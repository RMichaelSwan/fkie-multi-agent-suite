import { JSONObject, JSONValue } from "@/types";
import React, { createContext, useMemo, useReducer } from "react";

import useLocalStorage from "@/renderer/hooks/useLocalStorage";
import URI from "@/renderer/models/uris";
import CliArgs from "../assets/cliArgs.json";

export const SETTINGS_VERSION = 1;

export const getDefaultPortFromRos: (
  connectionType: string,
  rosVersion: string,
  ros1MasterUri: string,
  domainId: number
) => number = (connectionType, rosVersion, ros1MasterUri, domainId) => {
  if (connectionType === "crossbar-wamp") {
    return rosVersion === "2" ? 11811 + domainId : 11911 + domainId;
  }
  let uriShift = 0;
  if (rosVersion === "1" && ros1MasterUri && ros1MasterUri !== "default") {
    // shift port if ROS_MASTER_URI has not a default port
    uriShift = (Number.parseInt(ros1MasterUri.split(":").slice(-1)[0]) - 11311) * 101;
  }
  return rosVersion === "2" ? 35430 + domainId : 35685 + uriShift + domainId;
};

export interface ISettingsContext {
  MIN_VERSION_DAEMON: string;
  changed: number;
  get: (attribute: string) => JSONValue | undefined;
  getDefault: (attribute: string) => JSONValue | undefined;
  set: (attribute: string, value: JSONValue, settingsCtx?: ISettingsContext) => void;
  getParamList: () => { name: string; param: ISettingsParam }[];
}

export const LOG_LEVEL_LIST = ["DEBUG", "INFO", "SUCCESS", "WARN", "ERROR"];

export const BUTTON_LOCATIONS = { LEFT: "LEFT", RIGHT: "RIGHT" };

export const LAUNCH_FILE_EXTENSIONS = [".launch", "launch.xml", "launch.py", "launch.yaml", "launch.yml"];

export interface ISettingsParam {
  label?: string;
  default: JSONValue;
  type: string;
  placeholder?: string;
  options?: string | JSONValue[];
  freeSolo?: boolean;
  readOnly?: boolean;
  description?: string;
  group?: string;
  min?: number;
  max?: number;
  cb?: (get: (attribute: string) => JSONValue | undefined, set: (attribute: string, value: JSONValue) => void) => void;
  validate?: (value: JSONValue) => JSONValue;
  isValid?: (value: JSONValue) => boolean;
}

