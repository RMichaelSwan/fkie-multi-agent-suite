import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ArrowRightIcon from "@mui/icons-material/ArrowRight";
import { Box, Stack, Typography } from "@mui/material";
import { grey } from "@mui/material/colors";
import { alpha } from "@mui/material/styles";
import React from "react";

interface ActionGroupTreeItemProps {
  itemId: string;
  rootPath: string;
  groupName: string;
  countChildren: number;
  expanded: boolean;
  selected: boolean;
  depth: number;
  onToggle: () => void;
  onSelect: () => void;
}

/**
 * Virtualized row for an action group.
 * Click row: toggle + select; click icon: toggle only.
 */
export default function ActionGroupTreeItem({
  itemId,
  rootPath,
  groupName,
  countChildren,
  expanded,
  selected,
  depth,
  onToggle,
  onSelect,
}: ActionGroupTreeItemProps): JSX.Element {
  const handleRowClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    onToggle();
    onSelect();
  };

  const handleIconClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    onToggle();
  };

  const lineKeys = Array.from({ length: depth }, (_, i) => `${itemId}-line-${i}`);

  return (
    <Box
      onClick={handleRowClick}
      sx={{
        display: "flex",
        alignItems: "stretch",
        cursor: "pointer",
        borderRadius: 0,
        bgcolor: selected ? "var(--color-select-bg)" : "transparent",
        color: "text.secondary",
      }}
    >
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

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexGrow: 1,
          py: 0.3,
          pr: 1,
        }}
      >
        <Box
          onClick={handleIconClick}
          sx={{
            width: "1em",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {expanded ? <ArrowDropDownIcon fontSize="inherit" /> : <ArrowRightIcon fontSize="inherit" />}
        </Box>

        <Stack direction="column" sx={{ flexGrow: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Stack direction="row" sx={{ flexGrow: 1, alignItems: "center" }}>
              <Typography variant="body2" sx={{ fontWeight: "inherit", userSelect: "none" }}>
                {rootPath.length > 0 ? `${rootPath}/` : ""}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: "inherit", userSelect: "none" }}>
                {groupName}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              {countChildren > 0 && (
                <Typography variant="caption" color="inherit" padding={0.2}>
                  [{countChildren}]
                </Typography>
              )}
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
