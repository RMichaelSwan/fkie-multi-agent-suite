import { GlobalStyles, useTheme } from "@mui/material";

/** global styles for monaco decorations of a pending parameter insert */
export function PendingEditStyles(): JSX.Element {
  const theme = useTheme();
  return (
    <GlobalStyles
      styles={{
        ".pending-edit-text": {
          backgroundColor: theme.palette.mode === "dark" ? "rgba(102, 187, 106, 0.25)" : "rgba(76, 175, 80, 0.22)",
          borderBottom: `1px dashed ${theme.palette.success.main}`,
        },
        ".pending-edit-line": {
          backgroundColor: theme.palette.mode === "dark" ? "rgba(102, 187, 106, 0.08)" : "rgba(76, 175, 80, 0.08)",
        },
        ".pending-edit-widget": {
          zIndex: 60,
          pointerEvents: "auto",
          whiteSpace: "nowrap",
          lineHeight: "normal",
        },
      }}
    />
  );
}
