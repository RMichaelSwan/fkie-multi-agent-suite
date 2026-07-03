import AccountTreeIcon from "@mui/icons-material/AccountTree";
import AppsIcon from "@mui/icons-material/Apps";
import FeaturedPlayListIcon from "@mui/icons-material/FeaturedPlayList";
import TopicIcon from "@mui/icons-material/Topic";
import { Box } from "@mui/material";
import * as FlexLayout from "flexlayout-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useCustomEventListener } from "react-custom-events";

import { useAppState } from "@/renderer/hooks/useAppState";
import { useLoggingContext } from "@/renderer/hooks/useLoggingContext";
import { useRosContext } from "@/renderer/hooks/useRosContext";
import { LAYOUT_TABS } from "@/renderer/pages/NodeManager/layout";
import {
  EVENT_SELECT_TAB,
  EVENT_TOGGLE_COMPONENT,
  TEventOpenComponent,
  TEventSelectTab,
} from "@/renderer/pages/NodeManager/layout/events";
import { pAddTabStickyButton } from "@/renderer/pages/NodeManager/layout/helpers";
import { contentToId, TContentId } from "@/renderer/pages/NodeManager/layout/LayoutTabConfig";

/**
 * Minimal JSON node shape used for manipulating the FlexLayout JSON model.
 */
type JsonNode = {
  id: string;
  type: string;
  children?: JsonNode[];
  name?: string;
  component?: string;
  enableClose?: boolean;
  enableMaximize?: boolean;
  config?: Record<string, unknown>;
  weight?: number;
};

/**
 * Options for the persistent FlexLayout hook.
 */

interface DomainFlexLayoutOptions {
  /** Storage key used to persist the serialized layout JSON (e.g. localStorage) */
  storageKey: string;
  /** ID of the tab where this layout is located. It is used to update the content after the tab is selected again. */
  insideTabId: string;

  contentId: TContentId;
}

/**
 * Result of the persistent FlexLayout hook.

 */
export interface DomainFlexLayoutResult {
  model: FlexLayout.Model | null;
  setModel: (model: FlexLayout.Model | null) => void;
  handleModelChange: (model: FlexLayout.Model) => void;
}

/**
 * Hook that manages a FlexLayout.Model and keeps it in sync with:
 * - A list of "ids" (one tab per id)
 * - A persisted JSON representation of the layout

 *
 * It:
 * - Restores from persisted JSON if available (once on initialization)
 * - Merges added/removed ids into the existing layout when ids change
 * - Saves layout changes to storage via `storageKey`

 *
 * Important:
 * - We do NOT recreate the model on every model change.
 *   That would destroy internal component state (e.g. expanded tree nodes)
 *   whenever the user switches tabs or drags them.

 */
export default function useDomainFlexLayout(options: DomainFlexLayoutOptions): DomainFlexLayoutResult {
  const { storageKey, contentId } = options;

  /**
   * Create a tab JSON node for a given id.
   * The tab name is formatted as "Domain <id>" to provide a descriptive label.

   */
  const createTabForId = useCallback(
    (contentId: TContentId): JsonNode => ({
      id: `${LAYOUT_TABS.NODES}-${contentToId(contentId)}`,
      type: "tab",
      name: "Nodes",
      enableClose: false,
      component: LAYOUT_TABS.NODES,
      config: { contentId: contentId },
    }),
    []
  );

  /**
   * Create a simple default layout with a single tabset containing one tab per id.

   */
  const createDefaultLayoutJson = useCallback(
    (contentId?: TContentId): FlexLayout.IJsonModel => {
      console.log("DomainFlexLayout: createDefaultLayoutJson called with domainId", contentId);
      const rowNode: FlexLayout.IJsonRowNode = {
        type: "row",
        weight: 100,
        children: contentId // add a single tabset with Nodes-Panel for the given domainId if provided, otherwise no children
          ? [
              {
                type: "tabset",
                weight: 100,
                children: [createTabForId(contentId)],
              },
            ]
          : [],
      };
      return {
        global: {
          // tabEnableClose: false,
          // tabEnableDrag: false,
          tabEnableRename: false,
          tabSetEnableSingleTabStretch: false,
          tabSetEnableTabStrip: true,
          tabSetEnableTabWrap: false,
          tabSetEnableMaximize: true,
        },
        borders: [],
        layout: rowNode,
      };
    },
    [createTabForId]
  );

  const defaultLayout = useMemo(() => createDefaultLayoutJson(contentId), [createDefaultLayoutJson, contentId]);

  const { value: layoutJson, set: setLayoutJson } = useAppState<FlexLayout.IJsonModel>(
    "layouts",
    `${storageKey}-${contentToId(contentId)}`,
    defaultLayout,
    {
      version: 1,
      migrateFrom: {
        localStorageKey: `${storageKey}-${contentToId(contentId)}`,
      },
    }
  );

  const [model, setModel] = useState<FlexLayout.Model | null>(null);
  const initializedRef = useRef(false);
  const logCtx = useLoggingContext();

  /**
   * Handler for FlexLayout.Layout.onModelChange.
   * Only persists the JSON, does NOT update the model state,
   * to avoid resetting the UI on every interaction.

   *
   * The model instance remains the same while the user interacts
   * (switches tabs, drags tabs, resizes, ...).
   */
  const handleModelChange = useCallback(
    (nextModel: FlexLayout.Model): void => {
      try {
        const json = nextModel.toJson();
        setLayoutJson(json);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logCtx.warn("Failed to serialize layout model", message, "layout not saved");
      }
    },
    [setLayoutJson, logCtx]
  );

  /**
   * Initialize layout from storage on first run,
   * then only react to changes in the ids list (e.g. new/removed domains).

   *
   * Important:
   * - We intentionally do NOT depend on `layoutJson` or `model` here,
   *   so the model is not recreated on every user interaction.
   * - `layoutJson` is read once during initialization via closure.
   */
  useEffect(() => {
    // restore from storage or create default layout
    if (!initializedRef.current) {
      const baseJson: FlexLayout.IJsonModel | null = layoutJson;
      const finalJson = baseJson || createDefaultLayoutJson(contentId);
      try {
        setModel(FlexLayout.Model.fromJson(finalJson));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logCtx.warn("Failed to set domain flex layout, recreating layout", message, "load flex layout failed");
        const fallbackJson = createDefaultLayoutJson(contentId);
        setModel(FlexLayout.Model.fromJson(fallbackJson));
      }
      initializedRef.current = true;
      return;
    }
  }, [contentId, createDefaultLayoutJson, logCtx.warn]);
  // Note:
  // - We intentionally omit `layoutJson` from dependencies
  //   to avoid recreating the model on every storage update.
  //   This keeps tab contents (e.g. expanded tree nodes) stable.

  useEffect(() => {
    if (initializedRef.current) {
      console.log(
        "DomainFlexLayout: domainId changed, selecting tab",
        `${LAYOUT_TABS.NODES}-${contentToId(contentId)}`
      );
      // When the layout is initialized and the domainId changes, select nodes tab
      const selectTabAction = FlexLayout.Actions.selectTab(`${LAYOUT_TABS.NODES}-${contentToId(contentId)}`);
      model?.doAction(selectTabAction);
    }
  }, [model, contentId]);

  return { model, setModel, handleModelChange };
}

