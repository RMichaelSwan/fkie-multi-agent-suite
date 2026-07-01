import ArrowForwardIosSharpIcon from "@mui/icons-material/ArrowForwardIosSharp";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SettingsIcon from "@mui/icons-material/Settings";
import StorageIcon from "@mui/icons-material/Storage";
import UndoIcon from "@mui/icons-material/Undo";
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import MuiAccordion, { AccordionProps } from "@mui/material/Accordion";
import MuiAccordionDetails from "@mui/material/AccordionDetails";
import MuiAccordionSummary, { AccordionSummaryProps } from "@mui/material/AccordionSummary";
import { styled } from "@mui/material/styles";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { BUTTON_LOCATIONS, ISettingsParam } from "@/renderer/context/SettingsContext";
import { useAppStateContext } from "@/renderer/hooks/useAppStateContext";
import { useLoggingContext } from "@/renderer/hooks/useLoggingContext";
import { useSetting } from "@/renderer/hooks/useSetting";
import { useSettingsContext } from "@/renderer/hooks/useSettingsContext";
import { JSONValue } from "@/types";
import SearchBar from "../UI/SearchBar";

const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

const Accordion = styled((props: AccordionProps) => <MuiAccordion disableGutters elevation={0} square {...props} />)(
  ({ theme }) => ({
    border: `1px solid ${theme.palette.divider}`,
    "&:not(:last-child)": {
      borderBottom: 0,
    },
    "&::before": {
      display: "none",
    },
  })
);

const AccordionSummary = styled((props: AccordionSummaryProps) => (
  <MuiAccordionSummary expandIcon={<ArrowForwardIosSharpIcon sx={{ fontSize: "0.9rem" }} />} {...props} />
))(({ theme }) => ({
  backgroundColor: "rgba(0, 0, 0, .03)",
  flexDirection: "row-reverse",
  "& .MuiAccordionSummary-expandIconWrapper.Mui-expanded": {
    transform: "rotate(90deg)",
  },
  "& .MuiAccordionSummary-content": {
    marginLeft: theme.spacing(1),
  },
  "&:hover": {
    fontWeight: "bolder",
  },
  // ...theme.applyStyles("dark", {
  //   backgroundColor: "rgba(255, 255, 255, .05)",
  // }),
}));

const AccordionDetails = styled(MuiAccordionDetails)(({ theme }) => ({
  backgroundColor: theme.palette.background.default,
  padding: theme.spacing(2),
  borderTop: "1px solid rgba(0, 0, 0, .125)",
}));

interface ExportPayload {
  _meta: {
    type: "full-backup";
    version: number;
    exportedAt: string;
    appVersion: string;
  };
  settings?: Record<string, JSONValue>;
  appState?: Record<string, Record<string, JSONValue>>;
}

export interface IGroupEntry {
  group: string;
  params: { name: string; param: ISettingsParam }[];
  forceExpanded: boolean;
}

