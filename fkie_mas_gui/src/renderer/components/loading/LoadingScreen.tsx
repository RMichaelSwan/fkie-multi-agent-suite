import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import { Box, CircularProgress, Fade, Typography, useTheme } from "@mui/material";
import React from "react";

interface LoadingScreenProps {
  /** Optional message displayed below the spinner. */
  message?: string;
}

/**
 * Full-screen loading indicator shown while persistence layers initialize.
 * Uses MUI theming and adapts to dark/light mode automatically.
 */
export function LoadingScreen({ message = "Initializing..." }: LoadingScreenProps): React.ReactElement {
  const theme = useTheme();

  return (
    <Fade in timeout={400}>
      <Box
        sx={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2.5,
          bgcolor: theme.palette.background.default,
          zIndex: theme.zIndex.modal + 1,
        }}
      >
        {/* Icon + Spinner combo */}
        <Box sx={{ position: "relative", display: "inline-flex" }}>
          <CircularProgress
            size={72}
            thickness={2}
            sx={{
              color: theme.palette.primary.main,
            }}
          />
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <StorageRoundedIcon
              sx={{
                fontSize: 28,
                color: theme.palette.primary.main,
                opacity: 0.85,
              }}
            />
          </Box>
        </Box>

        {/* Message */}
        <Typography
          variant="body2"
          sx={{
            color: theme.palette.text.secondary,
            fontWeight: 500,
            letterSpacing: 0.3,
            userSelect: "none",
          }}
        >
          {message}
        </Typography>
      </Box>
    </Fade>
  );
}
