# ****************************************************************************
#
# Copyright (c) 2014-2024 Fraunhofer FKIE
# Author: Alexander Tiderko
# License: MIT
#
# ****************************************************************************

from typing import Dict
from typing import List
from typing import Text
from typing import Tuple
from typing import Union

import os
import re
import sys
import threading
import time
from collections import defaultdict

from ament_index_python.packages import PackageNotFoundError
import launch
from launch.launch_context import LaunchContext
from launch.launch_description_sources import get_launch_description_from_any_launch_file
from launch.substitutions.substitution_failure import SubstitutionFailure
import launch.utilities
from launch.utilities import normalize_to_list_of_substitutions
from launch.utilities import perform_substitutions
import launch_ros
import composition_interfaces.srv

from launch_ros.utilities import make_namespace_absolute

from fkie_mas_pylib.interface.launch_interface import LaunchArgument
from fkie_mas_pylib.interface.launch_interface import LaunchIncludedFile
from fkie_mas_pylib.logging.logging import Log
from fkie_mas_pylib import ros_pkg
from fkie_mas_pylib.defines import RESPAWN_SCRIPT
from fkie_mas_pylib.system import exceptions
from fkie_mas_pylib.system import screen
from fkie_mas_pylib.system.supervised_popen import SupervisedPopen

from .launch_argument_cache import LaunchArgTemplate
from .launch_argument_cache import LAUNCH_ARGUMENT_CACHE
from .launch_node_wrapper import LaunchNodeWrapper
from .utils import LaunchConfigException
from .utils import perform_to_string

import fkie_mas_daemon as nmd

PRINT_DEBUG_LOAD = False


