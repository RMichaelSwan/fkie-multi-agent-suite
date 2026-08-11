# ****************************************************************************
#
# Copyright (c) 2014-2024 Fraunhofer FKIE
# Author: Alexander Tiderko
# License: MIT
#
# ****************************************************************************
import os
import threading
import time
import traceback
from typing import Callable
from typing import Dict
from typing import FrozenSet
from typing import Iterable
from typing import List
from typing import Optional
from typing import Union

from watchdog.events import FileSystemEvent
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from fkie_mas_pylib.logging.logging import Log


class FileObserverHandler(FileSystemEventHandler):
    '''
    Minimal watchdog handler. It only forwards modification events.
    Filtering, path mapping and debouncing is done by FileObserverRegistry,
    because only the registry knows the observed state.
    '''

    # some watchdog versions report these types through on_modified
    IGNORED_EVENT_TYPES = ('opened', 'closed', 'closed_no_write')

    def __init__(self, callback: Callable[[str, str], None]) -> None:
        FileSystemEventHandler.__init__(self)
        self._callback = callback

    def on_modified(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        if event.event_type in self.IGNORED_EVENT_TYPES:
            return
        try:
            self._callback(event.event_type, event.src_path)
        except Exception:
            Log.warn(f"{self.__class__.__name__}: error while handling {event}:\n"
                     f"{traceback.format_exc()}")


class FileObserverRegistry:
    '''
    Thread safe registry for all observed files of the launch servicer.

    It owns one watchdog Observer and keeps reference counts for observed files
    and directories, so the same file can be requested by several launch files
    or nodes without losing the watch on the first release.

    Threading contract:
      * all state is protected by one internal lock
      * the lock is only held for dictionary operations and for the bounded
        watchdog calls schedule()/unschedule(); never for join() and never
        while the change callback is executed
      * the change callback runs without any lock held, it may block (websocket)
    '''

    def __init__(self,
                 on_change: Callable[[str, str, FrozenSet[str]], None],
                 min_event_interval: float = 1.0) -> None:
        '''
        :param on_change: called with (event_type, reported_path, affected_launch_files)
        :param min_event_interval: debounce interval, editors emit several
                                   events for a single save, see
                                   https://github.com/gorakhargosh/watchdog/issues/346
        '''
        self._on_change = on_change
        self._min_event_interval = min_event_interval
        self._lock = threading.Lock()
        self._observer = Observer()
        self._handler = FileObserverHandler(self._dispatch)
        self._running = False
        # real path -> path as reported to the clients (may be a symlink)
        self._real_paths: Dict[str, str] = {}
        # observed path -> reference count
        self._file_refs: Dict[str, int] = {}
        # observed directory -> [watch, reference count]
        self._dir_watches: Dict[str, list] = {}
        # launch file -> observed paths belonging to it
        self._launch_files: Dict[str, List[str]] = {}
        # observed path -> time stamp of the last forwarded event
        self._last_event: Dict[str, float] = {}

    # -- life cycle -------------------------------------------------------

    def start(self) -> None:
        with self._lock:
            if self._running:
                return
            self._running = True
        self._observer.start()

    def stop(self, timeout: float = 3.0) -> None:
        '''Stop the observer and drop the complete state.'''
        with self._lock:
            self._running = False
            self._real_paths.clear()
            self._file_refs.clear()
            self._dir_watches.clear()
            self._launch_files.clear()
            self._last_event.clear()
        # blocking calls outside of the lock
        try:
            self._observer.unschedule_all()
            self._observer.stop()
            self._observer.join(timeout=timeout)
        except Exception:
            Log.debug(f"{self.__class__.__name__}: stopping observer failed:\n"
                      f"{traceback.format_exc()}")

    # -- single files -----------------------------------------------------

    def add_file(self, path: str) -> None:
        '''
        Observe the directory of the given file. Reference counted: calling it
        twice requires two remove_file() calls.

        :raise OSError: if the directory cannot be observed (inotify limit)
        '''
        real_path = os.path.realpath(path)
        directory = os.path.dirname(real_path)
        with self._lock:
            self._real_paths[real_path] = path
            self._file_refs[path] = self._file_refs.get(path, 0) + 1
            entry = self._dir_watches.get(directory)
            if entry is not None:
                entry[1] += 1
                return
            try:
                Log.debug(f"{self.__class__.__name__}: observe directory: {directory}")
                watch = self._observer.schedule(self._handler, directory)
                self._dir_watches[directory] = [watch, 1]
            except OSError as err:
                # roll back the file reference, the file is not observed
                self._release_file(path, real_path)
                Log.warn(f"{self.__class__.__name__}: cannot observe {directory}: {err}. "
                         "Consider increasing fs.inotify.max_user_instances")
                raise

    def remove_file(self, path: str) -> None:
        real_path = os.path.realpath(path)
        directory = os.path.dirname(real_path)
        watch = None
        with self._lock:
            if path not in self._file_refs:
                return
            Log.debug(f"{self.__class__.__name__}: stop observe path: {path}")
            self._release_file(path, real_path)
            entry = self._dir_watches.get(directory)
            if entry is not None:
                entry[1] -= 1
                if entry[1] <= 0:
                    Log.debug(f"{self.__class__.__name__}: remove directory "
                              f"from observer: {directory}")
                    watch = entry[0]
                    del self._dir_watches[directory]
            if watch is not None:
                try:
                    self._observer.unschedule(watch)
                except Exception:
                    Log.debug(f"{self.__class__.__name__}: unschedule {directory} failed:\n"
                              f"{traceback.format_exc()}")

    def _release_file(self, path: str, real_path: str) -> None:
        '''Decrement the file reference count. The lock must be held.'''
        count = self._file_refs.get(path, 0) - 1
        if count > 0:
            self._file_refs[path] = count
            return
        self._file_refs.pop(path, None)
        self._last_event.pop(path, None)
        if self._real_paths.get(real_path) == path:
            del self._real_paths[real_path]

    # -- launch files -----------------------------------------------------

    def register_launch(self, launch_file: str, paths: Iterable[str]) -> List[str]:
        '''
        Observe a launch file and all of its included files.

        :return: list of error messages for files that cannot be observed
        '''
        errors: List[str] = []
        added: List[str] = []
        for path in paths:
            try:
                self.add_file(path)
                added.append(path)
            except Exception as error:
                errors.append(f"{path}: {error}")
                Log.error(f"{self.__class__.__name__}: cannot observe {path}: {error}")
        with self._lock:
            previous = self._launch_files.get(launch_file)
            self._launch_files[launch_file] = added
        if previous:
            # a re-registration replaces the old file set
            for path in previous:
                self.remove_file(path)
        return errors

    def unregister_launch(self, launch_file: str) -> None:
        with self._lock:
            paths = self._launch_files.pop(launch_file, [])
        for path in paths:
            try:
                self.remove_file(path)
            except Exception:
                Log.error(f"{self.__class__.__name__}: remove {path} from observer failed:\n"
                          f"{traceback.format_exc()}")

    # -- queries ----------------------------------------------------------

    def is_observed(self, path: str) -> bool:
        with self._lock:
            return path in self._file_refs

    def affected_launch_files(self, path: str) -> FrozenSet[str]:
        with self._lock:
            return self._affected_launch_files(path)

    def _affected_launch_files(self, path: str) -> FrozenSet[str]:
        '''The lock must be held.'''
        return frozenset(launch_file
                         for launch_file, paths in self._launch_files.items()
                         if path in paths)

    def statistics(self) -> Dict[str, int]:
        with self._lock:
            return {'files': len(self._file_refs),
                    'directories': len(self._dir_watches),
                    'launch_files': len(self._launch_files)}

    # -- event dispatching ------------------------------------------------

    def _dispatch(self, event_type: str, src_path: str) -> None:
        '''Called from the watchdog thread for every modification event.'''
        with self._lock:
            if not self._running:
                return
            path = self._resolve(src_path)
            if path is None:
                return
            now = time.time()
            if now - self._last_event.get(path, 0.0) <= self._min_event_interval:
                return
            self._last_event[path] = now
            affected = self._affected_launch_files(path)
        # callback without any lock: it publishes over the websocket
        self._on_change(event_type, path, affected)

    def _resolve(self, src_path: str) -> Optional[str]:
        '''Map an event path to the observed path. The lock must be held.'''
        path = self._real_paths.get(src_path)
        if path is None:
            path = self._real_paths.get(os.path.realpath(src_path))
        if path is None or path not in self._file_refs:
            return None
        return path
