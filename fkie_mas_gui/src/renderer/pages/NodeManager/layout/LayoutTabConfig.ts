import { ProviderLaunchConfiguration, RosNode } from "@/renderer/models";
import { CmdType } from "@/renderer/providers";
import { TEnvEntry, TFileRange, TLaunchArg } from "@/types";

export type TExtTerminalConfig = {
  type: CmdType;
  providerId: string;
  nodeName: string;
  topicName: string;
  screen: string;
  cmd: string;
  env: TEnvEntry[];
};

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

export type TPublisherConfig = {
  id: string;
  providerId: string;
  host: string;
  port: number;
  topicName: string;
  topicType: string;
};

export type TSubscriberConfig = {
  id: string;
  providerId: string;
  host: string;
  port: number;
  topic: string;
  showOptions: boolean;
  noData: boolean;
};

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

export type TParameterConfig = {
  id: string;
  nodes: RosNode[];
  providers: string[];
};

export type TServiceCallerConfig = {
  id: string;
  providerId: string;
  serviceName: string;
  serviceType: string;
};

export type TActionConfig = {
  id: string;
  providerId: string;
  actionName: string;
  actionType: string;
};

export type TNodeLoggerConfig = {
  id: string;
  node: RosNode;
};

export type TProviderLaunchConfig = {
  id: string;
  config: ProviderLaunchConfiguration;
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
  /**
   * @deprecated Instead, create a '...Config' and extend the factory() function in NodeManager.tsx
   */
  reactNode?: React.ReactNode;

  contentId?: TContentId;

  openExternal?: boolean;

  terminalType?: CmdType;

  extTerminalConfig?: TExtTerminalConfig;

  editorConfig?: TEditorConfig;

  publisherConfig?: TPublisherConfig;

  subscriberConfig?: TSubscriberConfig;

  terminalConfig?: TTerminalConfig;

  parameterConfig?: TParameterConfig;

  serviceCallerConfig?: TServiceCallerConfig;

  actionConfig?: TActionConfig;

  nodeLoggerConfig?: TNodeLoggerConfig;

  providerLaunchConfig?: TProviderLaunchConfig;

  filterText?: string;
};
