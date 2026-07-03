// ActionPanel.tsx
import CancelIcon from "@mui/icons-material/Cancel";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import EditNoteIcon from "@mui/icons-material/EditNote";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PlaylistRemoveIcon from "@mui/icons-material/PlaylistRemove";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import SendIcon from "@mui/icons-material/Send";
import StarIcon from "@mui/icons-material/Star";
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Divider,
  FormLabel,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCustomEventListener } from "react-custom-events";
import JsonView from "react18-json-view";
import { v4 as uuid } from "uuid";

import SearchBar from "@/renderer/components/UI/SearchBar";
import { useLoggingContext } from "@/renderer/hooks/useLoggingContext";
import { DB_MAX_MSGS, TMsgHistoryEntry, useMsgHistory } from "@/renderer/hooks/useMsgHistory";
import { useRosContext } from "@/renderer/hooks/useRosContext";
import { useSetting } from "@/renderer/hooks/useSetting";
import { rosMessageStructToString, TRosMessageStruct } from "@/renderer/models";
import { Provider } from "@/renderer/providers";
import { EventProviderActionEvent } from "@/renderer/providers/events";
import {
  EVENT_PROVIDER_ACTION_FEEDBACK_PREFIX,
  EVENT_PROVIDER_ACTION_RESULT_PREFIX,
} from "@/renderer/providers/eventTypes";
import { JSONObject } from "@/types";
import InputElements from "./MessageDialogPanel/InputElements";

interface ActionEventDisplay {
  key: string;
  type: "feedback" | "result";
  status: string;
  data: object | null;
  goalId: string;
  timestamp: number;
  receivedIndex: number;
  message?: string;
}

type ActionStatus = "idle" | "waiting" | "executing" | "succeeded" | "aborted" | "canceled" | "rejected" | "error";

interface ActionPanelProps {
  showOptions: boolean;
  actionName: string;
  actionType?: string;
  providerId: string;
}

