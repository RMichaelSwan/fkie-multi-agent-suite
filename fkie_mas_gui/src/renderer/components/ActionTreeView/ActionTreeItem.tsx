import { Box, Menu, MenuItem, Stack, Typography } from "@mui/material";
import { grey } from "@mui/material/colors";
import { alpha } from "@mui/material/styles";
import { useCallback, useEffect, useState } from "react";

import { useLoggingContext } from "@/renderer/hooks/useLoggingContext";
import { useRosContext } from "@/renderer/hooks/useRosContext";
import { useSetting } from "@/renderer/hooks/useSetting";

/**
 * Information about a ROS node providing an action.
 */
export interface ActionNodeInfo {
  nodeName: string;
  nodeId: string;
  isLocal: boolean;
  providerId: string;
  providerName: string;
}

/**
 * Information about a discovered ROS 2 action.
 */
export interface ActionInfo {
  name: string; // e.g. "/navigate_to_pose"
  actionType: string; // e.g. "nav2_msgs/action/NavigateToPose"
  goalType: string; // e.g. "nav2_msgs/action/NavigateToPose_SendGoal"
  resultType: string; // e.g. "nav2_msgs/action/NavigateToPose_GetResult"
  feedbackType: string; // e.g. "nav2_msgs/action/NavigateToPose_FeedbackMessage"
  providerId?: string;
  nodeProviders: ActionNodeInfo[];
}

interface ActionTreeItemProps {
  itemId: string;
  rootPath: string;
  actionInfo: ActionInfo;
  selectedItem: string;
  selected: boolean;
  depth: number;
  onSelect: () => void;
}

/**
 * Virtualized row for a single ROS 2 action.
 * - Single click selects the item.
 * - Second click on selected item toggles extended info.
 */