class LaunchConfig(object):
    '''
    A class to handle the ROS configuration stored in launch file.
    '''

    # os.environ is process global: serialize launch file parsing and every
    # environment snapshot across all instances. This is the lowest level in
    # the lock hierarchy, never acquire a servicer lock while holding it.
    _LOAD_LOCK = threading.RLock()

    def __init__(self, launch_file: str, *, context=None, package=None, daemonuri='', launch_arguments: List[Tuple[Text, Text]] = []):
        '''
        Creates the LaunchConfig object. The launch file will be not loaded on
        creation, first on request of roscfg value.

        :param str launch_file: The absolute or relative path with the launch file.
                                By using relative path a package must be valid for
                                remote launches.
        :param package: the package containing the launch file. If None the
                        launch_file will be used to determine the launch file.
                        No remote launches a possible without a valid package.
        :type package: str or None
        :param str daemonuri: daemon where to start the nodes of this launch file.
        :raise roslaunch.XmlParseException: if the launch file can't be found.
        '''
        self.__launch_file = launch_file
        self.__package = ros_pkg.get_name(os.path.dirname(self.__launch_file))[
            0] if package is None else package
        self.launch_type = 'python'
        self.load_exceptions = []
        if self.__launch_file.endswith('.xml') or self.__launch_file.endswith('.launch'):
            self.launch_type = 'xml'
        self._nodes: List[LaunchNodeWrapper] = []
        self.__nmduri = daemonuri
        self.provided_launch_arguments = launch_arguments
        self.launch_arguments: List[LaunchArgument] = []
        argv = sys.argv[1:]
        argv.extend(["%s:=%s" % (name, value)
                     for (name, value) in launch_arguments])
        self.__launch_context = context
        if context is None:
            self.__launch_context = LaunchContext(argv=argv)
        for (name, value) in launch_arguments:
            name_normalized = perform_substitutions(self.__launch_context,
                                                    launch.utilities.normalize_to_list_of_substitutions(name))
            self.__launch_context.launch_configurations[name_normalized] = value
            self.launch_arguments.append(LaunchArgument(name_normalized, value))
        self.__launch_description = get_launch_description_from_any_launch_file(self.filename)
        self._included_files: List[LaunchIncludedFile] = []
        self.__launch_description.launch_name = self.filename
        self.environment = {}
        self.load()
        self.argv = None
        if self.argv is None:
            self.argv = []
        self.__reqTested = False
        self.__argv_values = dict()
        self.__launch_id = '%.9f' % time.time()
        self._robot_description = None
        self._capabilities = None
        self.resolve_dict = {}
        self.changed = True

    def __del__(self):
        self._nodes.clear()

    @property
    def context(self) -> LaunchContext:
        return self.__launch_context

    @property
    def daemonuri(self) -> str:
        '''
        :return: Returns the URI (host) of daemon where the node of this config will be started.
        :rtype: str
        '''
        return self.__nmduri

    @property
    def roscfg(self) -> launch.LaunchDescription:
        '''
        Holds a loaded launch configuration. It raises a LaunchConfigException on load error.
        :return: a previously loaded ROS configuration
        '''
        if self.__launch_description is not None:
            return self.__launch_description
        else:
            result, _ = self.load(self.argv)
            if not result:
                raise LaunchConfigException("not all argv are set properly!")
            return self.__launch_description

    def remove_comments_preserve_lines(self, content):
        def replacer(match):
            # Ersetze jeden Kommentar mit der gleichen Anzahl Zeilenumbrüche
            comment = match.group(0)
            return '\n' * comment.count('\n')
        return re.sub(r'<!--.*?-->', replacer, content, flags=re.DOTALL)

    def find_definition_xml(self, content, identifier, start=0):
        content_no_comments = self.remove_comments_preserve_lines(content)
        pattern = re.compile(
            r'<\s*' + re.escape(identifier) + r'\b[^>]*(?:/>|>.*?</\s*' + re.escape(identifier) + r'\s*>)',
            re.DOTALL | re.IGNORECASE
        )
        match = pattern.search(content_no_comments, start)
        if match:
            line_number = content_no_comments[:match.start()].count('\n') + 1
            end_position = match.end()
            raw_text = content[match.start():match.end()]  # Originaltext zurückgeben
            return line_number, end_position, raw_text
        else:
            return -1, start, ""

    def find_definition(self, content, identifier, start=0, include_close_bracket=True):
        # searches for identifier in launch file.
        # we use it to find e.g. include file directives
        identifier_pattern = None
        if self.launch_type == 'xml':
            # TODO: search for includes in XML files
            return -1, start, ""
        elif self.launch_type == 'python':
            if identifier == 'include':
                identifier_pattern = re.compile(
                    rf"[^#]\sIncludeLaunchDescription\s*?\(", re.DOTALL | re.MULTILINE | re.S)
            elif identifier == 'group':
                identifier_pattern = re.compile(rf"[^#]\sGroupAction\s*?\(", re.DOTALL | re.MULTILINE | re.S)
            else:
                identifier_pattern = re.compile(rf"[^#]\s{identifier}\s*?\(", re.DOTALL | re.MULTILINE | re.S)
        else:
            identifier_pattern = re.compile(rf"[^#]\s{identifier}\s*?\(", re.DOTALL | re.MULTILINE | re.S)
        line_number = -1
        end_position = start
        raw_text = ""
        match = identifier_pattern.search(content, start)
        if match is not None:
            open_brackets = 0
            line_number = content[:match.start()].count('\n') + 1
            end_position = match.end()
            raw_text = content[match.start():match.end()]
            if include_close_bracket:
                for idx in range(match.end()+1, len(content)-1):
                    if content[idx] == '(':
                        open_brackets += 1
                    if content[idx] == ')':
                        open_brackets -= 1
                        if open_brackets < 0:
                            end_position = idx
                            raw_text = content[match.start():idx+1]
                            break
        return line_number, end_position, raw_text

    def _reset_loaded_state(self) -> None:
        """Drop everything produced by _load(); keeps the provided launch arguments."""
        self._nodes.clear()
        self._included_files.clear()
        self.load_exceptions.clear()

    def unload(self):
        Log.info(f"unload launch file: {self.filename}")
        self._reset_loaded_state()
        self.launch_arguments.clear()

    def load(self) -> None:
        Log.info(
            f"load launch file: {self.filename}, arguments: {[f'{v.name}:={v.value}' for v in self.launch_arguments]}")
        with LaunchConfig._LOAD_LOCK:
            # reload must not append to the result of a previous load
            self._reset_loaded_state()
            self.environment = os.environ.copy()
            try:
                self._load(current_file=self.filename)
            finally:
                # always restore environment, also on load errors, to avoid
                # interaction if multiple files are loaded
                os.environ.clear()
                os.environ.update(self.environment)
        self.changed = True

    def _load(self, sub_obj: Union[None, List[launch.frontend.Entity]] = None, *, launch_description=None, current_file: str = '', indent: str = '', launch_file_obj: Union[LaunchIncludedFile, None] = None, depth: int = -1, start_position_in_file=0, timer_period=0, env: Dict[str, str] = {}, remove_env: List[str] = []) -> None:
        if PRINT_DEBUG_LOAD:
            print(f"  ***debug launch loading: {indent}perform file {current_file}")
        current_launch_description = launch_description
        file_content = ""
        launch_prefix = ""
        additional_environment = {}
        additional_environment.update(env)
        remove_environment = list(remove_env)

        if sub_obj is None:
            sub_obj = self.__launch_description
            self.context.extend_locals({'launch_file_path': self.filename})
            self.context.extend_locals({'launch_arguments': self.launch_arguments})
            self.context.extend_locals({v.name: v.value for v in self.launch_arguments})
        if current_file:
            self.context.extend_locals({'current_launch_file_path': current_file})
            with open(current_file, 'r') as f:
                file_content = f.read()
        if current_launch_description is None:
            current_launch_description = self.__launch_description
        # import traceback
        # print(traceback.format_stack())
        # print("Launch arguments:")
        # for la in self.__launch_description.get_launch_arguments():
        #     print(la.name, launch.utilities.perform_substitutions(self.context, la.default_value))
        position_in_file = start_position_in_file
        entities = None
        if hasattr(sub_obj, 'get_sub_entities'):
            entities = getattr(sub_obj, 'get_sub_entities')()
        elif hasattr(sub_obj, 'entities'):
            entities = getattr(sub_obj, 'entities')
        else:
            entities = sub_obj
        if entities is None:
            return
        if PRINT_DEBUG_LOAD:
            print(f"  ***debug launch loading: {indent}entities: {entities}")
        for entity in entities:
            if PRINT_DEBUG_LOAD:
                print(f"  ***debug launch loading: {indent}perform entity: {entity}")
            if hasattr(entity, "condition") and entity.condition:
                # check for available condition
                # if condition does not evaluate to True we have to parse for
                #   1. included file: we track the line of include directives
                #   2. GroupActions: we need line number for recursive _load() call
                if not entity.condition.evaluate(self.context):
                    if isinstance(entity, launch.actions.include_launch_description.IncludeLaunchDescription):
                        # perform search
                        inc_file_exists = False
                        file_size = -1
                        cfg_actions = entity.execute(self.context)
                        inc_launch_arguments = []
                        if cfg_actions is not None:
                            for cac in cfg_actions:
                                if isinstance(cac, launch.actions.set_launch_configuration.SetLaunchConfiguration):
                                    cac.execute(self.context)
                                    arg_name = perform_substitutions(self.context, cac.name)
                                    arg_value = perform_substitutions(self.context, cac.value)
                                    if PRINT_DEBUG_LOAD:
                                        print(
                                            f"  ***debug launch loading: {indent}  add launch config: {arg_name}: {arg_value}")
                                    inc_launch_arguments.append(LaunchArgument(name=arg_name, value=arg_value))
                        inc_file_name = perform_to_string(
                            self.context, entity.launch_description_source.location)
                        used_path = inc_file_name
                        used_realpath = used_path
                        if os.path.exists(inc_file_name):
                            inc_file_exists = True
                            file_size = os.path.getsize(inc_file_name)
                            used_realpath = os.path.realpath(inc_file_name)
                        if self.launch_type == 'xml':
                            include_line_number, position_in_file, raw_text = self.find_definition_xml(
                                file_content, 'include', position_in_file)
                        else:
                            include_line_number, position_in_file, raw_text = self.find_definition(
                                file_content, 'include', position_in_file)
                        launch_inc_file = LaunchIncludedFile(path=current_file,
                                                             line_number=include_line_number,
                                                             inc_path=used_path,
                                                             inc_realpath=used_realpath,
                                                             exists=inc_file_exists,
                                                             raw_inc_path=raw_text,
                                                             rec_depth=depth+1,
                                                             args=[],
                                                             default_inc_args=inc_launch_arguments,
                                                             size=file_size,
                                                             conditional_excluded=True)
                        self._included_files.append(launch_inc_file)
                    elif isinstance(entity, launch.actions.group_action.GroupAction):
                        include_line_number, position_in_file, raw_text = self.find_definition(
                            file_content, 'group', position_in_file)
                    continue
            if isinstance(entity, launch_ros.actions.node.Node):
                try:
                    if PRINT_DEBUG_LOAD:
                        print(f"  ***debug launch loading: {indent}  parse node: {entity._Node__node_executable}")
                    entity._perform_substitutions(self.context)
                    if PRINT_DEBUG_LOAD:
                        print(f"  ***debug launch loading: {indent}  node after subst: {entity._Node__node_executable}")
                    # actions = entity.execute(self.context)
                    node = LaunchNodeWrapper(
                        entity, launch_description=current_launch_description, launch_context=self.context,
                        environment=additional_environment, remove_environment=remove_environment, position_in_file=position_in_file)
                    node.timer_period = timer_period
                    if launch_prefix:
                        node.launch_prefix = launch_prefix
                    self._nodes.append(node)
                    # for action in actions:
                    #    if isinstance(action, launch_ros.actions.LoadComposableNodes):

                    if isinstance(entity, launch_ros.actions.ComposableNodeContainer):
                        for cn in entity._ComposableNodeContainer__composable_node_descriptions:
                            c_node = LaunchNodeWrapper(cn, launch_description=current_launch_description, launch_context=self.context,
                                                       composable_container=node.unique_name, environment=additional_environment,
                                                       remove_environment=remove_environment, position_in_file=position_in_file)
                            c_node.timer_period = timer_period
                            self._nodes.append(c_node)
                except (SubstitutionFailure, PackageNotFoundError) as err:
                    raise err
                except:
                    import traceback
                    print(traceback.format_exc())
            elif isinstance(entity, launch_ros.actions.load_composable_nodes.LoadComposableNodes):
                if PRINT_DEBUG_LOAD:
                    print(
                        f"  ***debug launch loading: {indent}  load composable nodes: {len(entity._LoadComposableNodes__composable_node_descriptions)}")
                for cn in entity._LoadComposableNodes__composable_node_descriptions:
                    container_name = ""
                    if isinstance(entity._LoadComposableNodes__target_container, launch_ros.actions.ComposableNodeContainer):
                        node = LaunchNodeWrapper(
                            entity._LoadComposableNodes__target_container, launch_description=current_launch_description,
                            launch_context=self.context, environment=additional_environment,
                            remove_environment=remove_environment, position_in_file=position_in_file)
                        node.timer_period = timer_period
                        self._nodes.append(node)
                        container_name = node.node_name
                    else:
                        subs = normalize_to_list_of_substitutions(entity._LoadComposableNodes__target_container)
                        container_name = make_namespace_absolute(perform_substitutions(self.context, subs))
                    for n in self._nodes:
                        if n.node_name == container_name:
                            n.composable_container = container_name
                    node = LaunchNodeWrapper(cn, launch_description=current_launch_description, launch_context=self.context,
                                             composable_container=container_name, environment=additional_environment,
                                             remove_environment=remove_environment, position_in_file=position_in_file)
                    node.timer_period = timer_period
                    self._nodes.append(node)
            elif isinstance(entity, launch.actions.execute_process.ExecuteProcess):
                if PRINT_DEBUG_LOAD:
                    print(f"  ***debug launch loading: {indent}  add execute process")
                node = LaunchNodeWrapper(entity, launch_description=current_launch_description, launch_context=self.context,
                                         environment=additional_environment, remove_environment=remove_environment, position_in_file=position_in_file)
                node.timer_period = timer_period
                self._nodes.append(node)
            elif isinstance(entity, launch.actions.declare_launch_argument.DeclareLaunchArgument):
                entity.execute(self.context)
                # if entity.default_value is not None:
                #     print('  perform ARG:', entity.name, launch.utilities.perform_substitutions(
                #         self.context, entity.default_value))
                # cfg_actions = entity.execute(self.context)
                # if cfg_actions is not None:
                #     for cac in cfg_actions:
                #         print("  ***debug launch loading action: ", indent, '->', type(cac), cac)
                # if launch_file_obj:
                #     print(f"current file: {current_file}")
                #     if PRINT_DEBUG_LOAD:
                #         print(f"  ***debug launch loading: {indent} add declared argument: {entity.name}")
                #     la = LaunchArgument(name=perform_to_string(self.context, entity.name),
                #                         value="",
                #                         default_value=perform_to_string(self.context, entity.default_value),
                #                         description=perform_to_string(self.context, entity.description),
                #                         choices=entity.choices)
                #     print(f"la {la.name}: {la.default_value} {current_file}")
                #     launch_file_obj.default_inc_args.append(la)
                #     entity.execute(self.context)
            elif isinstance(entity, launch.actions.include_launch_description.IncludeLaunchDescription):
                self.context._push_launch_configurations()
                saved_env = dict(os.environ)          # save environment
                try:
                    cfg_actions = entity.execute(self.context)
                    if PRINT_DEBUG_LOAD:
                        print(
                            f"  ***debug launch loading: {indent} include file: {entity.launch_description_source.location}")
                    inc_file_exists = False
                    file_size = -1
                    used_path = entity.launch_description_source.location
                    used_realpath = used_path
                    if os.path.exists(entity.launch_description_source.location):
                        inc_file_exists = True
                        used_realpath = os.path.realpath(used_path)
                        file_size = os.path.getsize(used_path)
                    if self.launch_type == 'xml':
                        include_line_number, position_in_file, raw_text = self.find_definition_xml(
                            file_content, 'include', position_in_file)
                    else:
                        include_line_number, position_in_file, raw_text = self.find_definition(
                            file_content, 'include', position_in_file)
                    # inc_launch_arguments = []
                    if cfg_actions is not None:
                        for cac in cfg_actions:
                            if isinstance(cac, launch.actions.set_launch_configuration.SetLaunchConfiguration):
                                cac.execute(self.context)
                    #             arg_name = perform_substitutions(self.context, cac.name)
                    #             arg_value = perform_substitutions(self.context, cac.value)
                    #             if PRINT_DEBUG_LOAD:
                    #                 print(
                    #                     f"  ***debug launch loading: {indent}  add launch config: {arg_name}: {arg_value}")
                    #             inc_launch_arguments.append(LaunchArgument(name=arg_name, value=arg_value))
                    # inc_launch_arguments_def = []
                    launch_inc_file = LaunchIncludedFile(path=current_file,
                                                         line_number=include_line_number,
                                                         inc_path=used_path,
                                                         inc_realpath=used_realpath,
                                                         exists=inc_file_exists,
                                                         raw_inc_path=raw_text,
                                                         rec_depth=depth+1,
                                                         args=[],
                                                         default_inc_args=[],
                                                         size=file_size
                                                         )
                    self._included_files.append(launch_inc_file)
                    self._load(entity, launch_description=entity, current_file=entity._get_launch_file(),
                               indent=indent+'  ', launch_file_obj=launch_inc_file, depth=depth+1, start_position_in_file=0,
                               timer_period=timer_period, env=additional_environment, remove_env=remove_environment)
                    if current_file:
                        self.context.extend_locals({'current_launch_file_path': current_file})
                except launch.invalid_launch_file_error.InvalidLaunchFileError as err:
                    raise Exception('%s (%s)' % (
                        err, entity.launch_description_source.location))
                finally:
                    os.environ.clear()                 # restore environment
                    os.environ.update(saved_env)
                    self.context._pop_launch_configurations()
            elif isinstance(entity, launch.actions.group_action.GroupAction):
                self.context._push_launch_configurations()
                saved_env = dict(os.environ)          # save environment
                try:
                    if current_file:
                        self.context.extend_locals({'current_launch_file_path': current_file})
                    include_line_number, position_in_file, raw_text = self.find_definition(
                        file_content, 'group', position_in_file, include_close_bracket=False)
                    position_in_file = self._load(entity, launch_description=current_launch_description,
                                                  current_file=current_file, indent=indent+'  ', launch_file_obj=launch_file_obj,
                                                  depth=depth, start_position_in_file=position_in_file, timer_period=timer_period,
                                                  env=additional_environment, remove_env=remove_environment)
                finally:
                    os.environ.clear()                 # restore environment
                    os.environ.update(saved_env)
                    self.context._pop_launch_configurations()
            elif isinstance(entity, launch.actions.timer_action.TimerAction):
                if PRINT_DEBUG_LOAD:
                    print(f"  ***debug launch loading: {indent} timer period: {entity.period}")
                period = entity.period
                if not isinstance(period, (float, int)):
                    period = float(perform_substitutions(self.context, entity.period))
                if PRINT_DEBUG_LOAD:
                    print(f"  ***debug launch loading: {indent} timer period (resolved): {period}")
                if PRINT_DEBUG_LOAD:
                    print(f"  ***debug launch loading: {indent} actions count: {len(entity.actions)}")
                position_in_file = self._load(entity.actions, launch_description=current_launch_description, current_file=current_file,
                                              indent=indent+'  ', launch_file_obj=launch_file_obj, depth=depth, start_position_in_file=position_in_file,
                                              timer_period=period, env=additional_environment, remove_env=remove_environment)
                # period: Union[float, SomeSubstitutionsType],
                # actions: Iterable[LaunchDescriptionEntity],
                # cancel_on_shutdown: Union[bool, SomeSubstitutionsType] = True,
            elif isinstance(entity, launch.actions.set_environment_variable.SetEnvironmentVariable):
                # apply to the real process environment, so that OpaqueFunctions reading
                # os.environ see the same value as with "ros2 launch"
                entity.execute(self.context)
                name = perform_substitutions(self.context, getattr(entity, 'name', ''))
                value = perform_substitutions(self.context, getattr(entity, 'value', ''))
                additional_environment[name] = value
                if name in remove_environment:
                    remove_environment.remove(name)
            elif isinstance(entity, launch.actions.unset_environment_variable.UnsetEnvironmentVariable):
                if hasattr(entity, 'execute'):
                    entity.execute(self.context)
                name = perform_substitutions(self.context, getattr(entity, 'name', ''))
                if name in additional_environment:
                    del additional_environment[name]
                if name not in remove_environment:
                    remove_environment.append(name)
            elif isinstance(entity, launch.launch_description.LaunchDescription):
                if PRINT_DEBUG_LOAD:
                    print(f"  ***debug launch loading: {indent} LaunchDescription: {entity}: {dir(entity)}")
                    print(f"  current file: {current_file}")
                last_included_file = self._included_files[-1]
                if last_included_file and last_included_file.inc_path == current_file:
                    launch_args = []
                    for arg_name, arg_value in current_launch_description.launch_arguments:
                        try:
                            la = LaunchArgument(perform_to_string(self.context, arg_name),
                                                perform_to_string(self.context, arg_value))
                            if PRINT_DEBUG_LOAD:
                                print(f"    add launch arg: {la.name}: {la.value}")
                            launch_args.append(la)
                        except Exception as err:
                            import traceback
                            print(traceback.format_exc())
                            raise LaunchConfigException(f"Error while resolve arguments in {current_file}: {err}")
                    default_args = []
                    for arg in entity.get_launch_arguments():
                        try:
                            da = LaunchArgument(perform_to_string(self.context, arg.name),
                                                perform_to_string(self.context, arg.default_value))
                            if PRINT_DEBUG_LOAD:
                                print(f"    add default arg: {da.name}: {da.value}")
                            default_args.append(da)
                        except Exception as err:
                            import traceback
                            print(traceback.format_exc())
                            raise LaunchConfigException(
                                f"Error while resolve default arguments in {current_file}: {err}")
                    last_included_file.args = launch_args
                    last_included_file.default_inc_args = default_args
                self._load(entity, launch_description=current_launch_description,
                           current_file=current_file, indent=indent+'  ', launch_file_obj=launch_file_obj, depth=depth+1,
                           start_position_in_file=position_in_file, timer_period=timer_period,
                           env=additional_environment, remove_env=remove_environment)
                if current_file:
                    self.context.extend_locals({'current_launch_file_path': current_file})
            elif isinstance(entity, launch.actions.set_launch_configuration.SetLaunchConfiguration):
                entity.execute(self.context)
                # launch prefix is set by <let ... /> in a group
                arg_name = perform_substitutions(self.context, entity.name)
                if arg_name == "launch-prefix":
                    launch_prefix = perform_substitutions(self.context, getattr(entity, 'value', ''))
                if PRINT_DEBUG_LOAD:
                    arg_value = perform_substitutions(self.context, entity.value)
                    print(f"  ***debug launch loading: {indent}  SetLaunchConfiguration: {arg_name}: {arg_value}")
            elif isinstance(entity, launch.actions.pop_launch_configurations.PopLaunchConfigurations):
                if PRINT_DEBUG_LOAD:
                    print(f"  ***debug launch loading: {indent}  PopLaunchConfigurations: {dir(entity)}")
                entity.execute(self.context)
                if PRINT_DEBUG_LOAD:
                    for sub_entity in entity.get_sub_entities():
                        arg_name = perform_substitutions(self.context, sub_entity.name)
                        print(f"  ***debug launch loading: {indent}    remove arg_name: {arg_name}")
            elif hasattr(entity, 'execute'):
                if PRINT_DEBUG_LOAD:
                    print(f"  ***debug launch loading: {indent} parse execute entity: {entity}; {dir(entity)}")
                try:
                    exec_result = entity.execute(self.context)
                    if exec_result:
                        if PRINT_DEBUG_LOAD:
                            print(f"  ***debug execute result: {exec_result}; {dir(exec_result)}")
                        if not isinstance(exec_result, List):
                            exec_result = [exec_result]
                        position_in_file = self._load(exec_result, launch_description=current_launch_description,
                                                      current_file=current_file, indent=indent+'  ', launch_file_obj=launch_file_obj,
                                                      depth=depth, start_position_in_file=position_in_file, timer_period=timer_period,
                                                      env=additional_environment, remove_env=remove_environment)
                except Exception as e:
                    import traceback
                    err_msg = traceback.format_exc()
                    self.load_exceptions.append(f"{e}")
                    print(err_msg)

            else:
                print(f"  ***debug launch loading: {indent} unknown entity: {entity}")
                self._load(entity, launch_description=current_launch_description,
                           current_file=current_file, indent=indent+'  ', launch_file_obj=launch_file_obj,
                           depth=depth+1, start_position_in_file=position_in_file, timer_period=timer_period,
                           env=additional_environment, remove_env=remove_environment)
                if current_file:
                    self.context.extend_locals({'current_launch_file_path': current_file})
        return position_in_file

    def nodes(self) -> List[LaunchNodeWrapper]:
        return self._nodes

    @property
    def filename(self) -> Text:
        '''
        Returns an existing path with file name or an empty string.
        '''
        if os.path.isfile(self.__launch_file):
            return self.__launch_file
        raise LaunchConfigException(f'launch file {self.__launch_file} not found!')

    @property
    def launch_name(self) -> Text:
        '''
        Returns the name of the launch file with extension, e.g. 'test.launch'
        '''
        return os.path.basename(self.__launch_file)

    @property
    def package_name(self) -> Union[Text, None]:
        '''
        Returns the name of the package containing the launch file or None.
        '''
        return self.__package

    @classmethod
    def _get_launch_arguments(cls, context: LaunchContext, filename: str, *, provided_args: Union[List, None]) -> List[LaunchArgument]:
        '''
        Returns only top-level launch arguments, but collects all possible default values recursively
        from entire launch tree (includes, groups, nested LaunchDescriptions).
        '''
        def get_entities(entity):
            """Helper: Extract entities from any entity type."""
            try:
                if hasattr(entity, 'entities'):
                    return entity.entities
                elif hasattr(entity, 'get_sub_entities'):
                    return entity.get_sub_entities()
                elif hasattr(entity, 'describe_sub_entities'):
                    return entity.describe_sub_entities()
                elif hasattr(entity, 'get_sub_entities'):
                    return entity.get_sub_entities()
            except:
                pass
            return []

        def collect_all_defaults(entities, defaults_map: defaultdict):
            """Recursively collect ALL DeclareLaunchArgument defaults from entire launch tree."""
            for entity in entities:
                # Direct DeclareLaunchArgument
                if isinstance(entity, launch.actions.DeclareLaunchArgument):
                    if entity.default_value:
                        try:
                            resolved = launch.utilities.perform_substitutions(context, entity.default_value)
                            if resolved not in defaults_map[entity.name]:
                                defaults_map[entity.name].append(resolved)
                        except:
                            pass

                # IncludeLaunchDescription
                elif isinstance(entity, launch.actions.IncludeLaunchDescription):
                    sub_entities = entity.describe_sub_entities()
                    collect_all_defaults(sub_entities, defaults_map)
                    for _, cond_entities in entity.describe_conditional_sub_entities():
                        collect_all_defaults(cond_entities, defaults_map)

                # GroupAction
                elif isinstance(entity, launch.actions.GroupAction):
                    sub_entities = get_entities(entity)
                    collect_all_defaults(sub_entities, defaults_map)

                # LaunchDescription (NESTED!)
                elif isinstance(entity, launch.LaunchDescription):
                    collect_all_defaults(entity.entities, defaults_map)

                # OpaqueFunction
                elif isinstance(entity, launch.actions.OpaqueFunction):
                    try:
                        result = entity.execute(context)
                        if isinstance(result, list):
                            for sub_result in result:
                                collect_all_defaults([sub_result], defaults_map)
                        else:
                            collect_all_defaults([result], defaults_map)
                    except:
                        pass

                # Generic recursion for other containers
                else:
                    sub_entities = get_entities(entity)
                    collect_all_defaults(sub_entities, defaults_map)

        launch_description = get_launch_description_from_any_launch_file(filename)

        # Phase 1: ONLY top-level DeclareLaunchArgument (direct from launch_description.entities)
        top_level_actions = []
        for entity in launch_description.entities:
            if isinstance(entity, launch.actions.DeclareLaunchArgument):
                if entity.name not in [e.name for e in top_level_actions]:
                    top_level_actions.append(entity)

        # Phase 2: FULL recursion - collect ALL defaults from entire tree
        all_defaults_map = defaultdict(list)
        collect_all_defaults(launch_description.entities, all_defaults_map)

        # Build result
        result = []
        for argument_action in top_level_actions:
            value = None
            if provided_args is not None:
                for provided_arg in provided_args:
                    if argument_action.name == provided_arg.name and hasattr(provided_arg, "value"):
                        value = provided_arg.value
                        break

            default_value = None
            if argument_action.default_value:
                default_value = launch.utilities.perform_substitutions(context, argument_action.default_value)

            # Extend choices with ALL found defaults
            all_choices = list(all_defaults_map[argument_action.name])
            existing_choices = argument_action.choices or []
            choices = list(existing_choices)
            for default_val in all_choices:
                if default_val not in choices:
                    choices.append(default_val)

            arg = LaunchArgument(
                name=argument_action.name,
                value=value if value is not None else default_value,
                default_value=default_value,
                description=argument_action.description,
                choices=choices
            )
            result.append(arg)

        return result

    @classmethod
    def get_launch_arguments(cls, context: LaunchContext, filename: str, *,
                             provided_args: Union[List, None]) -> List[LaunchArgument]:
        key = LAUNCH_ARGUMENT_CACHE.make_key(filename, context)

        def _load() -> Tuple[LaunchArgTemplate, ...]:
            Log.debug(f"LaunchConfig: parse launch arguments of {filename}")
            # parse without provided_args: the result must not depend on the request
            parsed = cls._get_launch_arguments(context, filename=filename, provided_args=None)
            return tuple(
                LaunchArgTemplate(name=a.name,
                                  default_value=a.default_value,
                                  description=a.description,
                                  choices=tuple(a.choices or []))
                for a in parsed
            )

        templates = LAUNCH_ARGUMENT_CACHE.get_or_load(key, _load)

        # always build fresh objects: the caller mutates and extends the returned list
        provided = {}
        if provided_args:
            provided = {a.name: a.value for a in provided_args if hasattr(a, "value")}
        return [
            LaunchArgument(name=t.name,
                           value=provided.get(t.name, t.default_value),
                           default_value=t.default_value,
                           description=t.description,
                           choices=list(t.choices))
            for t in templates
        ]

    def get_node(self, name: str) -> Union[LaunchNodeWrapper, None]:
        '''
        Returns a configuration node for a given node name.
        '''
        for item in self.nodes():
            if (item.unique_name == name):
                return item
        Log.debug(f"Node '{name}' NOT found; {self.filename}; nodes: {len(self._nodes)}")
        return None

    def run_node(self, name: str, ignore_timer=False) -> str:
        '''
        Start a node local

        :return: path of executable or empty string on load composable node
        :raise exceptions.StartException: on errors
        :raise exceptions.BinarySelectionRequest: on multiple binaries
        '''
        node: LaunchNodeWrapper = self.get_node(name)
        if node is None:
            raise exceptions.StartException(f"Node '{name}' in '{self.filename}' not found!")
        if node.timer_period > 0 and not ignore_timer:
            t = threading.Timer(node.timer_period, self.run_node, args=(name, True))
            t.start()
            # TODO: add executable to observed files
            return f"{name} will be started in {node.timer_period} seconds"
        if node.composable_container and node.composable_container != node.node_name:
            # load plugin in container
            Log.info(f"Load node='{node.unique_name}'; as plugin into container='{node.composable_container}';")
            # skip check if container is running, it is done by the GUI
            self.run_composed_node(node)
            return ''

        # run on local host
        # run get_cmd() before create new_env since get_cmd() extends os.environ
        with LaunchConfig._LOAD_LOCK:
            screen_prefix = screen.get_cmd(node.unique_name)
            # set environment
            new_env = os.environ.copy()
        # add environment from launch
        if node.additional_env:
            new_env.update(dict(node.additional_env))
        for env_name in node.remove_environment:
            if env_name in new_env:
                del new_env[env_name]
        # set display variable to local display
        if 'DISPLAY' in new_env:
            if not new_env['DISPLAY'] or new_env['DISPLAY'] == 'remote':
                del new_env['DISPLAY']
        else:
            new_env['DISPLAY'] = ':0'
        if node.node_namespace:
            new_env['ROS_NAMESPACE'] = node.node_namespace
        # set logging
        if node.output_format:
            new_env['ROSCONSOLE_FORMAT'] = '%s' % node.output_format
        # if node.loglevel:
        #     new_env['ROSCONSOLE_CONFIG_FILE'] = _rosconsole_cfg_file(
        #         node.package, node.loglevel)
        # handle respawn
        respawn_prefix = ''
        if node.respawn:
            if node.respawn_delay and node.respawn_delay > 0:
                new_env['RESPAWN_DELAY'] = '%d' % node.respawn_delay
            # TODO
            # respawn_params = _get_respawn_params(node.fullname, node.params)
            # if respawn_params['max'] > 0:
            #     new_env['RESPAWN_MAX'] = '%d' % respawn_params['max']
            # if respawn_params['min_runtime'] > 0:
            #     new_env['RESPAWN_MIN_RUNTIME'] = '%d' % respawn_params['min_runtime']
            respawn_prefix = f"{RESPAWN_SCRIPT}"

        launch_prefix = ''
        if node.launch_prefix:
            launch_prefix = node.launch_prefix
        # TODO: check for HOSTNAME
        # start
        executable_path = ''
        if node.cmd:
            executable_path = node.cmd.split()[0]
        Log.info(f"{screen_prefix} {respawn_prefix} {launch_prefix} {node.cmd} (launch_file: '{node.launch_name}')")
        Log.debug(f"environment while run node '{node.unique_name}': '{new_env}'")
        SupervisedPopen(' '.join([screen_prefix, respawn_prefix, launch_prefix, node.cmd]), cwd=node.cwd, shell=True, env=new_env,
                        object_id=f"run_node_{node.unique_name}", description=f"Run [{node.package_name}]{node.executable}")
        return executable_path

    def run_composed_node(self, node: LaunchNodeWrapper):
        # Create a client to load nodes in the target container.
        client_load_node = nmd.ros_node.create_client(
            composition_interfaces.srv.LoadNode, f'{node.composable_container}/_container/load_node')
        request = node.get_composed_load_request()
        service_load_node_name = f'{node.composable_container}/_container/load_node'
        Log.debug(f" -> load composed node to '{service_load_node_name}'")
        response = nmd.launcher.call_service(
            service_load_node_name, composition_interfaces.srv.LoadNode, request, timeout_sec=5.0)
        if response is None:
            error_msg = f"Failed to load service '{request.node_name}' of type '{request.plugin_name}' in container '{node.composable_container}': None as service response"
            Log.error(error_msg)
            raise exceptions.StartException(error_msg)
        Log.debug(f"  <- load composed node: response received: {response} {dir(response)}")
        node_name = response.full_node_name if response.full_node_name else request.node_name
        nmd.ros_node.destroy_client(client_load_node)
        if response.success:
            # if node_name is not None:
            #     add_node_name(context, node_name)
            #     node_name_count = get_node_name_count(context, node_name)
            #     if node_name_count > 1:
            #         container_logger = launch.logging.get_logger(self.__target_container.name)
            #         container_logger.warning(
            #             'there are now at least {} nodes with the name {} created within this '
            #             'launch context'.format(node_name_count, node_name)
            #         )
            Log.info(f"Loaded node '{response.full_node_name}' in container '{node.composable_container}'")
        else:
            error_msg = f"Failed to load node '{node_name}' of type '{request.plugin_name}' in container '{node.composable_container}': {response.error_message}"
            Log.error(error_msg)
            raise exceptions.StartException(error_msg)
