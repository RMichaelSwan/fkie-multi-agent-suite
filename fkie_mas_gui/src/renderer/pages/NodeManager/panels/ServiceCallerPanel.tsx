import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import EditNoteIcon from "@mui/icons-material/EditNote";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import StarIcon from "@mui/icons-material/Star";
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  Divider,
  FormLabel,
  IconButton,
  Slider,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import JsonView from "react18-json-view";

import SearchBar from "@/renderer/components/UI/SearchBar";
import { useLoggingContext } from "@/renderer/hooks/useLoggingContext";
import { DB_MAX_MSGS, TMsgHistoryEntry, useMsgHistory } from "@/renderer/hooks/useMsgHistory";
import { useRosContext } from "@/renderer/hooks/useRosContext";
import { useSetting } from "@/renderer/hooks/useSetting";
import { LaunchCallService, rosMessageStructToString, TRosMessageStruct } from "@/renderer/models";
import { Provider } from "@/renderer/providers";
import InputElements from "./MessageDialogPanel/InputElements";

interface ServiceCallerPanelProps {
  serviceName: string;
  serviceType: string;
  providerId: string;
}

export default function ServiceCallerPanel(props: ServiceCallerPanelProps): JSX.Element {
  const { serviceName, serviceType, providerId } = props;

  const logCtx = useLoggingContext();
  const {
    entries: history,
    addEntry,
    updateMeta,
    deleteEntry,
    deleteNonFavorites,
    maxEntries: maxHistoryLength,
    setMaxEntries: setMaxHistoryLength,
  } = useMsgHistory(serviceType);
  const rosCtx = useRosContext();
  const [searchTerm, setSearchTerm] = useState("");
  const [serviceStruct, setServiceStruct] = useState<TRosMessageStruct>();
  const [serviceStructOrg, setServiceStructOrg] = useState<TRosMessageStruct>();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [inputElements, setInputElements] = useState<React.ReactNode | null>(null);
  const [historyEditMode, setHistoryEditMode] = useState<boolean>(false);

  const [callServiceDescription, setCallServiceDescription] = useState("");
  const [callServiceIsSubmitting, setCallServiceIsSubmitting] = useState(false);
  const [resultError, setResultError] = useState<string>();
  const [resultMessage, setResultMessage] = useState<TRosMessageStruct>();
  const [timeoutObj, setTimeoutObj] = useState<NodeJS.Timeout | null>(null);

  const [useDarkMode] = useSetting<boolean>("useDarkMode");
  const [backgroundColor] = useSetting<string>("backgroundColor");
  const [colorizeHosts] = useSetting<boolean>("colorizeHosts");

  useEffect(() => {
    if (history.length === 0) setHistoryEditMode(false);
  }, [history]);

  // get item history after the history was loaded
  const fromHistory = useCallback(
    (entry: TMsgHistoryEntry) => {
      setServiceStruct(structuredClone(entry.data));
    },
    [setServiceStruct]
  );

  // add new item to the history
  const updateHistory = useCallback(async () => {
    if (!serviceStruct) return;

    addEntry({
      messageType: serviceType,
      name: "",
      favorite: false,
      data: serviceStruct,
      createdAt: Date.now(),
    });
  }, [serviceStruct, serviceType, addEntry]);

  // create string from message struct and copy it to clipboard
  const onCopyToClipboard = useCallback(() => {
    const json = serviceStruct ? rosMessageStructToString(serviceStruct, false, false) : "{}";
    navigator.clipboard.writeText(`${serviceName} ${serviceType} "${json}"`);
    logCtx.success("service call input copied!", "", "service call input copied");
  }, [serviceStruct]);

  const getServiceStructData = useCallback(async () => {
    if (serviceName) {
      const newProvider = rosCtx.getProviderById(providerId);
      if (newProvider) {
        setProvider(newProvider);
        if (serviceType) {
          const srvStruct = await newProvider.getServiceStruct(serviceType);
          if (srvStruct) {
            setServiceStructOrg(srvStruct.data);
            setServiceStruct(srvStruct.data);
            setInputElements(
              <InputElements
                key={srvStruct.data.type}
                messageStruct={srvStruct.data}
                parentName={srvStruct.data.type ? srvStruct.data.type : `${serviceName}[${serviceType}]`}
                filterText={searchTerm}
              />
            );
          }
        }
      }
    }
  }, [serviceName, providerId, rosCtx]);

  // debounced filter callback
  const onUpdateInputElements = useCallback(
    (searchText: string) => {
      if (!serviceStruct) return;
      setInputElements(
        <InputElements
          key={serviceStruct.type}
          messageStruct={serviceStruct}
          parentName={serviceStruct.type ? serviceStruct.type : `${serviceName}[${serviceType}]`}
          filterText={searchText}
        />
      );
    },
    [serviceStruct]
  );

  async function handleCallService(): Promise<void> {
    setResultError("");
    setResultMessage(undefined);
    setCallServiceDescription("Calling service...");
    setCallServiceIsSubmitting(true);

    // store struct to history if new message
    const messageStr = rosMessageStructToString(serviceStruct, false, false);
    if (messageStr !== "{}") {
      const exists = history.some((item) => rosMessageStructToString(item.data, false, false) === messageStr);
      if (!exists) {
        updateHistory();
      }
    }

    if (provider) {
      const srvResult = await provider.callService(new LaunchCallService(serviceName, serviceType, serviceStruct));
      if (srvResult) {
        if (srvResult.message) {
          setResultError(srvResult.message);
        }
        if (srvResult.valid) {
          setResultMessage(srvResult.data);
        }
      }
      // close modal
      setTimeoutObj(
        setTimeout(() => {
          setCallServiceIsSubmitting(false);
          setCallServiceDescription("");
        }, 5000)
      );
    } else {
      setCallServiceIsSubmitting(false);
      setCallServiceDescription("");
    }
  }

  useEffect(() => {
    if (!timeoutObj) return;
    if (resultMessage || resultError) {
      clearTimeout(timeoutObj);
      setTimeoutObj(null);
      setCallServiceIsSubmitting(false);
      setCallServiceDescription("");
    }
  }, [timeoutObj, resultMessage, resultError]);

  useEffect(() => {
    if (!serviceType) return;
    if (!serviceStruct) return;
    onUpdateInputElements(searchTerm);
    if ((serviceStruct.def || []).length === 0) {
      handleCallService();
    }
  }, [serviceStruct]);

  // Get topic struct when mounting the component
  useEffect(() => {
    getServiceStructData();
  }, [serviceName]);

  // Update the visible state of input fields on a filter change
  useEffect(() => {
    onUpdateInputElements(searchTerm);
  }, [searchTerm]);

  // create input mask for an element of the array
  function createHistoryButton(entry: TMsgHistoryEntry): JSX.Element {
    return (
      <Tooltip key={`history-button-${entry.id}`} title={`${entry.name}`} placement="bottom" disableInteractive>
        <Button
          onClick={(event) => {
            fromHistory(entry);
            event.stopPropagation();
          }}
          startIcon={<StorageOutlinedIcon />}
          size="small"
        >
          {entry.id}
        </Button>
      </Tooltip>
    );
  }

  // create edit mask for an element of the history array
  function createHistoryEditItem(entry: TMsgHistoryEntry): JSX.Element {
    return (
      <Stack key={`history-edit-item-${entry.id}`} direction="row" spacing="0.5em">
        <Tooltip title="favorite entries are not automatically deleted" placement="bottom" disableInteractive>
          <IconButton
            key={`history-edit-star-${entry.id}`}
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
          key={`history-edit-name-${entry.id}`}
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
          key={`history-edit-delete-${entry.id}`}
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

  const getHostStyle = useCallback(
    function getHostStyle(): object {
      const provId = provider?.id;
      if (provId && colorizeHosts) {
        return {
          flexGrow: 1,
          borderTopStyle: "solid",
          borderTopColor: rosCtx.providerColor(provId),
          borderTopWidth: "0.3em",
          backgroundColor: backgroundColor,
        };
      }
      return { flexGrow: 1, backgroundColor: backgroundColor };
    },
    [provider, colorizeHosts, backgroundColor, rosCtx.providerColor]
  );

  const createJsonView = useMemo(() => {
    return (
      <JsonView
        src={resultMessage}
        dark={useDarkMode}
        theme="a11y"
        enableClipboard={false}
        ignoreLargeArray={false}
        collapseObjectsAfterLength={3}
        displaySize={"collapsed"}
        collapsed={(params: {
          node: Record<string, unknown> | Array<unknown>;
          indexOrName: number | string | undefined;
          depth: number;
          size: number;
        }) => {
          if (params.indexOrName === undefined) return false;
          if (Array.isArray(params.node) && params.node.length === 0) return true;
          return false;
        }}
      />
    );
  }, [resultMessage, useDarkMode]);

  return (
    <Box height="100%" overflow="auto" alignItems="center" sx={getHostStyle()}>
      <Stack spacing={1} margin={1}>
        {serviceStruct && (serviceStruct.def || []).length > 0 && (
          <Stack direction="row" spacing={1}>
            <SearchBar
              onSearch={(value) => {
                setSearchTerm(value);
              }}
              placeholder="Filter Fields"
              defaultValue={searchTerm}
            />
          </Stack>
        )}
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography fontWeight="bold">{serviceName}</Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography color="grey" fontSize="0.8em">
            {provider?.name()}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={2} display="flex" alignItems="center">
          {history.length > 0 && (
            <Stack direction="column" spacing={1} alignItems="left">
              <FormLabel sx={{ fontSize: "0.8em", lineHeight: "1em" }}>call history</FormLabel>
              <ButtonGroup sx={{ maxHeight: "24px" }}>
                <Tooltip title="edit history" enterDelay={500}>
                  <Button
                    color="success"
                    onClick={(event) => {
                      setServiceStruct(serviceStructOrg);
                      setHistoryEditMode((prev) => !prev);
                      event.stopPropagation();
                    }}
                    size="small"
                  >
                    <EditNoteIcon />
                  </Button>
                </Tooltip>
                {history.map((entry) => createHistoryButton(entry))}
              </ButtonGroup>
              {historyEditMode && (
                <Stack direction="column" alignContent="start">
                  <Stack direction="row" alignContent="start">
                    <Slider
                      aria-label="Temperature"
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
                  {history.map((entry) => createHistoryEditItem(entry))}
                </Stack>
              )}
            </Stack>
          )}
        </Stack>
        <Box>
          {callServiceIsSubmitting ? (
            <Stack direction="row" spacing={1}>
              <CircularProgress size="1em" />
              <div>{`${callServiceDescription} with arguments ${rosMessageStructToString(
                serviceStruct,
                false,
                false
              )}`}</div>
            </Stack>
          ) : (
            <Stack direction="row" spacing="0.5em">
              <Button
                type="submit"
                variant="contained"
                color="success"
                onClick={handleCallService}
                disabled={serviceStruct?.type === undefined}
              >
                Call Service
              </Button>
              <Tooltip title="Copy service name, type and data fields" placement="bottom">
                <IconButton
                  color="default"
                  onClick={(event) => {
                    onCopyToClipboard();
                    event?.stopPropagation();
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
        {inputElements}
        ---
        {!serviceStruct && (
          <Alert severity="error" style={{ minWidth: 0 }}>
            <AlertTitle>{`Service definition for ${serviceName}[${serviceType}] not found!`}</AlertTitle>
          </Alert>
        )}
        {resultError && (
          <Alert severity="error" style={{ minWidth: 0 }}>
            <AlertTitle>{`Service call failed with: ${resultError}!`}</AlertTitle>
          </Alert>
        )}
        {resultMessage && createJsonView}
      </Stack>
    </Box>
  );
}