export default function ActionTreeItem({
  itemId,
  rootPath,
  actionInfo,
  selectedItem,
  selected,
  depth,
  onSelect,
}: ActionTreeItemProps): JSX.Element {
  const logCtx = useLoggingContext();
  const rosCtx = useRosContext();

  const [name, setName] = useState<string>("");
  const [namespace, setNamespace] = useState<string>("");
  const [showExtendedInfo, setShowExtendedInfo] = useState<boolean>(false);
  const [ignoreNextClick, setIgnoreNextClick] = useState<boolean>(true);
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number } | null>(null);
  const [colorizeHosts] = useSetting<boolean>("colorizeHosts");

  // Reset click state when item is deselected
  useEffect(() => {
    if (!selected) {
      setIgnoreNextClick(true);
    }
  }, [selected]);

  // Split action name into namespace and leaf name
  useEffect(() => {
    const parts = actionInfo.name.split("/");
    setName(`${parts.pop()}`);
    setNamespace(rootPath ? `${rootPath}/` : "");
  }, [actionInfo.name, rootPath]);

  const getHostStyle = useCallback(
    (providerId: string | undefined): object => {
      if (providerId && colorizeHosts) {
        return {
          flexGrow: 1,
          alignItems: "center",
          borderLeftStyle: "solid",
          borderLeftColor: rosCtx.providerColor(providerId),
          borderLeftWidth: "0.6em",
        };
      }
      return { flexGrow: 1, alignItems: "center", paddingLeft: 0 };
    },
    [colorizeHosts, rosCtx]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu(contextMenu === null ? { mouseX: event.clientX + 2, mouseY: event.clientY - 6 } : null);
    },
    [contextMenu]
  );

  const handleCloseMenu = useCallback((event: React.SyntheticEvent) => {
    setContextMenu(null);
    event.stopPropagation();
  }, []);

  const handleDoubleClickCopy = useCallback(
    (e: React.MouseEvent<HTMLElement>, value: string, label: string) => {
      if (e.detail === 2) {
        navigator.clipboard.writeText(value);
        logCtx.info(`${value} copied!`, "", `${label} copied`);
        e.stopPropagation();
      }
    },
    [logCtx]
  );

  /**
   * Click behavior:
   * - First click on an unselected item selects it.
   * - Second click on the same item toggles extended information.
   */
  const handleRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();

    if (ignoreNextClick) {
      setIgnoreNextClick(false);
    } else {
      setShowExtendedInfo((prev) => !prev);
    }

    onSelect();
  };

  const hardSelected = selected;
  const softSelected = !selected && selectedItem === itemId;
  const lineKeys = Array.from({ length: depth }, (_, i) => `${itemId}-line-${i}`);

  return (
    <Box
      sx={(theme) => ({
        display: "flex",
        alignItems: "stretch",
        cursor: "pointer",
        borderRadius: 0,
        bgcolor: hardSelected
          ? alpha(theme.palette.primary.main, 0.18)
          : softSelected
            ? alpha(theme.palette.primary.main, 0.06)
            : "transparent",
        color: "text.secondary",
      })}
      onClick={handleRowClick}
      onContextMenu={handleContextMenu}
    >
      {/* Indentation guide lines */}
      {lineKeys.map((key) => (
        <Box
          key={key}
          sx={{
            ml: 0.9,
            width: "0.9em",
            borderLeft: `1px dashed ${alpha(grey[600], 0.4)}`,
          }}
        />
      ))}

      {/* Main content */}
      <Box sx={{ flexGrow: 1, py: 0.2, pr: 1 }}>
        {/* Header row with action name and action type */}
        <Box
          sx={{
            ml: 0.7,
            display: "flex",
            alignItems: "center",
            py: 0.2,
          }}
        >
          <Stack spacing={1} direction="row" sx={{ flexGrow: 1, alignItems: "center" }}>
            <Stack direction="row" sx={getHostStyle(actionInfo.providerId)}>
              <Typography
                variant="body2"
                sx={{ fontSize: "inherit", userSelect: "none" }}
                onClick={(e) => handleDoubleClickCopy(e, actionInfo.name, "action name")}
              >
                {namespace}
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontSize: "inherit", fontWeight: "bold", userSelect: "none" }}
                onClick={(e) => handleDoubleClickCopy(e, actionInfo.name, "action name")}
              >
                {name}
              </Typography>
            </Stack>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            {actionInfo.actionType && (
              <Typography
                variant="caption"
                color="inherit"
                padding={0.2}
                onClick={(e) => handleDoubleClickCopy(e, actionInfo.actionType, "action type")}
              >
                {actionInfo.actionType}
              </Typography>
            )}
          </Stack>
        </Box>

        {/* Extended information shown after the second click */}
        {showExtendedInfo && (
          <Stack paddingLeft={3} spacing={0.3}>
            {actionInfo.nodeProviders.length > 0 && (
              <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap">
                <Typography fontWeight="bold" fontSize="small">
                  Provider:
                </Typography>
                <Stack spacing={0.2}>
                  {actionInfo.nodeProviders.map((node) => (
                    <Typography
                      key={node.nodeId}
                      fontSize="small"
                      sx={{ cursor: "pointer" }}
                      onClick={(e) => handleDoubleClickCopy(e, node.nodeName, "provider node")}
                    >
                      {node.nodeName}
                    </Typography>
                  ))}
                </Stack>
              </Stack>
            )}

            <Stack direction="row" spacing={1} alignItems="center">
              <Typography fontWeight="bold" fontSize="small">
                Goal:
              </Typography>
              <Typography
                fontSize="small"
                sx={{ cursor: "pointer" }}
                onClick={(e) => handleDoubleClickCopy(e, actionInfo.goalType, "goal type")}
              >
                {actionInfo.goalType}
              </Typography>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              <Typography fontWeight="bold" fontSize="small">
                Result:
              </Typography>
              <Typography
                fontSize="small"
                sx={{ cursor: "pointer" }}
                onClick={(e) => handleDoubleClickCopy(e, actionInfo.resultType, "result type")}
              >
                {actionInfo.resultType}
              </Typography>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              <Typography fontWeight="bold" fontSize="small">
                Feedback:
              </Typography>
              <Typography
                fontSize="small"
                sx={{ cursor: "pointer" }}
                onClick={(e) => handleDoubleClickCopy(e, actionInfo.feedbackType, "feedback type")}
              >
                {actionInfo.feedbackType}
              </Typography>
            </Stack>
          </Stack>
        )}

        {/* Context menu */}
        <Menu
          open={contextMenu != null}
          onClose={handleCloseMenu}
          anchorReference="anchorPosition"
          anchorPosition={contextMenu != null ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
        >
          <MenuItem
            sx={{ fontSize: "0.8em" }}
            onClick={(event) => {
              navigator.clipboard.writeText(actionInfo.name);
              handleCloseMenu(event);
            }}
          >
            Copy action name
          </MenuItem>
          <MenuItem
            sx={{ fontSize: "0.8em" }}
            onClick={(event) => {
              navigator.clipboard.writeText(actionInfo.actionType);
              handleCloseMenu(event);
            }}
          >
            Copy action type
          </MenuItem>
          {actionInfo.nodeProviders.map((node) => (
            <MenuItem
              key={`copy-provider-${node.nodeId}`}
              sx={{ fontSize: "0.8em" }}
              onClick={(event) => {
                navigator.clipboard.writeText(node.nodeName);
                handleCloseMenu(event);
              }}
            >
              Copy provider node: {node.nodeName}
            </MenuItem>
          ))}
          <MenuItem
            sx={{ fontSize: "0.8em" }}
            onClick={(event) => {
              navigator.clipboard.writeText(actionInfo.goalType);
              handleCloseMenu(event);
            }}
          >
            Copy goal type
          </MenuItem>
          <MenuItem
            sx={{ fontSize: "0.8em" }}
            onClick={(event) => {
              navigator.clipboard.writeText(actionInfo.resultType);
              handleCloseMenu(event);
            }}
          >
            Copy result type
          </MenuItem>
          <MenuItem
            sx={{ fontSize: "0.8em" }}
            onClick={(event) => {
              navigator.clipboard.writeText(actionInfo.feedbackType);
              handleCloseMenu(event);
            }}
          >
            Copy feedback type
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  );
}
