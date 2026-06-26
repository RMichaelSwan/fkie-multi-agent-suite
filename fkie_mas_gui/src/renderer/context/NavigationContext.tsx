import { Model } from "flexlayout-react";
import React, { createContext, useCallback, useMemo, useState } from "react";

import { useLoggingContext } from "@/renderer/hooks/useLoggingContext";
import { useRosContext } from "@/renderer/hooks/useRosContext";
import { useSettingsContext } from "@/renderer/hooks/useSettingsContext";
import { getBaseName } from "@/renderer/models";
import { emitEditorSelectRange, emitOpenComponent } from "@/renderer/pages/NodeManager/layout/events";
import { xor } from "@/renderer/utils/index";
import { TFileRange, TLaunchArg } from "@/types";
import { createEditorId } from "../monaco/utils";
import { LAYOUT_TAB_SETS, LAYOUT_TABS } from "../pages/NodeManager/layout";
import { CmdType } from "../providers";

export type TNavSelection = {
  triggerId: string;
  selected: string[];
  selectedNodes: string[];
  selectedProviders: string[];
};

const NO_SELECTION = {
  triggerId: "",
  selected: [],
  selectedNodes: [],
  selectedProviders: [],
};

export interface INavigationContext {
  selection: TNavSelection;
  setSelected: (triggerId: string, nodes: string[], addToHistory?: boolean) => void;
  history: TNavSelection[];
  setSelectedFromHistory: (triggerId: string) => TNavSelection;
  layoutModel: Model | null;
  setLayoutModel: (model: Model | null) => void;
  openEditor: (
    providerId: string,
    rootLaunch: string,
    path: string,
    fileRange: TFileRange | null,
    launchArgs: TLaunchArg[],
    topLevelLaunchArgs: TLaunchArg[],
    externalKeyModifier: boolean
  ) => void;
  startPublisher: (
    providerId: string,
    topicName: string | undefined,
    topicType: string | undefined,
    externalKeyModifier: boolean,
    forceOpenTerminal: boolean
  ) => void;
  openSubscriber: (
    providerId: string,
    topic: string,
    showOptions: boolean,
    defaultNoData: boolean,
    externalKeyModifier: boolean,
    forceOpenTerminal: boolean
  ) => void;
  openTerminal: (
    type: CmdType,
    providerId: string,
    node: string,
    screen: string,
    cmd: string,
    externalKeyModifier: boolean,
    forceOpenTerminal: boolean,
    noPopout?: boolean
  ) => Promise<void>;
}

export const NavigationContext = createContext<INavigationContext | null>(null);

interface INavigationProvider {
  children: React.ReactNode;
}

