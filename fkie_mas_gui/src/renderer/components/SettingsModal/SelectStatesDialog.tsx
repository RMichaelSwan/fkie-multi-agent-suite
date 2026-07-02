import FileDownloadIcon from "@mui/icons-material/FileDownload";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SettingsIcon from "@mui/icons-material/Settings";
import StorageIcon from "@mui/icons-material/Storage";
import {
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { ReactNode } from "react";

// Generic dialog to select settings and application state namespaces
interface SelectStateDialogProps {
  open: boolean;
  title: string;
  description: string;

  // Action context: controls button label, icon, color (export/import/reset)
  mode: "export" | "import" | "reset";
  confirmLabel?: string;
  confirmIcon?: ReactNode;
  confirmColor?: "primary" | "warning";

  // Settings section
  showSettings: boolean;
  settingsChecked: boolean;
  onToggleSettings: (checked: boolean) => void;
  settingsChipLabel?: string;

  // Namespaces section
  namespaces: string[];
  selectedNamespaces: Set<string>;
  onToggleNamespace: (ns: string) => void;
  getEntryCount?: (ns: string) => number;

  // Dialog actions
  onClose: () => void;
  onConfirm: () => void;
  disableConfirm?: boolean;
}

export function SelectStatesDialog({
  open,
  title,
  description,
  mode,
  confirmLabel,
  confirmIcon,
  confirmColor = mode === "reset" ? "warning" : "primary",
  showSettings,
  settingsChecked,
  onToggleSettings,
  settingsChipLabel,
  namespaces,
  selectedNamespaces,
  onToggleNamespace,
  getEntryCount,
  onClose,
  onConfirm,
  disableConfirm,
}: SelectStateDialogProps): JSX.Element {
  // Resolve default button label/icon based on mode
  const resolvedConfirmLabel = confirmLabel ?? (mode === "export" ? "Export" : mode === "import" ? "Import" : "Reset");

  const resolvedConfirmIcon =
    confirmIcon ??
    (mode === "export" ? <FileUploadIcon /> : mode === "import" ? <FileDownloadIcon /> : <RestartAltIcon />);

  // Determine if all namespaces are currently selected
  const allSelected = namespaces.length > 0 && selectedNamespaces.size === namespaces.length;

  // Toggle all namespaces based on current selection
  // If all are selected, deselect all; otherwise select all.
  const handleToggleAllNamespaces = () => {
    if (namespaces.length === 0) return;

    if (allSelected) {
      // Deselect all currently selected namespaces
      namespaces.forEach((ns) => {
        if (selectedNamespaces.has(ns)) {
          onToggleNamespace(ns);
        }
      });
    } else {
      // Select all namespaces that are not selected yet
      namespaces.forEach((ns) => {
        if (!selectedNamespaces.has(ns)) {
          onToggleNamespace(ns);
        }
      });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{description}</DialogContentText>

        {/* Settings selection */}
        {showSettings ? (
          <FormControlLabel
            control={
              <Checkbox
                checked={settingsChecked}
                onChange={(e) => onToggleSettings(e.target.checked)}
                icon={<SettingsIcon />}
                checkedIcon={<SettingsIcon />}
              />
            }
            label={
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography>Settings</Typography>
                {settingsChipLabel && <Chip label={settingsChipLabel} size="small" variant="outlined" />}
              </Stack>
            }
          />
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            No settings available for this operation.
          </Typography>
        )}

        {/* Application State namespaces */}
        {namespaces.length > 0 ? (
          <>
            <Divider sx={{ my: 1.5 }} />
            {/* Header row: clicking toggles all namespaces */}
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ mb: 1, cursor: "pointer" }}
              onClick={handleToggleAllNamespaces}
            >
              <StorageIcon fontSize="small" color="action" />
              <Typography variant="subtitle2" color="text.secondary">
                Application State
              </Typography>
              <Chip
                label={`${selectedNamespaces.size}/${namespaces.length}`}
                size="small"
                variant="outlined"
                color={allSelected ? "primary" : "default"}
              />
            </Stack>

            <List dense disablePadding>
              {namespaces.map((ns) => {
                const entryCount = getEntryCount ? getEntryCount(ns) : undefined;
                return (
                  <ListItem key={ns} disablePadding>
                    <ListItemButton dense onClick={() => onToggleNamespace(ns)}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Checkbox edge="start" checked={selectedNamespaces.has(ns)} disableRipple size="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={ns}
                        secondary={entryCount !== undefined ? `${entryCount} entries` : undefined}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            No application state available for this operation.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color={confirmColor}
          startIcon={resolvedConfirmIcon}
          disabled={disableConfirm}
        >
          {resolvedConfirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
