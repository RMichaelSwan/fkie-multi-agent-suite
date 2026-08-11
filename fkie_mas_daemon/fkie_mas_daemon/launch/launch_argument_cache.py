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
from collections import OrderedDict
from typing import Callable, Dict, List, NamedTuple, Optional, Tuple, Union


class LaunchArgTemplate(NamedTuple):
    """Immutable, request independent description of a top level launch argument."""
    name: str
    default_value: Optional[str]
    description: Optional[str]
    choices: Tuple[str, ...]


class LaunchArgumentCache:
    """Thread safe TTL/LRU cache for parsed top level launch arguments.

    The cached value contains only request independent data (LaunchArgTemplate).
    The concrete 'value' of an argument is always derived from the request,
    so the cache can never leak values between callers.

    The TTL is a safety net: included launch files are not necessarily watched
    by the file observer, so an entry must expire on its own as well.
    """

    def __init__(self, ttl: float = 5.0, max_size: int = 64) -> None:
        self._ttl = ttl
        self._max_size = max_size
        self._lock = threading.Lock()
        # key -> (insertion time, templates); OrderedDict is used as LRU
        self._entries: "OrderedDict[Tuple, Tuple[float, Tuple[LaunchArgTemplate, ...]]]" = OrderedDict()
        self._hits = 0
        self._misses = 0

    # -- key helpers ------------------------------------------------------

    @staticmethod
    def _stat_fingerprint(path: str) -> Tuple:
        try:
            st = os.stat(path)
            return (st.st_mtime_ns, st.st_size)
        except OSError:
            return (0, -1)

    @staticmethod
    def _context_fingerprint(context) -> Tuple:
        """Default values may reference LaunchConfiguration, so the launch
        context is part of the cache key."""
        try:
            return tuple(sorted((str(k), str(v)) for k, v in context.launch_configurations.items()))
        except Exception:
            return ()

    def make_key(self, path: str, context) -> Tuple:
        real_path = os.path.realpath(path)
        return (real_path, self._stat_fingerprint(real_path), self._context_fingerprint(context))

    # -- access -----------------------------------------------------------

    def get(self, key: Tuple) -> Optional[Tuple[LaunchArgTemplate, ...]]:
        now = time.time()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                self._misses += 1
                return None
            if now - entry[0] > self._ttl:
                del self._entries[key]
                self._misses += 1
                return None
            self._entries.move_to_end(key)  # mark as recently used
            self._hits += 1
            return entry[1]

    def put(self, key: Tuple, templates: Tuple[LaunchArgTemplate, ...]) -> None:
        with self._lock:
            self._entries[key] = (time.time(), templates)
            self._entries.move_to_end(key)
            while len(self._entries) > self._max_size:
                self._entries.popitem(last=False)  # drop least recently used

    def get_or_load(self, key: Tuple,
                    loader: Callable[[], Tuple[LaunchArgTemplate, ...]]) -> Tuple[LaunchArgTemplate, ...]:
        """Return cached templates or call loader(). The loader runs outside of
        the lock: parsing a launch file is slow and must not block other paths.
        A concurrent double parse is accepted, it is idempotent."""
        templates = self.get(key)
        if templates is None:
            templates = loader()
            self.put(key, templates)
        return templates

    # -- invalidation -----------------------------------------------------

    def invalidate(self, path: str) -> int:
        """Drop all entries of one launch file, regardless of stat/context."""
        real_path = os.path.realpath(path)
        with self._lock:
            keys = [k for k in self._entries if k[0] == real_path]
            for k in keys:
                del self._entries[k]
            return len(keys)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()

    def statistics(self) -> Dict[str, Union[int, float]]:
        with self._lock:
            total = self._hits + self._misses
            return {
                'size': len(self._entries),
                'max_size': self._max_size,
                'ttl': self._ttl,
                'hits': self._hits,
                'misses': self._misses,
                'hit_rate': (self._hits / total) if total else 0.0,
            }


# process wide instance: the cache must be shared between all LaunchConfig
# instances and requests, otherwise it never produces a hit
LAUNCH_ARGUMENT_CACHE = LaunchArgumentCache(ttl=5.0, max_size=64)


def invalidate_launch_argument_cache(path: str = None) -> None:
    """Compatibility wrapper used by the launch file observer."""
    if path is None:
        LAUNCH_ARGUMENT_CACHE.clear()
    else:
        LAUNCH_ARGUMENT_CACHE.invalidate(path)