export const SETTINGS_DEF: { [id: string]: ISettingsParam } = {
  useDarkMode: {
    label: "Dark mode",
    default: false,
    type: "boolean",
    description: "",
    cb: (get: (attribute: string) => JSONValue | undefined, set: (attribute: string, value: JSONValue) => void) => {
      const newValue = get("useDarkMode");
      set("color", newValue ? "#B8E7FB" : "#1a73e8");
      set("backgroundColor", newValue ? "#424242" : "#fafafa");
    },
    group: "Appearance",
  },
  colorizeHosts: {
    label: "Colorize hosts",
    default: true,
    type: "boolean",
    description: "Each host is assigned a color. Everything related to this host is marked with this color.",
    group: "Appearance",
  },
  showButtonsForKeyModifiers: {
    label: "Show buttons for key modifiers",
    default: false,
    type: "boolean",
    description: "Display buttons for additional functions that are otherwise accessible via key modifiers",
    group: "Appearance",
  },
  buttonLocation: {
    label: "Location of the control buttons",
    type: "string",
    default: BUTTON_LOCATIONS.RIGHT,
    options: [BUTTON_LOCATIONS.RIGHT, BUTTON_LOCATIONS.LEFT],
    description: "",
    group: "Appearance",
  },
  checkForUpdates: {
    label: "Check for updates on start",
    default: true,
    type: "boolean",
    description: "",
  },
  fontSizeTerminal: {
    label: "Font size in terminal",
    type: "number",
    default: 14,
    min: 2,
    description: "This font size only affects the terminal tab (e.g. for screen and log)",
    group: "Appearance",
  },
  fontSize: {
    label: "Font size",
    type: "number",
    default: 14,
    min: 2,
    description: "Global font size except in the terminal",
    group: "Appearance",
  },
  resetLayout: {
    label: "Reset layout",
    type: "button",
    default: false,
    description: "Restores default sizes and positions of the tabs and main window",
    group: "Appearance",
  },
  rosVersion: {
    label: "Default ROS version",
    default: CliArgs["ros-version"].default ? CliArgs["ros-version"].default : "2",
    type: "string",
    options: ["1", "2"],
    readOnly: false,
    description:
      "Standard ROS version used to start remote daemon and discovery nodes. Only if automatic detection has failed.",
  },
  // guiLogLevel: {
  //   label: "Log Level",
  //   type: "string[]",
  //   default: ["INFO", "SUCCESS", "WARN", "ERROR"],
  //   options: LOG_LEVEL_LIST,
  //   description: "Messages that are displayed on the console. This has no effect on the output in the ‘Logging’ tab.",
  //   group: "Logging",
  // },
  debugByUri: {
    label: "Interface URIs",
    type: "string[]",
    default: [URI.ROS_PROVIDER_GET_LIST, URI.ROS_DAEMON_READY, URI.ROS_DISCOVERY_READY],
    options: Object.values(URI).sort(),
    description:
      "When communicating with the MAS daemon, the messages from the listed URIs are output as debug messages.",
    group: "Logging",
  },
  logPrintToConsole: {
    label: "Print to console",
    default: true,
    type: "boolean",
    description: "Prints the log output to the console",
    group: "Logging",
  },
  openScreenByDefault: {
    label: "Open screen by default",
    default: false,
    type: "boolean",
    description:
      "If true, double-clicking on a running node opens a screen terminal. Otherwise, the log file is opened. You can reverse the behavior by pressing the Shift key.",
    group: "Logging",
  },
  capabilityGroupParameter: {
    label: "Capability Group parameter",
    freeSolo: true,
    type: "string",
    default: "capability_group",
    description:
      "ROS1 parameter that specifies the group of the node. If the ROS node does not have this parameter it use a global one or group according to the namespace.",
    validate: (value: JSONValue) => {
      if ((value as string).startsWith("/")) {
        return (value as string).substring(1);
      }
      return value;
    },
  },
  launchHistoryLength: {
    label: "Launch History Length",
    type: "number",
    default: 5,
    min: 0,
    max: 15,
    description: "Number of recently loaded files displayed in the Package Explorer tab.",
  },
  logCommand: {
    label: "Log command prefix",
    description: "Terminal command to display the log file. The file name is appended. (+F: waiting for more data)",
    type: "string",
    freeSolo: true,
    default: "while [ ! -f {LOG_FILE} ]; do sleep 1.0; done; /usr/bin/less -fLQR +G +F",
    options: [
      "/usr/bin/less -fLQR +G",
      "/usr/bin/less -fLQR +G +F",
      "while [ ! -f {LOG_FILE} ]; do sleep 1.0; done; /usr/bin/less -fLQR +G +F",
    ],
    group: "Logging",
  },
  color: {
    label: "Color",
    type: "none",
    default: "#1a73e8",
  },
  backgroundColor: {
    label: "Color",
    type: "none",
    default: "#fafafa",
  },
  timeDiffThreshold: {
    label: "Time Diff Threshold [ms]",
    type: "numberX",
    default: 500,
    min: 0,
  },
  namespaceSystemNodes: {
    label: "Namespace for system nodes",
    type: "none",
    default: "/{SYSTEM}",
  },
  tooltipEnterDelay: {
    label: "The number of milliseconds to wait before showing the tooltip.",
    type: "number",
    default: 500,
    group: "Appearance",
  },
  actionOnChangeLaunch: {
    label: "Action on loaded launch file change detection",
    type: "string",
    default: "ASK",
    options: ["ASK", "DISMISS", "RELOAD"],
    description: "",
  },
  dedicatedTabsFor: {
    label: "Use a dedicated tab for each domain or host",
    type: "string",
    default: "DOMAINS",
    options: ["DOMAINS", "HOSTS"],
    description: "",
  },
  editorOpenLocation: {
    label: "Location to open editor tab",
    type: "string",
    default: "CENTER",
    options: ["BORDER_TOP", "CENTER", "BORDER_BOTTOM"],
    description: "",
    group: "Window behavior",
  },
  nodeLoggerOpenLocation: {
    label: "Location to open log level tab",
    type: "string",
    default: "BORDER_RIGHT",
    options: ["BORDER_RIGHT", "CENTER", "BORDER_BOTTOM"],
    description: "",
    group: "Window behavior",
  },
  nodeParamOpenLocation: {
    label: "Location to open node parameter tab",
    type: "string",
    default: "BORDER_RIGHT",
    options: ["BORDER_RIGHT", "CENTER", "BORDER_BOTTOM"],
    description: "",
    group: "Window behavior",
  },
  publisherOpenLocation: {
    label: "Location to open topic publisher tab",
    type: "string",
    default: "BORDER_RIGHT",
    options: ["BORDER_RIGHT", "BORDER_LEFT", "CENTER", "BORDER_BOTTOM"],
    description: "",
    group: "Window behavior",
  },
  subscriberOpenLocation: {
    label: "Location to open topic subscriber tab",
    type: "string",
    default: "BORDER_RIGHT",
    options: ["BORDER_RIGHT", "BORDER_LEFT", "CENTER", "BORDER_BOTTOM"],
    description: "",
    group: "Window behavior",
  },
  avoidGroupWithOneItem: {
    label: "Avoid groups with one item",
    default: true,
    type: "boolean",
    description: "Do not create a collapsible group with an element in it. Use name with namespace instead.",
  },
  tabFullName: {
    label: "Show tab names with namespace",
    default: true,
    type: "boolean",
    description: "",
  },
  showLaunchFileIndicatorForNodes: {
    label: "Show the launchfile indicator for nodes",
    default: true,
    type: "boolean",
    description: "",
  },
  spamNodes: {
    label: "Spam Nodes",
    freeSolo: true,
    type: "string",
    default: ".*_impl_,/*_ros2cli",
    options: [
      ".*_impl_,/*_ros2cli",
      ".*_impl_,/*_ros2cli,/mas/*,/_mas_*,ttyd*",
      ".*_impl_,/*_ros2cli,/mas/*,/_mas_*,ttyd*,zenoh-daemon",
    ],
    description: "Nodes to be placed in a {SPAM} group.",
    isValid: (value: JSONValue) => {
      const splits: string[] = ((value as string) || "").split(",");
      for (const item of splits) {
        try {
          new RegExp(`/(${item})/`);
        } catch (error) {
          console.log(`error while test: ${JSON.stringify(error)}`);
          return false;
        }
      }
      return true;
    },
    validate: (value: JSONValue) => {
      const splits: string[] = ((value as string) || "").split(",");
      const validEntries = splits.filter((item) => {
        try {
          new RegExp(`/(${item})/`);
          return true;
        } catch (error) {
          console.log(`error while test: ${JSON.stringify(error)}`);
        }
        return false;
      });
      return validEntries.join(",");
    },
  },
  ntpServer: {
    label: "NTP Server",
    freeSolo: true,
    type: "string[]",
    default: ["ntp.ubuntu.com"],
    options: ["ntp.ubuntu.com"],
  },
  editorOpenExternal: {
    label: "Open editor in external window by default",
    default: false,
    type: window.commandExecutor ? "boolean" : "none",
    description: "",
    group: "Window behavior",
  },
  logOpenExternal: {
    label: "Open logs in external window by default",
    default: false,
    type: window.commandExecutor ? "boolean" : "none",
    description: "",
    group: "Window behavior",
  },
  screenOpenExternal: {
    label: "Open screen in external window by default",
    default: false,
    type: window.commandExecutor ? "boolean" : "none",
    description: "",
    group: "Window behavior",
  },
  publisherOpenExternal: {
    label: "Open publisher in external window by default",
    default: false,
    type: window.commandExecutor ? "boolean" : "none",
    description: "",
    group: "Window behavior",
  },
  subscriberOpenExternal: {
    label: "Open subscriber in external window by default",
    default: false,
    type: window.commandExecutor ? "boolean" : "none",
    description: "",
    group: "Window behavior",
  },
  showParameterType: {
    label: "Show parameter types in parameter panel",
    default: true,
    type: "boolean",
    description: "",
    group: "hidden",
  },
};