export default function GuiPanel(): JSX.Element {
  const logCtx = useLoggingContext();
  const appStateCtx = useAppStateContext();
  const settingsCtx = useSettingsContext();
  const [buttonLocation] = useSetting<string>("buttonLocation");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [grouped, setGrouped] = useState<IGroupEntry[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [values] = useState<{ [x: string]: JSONValue | undefined }>({});
  const [valuesChanged, forceValuesUpdate] = useReducer((x) => x + 1, 0);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Export selection state
  const [exportSettings, setExportSettings] = useState(true);
  const [exportSelectedNamespaces, setExportSelectedNamespaces] = useState<Set<string>>(new Set());

  // Import preview state
  const [importPreview, setImportPreview] = useState<ExportPayload | null>(null);
  const [importSettings, setImportSettings] = useState(true);
  const [importSelectedNamespaces, setImportSelectedNamespaces] = useState<Set<string>>(new Set());

  // Available namespaces from AppState
  const namespaces = useMemo(() => appStateCtx.getAllNamespaces(), [appStateCtx]);

  function handleChange(panel: string): void {
    if (expanded.includes(panel)) {
      setExpanded(expanded.filter((item) => panel !== item));
    } else {
      setExpanded((prev) => [...prev, panel]);
    }
  }

  function createGroups(): void {
    const groupedDict: { [group: string]: { name: string; param: ISettingsParam }[] } = {};
    for (const item of settingsCtx.getParamList()) {
      values[item.name] = settingsCtx.get(item.name);
      if (filter.length <= 1 || item.name.toLocaleLowerCase().includes(filter)) {
        const group = item.param.group ? item.param.group : "Application";
        if (group !== "hidden") {
          if (!groupedDict[group]) {
            groupedDict[group] = [];
          }
          groupedDict[group].push(item);
        }
      }
    }
    const newGrouped: IGroupEntry[] = [];
    for (const key of Object.keys(groupedDict)) {
      newGrouped.push({ group: key, params: groupedDict[key], forceExpanded: filter.length > 1 });
    }
    setGrouped(newGrouped);
  }

  useEffect(() => {
    createGroups();
  }, [settingsCtx, filter]);

  /* ================ Export ================ */

  const handleOpenExportDialog = useCallback(() => {
    // Pre-select all namespaces
    setExportSelectedNamespaces(new Set(namespaces));
    setExportSettings(true);
    setExportDialogOpen(true);
  }, [namespaces]);

  const handleToggleExportNamespace = useCallback((ns: string) => {
    setExportSelectedNamespaces((prev) => {
      const next = new Set(prev);
      if (next.has(ns)) {
        next.delete(ns);
      } else {
        next.add(ns);
      }
      return next;
    });
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const payload: ExportPayload = {
        _meta: {
          type: "full-backup",
          version: 1,
          exportedAt: new Date().toISOString(),
          appVersion: window.APP_VERSION ?? "unknown",
        },
      };

      // Export settings if selected
      if (exportSettings) {
        const settingsJson = await settingsCtx.exportSettings();
        const parsed = JSON.parse(settingsJson);
        payload.settings = parsed.data ?? parsed.settings ?? parsed;
      }

      // Export selected namespaces from AppState
      if (exportSelectedNamespaces.size > 0) {
        payload.appState = {};
        for (const ns of exportSelectedNamespaces) {
          const entries = appStateCtx.getNamespace(ns);
          if (Object.keys(entries).length > 0) {
            payload.appState[ns] = entries;
          }
        }
        // Remove appState key if empty
        if (Object.keys(payload.appState).length === 0) {
          delete payload.appState;
        }
      }

      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `mas-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setExportDialogOpen(false);
      logCtx.info("Settings exported successfully.", "", "Settings exported successfully.");
    } catch (error) {
      console.error("[SettingsImportExport] Export failed:", error);
      logCtx.error("Export failed.", `${error}`, "Export failed.");
    }
  }, [exportSettings, exportSelectedNamespaces, settingsCtx, appStateCtx]);

  // const handleExport = useCallback(async () => {
  //   try {
  //     const json = await settingsCtx.exportSettings();

  //     const blob = new Blob([json], { type: "application/json" });
  //     const url = URL.createObjectURL(blob);

  //     const a = document.createElement("a");
  //     a.href = url;
  //     a.download = `mas-settings-${new Date().toISOString().slice(0, 10)}.json`;
  //     a.click();

  //     URL.revokeObjectURL(url);
  //     logCtx.info("Settings exported successfully.", "", "Settings exported successfully.");
  //   } catch (error) {
  //     logCtx.error("Export failed.", `${error}`, "Export failed.");
  //   }
  // }, [settingsCtx, logCtx]);

  /* ================ Import ================ */

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const json = await file.text();
      const parsed = JSON.parse(json) as ExportPayload;

      // Validate basic structure
      if (!parsed._meta && !parsed.settings && !parsed.appState) {
        // Try to interpret as settings-only export
        setImportPreview({
          _meta: { type: "full-backup", version: 1, exportedAt: "", appVersion: "" },
          settings: parsed as unknown as Record<string, JSONValue>,
        });
      } else {
        setImportPreview(parsed);
      }

      // Pre-select everything that's available in the file
      setImportSettings(!!parsed.settings);
      setImportSelectedNamespaces(new Set(parsed.appState ? Object.keys(parsed.appState) : []));
      setImportDialogOpen(true);
    } catch (error) {
      console.error("[SettingsImportExport] File parse failed:", error);
      logCtx.error("File parse failed.", `${error}`, "File parse failed.");
    }

    // Reset input so the same file can be re-selected
    event.target.value = "";
  }, []);

  const handleToggleImportNamespace = useCallback((ns: string) => {
    setImportSelectedNamespaces((prev) => {
      const next = new Set(prev);
      if (next.has(ns)) {
        next.delete(ns);
      } else {
        next.add(ns);
      }
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (!importPreview) return;

    const results: string[] = [];

    try {
      // Import settings
      if (importSettings && importPreview.settings) {
        const settingsPayload = JSON.stringify({
          _meta: { type: "settings", version: importPreview._meta.version },
          data: importPreview.settings,
        });
        const { imported, skipped } = await settingsCtx.importSettings(settingsPayload);
        results.push(`Settings: ${imported} imported${skipped.length > 0 ? `, ${skipped.length} skipped` : ""}`);
      }

      // Import selected AppState namespaces
      if (importSelectedNamespaces.size > 0 && importPreview.appState) {
        for (const ns of importSelectedNamespaces) {
          const nsData = importPreview.appState[ns];
          if (!nsData) continue;

          const nsPayload = JSON.stringify(nsData);
          const { imported, skipped } = await appStateCtx.importState(nsPayload, {
            replace: true,
            namespace: ns,
          });
          results.push(`${ns}: ${imported} imported${skipped.length > 0 ? `, ${skipped.length} skipped` : ""}`);
        }
      }

      setImportDialogOpen(false);
      setImportPreview(null);
      logCtx.info("Settings imported successfully.", "", "Settings imported successfully.");
    } catch (error) {
      console.error("[SettingsImportExport] Import failed:", error);
      logCtx.error("Import failed.", `${error}`, "Import failed.");
    }
  }, [importPreview, importSettings, importSelectedNamespaces, settingsCtx, appStateCtx]);

  // const handleImportClick = useCallback(() => {
  //   fileInputRef.current?.click();
  // }, []);

  // const handleFileChange = useCallback(
  //   async (event: React.ChangeEvent<HTMLInputElement>) => {
  //     const file = event.target.files?.[0];
  //     if (!file) return;

  //     try {
  //       const json = await file.text();
  //       const { imported, skipped } = await settingsCtx.importSettings(json);

  //       let message = `Imported ${imported} setting(s).`;
  //       if (skipped.length > 0) {
  //         message += ` Skipped: ${skipped.join(", ")}`;
  //       }

  //       logCtx.info("Settings imported successfully.", "", "Settings imported successfully.");
  //     } catch (error) {
  //       logCtx.error("Import failed.", `${error}`, "Import failed.");
  //     }

  //     // Reset input so the same file can be re-selected
  //     event.target.value = "";
  //   },
  //   [settingsCtx]
  // );

  /* ================ Reset ================ */

  const handleReset = async () => {
    await settingsCtx.resetAll();
    await appStateCtx.clearAll();
    setConfirmResetOpen(false);
    logCtx.info("All settings and state reset to defaults.", "", "All settings and state reset to defaults.");
  };

  /* ================ Available namespaces in import file ================ */

  const importNamespaces = useMemo(() => {
    if (!importPreview?.appState) return [];
    return Object.keys(importPreview.appState);
  }, [importPreview]);

  const createButtons = useMemo(() => {
    return (
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Tooltip title="Export" placement="left" disableInteractive>
          <IconButton
            size="small"
            onClick={() => {
              handleOpenExportDialog();
            }}
          >
            <FileDownloadIcon sx={{ fontSize: "inherit" }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Import" placement="left" disableInteractive>
          <IconButton
            size="small"
            onClick={() => {
              handleImportClick();
            }}
          >
            <FileUploadIcon sx={{ fontSize: "inherit" }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Reset" placement="left" disableInteractive>
          <IconButton
            size="small"
            onClick={() => {
              setConfirmResetOpen(true);
            }}
          >
            <RestartAltIcon sx={{ fontSize: "inherit" }} />
          </IconButton>
        </Tooltip>
      </Stack>
    );
  }, [handleExport, handleImportClick]);

  const generateContent = useMemo(() => {
    return (
      <Stack height="100%" width="99%">
        <Stack direction="row" spacing={0.5} alignItems="center">
          {buttonLocation === BUTTON_LOCATIONS.LEFT && createButtons}
          <SearchBar
            onSearch={(value) => setFilter(value.toLocaleLowerCase())}
            placeholder="Filter Parameter"
            defaultValue=""
          />
          {buttonLocation === BUTTON_LOCATIONS.RIGHT && createButtons}
          {/* Hidden file input for import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          {/* ================ Export Dialog ================ */}
          <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Export Configuration</DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ mb: 2 }}>Select which data to include in the export file.</DialogContentText>

              {/* Settings checkbox */}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={exportSettings}
                    onChange={(e) => setExportSettings(e.target.checked)}
                    icon={<SettingsIcon />}
                    checkedIcon={<SettingsIcon />}
                  />
                }
                label={
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography>Settings</Typography>
                    <Chip label="App preferences" size="small" variant="outlined" />
                  </Stack>
                }
              />

              {/* AppState namespaces */}
              {namespaces.length > 0 && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <StorageIcon fontSize="small" color="action" />
                    <Typography variant="subtitle2" color="text.secondary">
                      Application State
                    </Typography>
                    <Chip
                      label={`${exportSelectedNamespaces.size}/${namespaces.length}`}
                      size="small"
                      variant="outlined"
                    />
                  </Stack>

                  <List dense disablePadding>
                    {namespaces.map((ns) => (
                      <ListItem key={ns} disablePadding>
                        <ListItemButton dense onClick={() => handleToggleExportNamespace(ns)}>
                          <ListItemIcon sx={{ minWidth: 36 }}>
                            <Checkbox
                              edge="start"
                              checked={exportSelectedNamespaces.has(ns)}
                              disableRipple
                              size="small"
                            />
                          </ListItemIcon>
                          <ListItemText
                            primary={ns}
                            secondary={`${Object.keys(appStateCtx.getNamespace(ns)).length} entries`}
                          />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setExportDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleExport}
                variant="contained"
                disabled={!exportSettings && exportSelectedNamespaces.size === 0}
                startIcon={<FileDownloadIcon />}
              >
                Export
              </Button>
            </DialogActions>
          </Dialog>

          {/* ================ Import Dialog ================ */}
          <Dialog
            open={importDialogOpen}
            onClose={() => {
              setImportDialogOpen(false);
              setImportPreview(null);
            }}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle>Import Configuration</DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ mb: 2 }}>
                Select which data to import. Existing values will be replaced.
              </DialogContentText>

              {/* Settings */}
              {importPreview?.settings && (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={importSettings}
                      onChange={(e) => setImportSettings(e.target.checked)}
                      icon={<SettingsIcon />}
                      checkedIcon={<SettingsIcon />}
                    />
                  }
                  label={
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography>Settings</Typography>
                      <Chip
                        label={`${Object.keys(importPreview.settings).length} values`}
                        size="small"
                        variant="outlined"
                      />
                    </Stack>
                  }
                />
              )}

              {!importPreview?.settings && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  No settings found in file.
                </Typography>
              )}

              {/* AppState namespaces from file */}
              {importNamespaces.length > 0 && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <StorageIcon fontSize="small" color="action" />
                    <Typography variant="subtitle2" color="text.secondary">
                      Application State
                    </Typography>
                    <Chip
                      label={`${importSelectedNamespaces.size}/${importNamespaces.length}`}
                      size="small"
                      variant="outlined"
                    />
                  </Stack>

                  <List dense disablePadding>
                    {importNamespaces.map((ns) => {
                      const entryCount = importPreview?.appState?.[ns]
                        ? Object.keys(importPreview.appState[ns]).length
                        : 0;

                      return (
                        <ListItem key={ns} disablePadding>
                          <ListItemButton dense onClick={() => handleToggleImportNamespace(ns)}>
                            <ListItemIcon sx={{ minWidth: 36 }}>
                              <Checkbox
                                edge="start"
                                checked={importSelectedNamespaces.has(ns)}
                                disableRipple
                                size="small"
                              />
                            </ListItemIcon>
                            <ListItemText primary={ns} secondary={`${entryCount} entries`} />
                          </ListItemButton>
                        </ListItem>
                      );
                    })}
                  </List>
                </>
              )}

              {!importPreview?.appState && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No application state found in file.
                </Typography>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => {
                  setImportDialogOpen(false);
                  setImportPreview(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                variant="contained"
                disabled={!importSettings && importSelectedNamespaces.size === 0}
                startIcon={<FileUploadIcon />}
              >
                Import
              </Button>
            </DialogActions>
          </Dialog>

          {/* ================ Reset Confirmation ================ */}
          <Dialog open={confirmResetOpen} onClose={() => setConfirmResetOpen(false)}>
            <DialogTitle>Reset everything?</DialogTitle>
            <DialogContent>
              <DialogContentText>
                This will restore all settings to defaults and clear all application state (layouts, histories,
                configurations). This action cannot be undone.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmResetOpen(false)}>Cancel</Button>
              <Button onClick={handleReset} color="warning" variant="contained">
                Reset
              </Button>
            </DialogActions>
          </Dialog>
        </Stack>
        <Box height="100%" width="100%" overflow="auto">
          {grouped.map(({ group, params, forceExpanded }) => {
            return (
              <Accordion
                key={`${group}-accordion`}
                expanded={expanded.includes(group) || (forceExpanded && filter.length > 1)}
                onChange={() => handleChange(group)}
              >
                <AccordionSummary aria-controls={`${group}-content`} id={`${group}-header`}>
                  <Typography style={{ fontWeight: "inherit" }}>{group}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack margin={0} spacing={"0.7em"}>
                    {params.map(({ name, param }) => {
                      if (Array.isArray(param.options)) {
                        return (
                          <Stack
                            key={`opt-${name}-array`}
                            sx={{
                              "&:hover": {
                                backgroundColor: (theme) => theme.palette.action.hover,
                              },
                            }}
                          >
                            {param.type.endsWith("[]") ? (
                              // multiple values can be selected
                              <>
                                <Typography sx={{ fontWeight: "bold" }}>{param.label}</Typography>
                                {param.description && (
                                  <Typography sx={{ typography: "body2" }}>{param.description}</Typography>
                                )}
                                <Stack direction="row" alignItems="center">
                                  <Autocomplete
                                    key={name}
                                    disablePortal={false}
                                    handleHomeEndKeys={false}
                                    multiple
                                    id={param.label}
                                    size="small"
                                    options={param.options}
                                    freeSolo={param.freeSolo}
                                    sx={{ margin: 0 }}
                                    fullWidth={true}
                                    getOptionLabel={(option) => option as string}
                                    renderInput={(params) => (
                                      <TextField
                                        {...params}
                                        variant="outlined"
                                        size="small"
                                        // label={param.label}
                                        placeholder={param.placeholder ? param.placeholder : "..."}
                                        // helperText={param.description}
                                      />
                                    )}
                                    value={settingsCtx.get(name) as JSONValue[]}
                                    onChange={(_event, newValue) => {
                                      settingsCtx.set(name, newValue);
                                    }}
                                    disableCloseOnSelect
                                    renderOption={(props, option, { selected }) => {
                                      return (
                                        <li {...props} key={option as string} style={{ height: "1.5em" }}>
                                          <Checkbox
                                            icon={icon}
                                            checkedIcon={checkedIcon}
                                            checked={selected}
                                            size="small"
                                          />
                                          {`${option}`}
                                        </li>
                                      );
                                    }}
                                  />
                                  {param.default && param.default !== settingsCtx.get(name) && (
                                    <Tooltip title="Restore default value" placement="bottom" disableInteractive>
                                      <IconButton
                                        onClick={() => {
                                          settingsCtx.set(name, param.default);
                                        }}
                                      >
                                        <UndoIcon fontSize="inherit" />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                </Stack>
                              </>
                            ) : param.freeSolo ? (
                              <>
                                <Typography sx={{ fontWeight: "bold" }}>{param.label}</Typography>
                                {param.description && (
                                  <Typography sx={{ typography: "body2" }}>{param.description}</Typography>
                                )}
                                <Stack direction="row" alignItems="center">
                                  <Autocomplete
                                    id={param.label}
                                    size="small"
                                    options={param.options}
                                    freeSolo={param.freeSolo}
                                    fullWidth={true}
                                    value={settingsCtx.get(name)}
                                    renderInput={(params) => (
                                      <TextField
                                        {...params}
                                        variant="outlined"
                                        size="small"
                                        placeholder={param.placeholder ? param.placeholder : param.label}
                                      />
                                    )}
                                    onChange={(_event, newValue) => {
                                      settingsCtx.set(name, newValue as string);
                                    }}
                                  />
                                  {param.default && param.default !== settingsCtx.get(name) && (
                                    <Tooltip title="Restore default value" placement="bottom" disableInteractive>
                                      <IconButton
                                        onClick={() => {
                                          settingsCtx.set(name, param.default);
                                        }}
                                      >
                                        <UndoIcon fontSize="inherit" />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                </Stack>
                              </>
                            ) : (
                              <>
                                <Typography sx={{ fontWeight: "bold" }}>{param.label}</Typography>
                                <FormControlLabel
                                  control={
                                    <Select
                                      labelId={`label-${param.label}`}
                                      id={param.label}
                                      autoWidth={false}
                                      value={settingsCtx.get(name)}
                                      onChange={(event) => {
                                        settingsCtx.set(name, event.target.value);
                                      }}
                                      size="small"
                                      sx={{ marginRight: "0.5em", minWidth: "15em" }}
                                      displayEmpty
                                    >
                                      {param.options.map((name) => {
                                        return (
                                          <MenuItem key={name as string} value={name as string}>
                                            {name as string}
                                          </MenuItem>
                                        );
                                      })}
                                    </Select>
                                  }
                                  sx={{ margin: 0 }}
                                  label={
                                    <Stack direction="row" alignItems="center">
                                      {param.default && param.default !== settingsCtx.get(name) && (
                                        <Tooltip title="Restore default value" placement="bottom" disableInteractive>
                                          <IconButton
                                            onClick={() => {
                                              settingsCtx.set(name, param.default);
                                            }}
                                          >
                                            <UndoIcon fontSize="inherit" />
                                          </IconButton>
                                        </Tooltip>
                                      )}
                                      <Typography sx={{ typography: "body2" }}>{param.description}</Typography>
                                    </Stack>
                                  }
                                />
                              </>
                            )}
                          </Stack>
                        );
                      }
                      if (param.type === "boolean") {
                        return (
                          <Stack
                            key={`opt-${name}-boolean`}
                            sx={{
                              "&:hover": {
                                backgroundColor: (theme) => theme.palette.action.hover,
                              },
                            }}
                          >
                            {param.description ? (
                              <>
                                <Typography sx={{ fontWeight: "bold" }}>{param.label}</Typography>
                                <FormControlLabel
                                  control={
                                    <Checkbox
                                      checked={settingsCtx.get(name) as boolean}
                                      onChange={(event) => {
                                        settingsCtx.set(name, event.target.checked);
                                      }}
                                    />
                                  }
                                  sx={{ margin: 0 }}
                                  label={<Typography sx={{ typography: "body2" }}>{param.description}</Typography>}
                                />
                              </>
                            ) : (
                              <FormControl key={name} component="fieldset" variant="standard" sx={{ margin: 0 }}>
                                <FormControlLabel
                                  control={
                                    <Switch
                                      // color="primary"
                                      checked={settingsCtx.get(name) as boolean}
                                      onChange={(event) => {
                                        settingsCtx.set(name, event.target.checked);
                                      }}
                                    />
                                  }
                                  label={param.label}
                                  labelPlacement="end"
                                  aria-label={param.label}
                                  id={`toggle-${param.label}`}
                                />
                              </FormControl>
                            )}
                          </Stack>
                        );
                      }
                      if (param.type === "number") {
                        return (
                          <Stack
                            key={`opt-${name}-number`}
                            direction="column"
                            spacing={0}
                            sx={{
                              "&:hover": {
                                backgroundColor: (theme) => theme.palette.action.hover,
                              },
                            }}
                            // alignItems={"center"}
                          >
                            <Typography sx={{ fontWeight: "bold" }}>{param.label}</Typography>
                            <FormControlLabel
                              control={
                                <TextField
                                  type="number"
                                  key={`number-${param.label}`}
                                  // label={param.label}
                                  size="small"
                                  variant="outlined"
                                  InputProps={{ inputProps: { min: param.min, max: param.max } }}
                                  fullWidth={false}
                                  onChange={(e) => settingsCtx.set(name, Number(`${e.target.value}`))}
                                  value={settingsCtx.get(name)}
                                  sx={{ margin: 0, marginRight: "0.5em" }}
                                  // helperText={param.description}
                                />
                              }
                              sx={{ margin: 0 }}
                              label={
                                <Stack direction="row" alignItems="center">
                                  {param.default !== undefined && param.default !== settingsCtx.get(name) && (
                                    <Tooltip title="Restore default value" placement="bottom" disableInteractive>
                                      <IconButton
                                        onClick={() => {
                                          settingsCtx.set(name, param.default);
                                        }}
                                      >
                                        <UndoIcon fontSize="inherit" />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                  <Typography sx={{ typography: "body2" }}>{param.description}</Typography>
                                </Stack>
                              }
                            />
                          </Stack>
                        );
                      }
                      if (param.type === "button") {
                        return (
                          <Stack
                            key={`opt-${name}-button`}
                            direction="row"
                            spacing={"1em"}
                            sx={{
                              "&:hover": {
                                backgroundColor: (theme) => theme.palette.action.hover,
                              },
                            }}
                            alignItems={"center"}
                          >
                            <Typography sx={{ typography: "body2" }}>{param.description}</Typography>
                            <Button
                              key={`button-${param.label}`}
                              // helperText={param.description}
                              variant="contained"
                              size="small"
                              onClick={() => settingsCtx.set(name, true)}
                            >
                              {param.label}
                            </Button>
                          </Stack>
                        );
                      }
                      if (param.type === "string") {
                        return (
                          <Stack
                            key={`opt-${name}-array`}
                            direction="column"
                            spacing={0}
                            sx={{
                              "&:hover": {
                                backgroundColor: (theme) => theme.palette.action.hover,
                              },
                            }}
                            // alignItems={"center"}
                          >
                            <Typography sx={{ fontWeight: "bold" }}>{param.label}</Typography>
                            {param.description && (
                              <Typography sx={{ typography: "body2" }}>{param.description}</Typography>
                            )}
                            <Stack direction="row">
                              <TextField
                                key={`text-${param.label}`}
                                // label={param.label}
                                size="small"
                                variant="outlined"
                                fullWidth={true}
                                error={param.isValid && !param.isValid(values[name] as string)}
                                onChange={(e) => {
                                  const value = `${e.target.value}`;
                                  if (!param.isValid || param.isValid?.(value)) {
                                    settingsCtx.set(name, param.validate ? param.validate(value) : value);
                                  }
                                  values[name] = value;
                                  forceValuesUpdate();
                                }}
                                value={values[name]}
                                sx={{ marginRight: "0.5em" }}
                                // helperText={param.description}
                              />
                              {param.default && param.default !== settingsCtx.get(name) && (
                                <Tooltip title="Restore default value" placement="bottom" disableInteractive>
                                  <IconButton
                                    onClick={() => {
                                      settingsCtx.set(name, param.default);
                                    }}
                                  >
                                    <UndoIcon fontSize="inherit" />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>
                          </Stack>
                        );
                      }
                      // console.log(`Ignored PARAMETER: ${JSON.stringify(name)} of type ${param.type}`);
                      return "";
                    })}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>
      </Stack>
    );
  }, [
    grouped,
    expanded,
    valuesChanged,
    exportDialogOpen,
    importDialogOpen,
    confirmResetOpen,
    buttonLocation,
    exportSettings,
    importSettings,
    importSelectedNamespaces,
    importPreview,
    filter,
    settingsCtx,
    appStateCtx,
    exportSelectedNamespaces,
    handleExport,
    handleFileChange,
  ]);

  return generateContent;
}
