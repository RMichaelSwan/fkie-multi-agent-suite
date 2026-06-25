import { CmdType } from "@/renderer/providers";
import { TFileRange, TLaunchArg } from "@/types";

export type IExtTerminalConfig = {
  type: CmdType;
  providerId: string;
  nodeName: string;
  topicName: string;
  screen: string;
  cmd: string;
  env: string[];
};

export type IEditorConfig = {
  id: string;
  host: string;
  port: number;
  rootLaunch: string;
  path: string;
  fileRange: TFileRange | null;
  launchArgs: TLaunchArg[];
};

export type IPublisherConfig = {
  id: string;
  host: string;
  port: number;
  topicName: string;
  topicType: string;
};

export type ISubscriberConfig = {
  id: string;
  host: string;
  port: number;
  topic: string;
  showOptions: boolean;
  noData: boolean;
};

export type ITerminalConfig = {
  id: string;
  host: string;
  port: number;
  cmdType: CmdType;
  node: string;
  screen: string;
  cmd: string;
  env: string[];
};

export type TContentId =
  | {
      domainId: number;
      providerId?: never;
    }
  | {
      providerId: string;
      domainId?: never;
    };

export const contentToId: (contentId?: TContentId) => string | undefined = (contentId) => {
  return contentId?.domainId ? String(contentId?.domainId) : contentId?.providerId;
};

export type TLayoutTabConfig = {
  reactNode?: React.ReactNode;

  contentId?: TContentId;

  openExternal?: boolean;

  tabType?: CmdType;

  extTerminalConfig?: IExtTerminalConfig;

  editorConfig?: IEditorConfig;

  publisherConfig?: IPublisherConfig;

  subscriberConfig?: ISubscriberConfig;

  terminalConfig?: ITerminalConfig;

  filterText?: string;
};
