export const CmdTypes = {
  CMD: "cmd",
  SCREEN: "screen",
  LOG: "log",
  TERMINAL: "terminal",
  PUB: "pub",
  ECHO: "echo",
  SET_TIME: "set_time",
} as const;

export type CmdType = (typeof CmdTypes)[keyof typeof CmdTypes];

export function cmdTypeFromString(type: string | undefined | null): CmdType {
  switch (type?.toLowerCase()) {
    case "cmd":
      return "cmd";
    case "screen":
      return "screen";
    case "log":
      return "log";
    case "pub":
      return "pub";
    case "echo":
      return "echo";
    case "terminal":
      return "terminal";
    case "set_time":
      return "set_time";
    default:
      return "terminal";
  }
}