/**
 * Props for the generic DomainFlexLayout component.
 */
type DomainFlexLayoutProps = DomainFlexLayoutOptions & {
  /**
   * Factory that renders the content for each tab.
   * The hook ensures that `domainId` matches the value stored.
   */
  factory: (tabNode: FlexLayout.TabNode, contentId: TContentId) => JSX.Element;
  onCloseTab: (id: string) => void;
};

/**
 * Generic FlexLayout wrapper that:
 * - Uses useDomainFlexLayout to manage model + persistence
 * - Exposes a typed `factory` for rendering tab content
 */
export function DomainFlexLayout(props: DomainFlexLayoutProps): JSX.Element | null {
  const { contentId, storageKey, insideTabId, factory, onCloseTab } = props;

  const rosCtx = useRosContext();
  const [forceUpdate, setForceUpdate] = useReducer((x) => x + 1, 0);
  const { model, handleModelChange } = useDomainFlexLayout({
    storageKey,
    contentId,
    insideTabId,
  });

  const closeThisTab = useCallback(() => {
    console.log(`DomainFlexLayout: all provider for this domain ${contentId} removed. Close this tab!`);
    onCloseTab(`${LAYOUT_TABS.DOMAIN}-${contentToId(contentId)}`);
  }, [contentId, onCloseTab]);

  useEffect(() => {
    // if no provider is available for this domain, close this tab.
    for (const p of rosCtx.providers) {
      if (p.connection.domainId === contentId.domainId || p.id === contentId.providerId) {
        return;
      }
    }
    closeThisTab();
  }, [contentId, rosCtx.providers, closeThisTab]);

  /**
   * Wrapper around the user-provided factory.
   * It extracts the domainId from the tab config
   * and passes it as a typed argument to the factory.
   */
  const nodeFactory = useCallback(
    (tabNode: FlexLayout.TabNode): JSX.Element => {
      // const configUnknown = tabNode.getConfig() as unknown;
      // const config =
      //   typeof configUnknown === "object" && configUnknown !== null
      //     ? (configUnknown as Record<string, unknown>)
      //     : ({} as Record<string, unknown>);
      // now you can read the node configuration and use it if needed
      return factory(tabNode, contentId);
    },
    [factory, contentId]
  );

  function onRenderTabSet(
    node: FlexLayout.TabSetNode | FlexLayout.BorderNode,
    renderValues: FlexLayout.ITabSetRenderValues
  ): void {
    const children = node.getChildren();

    for (const child of children) {
      if (model && child.getId() === `${LAYOUT_TABS.NODES}-${contentToId(contentId)}`) {
        pAddTabStickyButton({
          model: model,
          container: renderValues.stickyButtons,
          id: `${LAYOUT_TABS.TOPICS}-${contentToId(contentId)}`,
          title: "Topics",
          component: LAYOUT_TABS.TOPICS,
          setId: node.getId(),
          icon: <TopicIcon sx={{ fontSize: "inherit" }} />,
          config: { contentId: contentId },
        });
        pAddTabStickyButton({
          model: model,
          container: renderValues.stickyButtons,
          id: `${LAYOUT_TABS.SERVICES}-${contentToId(contentId)}`,
          title: "Services",
          component: LAYOUT_TABS.SERVICES,
          setId: node.getId(),
          icon: <FeaturedPlayListIcon sx={{ fontSize: "inherit" }} />,
          config: { contentId: contentId },
        });
        pAddTabStickyButton({
          model: model,
          container: renderValues.stickyButtons,
          id: `${LAYOUT_TABS.ACTIONS}-${contentToId(contentId)}`,
          title: "Actions",
          component: LAYOUT_TABS.ACTIONS,
          setId: node.getId(),
          icon: <AccountTreeIcon sx={{ fontSize: "inherit" }} />,
          config: { contentId: contentId },
        });
        pAddTabStickyButton({
          model: model,
          container: renderValues.stickyButtons,
          id: `${LAYOUT_TABS.APPS}-${contentToId(contentId)}`,
          title: "ROS Apps",
          component: LAYOUT_TABS.APPS,
          setId: node.getId(),
          icon: <AppsIcon sx={{ fontSize: "inherit" }} />,
          config: { contentId: contentId },
        });
      }
    }
  }

  function onRenderTab(node: FlexLayout.TabNode, renderValues: FlexLayout.ITabRenderValues): void {
    const renderNameValues = renderValues as FlexLayout.ITabRenderValues & { name: string };
    switch (node.getComponent()) {
      case LAYOUT_TABS.TOPICS:
        renderNameValues.leading = <TopicIcon sx={{ fontSize: (theme) => theme.typography.fontSize }} />;
        break;
      case LAYOUT_TABS.SERVICES:
        renderNameValues.leading = <FeaturedPlayListIcon sx={{ fontSize: (theme) => theme.typography.fontSize }} />;
        break;
      case LAYOUT_TABS.ACTIONS:
        renderNameValues.leading = <AccountTreeIcon sx={{ fontSize: (theme) => theme.typography.fontSize }} />;
        break;
      case LAYOUT_TABS.APPS:
        renderNameValues.leading = <AppsIcon sx={{ fontSize: (theme) => theme.typography.fontSize }} />;
        break;
    }
  }

  useCustomEventListener(EVENT_SELECT_TAB, (data: TEventSelectTab) => {
    // IMPORTANT: When the surrounding Nodes tab becomes active again,
    // rebuild the internal domain-specific FlexLayout model once.
    if (data.tabId === insideTabId) {
      setForceUpdate();
    }
    model?.doAction(FlexLayout.Actions.selectTab(data.tabId));
  });

  useCustomEventListener(
    EVENT_TOGGLE_COMPONENT,
    (data: TEventOpenComponent) => {
      if (
        !model ||
        data.config?.contentId === undefined ||
        data.config?.contentId.domainId !== contentId.domainId ||
        data.config?.contentId.providerId !== contentId.providerId
      ) {
        return;
      }
      const tab = model.getNodeById(data.id);
      const createTab = tab === undefined;
      if (tab && !(tab as FlexLayout.TabNode)?.isVisible()) {
        model.doAction(FlexLayout.Actions.selectTab(data.id));
        return;
      }
      if (createTab) {
        console.log("DomainFlexLayout: creating new tab", data.id, "for domainId", contentId);
        const tab: FlexLayout.ITabAttributes = {
          id: data.id,
          type: "tab",
          name: data.title,
          component: data.component,
          enableClose: data.closable,
          enablePopout: false,
          config: data.config,
        };
        const action = FlexLayout.Actions.addTab(tab, data.toNodeId, FlexLayout.DockLocation.CENTER, -1);
        model.doAction(action);
      } else {
        model.doAction(FlexLayout.Actions.deleteTab(data.id));
      }
    },
    [model, contentId]
  );

  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, [forceUpdate]);

  if (!model) {
    // If there is no model (e.g. no domainId), render nothing
    return null;
  }

  return (
    <Box
      sx={{
        flex: 1,
        height: "100%",
        width: "100%",
        overflow: "hidden",
        position: "relative", // <- important: anchor for absolute FlexLayout
      }}
    >
      <FlexLayout.Layout
        model={model}
        onAction={(action: FlexLayout.Action) => {
          if (action.type === FlexLayout.Actions.DELETE_TAB) {
            const nodeBId = model.getNodeById(action.data.node);
            // select "Nodes" tab if it is in the same tabset as the closed tab
            for (const tab of nodeBId?.getParent()?.getChildren() || []) {
              if (tab.getType() === "tab" && (tab as FlexLayout.TabNode).getComponent() === LAYOUT_TABS.NODES) {
                model.doAction(FlexLayout.Actions.selectTab(tab.getId()));
              }
            }
          }
          return action;
        }}
        factory={nodeFactory}
        onModelChange={handleModelChange}
        onRenderTab={onRenderTab}
        onRenderTabSet={onRenderTabSet}
      />
    </Box>
  );
}