interface ISettingProvider {
  children: React.ReactNode;
}

export const SettingsContext = createContext<ISettingsContext | null>(null);

export function SettingsProvider({ children }: ISettingProvider): ReturnType<React.FC<ISettingProvider>> {
  const MIN_VERSION_DAEMON = "5.7.2";
  const [changed, forceUpdate] = useReducer((x) => x + 1, 0);
  const [config, setConfig] = useLocalStorage<JSONObject, JSONObject>(
    "SettingsContext:config",
    {},
    {
      version: SETTINGS_VERSION,
      migrate: migrateSettings,
    }
  );

  function get(attribute: string): JSONValue | undefined {
    if (attribute in config) {
      return config[attribute];
    }
    if (attribute in SETTINGS_DEF) {
      return SETTINGS_DEF[attribute]?.default;
    }
    throw new Error(`Configuration attribute ${attribute} not found!`);
  }

  function getDefault(attribute: string): JSONValue | undefined {
    if (attribute in SETTINGS_DEF) {
      return SETTINGS_DEF[attribute]?.default;
    }
    throw new Error(`Configuration attribute ${attribute} not found!`);
  }

  function set(attribute: string, value: JSONValue): void {
    if (!SETTINGS_DEF[attribute]) {
      throw new Error(`Configuration attribute ${attribute} while set() not found!`);
    }

    // Create a new object instead of mutating
    const newConfig = { ...config, [attribute]: value };

    // Collect all changes from callbacks before writing
    if (SETTINGS_DEF[attribute].cb) {
      SETTINGS_DEF[attribute].cb?.(
        // get reads from newConfig
        (attr: string) => (attr in newConfig ? newConfig[attr] : SETTINGS_DEF[attr]?.default),
        // set writes into newConfig (no recursion into localStorage)
        (attr: string, val: JSONValue) => {
          newConfig[attr] = val;
        }
      );
    }

    // Remove values that equal the default (keep localStorage clean)
    for (const [key, val] of Object.entries(newConfig)) {
      if (SETTINGS_DEF[key] && JSON.stringify(val) === JSON.stringify(SETTINGS_DEF[key].default)) {
        delete newConfig[key];
      }
    }

    // Single write to localStorage
    setConfig(newConfig);
    forceUpdate();
  }

  function getParamList(): { name: string; param: ISettingsParam }[] {
    const params: { name: string; param: ISettingsParam }[] = [];
    for (const key of Object.keys(SETTINGS_DEF)) {
      params.push({ name: key, param: SETTINGS_DEF[key] });
    }
    return params;
  }

  const attributesMemo = useMemo(
    () => ({
      MIN_VERSION_DAEMON,
      changed,
      get,
      getDefault,
      set,
      getParamList,
    }),
    [changed]
  );

  return <SettingsContext.Provider value={attributesMemo}>{children}</SettingsContext.Provider>;
}

