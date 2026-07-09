import DeleteIcon from "@mui/icons-material/Delete";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import {
  Alert,
  AlertTitle,
  Autocomplete,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { HTMLAttributes, useCallback, useEffect, useState } from "react";

import { useAlwaysCurrentRef } from "@/renderer/hooks/useAlwaysCurrentRef";
import { useAppState } from "@/renderer/hooks/useAppState";
import { useLoggingContext } from "@/renderer/hooks/useLoggingContext";
import { useRosContext } from "@/renderer/hooks/useRosContext";
import { getFileName, LaunchArgument, LaunchLoadReply, LaunchLoadRequest, PathItem } from "@/renderer/models";
import { getDir } from "@/renderer/models/FileItem";
import { enqueueSnackbar } from "notistack";
import { ErrorAlertComponent } from "../UI";
import DraggablePaper from "../UI/DraggablePaper";

interface LaunchArgumentWithHistory extends LaunchArgument {
  history: string[];
}

interface LaunchFileModalProps {
  selectedProvider: string | undefined;
  selectedLaunchFile: PathItem;
  setSelectedLaunchFile: (path: PathItem | undefined) => void;
  onLaunchCallback: () => void;
}

export default function LaunchFileModal(props: LaunchFileModalProps): JSX.Element {
  const {
    selectedProvider = undefined,
    selectedLaunchFile,
    setSelectedLaunchFile,
    onLaunchCallback = (): void => {},
  } = props;

  const rosCtx = useRosContext();
  const logCtx = useLoggingContext();
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const loadingRef = useAlwaysCurrentRef(loading);
  const [selectedLaunch, setSelectedLaunch] = useState<LaunchLoadReply | null>(null);
  const [messageLaunchLoaded, setMessageLaunchLoaded] = useState("");
  const { value: argHistory, set: setArgHistory } = useAppState<{ [key: string]: string[] }>(
    "packages",
    "args-history",
    {},
    {
      version: 1,
      migrateFrom: {
        localStorageKey: "history:loadLaunchArgs",
      },
      migrate: (oldValue, oldVersion) => {
        if (oldVersion === undefined) {
          return oldValue as { [key: string]: string[] };
        }
        return {};
      },
    }
  );
  const { value: lastOpenPath, set: setLastOpenPath } = useAppState<string>("packages", "last-open-path", "", {
    version: 1,
    migrateFrom: {
      localStorageKey: "lastOpenPath",
    },
  });
  const [currentArgs, setCurrentArgs] = useState<LaunchArgumentWithHistory[]>([]);
  const [scrollBar, setScrollBar] = useState<string>("auto");
  const [lastKey, setLastKey] = useState<string>("");
  const booleanWordRegex = /\b(true|false)\b/;

  // Make a request to provider and get Launch attributes like required arguments, status and paths
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const getLaunchFile = useCallback(
    async (file: string): Promise<void> => {
      const provider = rosCtx.getProviderById(selectedProvider || selectedLaunchFile.providerId || "", true);
      if (!provider || !provider.isAvailable()) return;

      if (provider.launchLoadFile) {
        const rosPackage = "";
        const launch = "";
        const path = file;
        const args = [];
        const forceFirstFile = true;
        const requestArgs = true;
        const masteruri = "";
        const host = "";
        const request = new LaunchLoadRequest(
          rosPackage,
          launch,
          path,
          args,
          forceFirstFile,
          requestArgs,
          masteruri,
          host
        );

        setLoading(true);
        const result: LaunchLoadReply = await provider.launchLoadFile(request, false);
        setLoading(false);
        if (!loadingRef.current) return;

        if (result.status.code === "ALREADY_OPEN") {
          logCtx.warn(`Launch file [${getFileName(path)}] was already loaded`, `File: ${path}`, "already loaded");
          setMessageLaunchLoaded("Launch file was already loaded");
          setOpen(false);
          onLaunchCallback();
          provider.updateLaunchContent();
          return;
        }

        if (result.status.code === "PARAMS_REQUIRED") {
          setSelectedLaunch(() => result);

          const argList: LaunchArgumentWithHistory[] = [];
          if (result.args) {
            for (const arg of result.args) {
              const argValue: string = !arg.value ? (arg.default_value as string) : arg.value;
              let historyList = argHistory[arg.name];
              if (historyList === undefined) {
                historyList = [];
              }
              historyList = [...new Set([...historyList, argValue])];
              if (historyList.length === 1) {
                if (`${argValue}`.toLocaleLowerCase().localeCompare("true") === 0) {
                  historyList.push("False");
                } else if (`${argValue}`.toLocaleLowerCase().localeCompare("false") === 0) {
                  historyList.push("True");
                }
              }
              argList.push({
                name: arg.name,
                value: argValue || "",
                history: historyList,
                choices: arg.choices,
                default_value: undefined,
                description: undefined,
              });
            }
          }
          setCurrentArgs(argList);
          setMessageLaunchLoaded("");
        }

        if (result.status.code === "OK") {
          setOpen(false);
          setMessageLaunchLoaded("Launch file loaded successfully");
          setSelectedLaunch(null);
          if (result.status.msg) {
            logCtx.warn(
              `Launch file [${getFileName(path)}] loaded with warnings`,
              `File: ${path}\n${result.status.msg}`,
              "loaded with warnings"
            );
          } else {
            logCtx.success(`Launch file [${getFileName(path)}] loaded`, `File: ${path}`, "launch file loaded");
          }
          onLaunchCallback();
          return;
        }

        if (result.status.code === "ERROR" || result.status.code === "CONNECTION_ERROR") {
          setMessageLaunchLoaded(result.status.msg || "");
          logCtx.error(
            `Error on load "${getFileName(path)}"`,
            `Error message: ${result.status.msg}`,
            result.status.msg
          );
          return;
        }

        setOpen(true);
      } else {
        logCtx.error(
          `The provider [${selectedProvider}] does not support [launchLoadFile]`,
          "Please check your provider configuration",
          "not supported by provider"
        );
      }
    },
    [argHistory, rosCtx.initialized, rosCtx.providers, selectedProvider, selectedLaunchFile]
  );

  // The user clicked on launch, fill arguments a make a request to provider
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const launchSelectedFile = useCallback(async (): Promise<void> => {
    setOpen(false);
    if (!selectedLaunch) return;

    const provider = rosCtx.getProviderById(selectedProvider || selectedLaunchFile.providerId || "", true);
    if (!provider || !provider.isAvailable()) return;

    if (provider.launchLoadFile) {
      const rosPackage = "";
      const launch = "";
      const path = selectedLaunch.paths && selectedLaunch.paths.length > 0 ? selectedLaunch.paths[0] : "";
      const forceFirstFile = true;
      const requestArgs = false;

      const args: LaunchArgument[] = [];

      for (const arg of currentArgs) {
        args.push(new LaunchArgument(arg.name, arg.value));
        let hList: string[] = argHistory[arg.name];
        if (hList !== undefined) {
          hList = hList.filter((value) => value != null && `${value}`.length > 0 && value !== arg.value);
        } else {
          hList = [];
        }
        hList.unshift(arg.value);
        hList = hList.slice(0, 10);
        argHistory[arg.name] = hList;
      }
      setArgHistory({ ...argHistory });

      const request = new LaunchLoadRequest(
        rosPackage,
        launch,
        path,
        args,
        forceFirstFile,
        requestArgs,
        provider.rosState.masteruri ? provider.rosState.masteruri : "",
        provider.host()
      );

      setLoading(true);
      const resultLaunchLoadFile = await provider.launchLoadFile(request, false);
      setLoading(false);

      if (!resultLaunchLoadFile) {
        logCtx.error(
          "Invalid response for [launchLoadFile], check DAEMON screen output",
          "Please check your provider configuration",
          "not supported by provider"
        );
      } else if (resultLaunchLoadFile.status.code === "OK") {
        if (resultLaunchLoadFile.status.msg) {
          logCtx.warn(
            `Launch file [${getFileName(path)}] loaded with warnings`,
            `File: ${path}\n${resultLaunchLoadFile.status.msg}`,
            "loaded with warnings"
          );
        } else {
          logCtx.success(`Launch file [${getFileName(path)}] loaded`, `File: ${path}`, "launch file loaded");
        }
      } else if (resultLaunchLoadFile.status.code === "PARAMS_REQUIRED") {
        setMessageLaunchLoaded("Please fill all arguments");
      } else {
        setMessageLaunchLoaded(`Could not load file: ${resultLaunchLoadFile.status.msg}`);
        enqueueSnackbar(`Could not load file: ${path}`, {
          persist: true,
          anchorOrigin: { vertical: "top", horizontal: "right" },
          preventDuplicate: true,
          content: (key, message) => (
            <ErrorAlertComponent id={key} message={message} details={`${resultLaunchLoadFile.status.msg}`} />
          ),
        });
        logCtx.error(
          `Could not load file: "${path}"`,
          `Error message: ${resultLaunchLoadFile.status.msg}`,
          "could not load file"
        );
      }
    } else {
      logCtx.error(
        `The provider [${selectedProvider}] does not support [launchLoadFile]`,
        "Please check your provider configuration",
        "not supported by provider"
      );
    }

    setSelectedLaunch(null);
    setSelectedLaunchFile(undefined);
    onLaunchCallback();
  }, [currentArgs, argHistory, selectedLaunch, selectedProvider, logCtx.success, setSelectedLaunchFile, setArgHistory]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (selectedLaunchFile) setOpen(true);
    getLaunchFile(selectedLaunchFile.path);
  }, [selectedLaunchFile]);

  function handleClose(reason: "backdropClick" | "escapeKeyDown" | "confirmed" | "cancel"): void {
    if (reason && reason === "backdropClick") return;
    setOpen(false);
  }

  const deleteHistoryOption = useCallback(
    (argName: string, option: string): void => {
      setCurrentArgs((prev) =>
        prev.map((arg) => {
          if (arg.name === argName) {
            arg.history = arg.history.filter((value) => value !== option);
          }
          return arg;
        })
      );
      const newHistory = {};
      for (const [key, value] of Object.entries(argHistory)) {
        if (key === argName) {
          newHistory[key] = value.filter((val) => val !== option);
        } else {
          newHistory[key] = value;
        }
      }
      setArgHistory(newHistory);
    },
    [argHistory, setArgHistory]
  );

  const openFileDialog = useCallback(
    async (argName: string, argValue: string, openDirectory: boolean): Promise<void> => {
      let defaultPath = lastOpenPath;
      if (!defaultPath && argValue.startsWith("/")) {
        defaultPath = argValue;
      }
      const filePath = openDirectory
        ? await window.dialogManager?.openDirectory(defaultPath)
        : await window.dialogManager?.openFile(defaultPath);
      if (filePath) {
        setLastOpenPath(filePath);
        setCurrentArgs(
          currentArgs.map((arg) => {
            if (arg.name === argName) {
              arg.value = filePath;
            }
            return arg;
          })
        );
      }
    },
    [currentArgs, lastOpenPath, setLastOpenPath]
  );

  function isPathParam(name: string, value: string): boolean {
    if (!value) {
      return true;
    }
    const lValue = value.toLocaleLowerCase();
    if (["true", "false"].includes(lValue)) {
      return false;
    }
    const lName = name.toLocaleLowerCase();
    if (lName.includes("frame")) {
      return false;
    }
    if (lName.includes("[")) {
      return false;
    }
    return Number.isNaN(Number(value));
  }

  return (
    <Dialog
      open={open}
      onClose={(reason: "backdropClick" | "escapeKeyDown") => handleClose(reason)}
      fullWidth
      scroll="paper"
      PaperComponent={DraggablePaper}
      aria-labelledby="draggable-dialog-title"
      onKeyUp={(event) => {
        if (lastKey === "Enter") {
          launchSelectedFile();
        } else setLastKey(event.key);
      }}
      onMouseUp={() => setLastKey("")}
    >
      <DialogTitle className="draggable-dialog-title" style={{ cursor: "move" }} id="draggable-dialog-title">
        Launch file
      </DialogTitle>
      <DialogContent sx={{ overflow: scrollBar }}>
        {selectedLaunch?.paths && selectedLaunch.paths.length > 0 && (
          <Stack paddingBottom={1}>
            <Typography
              variant="body2"
              sx={{ color: "grey", wordBreak: "break-all", overflow: "hidden" }}
            >
              {getDir(selectedLaunch.paths[0])}/<b>{getFileName(selectedLaunch.paths[0])}</b>
            </Typography>
          </Stack>
        )}
        {loading && (
          <Stack alignItems="center" justifyContent="center" sx={{ py: 4 }}>
            <CircularProgress />
            <Typography variant="body2" sx={{ mt: 1 }}>
              Requesting launch parameter...
            </Typography>
          </Stack>
        )}
        {!loading && selectedLaunch && (
          <Stack>
            <Stack>
              {currentArgs.map((arg) => {
                const optionsTmp = new Set([...(arg.choices || []), ...arg.history]);
                const options = Array.from(optionsTmp).filter((value) => value);
                return (
                  <Stack key={`stack-launch-load-${arg.name}`} direction="row">
                    {options.length > 1 || (options.length === 1 && options[0] !== arg.value) ? (
                      <Autocomplete
                        key={`autocomplete-launch-load-${arg.name}`}
                        size="small"
                        fullWidth
                        autoHighlight
                        disableListWrap
                        handleHomeEndKeys={false}
                        options={options}
                        getOptionLabel={(option) => option}
                        value={arg.value}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label={arg.name}
                            color="info"
                            variant="outlined"
                            margin="dense"
                            size="small"
                            error={booleanWordRegex.test(arg.value)}
                            helperText={
                              booleanWordRegex.test(arg.value)
                                ? "Use uppercase True/False, otherwise some eval statements may fail."
                                : ""
                            }
                          />
                        )}
                        renderOption={(props, option) => {
                          return (
                            <Stack {...(props as HTMLAttributes<HTMLDivElement>)} key={option} direction="row">
                              <Typography style={{ overflowWrap: "anywhere" }} width="stretch">
                                {option}
                              </Typography>
                              <IconButton
                                component="label"
                                onClick={(event) => {
                                  deleteHistoryOption(arg.name, option);
                                  event.stopPropagation();
                                }}
                              >
                                <DeleteIcon sx={{ fontSize: "1em" }} />
                              </IconButton>
                            </Stack>
                          );
                        }}
                        onChange={(_event, newArgValue) => {
                          setCurrentArgs((prev) =>
                            prev.map((item) => {
                              if (item.name === arg.name) {
                                item.value = newArgValue as string;
                                if (isPathParam(item.name, item.value)) {
                                  setLastOpenPath(item.value);
                                }
                              }
                              return item;
                            })
                          );
                        }}
                        onInputChange={(_event, newInputValue) => {
                          setCurrentArgs((prev) =>
                            prev.map((item) => {
                              if (item.name === arg.name) {
                                item.value = newInputValue;
                                if (isPathParam(item.name, item.value)) {
                                  setLastOpenPath(item.value);
                                }
                              }
                              return item;
                            })
                          );
                        }}
                        isOptionEqualToValue={(option, value) => {
                          return value === undefined || value === "" || option === value;
                        }}
                        onWheel={(event) => {
                          let newIndex = -1;
                          options.forEach((value, index) => {
                            if (value === (event.target as HTMLInputElement).value) {
                              if (event.deltaY > 0) {
                                newIndex = index + 1;
                              } else {
                                newIndex = index - 1;
                              }
                            }
                          });
                          if (newIndex < 0) newIndex = options.length - 1;
                          else if (newIndex > options.length - 1) newIndex = 0;
                          setCurrentArgs((prev) =>
                            prev.map((item) => {
                              if (item.name === arg.name) {
                                item.value = options[newIndex];
                                if (isPathParam(item.name, item.value)) {
                                  setLastOpenPath(item.value);
                                }
                              }
                              return item;
                            })
                          );
                        }}
                        onMouseEnter={() => {
                          setScrollBar("hidden");
                        }}
                        onMouseLeave={() => {
                          setScrollBar("auto");
                        }}
                      />
                    ) : (
                      <TextField
                        id={`textfield-launch-load-${arg.name}`}
                        fullWidth
                        label={arg.name}
                        value={arg.value}
                        variant="outlined"
                        size="small"
                        error={booleanWordRegex.test(arg.value)}
                        helperText={
                          booleanWordRegex.test(arg.value)
                            ? "Use uppercase True/False, otherwise some eval statements may fail."
                            : ""
                        }
                        onChange={(event) => {
                          setCurrentArgs((prev) =>
                            prev.map((item) => {
                              if (item.name === arg.name) {
                                item.value = event.target.value;
                              }
                              return item;
                            })
                          );
                        }}
                      />
                    )}
                    {isPathParam(arg.name, arg.value) && (
                      <Tooltip
                        title={
                          <div>
                            <Typography fontWeight="bold" fontSize="inherit">
                              Select a file
                            </Typography>
                            <Stack direction="row" spacing={"0.2em"}>
                              <Typography fontWeight={"bold"} fontSize={"inherit"}>
                                Shift:
                              </Typography>
                              <Typography fontSize={"inherit"}>select a directory</Typography>
                            </Stack>
                          </div>
                        }
                        disableInteractive
                      >
                        <IconButton
                          component="label"
                          onClick={(event: React.MouseEvent) => {
                            openFileDialog(arg.name, arg.value, event.nativeEvent.shiftKey);
                          }}
                        >
                          <MoreHorizIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          </Stack>
        )}
        {!loading && messageLaunchLoaded && messageLaunchLoaded.length > 0 && (
          <Alert severity="warning" style={{ minWidth: 0 }}>
            <AlertTitle>{messageLaunchLoaded.replaceAll("/", " / ")}</AlertTitle>
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            setOpen(false);
            loadingRef.current = false;
            setSelectedLaunch(null);
          }}
        >
          Cancel
        </Button>
        <Button autoFocus color="success" onClick={launchSelectedFile} disabled={loading}>
          Load
        </Button>
      </DialogActions>
    </Dialog>
  );
}
