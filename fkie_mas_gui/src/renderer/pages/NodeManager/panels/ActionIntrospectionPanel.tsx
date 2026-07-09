import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PlaylistRemoveIcon from "@mui/icons-material/PlaylistRemove";
import StopIcon from "@mui/icons-material/Stop";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useCustomEventListener } from "react-custom-events";
import JsonView from "react18-json-view";
import { v4 as uuid } from "uuid";

import { useAppState } from "@/renderer/hooks/useAppState";
import { useRosContext } from "@/renderer/hooks/useRosContext";
import { useSetting } from "@/renderer/hooks/useSetting";
import { Provider } from "@/renderer/providers";
import { EventProviderActionIntrospection } from "@/renderer/providers/events";

import { EVENT_PROVIDER_ACTION_INTROSPECTION_PREFIX, EVENT_PROVIDER_ROS_TOPICS } from "@/renderer/providers/eventTypes";

interface IntrospectionDisplay {
  key: string;
  phase: string;
  eventType: string;
  sequenceNumber: number;
  clientGid: number[];
  data: object | null;
  timestamp: number;
  receivedIndex: number;
}

interface ActionIntrospectionPanelProps {
  actionName: string;
  actionType: string;
  providerId: string;
}

type IntrospectionConfigValue = "disabled" | "metadata" | "contents";

const phaseColor: Record<string, "primary" | "secondary" | "warning"> = {
  send_goal: "primary",
  get_result: "secondary",
  cancel_goal: "warning",
};

const eventColor: Record<string, "info" | "success" | "default"> = {
  REQUEST_SENT: "info",
  REQUEST_RECEIVED: "info",
  RESPONSE_SENT: "success",
  RESPONSE_RECEIVED: "success",
};