export default function ActionPanel(props: ActionPanelProps): JSX.Element {
  const { showOptions, actionName, actionType: defaultActionType = "", providerId } = props;

  const rosCtx = useRosContext();
  const logCtx = useLoggingContext();

  const [actionType, setActionType] = useState(defaultActionType);
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [goalStruct, setGoalStruct] = useState<TRosMessageStruct>();
  const [goalStructOrg, setGoalStructOrg] = useState<TRosMessageStruct>();
  const [goalError, setGoalError] = useState<string>("");
  const [feedbackHistory, setFeedbackHistory] = useState<ActionEventDisplay[]>([]);
  const [resultEvent, setResultEvent] = useState<ActionEventDisplay | null>(null);
  const [showFeedbackDetails, setShowFeedbackDetails] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [maxFeedbackCount, setMaxFeedbackCount] = useState<number>(50);
  const [receivedIndex, setReceivedIndex] = useState(0);
  const [historyEditMode, setHistoryEditMode] = useState<boolean>(false);
  const [inputElements, setInputElements] = useState<React.ReactNode | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [useDarkMode] = useSetting<boolean>("useDarkMode");
  const [colorizeHosts] = useSetting<boolean>("colorizeHosts");
  const [backgroundColor] = useSetting<string>("backgroundColor");

  // Goal history via useMsgHistory
  const goalTypeKey = actionType ? `${actionType}_Goal` : `action_goal:${actionName}`;
  const {
    entries: goalHistory,
    addEntry,
    updateMeta,
    deleteEntry,
    deleteNonFavorites,
    maxEntries: maxHistoryLength,
    setMaxEntries: setMaxHistoryLength,
  } = useMsgHistory(goalTypeKey);

  // Resolve provider from providerId
  useEffect(() => {
    if (!providerId) return;
    const newProvider = rosCtx.getProviderById(providerId);
    if (newProvider) {
      setProvider(newProvider);
    }
  }, [providerId, rosCtx]);

  useEffect(() => {
    if (goalHistory.length === 0) setHistoryEditMode(false);
  }, [goalHistory]);

  // Resolve action type from provider's node list if not given
  useEffect(() => {
    if (actionType) return;
    if (!provider || !actionName) return;

    const nodeList = rosCtx.mapProviderRosNodes.get(provider.id);
    for (const node of nodeList || []) {
      for (const service of node.services || []) {
        if (service.name === `${actionName}/_action/send_goal`) {
          const srvType = service.msg_type;
          if (srvType) {
            const actionTypeStr = srvType.replace("_SendGoal", "").replace("/srv/", "/action/");
            setActionType(actionTypeStr);
          }
          break;
        }
      }
    }
  }, [provider, actionName, actionType, rosCtx.mapProviderRosNodes]);

  // Load goal struct when action type and provider are known
  useEffect(() => {
    if (!actionType || !provider) return;
    const goalTypeName = `${actionType}_Goal`;
    provider.getMessageStruct(goalTypeName).then((struct) => {
      if (struct?.data) {
        setGoalStructOrg(structuredClone(struct.data));
        setGoalStruct(structuredClone(struct.data));
      }
    });
  }, [actionType, provider]);

  // Update input elements
  const onUpdateInputElements = useCallback(
    (search: string) => {
      if (!goalStruct) return;
      setInputElements(
        <InputElements
          key={goalStruct.type}
          messageStruct={goalStruct}
          parentName={goalStruct.type ? goalStruct.type : `${actionName}[${actionType}]`}
          filterText={search}
        />
      );
    },
    [goalStruct, actionName, actionType]
  );

  useEffect(() => {
    if (!goalStruct) return;
    onUpdateInputElements(searchTerm);
  }, [goalStruct]);

  useEffect(() => {
    onUpdateInputElements(searchTerm);
  }, [searchTerm]);

  // Load from history
  const fromHistory = useCallback(
    (entry: TMsgHistoryEntry) => {
      setGoalStruct(structuredClone(entry.data));
    },
    [setGoalStruct]
  );

  // Save to history
  const updateGoalHistory = useCallback(() => {
    if (!goalStruct) return;
    const messageStr = rosMessageStructToString(goalStruct, false, false);
    if (messageStr === "{}") return;

    const exists = goalHistory.some((item) => rosMessageStructToString(item.data, false, false) === messageStr);
    if (!exists) {
      addEntry({
        messageType: goalTypeKey,
        name: "",
        favorite: false,
        data: goalStruct,
        createdAt: Date.now(),
      });
    }
  }, [goalStruct, goalHistory, goalTypeKey, addEntry]);

  // Copy goal to clipboard
  const onCopyToClipboard = useCallback(() => {
    const json = goalStruct ? rosMessageStructToString(goalStruct, false, false) : "{}";
    navigator.clipboard.writeText(`${actionName} ${actionType} "${json}"`);
    logCtx.success("Action goal copied to clipboard!", "", "action goal copied");
  }, [goalStruct, actionName, actionType]);

  // Listen for feedback events
  useCustomEventListener(
    `${EVENT_PROVIDER_ACTION_FEEDBACK_PREFIX}_${actionName}`,
    (data: EventProviderActionEvent) => {
      if (!data?.event) return;
      const evt = data.event;
      const display: ActionEventDisplay = {
        key: uuid(),
        type: "feedback",
        status: evt.status,
        data: evt.data,
        goalId: evt.goal_id,
        timestamp: Date.now(),
        receivedIndex,
      };
      setReceivedIndex((prev) => prev + 1);
      setActionStatus("executing");
      setFeedbackHistory((prev) => [display, ...prev.slice(0, maxFeedbackCount - 1)]);
    },
    [actionName, receivedIndex, maxFeedbackCount]
  );

  // Listen for result events
  useCustomEventListener(
    `${EVENT_PROVIDER_ACTION_RESULT_PREFIX}_${actionName}`,
    (data: EventProviderActionEvent) => {
      if (!data?.event) return;
      const evt = data.event;
      const display: ActionEventDisplay = {
        key: uuid(),
        type: "result",
        status: evt.status,
        data: evt.data,
        goalId: evt.goal_id,
        timestamp: Date.now(),
        receivedIndex,
        message: evt.message,
      };
      setReceivedIndex((prev) => prev + 1);
      setResultEvent(display);
      setActionStatus(evt.status as ActionStatus);
      setIsSubmitting(false);
    },
    [actionName, receivedIndex]
  );

  // Send goal
  async function handleSendGoal(): Promise<void> {
    setGoalError("");
    setResultEvent(null);
    setFeedbackHistory([]);

    if (!provider || !actionName || !actionType) {
      setGoalError("Action name, type and provider are required");
      return;
    }

    if (!goalStruct) {
      setGoalError("No goal struct available");
      return;
    }

    setActionStatus("waiting");
    setIsSubmitting(true);

    updateGoalHistory();

    const success = await provider.sendActionGoal({
      action_name: actionName,
      action_type: actionType,
      goal: JSON.stringify(goalStruct),
    });

    if (!success) {
      setActionStatus("error");
      setGoalError("Failed to send goal to provider");
      setIsSubmitting(false);
    }
  }

  // Cancel goal
  const cancelGoal = useCallback(async () => {
    if (!provider || !actionName) return;
    const result = await provider.stopAction(actionName);
    if (result.result) {
      setActionStatus("canceled");
    } else {
      logCtx.warn(`Failed to cancel action: ${result.message}`, "");
    }
    setIsSubmitting(false);
  }, [provider, actionName]);

  // Clear feedback
  const clearFeedback = useCallback(() => {
    setFeedbackHistory([]);
    setResultEvent(null);
  }, []);

  const isActive = actionStatus === "waiting" || actionStatus === "executing";

  const statusColor = useMemo(() => {
    switch (actionStatus) {
      case "idle":
        return "default";
      case "waiting":
        return "info";
      case "executing":
        return "primary";
      case "succeeded":
        return "success";
      case "aborted":
      case "error":
        return "error";
      case "canceled":
      case "rejected":
        return "warning";
      default:
        return "default";
    }
  }, [actionStatus]);

  const getHostStyle = useCallback((): object => {
    if (provider?.id && colorizeHosts) {
      return {
        flexGrow: 1,
        borderTopStyle: "solid",
        borderTopColor: rosCtx.providerColor(provider.id),
        borderTopWidth: "0.3em",
        backgroundColor,
      };
    }
    return { flexGrow: 1, backgroundColor };
  }, [provider, backgroundColor, colorizeHosts]);

  // History button
  function createHistoryButton(entry: TMsgHistoryEntry): JSX.Element {
    return (
      <Tooltip key={`history-button-${entry.id}`} title={entry.name || entry.id} placement="bottom" disableInteractive>
        <Button
          onClick={(event) => {
            fromHistory(entry);
            event.stopPropagation();
          }}
          startIcon={<StorageOutlinedIcon />}
          size="small"
        >
          {entry.name || entry.id}
        </Button>
      </Tooltip>
    );
  }

  // History edit item
  function createHistoryEditItem(entry: TMsgHistoryEntry): JSX.Element {
    return (
      <Stack key={`history-edit-item-${entry.id}`} direction="row" spacing="0.5em">
        <Tooltip title="favorite entries are not automatically deleted" placement="bottom" disableInteractive>
          <IconButton
            onClick={(event) => {
              updateMeta(entry.id, { favorite: !entry.favorite });
              event.stopPropagation();
            }}
            size="small"
          >
            {entry.favorite ? <StarIcon sx={{ color: "yellow" }} /> : <StarOutlineIcon />}
          </IconButton>
        </Tooltip>
        <TextField
          variant="standard"
          size="small"
          defaultValue={entry.name || entry.id}
          onBlur={(event) => {
            if (event.target.value && event.target.value !== entry.name) {
              updateMeta(entry.id, { name: event.target.value });
            }
          }}
        />
        <IconButton
          color="error"
          onClick={(event) => {
            deleteEntry(entry.id);
            event.stopPropagation();
          }}
          size="small"
        >
          <RemoveCircleOutlineIcon />
        </IconButton>
      </Stack>
    );
  }

  const createResultView = useMemo(() => {
    if (!resultEvent) return null;
    return (
      <Paper elevation={2} sx={{ p: 1 }}>
        <Stack spacing={0.5}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="subtitle2" fontWeight="bold">
              Result
            </Typography>
            <Chip label={resultEvent.status} color={statusColor} size="small" />
            <Typography variant="caption" color="grey">
              {new Date(resultEvent.timestamp).toLocaleTimeString()}
            </Typography>
          </Stack>
          {resultEvent.message && (
            <Typography variant="body2" color="error">
              {resultEvent.message}
            </Typography>
          )}
          {resultEvent.data && (
            <JsonView
              src={resultEvent.data}
              dark={useDarkMode}
              theme="a11y"
              enableClipboard={false}
              collapseObjectsAfterLength={3}
              displaySize="collapsed"
            />
          )}
        </Stack>
      </Paper>
    );
  }, [resultEvent, statusColor, useDarkMode]);

  const renderFeedback = useMemo(() => {
    if (feedbackHistory.length === 0) return null;
    return (
      <Stack spacing={0.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <ExpandMoreIcon
            style={{ transform: showFeedbackDetails ? "" : "rotate(-90deg)", cursor: "pointer" }}
            fontSize="small"
            onClick={() => setShowFeedbackDetails((prev) => !prev)}
          />
          <Typography variant="subtitle2" fontWeight="bold">
            Feedback ({feedbackHistory.length})
          </Typography>
          <Tooltip title="Clear feedback" placement="bottom" disableInteractive>
            <IconButton size="small" onClick={clearFeedback}>
              <PlaylistRemoveIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Max feedback count" placement="bottom" disableInteractive>
            <Select
              size="small"
              value={maxFeedbackCount.toString()}
              onChange={(e) => setMaxFeedbackCount(Number.parseInt(e.target.value))}
              sx={{ fontSize: "0.7em", minWidth: 50 }}
            >
              {[10, 25, 50, 100, 200].map((v) => (
                <MenuItem key={v} value={v} sx={{ fontSize: "0.7em" }}>
                  {v}
                </MenuItem>
              ))}
            </Select>
          </Tooltip>
        </Stack>
        {showFeedbackDetails && (
          <Stack spacing={0.5} sx={{ maxHeight: "300px", overflow: "auto" }}>
            {feedbackHistory.map((fb) => (
              <Paper key={fb.key} elevation={1} sx={{ p: 0.5 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption" color="grey">
                    #{fb.receivedIndex} {new Date(fb.timestamp).toLocaleTimeString()}
                  </Typography>
                  <Chip label={fb.status} size="small" color="primary" variant="outlined" />
                </Stack>
                {fb.data && (
                  <JsonView
                    src={fb.data}
                    dark={useDarkMode}
                    theme="a11y"
                    enableClipboard={false}
                    collapseObjectsAfterLength={2}
                    displaySize="collapsed"
                  />
                )}
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>
    );
  }, [feedbackHistory, showFeedbackDetails, maxFeedbackCount, useDarkMode]);

  return (
    <Box height="100%" overflow="auto" alignItems="center" sx={getHostStyle()}>
      <Stack spacing={1} margin={1}>
        {/* Search bar for goal fields */}
        {showOptions && goalStruct && (goalStruct.def || []).length > 0 && (
          <SearchBar
            onSearch={(value) => setSearchTerm(value)}
            placeholder="Filter Goal Fields"
            defaultValue={searchTerm}
          />
        )}{" "}
        {/* Header */}
        <Stack direction="column" alignItems="left" spacing={0.5}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography fontWeight="bold">{actionName}</Typography>
            <Typography color="grey" fontSize="0.8em">
              {provider?.name()}
            </Typography>
          </Stack>
          <Typography color="grey" fontSize="0.8em">
            [{actionType || "detecting..."}]
          </Typography>
          <Chip
            label={actionStatus}
            color={statusColor}
            size="small"
            variant="outlined"
            sx={{ alignSelf: "flex-start" }}
          />
        </Stack>
        {/* Goal History */}
        {goalHistory.length > 0 && (
          <Stack direction="column" spacing={1} alignItems="left" paddingBottom={1}>
            <FormLabel sx={{ fontSize: "0.8em", lineHeight: "1em" }}>goal history</FormLabel>
            <ButtonGroup sx={{ maxHeight: "24px", flexWrap: "wrap" }}>
              <Tooltip title="edit history" enterDelay={500}>
                <Button
                  color="success"
                  onClick={(event) => {
                    setGoalStruct(structuredClone(goalStructOrg));
                    setHistoryEditMode((prev) => !prev);
                    event.stopPropagation();
                  }}
                  size="small"
                >
                  <EditNoteIcon />
                </Button>
              </Tooltip>
              {goalHistory.map((entry) => createHistoryButton(entry))}
            </ButtonGroup>
            {historyEditMode && (
              <Stack direction="column" alignContent="start">
                <Stack direction="row" alignContent="start">
                  <Slider
                    aria-label="Max history length"
                    value={maxHistoryLength}
                    valueLabelFormat={(index) => `max history length: ${index}`}
                    valueLabelDisplay="auto"
                    shiftStep={1}
                    step={1}
                    marks
                    min={1}
                    max={DB_MAX_MSGS}
                    onChange={(_event: Event, newValue: number) => {
                      setMaxHistoryLength(newValue);
                    }}
                    sx={{ maxWidth: "80%", marginRight: "1.5em" }}
                  />
                  <Tooltip title="Remove all non-favorite entries" enterDelay={500}>
                    <IconButton
                      color="error"
                      onClick={(event) => {
                        deleteNonFavorites();
                        event.stopPropagation();
                      }}
                      size="small"
                    >
                      <DeleteForeverIcon />
                    </IconButton>
                  </Tooltip>
                </Stack>
                {goalHistory.map((entry) => createHistoryEditItem(entry))}
              </Stack>
            )}
          </Stack>
        )}
        {/* Action buttons */}
        <Box>
          {isSubmitting ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size="1em" />
              <Typography variant="body2">
                {`Sending goal: ${rosMessageStructToString(goalStruct, false, false)}`}
              </Typography>
              <Tooltip title="Cancel goal" placement="bottom" disableInteractive>
                <Button variant="outlined" color="warning" size="small" startIcon={<CancelIcon />} onClick={cancelGoal}>
                  Cancel
                </Button>
              </Tooltip>
            </Stack>
          ) : (
            <Stack direction="row" spacing="0.5em" alignItems="center">
              <Button
                variant="contained"
                color="success"
                onClick={handleSendGoal}
                disabled={!goalStruct?.type || isActive}
                startIcon={<SendIcon />}
              >
                Send Goal
              </Button>
              {isActive && (
                <Button variant="outlined" color="warning" size="small" startIcon={<CancelIcon />} onClick={cancelGoal}>
                  Cancel
                </Button>
              )}
              <Tooltip title="Copy action name, type and goal data" placement="bottom">
                <IconButton
                  color="default"
                  onClick={(event) => {
                    onCopyToClipboard();
                    event.stopPropagation();
                  }}
                  size="small"
                >
                  <ContentCopyOutlinedIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            </Stack>
          )}
        </Box>
        <Divider />
        {/* Goal input fields */}
        {showOptions && inputElements}
        {/* Errors */}
        {!goalStruct && actionType && (
          <Alert severity="error" style={{ minWidth: 0 }}>
            <AlertTitle>{`Goal definition for ${actionName}[${actionType}] not found!`}</AlertTitle>
          </Alert>
        )}
        {goalError && (
          <Alert severity="error" style={{ minWidth: 0 }}>
            <AlertTitle>{goalError}</AlertTitle>
          </Alert>
        )}
        {!provider && <Alert severity="info">Waiting for provider to initialize...</Alert>}
        {provider && !actionType && <Alert severity="warning">Could not detect action type for: {actionName}</Alert>}
        <Divider />
        {/* Result */}
        {createResultView}
        {/* Feedback */}
        {renderFeedback}
        {/* Initial hint */}
        {actionStatus === "idle" && feedbackHistory.length === 0 && !resultEvent && goalStruct && (
          <Alert severity="info">
            Configure goal fields and click &ldquo;Send Goal&rdquo; to start the action (Ctrl+Enter).
          </Alert>
        )}
      </Stack>
    </Box>
  );
}
