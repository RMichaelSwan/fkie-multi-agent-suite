import { CmdType } from "@/types";
import { TEnvEntry } from "./TEnvEntry";

export const TerminalManagerEvents = {
  has: "terminal:has",
  open: "terminal:open",
  close: "terminal:close",
  onClose: "terminal:onClose",
};

export type TerminalCloseCallback = (editorId: string) => void;

export type TTerminalConfig = {
  id: string;
  providerId: string;
  host: string;
  port: number;
  cmdType: CmdType;
  node: string;
  screen: string;
  cmd: string;
  env: TEnvEntry[];
};

export type TTerminalManager = {
  open: (props: TTerminalConfig) => Promise<string | null>;
  close: (id: string) => Promise<boolean>;
  has: (id: string) => Promise<boolean>;
  onClose: (callback: TerminalCloseCallback) => void;
};
