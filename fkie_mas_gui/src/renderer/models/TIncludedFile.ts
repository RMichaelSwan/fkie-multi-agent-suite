import LaunchIncludedFile from "./LaunchIncludedFile";

/** Included file extended by the information about its origin. */
export type TIncludedFile = LaunchIncludedFile & {
  /** "daemon": reported by the daemon, "editor": resolved locally as fallback */
  resolver?: "daemon" | "editor";
};