export function NavigationProvider({ children }: INavigationProvider): JSX.Element {
  const logCtx = useLoggingContext();
  const rosCtx = useRosContext();
  const settingsCtx = useSettingsContext();

  const [selection, setSelection] = useState<TNavSelection>(NO_SELECTION);

  const [history, setHistory] = useState<TNavSelection[]>([]);
  const [layoutModel, setLayoutModel] = useState<Model | null>(null);

  const isProviderId = useCallback(
    (id: string) => {
      return !!rosCtx.getProviderById(id);
    },
    [rosCtx]
  );

  // useCallback keeps stable function references for context consumers
  const setSelected = useCallback(
    (triggerId: string, ids: string[], addToHistory = true): void => {
      setSelection((prevSelection) => {
        const providerIds = ids.filter((id) => isProviderId(id)) || [];
        const nodeIds: string[] = [];
        for (const id of ids) {
          const n = rosCtx.nodeMap.get(id);
          if (n) {
            nodeIds.push(id);
          }
        }
        if (providerIds.length === 0 && addToHistory) {
          setHistory((prev) => (prevSelection ? [...prev, prevSelection] : []));
        }
        return { triggerId: triggerId, selected: ids, selectedNodes: nodeIds, selectedProviders: providerIds };
      });
    },
    [isProviderId, rosCtx.nodeMap]
  );

  const setSelectedFromHistory = useCallback(
    (triggerId: string): TNavSelection => {
      if (!history.length) {
        setSelected(triggerId, []);
        return NO_SELECTION;
      }
      const newHistory = history.slice(0, -1);
      const last = history[history.length - 1];
      setHistory(newHistory);
      setSelected(triggerId, last.selected, false);
      return last;
    },
    [history]
  );

  const openEditor = useCallback(
    async (
      providerId: string,
      rootLaunch: string,
      path: string,
      fileRange: TFileRange | null,
      launchArgs: TLaunchArg[],
      topLevelLaunchArgs: TLaunchArg[],
      externalKeyModifier: boolean
    ): Promise<void> => {
      const provider = rosCtx.getProviderById(providerId);
      if (!provider) return;

      const id = createEditorId(rootLaunch, provider.id);
      const openExternal =
        xor(settingsCtx.get("editorOpenExternal") as boolean, externalKeyModifier) && !layoutModel?.getNodeById(id);

      const hasExtEditor = await window.editorManager?.has(id);
      if (hasExtEditor) {
        window.editorManager?.emitFileRange(id, path, fileRange, launchArgs);
        return;
      }

      if (openExternal && window.editorManager) {
        window.editorManager.open(
          id,
          provider.connection.host,
          provider.connection.port,
          path,
          rootLaunch,
          fileRange,
          launchArgs
        );
        return;
      }
      emitEditorSelectRange({
        editorId: id,
        filePath: path,
        fileRange: fileRange,
        launchArgs: launchArgs,
      });
      emitOpenComponent({
        id: id,
        title: getBaseName(rootLaunch),
        closable: true,
        component: LAYOUT_TABS.EDITOR,
        toNodeId: LAYOUT_TAB_SETS[settingsCtx.get("editorOpenLocation") as string],
        config: {
          contentId: { domainId: provider.connection.domainId },
          openExternal: true,
          tabType: "editor",
          editorConfig: {
            id,
            providerId: provider.id,
            host: provider.connection.host,
            port: provider.connection.port,
            rootLaunch,
            path,
            fileRange,
            launchArgs,
            topLevelLaunchArgs,
          },
        },
      });
    },
    [rosCtx, settingsCtx, layoutModel]
  );

  const startPublisher = useCallback(
    async (
      providerId: string,
      topicName: string | undefined,
      topicType: string | undefined,
      externalKeyModifier: boolean,
      forceOpenTerminal: boolean
    ): Promise<void> => {
      const provider = rosCtx.getProviderById(providerId) || rosCtx.getLocalProvider()[0];
      if (!provider) return;

      const topic = topicName || "";
      const type = topicType || "";
      const id = `pub-${provider.connection.host}-${provider.connection.port}-${topic}`;
      const openExternal =
        xor(settingsCtx.get("publisherOpenExternal") as boolean, externalKeyModifier) && !layoutModel?.getNodeById(id);

      if (forceOpenTerminal) {
        try {
          const env = provider.createRosEnv();
          const terminalCmd = await provider.cmdForType(CmdType.PUB, "", topic, "", "", env);
          const result = await window.commandExecutor?.execTerminal(null, `"pub ${topic}"`, terminalCmd.cmd);
          if (!result?.result) {
            logCtx.error(
              `Can't start publisher in external terminal for ${topic}`,
              `${result?.message}`,
              "publisher not started"
            );
          }
        } catch (error) {
          logCtx.error(`Can't start publisher in external terminal for ${topic}`, `${error}`, "publisher not started");
        }
        return;
      }

      if (window.publishManager && (openExternal || (await window.publishManager?.has(id)))) {
        window.publishManager.start(id, provider.connection.host, provider.connection.port, topic, type);
        return;
      }

      emitOpenComponent({
        id: id,
        title: topic || "unknown",
        closable: true,
        component: LAYOUT_TABS.TOPIC_PUBLISHER,
        toNodeId: LAYOUT_TAB_SETS[settingsCtx.get("publisherOpenLocation") as string],
        config: {
          openExternal: true,
          tabType: `${CmdType.PUB}`,
          publisherConfig: {
            id,
            providerId: provider.id,
            host: provider.connection.host,
            port: provider.connection.port,
            topicName: topic,
            topicType: type,
          },
        },
      });
    },
    [rosCtx, settingsCtx, layoutModel, logCtx]
  );

  const openSubscriber = useCallback(
    async (
      providerId: string,
      topic: string,
      showOptions: boolean,
      defaultNoData: boolean,
      externalKeyModifier: boolean,
      forceOpenTerminal: boolean
    ): Promise<void> => {
      const provider = rosCtx.getProviderById(providerId);
      if (!provider) return;

      const id = `echo-${provider.connection.host}-${provider.connection.port}-${topic}`;
      const openExternal =
        xor(settingsCtx.get("subscriberOpenExternal") as boolean, externalKeyModifier) && !layoutModel?.getNodeById(id);

      if (forceOpenTerminal) {
        try {
          const env = provider.createRosEnv();
          const terminalCmd = await provider.cmdForType(CmdType.ECHO, "", topic, "", "", env);
          const result = await window.commandExecutor?.execTerminal(null, `"echo ${topic}"`, terminalCmd.cmd);
          if (!result?.result) {
            logCtx.error(
              `Can't open subscriber in external terminal for ${topic}`,
              `${result?.message};\nLook for details into terminal output of this GUI.`,
              "subscriber not started"
            );
          }
        } catch (error) {
          logCtx.error(`Can't open subscriber in external terminal for ${topic}`, `${error}`, "subscriber not started");
        }
        return;
      }

      if (window.subscriberManager && (openExternal || (await window.subscriberManager?.has(id)))) {
        window.subscriberManager.open(
          id,
          provider.connection.host,
          provider.connection.port,
          topic,
          showOptions,
          defaultNoData
        );
        return;
      }

      emitOpenComponent({
        id: id,
        title: topic || "unknown",
        closable: true,
        component: LAYOUT_TABS.TOPIC_ECHO,
        toNodeId: LAYOUT_TAB_SETS[settingsCtx.get("subscriberOpenLocation") as string],
        config: {
          openExternal: true,
          tabType: `${CmdType.ECHO}`,
          subscriberConfig: {
            id,
            providerId: provider.id,
            host: provider.connection.host,
            port: provider.connection.port,
            topic,
            showOptions,
            noData: defaultNoData,
          },
        },
      });
    },
    [rosCtx, settingsCtx, layoutModel, logCtx]
  );

  const openTerminal = useCallback(
    async (
      type: CmdType,
      providerId: string,
      node: string,
      screen: string,
      cmd: string,
      externalKeyModifier: boolean,
      forceOpenTerminal: boolean,
      noPopout?: boolean
    ): Promise<void> => {
      logCtx.debug(`Start terminal ${type}@${providerId} for ${node}`);
      const provider = rosCtx.getProviderById(providerId);
      if (!provider) return;

      const id = `terminal-${type}-${provider.connection.host}-${provider.connection.port}-${screen || node}`;
      const openExternal =
        type === CmdType.SCREEN
          ? xor(settingsCtx.get("screenOpenExternal") as boolean, externalKeyModifier)
          : xor(settingsCtx.get("logOpenExternal") as boolean, externalKeyModifier) && !layoutModel?.getNodeById(id);

      const env = provider.createRosEnv();
      if (forceOpenTerminal) {
        try {
          const terminalCmd = await provider.cmdForType(type, node, "", screen, cmd, env);
          const result = await window.commandExecutor?.execTerminal(
            provider.isLocalHost ? null : { host: provider.host() },
            `"${type.toLocaleUpperCase()} ${node}@${provider.host()}"`,
            terminalCmd.cmd
          );
          if (!result?.result) {
            logCtx.error(
              `Can't open external terminal on ${provider.host()}`,
              `${result?.message}`,
              "no external terminal"
            );
          }
        } catch (error) {
          logCtx.error(`Can't open external terminal on ${provider.host()}`, `${error}`, "no external terminal");
        }
        return;
      }

      if (window.terminalManager && (openExternal || (await window.terminalManager?.has(id)))) {
        window.terminalManager.open(
          id,
          provider.connection.host,
          provider.connection.port,
          `${type}`,
          node,
          screen,
          cmd,
          env
        );
        return;
      }

      emitOpenComponent({
        id: id,
        title: node || `${type}_${provider.connection.host}`,
        closable: true,
        component: LAYOUT_TABS.TERMINAL,
        toNodeId: LAYOUT_TAB_SETS.BORDER_BOTTOM,
        config: {
          openExternal: !noPopout,
          tabType: type,
          terminalConfig: {
            id,
            providerId: provider.id,
            host: provider.connection.host,
            port: provider.connection.port,
            cmdType: type,
            node,
            screen,
            cmd,
            env,
          },
        },
      });
    },
    [rosCtx, settingsCtx, layoutModel, logCtx]
  );

  const value = useMemo<INavigationContext>(
    () => ({
      selection,
      setSelected,
      history,
      setSelectedFromHistory,
      layoutModel,
      setLayoutModel,
      openEditor,
      openSubscriber,
      openTerminal,
      startPublisher,
    }),
    [
      selection,
      setSelected,
      history,
      setSelectedFromHistory,
      layoutModel,
      openEditor,
      openSubscriber,
      openTerminal,
      startPublisher,
    ]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export default NavigationContext;
