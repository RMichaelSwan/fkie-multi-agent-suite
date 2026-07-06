import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PlaylistRemoveIcon from "@mui/icons-material/PlaylistRemove";
import StopIcon from "@mui/icons-material/Stop";
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCustomEventListener } from "react-custom-events";
import JsonView from "react18-json-view";
import { v4 as uuid } from "uuid";

import { useRosContext } from "@/renderer/hooks/useRosContext";
import { useSetting } from "@/renderer/hooks/useSetting";
import { Provider } from "@/renderer/providers";

export interface ServiceIntrospectionEvent {
  service_name: string;
  event_type: "REQUEST_SENT" | "REQUEST_RECEIVED" | "RESPONSE_SENT" | "RESPONSE_RECEIVED" | string;
  sequence_number: number;
  client_gid: string | number[];
  data: object | null;
  timestamp: number;
}

interface EventProviderServiceIntrospection {
  provider: Provider;
  event: ServiceIntrospectionEvent;
}

interface ServiceIntrospectionDisplay {
  key: string;
  eventType: string;
  sequenceNumber: number;
  clientGid: string | number[];
  data: object | null;
  timestamp: number;
  receivedIndex: number;
}

interface ServiceIntrospectionPanelProps {
  serviceName: string;
  serviceType: string;
  providerId: string;
}

const EVENT_PROVIDER_SERVICE_INTROSPECTION_PREFIX = "EVENT_PROVIDER_SERVICE_INTROSPECTION";

const eventColor: Record<string, "info" | "success" | "default"> = {
  REQUEST_SENT: "info",
  REQUEST_RECEIVED: "info",
  RESPONSE_SENT: "success",
  RESPONSE_RECEIVED: "success",
};

export default function ServiceIntrospectionPanel(props: ServiceIntrospectionPanelProps): JSX.Element {
  const { serviceName, serviceType, providerId } = props;
  const rosCtx = useRosContext();

  const [provider, setProvider] = useState<Provider | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [events, setEvents] = useState<ServiceIntrospectionDisplay[]>([]);
  const [maxCount, setMaxCount] = useState<number>(100);
  const [_receivedIndex, setReceivedIndex] = useState(0);

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

  const introspectionAvailable = useMemo(() => {
    return provider?.hasServiceIntrospection(serviceName) ?? false;
  }, [provider, serviceName, rosCtx.nodeMap]);

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

  const getIntrospectionTopic = useCallback((): string => {
    return `${serviceName}/_service_event`;
  }, [serviceName]);

  useEffect(() => {
    if (!provider) {
      setMonitoring(false);
      return;
    }

    const introspectionTopic = getIntrospectionTopic();

    const hasIntrospectionSubscriber =
      provider.rosNodes?.some((node) => (node.subscribers || []).some((sub) => sub.name === introspectionTopic)) ??
      false;

    setMonitoring(hasIntrospectionSubscriber);
  }, [provider, getIntrospectionTopic, rosCtx.mapProviderRosNodes]);

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
    `${EVENT_PROVIDER_SERVICE_INTROSPECTION_PREFIX}_${serviceName}`,
    (data: EventProviderServiceIntrospection) => {
      if (!data?.event) return;

      const evt = data.event;

      setReceivedIndex((prev) => {
        const currentIndex = prev;
        const display: ServiceIntrospectionDisplay = {
          key: uuid(),
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
    [serviceName, maxCount]
  );

  const startMonitoring = useCallback(async () => {
    if (!provider || !introspectionAvailable) return;

    try {
      setIsStarting(true);
      await provider.startServiceIntrospection(serviceName, serviceType);
    } catch (_err) {
      setIsStarting(false);
    }
  }, [provider, introspectionAvailable, serviceName, serviceType]);

  const stopMonitoring = useCallback(async () => {
    if (!provider) return;

    setIsStarting(false);
    await provider.stopServiceIntrospection(serviceName);
  }, [provider, serviceName]);

  return (
    <Box height="100%" overflow="hidden" sx={getHostStyle()}>
      <Stack spacing={1} margin={1}>
        <Stack spacing={0.3}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography fontWeight="bold">{serviceName}</Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography color="grey" fontSize="0.8em" flexGrow={1}>
              {provider?.name()}
            </Typography>
            <Typography color="grey" fontSize="0.8em">
              [{serviceType}]
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Chip
              label={monitoring ? "monitoring" : isStarting ? "starting" : "stopped"}
              color={monitoring ? "success" : isStarting ? "info" : "default"}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
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
                  ? "Start service introspection"
                  : "This service does not provide introspection topic"
              }
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

          <Tooltip title="Clear events">
            <IconButton size="small" onClick={() => setEvents([])}>
              <PlaylistRemoveIcon fontSize="small" />
            </IconButton>
          </Tooltip>

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

        {provider && !monitoring && !introspectionAvailable && (
          <Alert severity="info">
            This service does not expose an introspection topic on the provider. To enable introspection, the ROS 2
            service server or client must publish the service event topic and use introspection state <b>METADATA</b> or{" "}
            <b>CONTENTS</b>. Expected topic: <b>{serviceName}/_service_event</b>. See{" "}
            <Link
              href="https://docs.ros.org/en/rolling/Tutorials/Demos/Service-Introspection.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              ROS 2 service introspection documentation
            </Link>
          </Alert>
        )}

        {provider && !monitoring && !isStarting && events.length === 0 && introspectionAvailable && (
          <Alert severity="info">
            Click &ldquo;Start Introspection&rdquo;. Note: The service server/client must have introspection enabled
            with state <b>METADATA</b> or <b>CONTENTS</b> for events to appear.
          </Alert>
        )}

        {provider && isStarting && !monitoring && (
          <Alert severity="info">Starting service introspection, waiting for provider subscriptions to appear...</Alert>
        )}

        <Stack spacing={0.5} sx={{ maxHeight: "70vh", overflow: "auto" }}>
          {events.map((evt) => (
            <Paper key={evt.key} elevation={1} sx={{ p: 0.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography variant="caption" color="grey">
                  #{evt.receivedIndex} {new Date(evt.timestamp).toLocaleTimeString()}
                </Typography>
                <Chip label={evt.eventType} size="small" color={eventColor[evt.eventType] ?? "default"} />
                <Typography variant="caption">seq: {evt.sequenceNumber}</Typography>
                <Typography variant="caption" color="grey">
                  gid: {Array.isArray(evt.clientGid) ? evt.clientGid.join(".") : evt.clientGid}
                </Typography>
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
