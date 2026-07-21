import { TFileRange } from "./FileRange";
import { TLaunchArg } from "./LaunchArg";

export const EditorManagerEvents = {
  has: "editor:has",
  open: "editor:open",
  close: "editor:close",
  changed: "editor:changed",
  emitFileRange: "editor:emitFileRange",
  onFileRange: "editor:onFileRange",
  onClose: "editor:onClose",
};

export type FileRangeCallback = (
  editorId: string,
  filePath: string,
  fileRange: TFileRange | null,
  launchArgs: TLaunchArg[]
) => void;

export type EditorCloseCallback = (editorId: string) => void;

export type TEditorConfig = {
  id: string;
  providerId: string;
  host: string;
  port: number;
  rootLaunch: string;
  path: string;
  fileRange: TFileRange | null;
  launchArgs: TLaunchArg[];
  topLevelLaunchArgs: TLaunchArg[];
};

export type TEditorManager = {
  open: (props: TEditorConfig) => Promise<string | null>;

  close: (id: string) => Promise<boolean>;

  changed: (id: string, path: string, changed: boolean) => Promise<boolean>;

  has: (id: string) => Promise<boolean>;

  emitFileRange: (id: string, path: string, fileRange: TFileRange | null, launchArgs: TLaunchArg[]) => Promise<boolean>;

  onFileRange: (callback: FileRangeCallback) => void;

  onClose: (callback: EditorCloseCallback) => void;
};