export default function ActionIntrospectionPanel(props: ActionIntrospectionPanelProps): JSX.Element {
  const { actionName, actionType, providerId } = props;
  const rosCtx = useRosContext();

  const [provider, setProvider] = useState<Provider | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [events, setEvents] = useState<IntrospectionDisplay[]>([]);
  const { value: maxCount, set: setMaxCount } = useAppState<number>("dialogs", "action:introspection:max-count", 50);

  const [_receivedIndex, setReceivedIndex] = useState(0);
  const [topicsUpdated, setTopicsUpdated] = useReducer((x) => x + 1, 0);
  const [phaseFilter, setPhaseFilter] = useState<string>("all");

  const [targetNodeName, setTargetNodeName] = useState<string>("");
  const [introspectionConfig, setIntrospectionConfig] = useState<string>("");
  const [paramAvailable, setParamAvailable] = useState<boolean>(false);
  const [isConfiguring, setIsConfiguring] = useState(false);

  const [useDarkMode] = useSetting<boolean>("useDarkMode");
  const [colorizeHosts] = useSetting<boolean>("colorizeHosts");
  const [backgroundColor] = useSetting<string>("backgroundColor");

  useEffect(() => {
    const p = rosCtx.getProviderById(providerId);
    if (p) {
      setProvider(p);
    } else {
      setProvider(null);
    }
  }, [providerId, rosCtx]);

  const loadIntrospectionConfig = useCallback(async () => {
    if (!provider || !targetNodeName) {
      setIntrospectionConfig("");
      setParamAvailable(false);
      return;
    }

    try {
      // getNodeParameters returns all parameters for the given node list.
      const result = await provider.getNodeParameters([targetNodeName]);
      const param = result.params.find(
        (p) => p.node === targetNodeName && p.name === "action_server_configure_introspection"
      );

      // Parameter is available only if it was actually found on the node
      setParamAvailable(param !== undefined);
      setIntrospectionConfig(String(param?.value ?? ""));
    } catch {
      setIntrospectionConfig("");
      setParamAvailable(false);
    }
  }, [provider, targetNodeName]);

  const introspectionAvailable = useMemo(() => {
    loadIntrospectionConfig();
    return provider?.hasActionIntrospection(actionName) ?? false;
  }, [provider, actionName, topicsUpdated, loadIntrospectionConfig]);

  useCustomEventListener(EVENT_PROVIDER_ROS_TOPICS, () => {
    setTopicsUpdated();
  });

  const getHostStyle = useCallback((): object => {
    if (providerId && colorizeHosts) {
      return {
        flexGrow: 1,
        borderTopStyle: "solid",
        borderTopColor: rosCtx.providerColor(providerId),
        borderTopWidth: "0.3em",
        backgroundColor,
      };
    }
    return { flexGrow: 1, backgroundColor };
  }, [providerId, colorizeHosts, backgroundColor, rosCtx]);

  const getIntrospectionTopics = useCallback((): string[] => {
    return [
      `${actionName}/_action/send_goal/_service_event`,
      `${actionName}/_action/get_result/_service_event`,
      `${actionName}/_action/cancel_goal/_service_event`,
    ];
  }, [actionName]);

  const getActionServiceNames = useCallback((): string[] => {
    return [`${actionName}/_action/send_goal`, `${actionName}/_action/get_result`, `${actionName}/_action/cancel_goal`];
  }, [actionName]);

  const resolveTargetNodeName = useCallback((): string => {
    if (!provider?.rosNodes || !provider?.rosServices) return "";

    const serviceNames = getActionServiceNames();

    for (const serviceName of serviceNames) {
      const node = provider?.getNodeForService(serviceName);
      if (!node) continue;
      return node.name;
    }

    return "";
  }, [provider, getActionServiceNames]);

  useEffect(() => {
    if (!provider) {
      setMonitoring(false);
      return;
    }

    const introspectionTopics = getIntrospectionTopics();

    const hasIntrospectionSubscriber =
      provider.rosNodes?.some((node) =>
        (node.subscribers || []).some((sub) => introspectionTopics.includes(sub.name))
      ) ?? false;

    setMonitoring(hasIntrospectionSubscriber);
  }, [provider, getIntrospectionTopics, rosCtx.mapProviderRosNodes]);

  useEffect(() => {
    setTargetNodeName(resolveTargetNodeName());
  }, [resolveTargetNodeName, topicsUpdated]);

  useEffect(() => {
    if (monitoring) {
      setIsStarting(false);
    }
  }, [monitoring]);

  useEffect(() => {
    if (!isStarting) return;

    const timer = window.setTimeout(() => {
      setIsStarting(false);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [isStarting]);

  useCustomEventListener(
    `${EVENT_PROVIDER_ACTION_INTROSPECTION_PREFIX}_${actionName}`,
    (data: EventProviderActionIntrospection) => {
      if (!data?.event) return;

      const evt = data.event;

      setReceivedIndex((prev) => {
        const currentIndex = prev;
        const display: IntrospectionDisplay = {
          key: uuid(),
          phase: evt.phase,
          eventType: evt.event_type,
          sequenceNumber: evt.sequence_number,
          clientGid: evt.client_gid,
          data: evt.data,
          timestamp: evt.timestamp ? evt.timestamp * 1000 : Date.now(),
          receivedIndex: currentIndex,
        };

        setEvents((old) => [display, ...old.slice(0, maxCount - 1)]);
        return prev + 1;
      });
    },
    [actionName, maxCount]
  );

  const startMonitoring = useCallback(async () => {
    if (!provider || !introspectionAvailable) return;

    try {
      setIsStarting(true);
      await provider.startActionIntrospection(actionName, actionType);
    } catch {
      setIsStarting(false);
    }
  }, [provider, introspectionAvailable, actionName, actionType]);

  const stopMonitoring = useCallback(async () => {
    if (!provider) return;

    setIsStarting(false);
    await provider.stopActionIntrospection(actionName);
  }, [provider, actionName]);

  const setNodeIntrospectionConfig = useCallback(
    async (value: IntrospectionConfigValue) => {
      if (!provider || !targetNodeName) return;

      try {
        setIsConfiguring(true);

        // The provider API expects:
        // setParameter(paramName, paramType, paramValue, nodeName)
        const result = await provider.setParameter(
          "action_server_configure_introspection",
          "str",
          value,
          targetNodeName
        );

        if (result?.result) {
          setIntrospectionConfig(value);
          setTopicsUpdated();
        }
      } finally {
        setIsConfiguring(false);
      }
    },
    [provider, targetNodeName]
  );

  const filtered = useMemo(
    () => (phaseFilter === "all" ? events : events.filter((e) => e.phase === phaseFilter)),
    [events, phaseFilter]
  );

  return (
    <Box height="100%" overflow="hidden" sx={getHostStyle()}>
      <Stack height="100%" spacing={1} marginLeft={1} marginRight={1} marginBottom={1}>
        <Stack direction="column" alignItems="left" spacing={0.3} paddingTop={1}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Chip
              label={monitoring ? "monitoring" : isStarting ? "starting" : "stopped"}
              color={monitoring ? "success" : isStarting ? "info" : "default"}
              size="small"
              variant="outlined"
            />
            <Typography fontWeight="bold" flexGrow={1}>
              {actionName}
            </Typography>
            <Typography color="grey" fontSize="0.8em">
              {provider?.name()}
            </Typography>
          </Stack>
          <Typography color="grey" fontSize="0.8em">
            {actionType || "detecting type..."}
          </Typography>
          {targetNodeName && (
            <Typography color="grey" fontSize="0.8em">
              node: {targetNodeName}
            </Typography>
          )}
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          {monitoring ? (
            <Button variant="outlined" color="warning" size="small" startIcon={<StopIcon />} onClick={stopMonitoring}>
              Stop
            </Button>
          ) : isStarting ? (
            <Box
              sx={{
                height: 32,
                minWidth: 120,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CircularProgress size={20} />
            </Box>
          ) : (
            <Tooltip
              title={
                introspectionAvailable
                  ? "Start action introspection"
                  : "This action does not provide introspection topics"
              }
              disableInteractive
            >
              <span>
                <Button
                  variant="contained"
                  color="success"
                  size="small"
                  startIcon={<PlayArrowIcon />}
                  onClick={startMonitoring}
                  disabled={!introspectionAvailable}
                >
                  Start Introspection
                </Button>
              </span>
            </Tooltip>
          )}

          {paramAvailable ? (
            <Tooltip
              title="Configure the introspection parameter 'action_server_configure_introspection' on the related ROS node"
              placement="top"
              disableInteractive
            >
              <span>
                <Select
                  size="small"
                  value={introspectionConfig || ""}
                  displayEmpty
                  disabled={!targetNodeName || isConfiguring}
                  onChange={(e) => setNodeIntrospectionConfig(e.target.value as IntrospectionConfigValue)}
                  sx={{ fontSize: "0.7em" }}
                >
                  <MenuItem value="" disabled sx={{ fontSize: "0.7em" }}>
                    unavailable
                  </MenuItem>
                  <MenuItem value="disabled" sx={{ fontSize: "0.7em" }}>
                    disabled
                  </MenuItem>
                  <MenuItem value="metadata" sx={{ fontSize: "0.7em" }}>
                    metadata
                  </MenuItem>
                  <MenuItem value="contents" sx={{ fontSize: "0.7em" }}>
                    contents
                  </MenuItem>
                </Select>
              </span>
            </Tooltip>
          ) : (
            <Tooltip
              title="Parameter 'action_server_configure_introspection' is not available on the related ROS node"
              placement="top"
              disableInteractive
            >
              <WarningAmberIcon color="warning" fontSize="small" />
            </Tooltip>
          )}
          <Tooltip title="Clear events" disableInteractive>
            <IconButton size="small" onClick={() => setEvents([])}>
              <PlaylistRemoveIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Select
            size="small"
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            sx={{ fontSize: "0.7em" }}
          >
            {["all", "send_goal", "get_result", "cancel_goal"].map((p) => (
              <MenuItem key={p} value={p} sx={{ fontSize: "0.7em" }}>
                {p}
              </MenuItem>
            ))}
          </Select>

          <Select
            size="small"
            value={maxCount.toString()}
            onChange={(e) => setMaxCount(Number.parseInt(e.target.value))}
            sx={{ fontSize: "0.7em" }}
          >
            {[25, 50, 100, 200, 500].map((v) => (
              <MenuItem key={v} value={v} sx={{ fontSize: "0.7em" }}>
                {v}
              </MenuItem>
            ))}
          </Select>
        </Stack>

        <Divider />

        {!provider && <Alert severity="info">Waiting for provider...</Alert>}

        {provider && !targetNodeName && (
          <Alert severity="warning">
            Could not resolve the ROS node that provides this action. The parameter
            <b> service_configure_introspection </b>
            cannot be configured until the related action service node is visible.
          </Alert>
        )}

        {provider && !monitoring && !introspectionAvailable && (
          <Alert severity="info">
            This action does not expose introspection topics on the provider. To enable introspection, the ROS 2 action
            server or client must publish service event topics and use introspection state <b>metadata</b> or{" "}
            <b>contents</b>. Expected topics: <b>{actionName}/_action/send_goal/_service_event</b>,{" "}
            <b>{actionName}/_action/get_result/_service_event</b>,{" "}
            <b>{actionName}/_action/cancel_goal/_service_event</b>. See{" "}
            <Link
              href="https://docs.ros.org/en/rolling/Tutorials/Demos/Action-Introspection.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              ROS 2 action introspection documentation
            </Link>
          </Alert>
        )}

        {provider && !monitoring && !isStarting && events.length === 0 && introspectionAvailable && (
          <Alert severity="info">
            Click &ldquo;Start Introspection&rdquo;. Note: The action server or client must have introspection enabled
            with state <b>metadata</b> or <b>contents</b> for events to appear.
          </Alert>
        )}

        {provider && targetNodeName && !paramAvailable && (
          <Alert severity="warning">
            The parameter <b>action_server_configure_introspection</b> is not available on node <b>{targetNodeName}</b>.
            Introspection cannot be configured from here. Make sure the node declares this parameter so its state can be
            set to <b>metadata</b> or <b>contents</b>.
          </Alert>
        )}

        {provider && isStarting && !monitoring && (
          <Alert severity="info">Starting action introspection, waiting for provider subscriptions to appear...</Alert>
        )}

        <Stack spacing={0.5} height="100%" sx={{ overflow: "auto" }}>
          {filtered.map((evt) => (
            <Paper key={evt.key} elevation={1} sx={{ p: 0.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography variant="caption" color="grey">
                  #{evt.receivedIndex} {new Date(evt.timestamp).toLocaleTimeString()}
                </Typography>
                <Chip label={evt.phase} size="small" color={phaseColor[evt.phase] ?? "default"} variant="outlined" />
                <Chip label={evt.eventType} size="small" color={eventColor[evt.eventType] ?? "default"} />
                <Typography variant="caption">seq: {evt.sequenceNumber}</Typography>
              </Stack>

              {evt.data ? (
                <JsonView
                  src={evt.data}
                  dark={useDarkMode}
                  theme="a11y"
                  enableClipboard={false}
                  collapseObjectsAfterLength={3}
                  displaySize="collapsed"
                />
              ) : (
                <Typography variant="caption" color="grey">
                  (metadata only – no payload, state = METADATA)
                </Typography>
              )}
            </Paper>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}