function validateValue(value: JSONValue, def: ISettingsParam): JSONValue | undefined {
  // Type validation
  switch (def.type) {
    case "number":
    case "numberX": {
      const num = Number(value);
      if (Number.isNaN(num)) return undefined;
      if (def.min !== undefined && num < def.min) return undefined;
      if (def.max !== undefined && num > def.max) return undefined;
      return num;
    }
    case "boolean": {
      if (typeof value === "boolean") return value;
      if (value === "true") return true;
      if (value === "false") return false;
      return undefined;
    }
    case "string": {
      if (typeof value !== "string") return undefined;
      // Check if value is included in options (when options are defined and not freeSolo)
      if (def.options && !def.freeSolo) {
        const options = def.options as JSONValue[];
        if (!options.includes(value)) return undefined;
      }
      break;
    }
    case "string[]": {
      if (!Array.isArray(value)) return undefined;
      if (!value.every((v) => typeof v === "string")) return undefined;
      break;
    }
    case "none":
    case "button": {
      // Invisible / non-editable fields: accept the value as is
      break;
    }
    default:
      break;
  }

  // Apply custom validate function from SETTINGS_DEF
  let resultValue = value;
  if (def.validate) {
    resultValue = def.validate(value);
  }

  // Custom isValid check
  if (def.isValid && !def.isValid(resultValue)) {
    return undefined;
  }

  return resultValue;
}

function migrateSettings(oldValue: JSONObject, _oldVersion: number | string | undefined): JSONObject | undefined {
  const migrated: JSONObject = {};

  // Version-specific migrations
  // if (oldVersion === undefined || oldVersion === 1) {
  //   // Example: a setting was renamed
  //   if ("oldSettingName" in data) {
  //     data["newSettingName"] = data["oldSettingName"];
  //     delete data["oldSettingName"];
  //   }
  // }

  // Always validate
  // Iterate over all stored keys
  for (const [key, value] of Object.entries(oldValue)) {
    // Key no longer exists in SETTINGS_DEF → discard
    if (!(key in SETTINGS_DEF)) {
      continue;
    }

    const def = SETTINGS_DEF[key];

    // null/undefined → discard (default will apply)
    if (value === null || value === undefined) {
      continue;
    }

    // Validate value
    const validated = validateValue(value, def);

    // Invalid → do not keep (default will apply)
    if (validated === undefined) {
      console.warn(`[SettingsContext] Discarding invalid value for "${key}":`, value, "→ using default:", def.default);
      continue;
    }

    // Value equals the default → do not store (saves space, default will apply)
    if (JSON.stringify(validated) === JSON.stringify(def.default)) {
      continue;
    }
    migrated[key] = validated;
  }

  return migrated;
}

export default SettingsProvider;
