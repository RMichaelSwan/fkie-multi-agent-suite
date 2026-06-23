import EditIcon from "@mui/icons-material/Edit";
import JoinFullIcon from "@mui/icons-material/JoinFull";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import { IconButton, Link, Stack, TableCell, TableRow, Tooltip, Typography } from "@mui/material";

import { useCallback, useMemo } from "react";

import LongPressIconButton from "@/renderer/components/UI/LongPressIconButton";
import { useRosContext } from "@/renderer/hooks/useRosContext";
import { ProviderLaunchConfiguration } from "@/renderer/models";

interface ProviderPanelRowCfgProps {
  startConfig: ProviderLaunchConfiguration;
  editConfiguration: (config: ProviderLaunchConfiguration) => void;
}

export default function ProviderPanelRowCfg(props: ProviderPanelRowCfgProps): JSX.Element {
  const { startConfig, editConfiguration } = props;
  const rosCtx = useRosContext();

  const handleStartProvider = useCallback(
    (options: { forceRestart: boolean }) => {
      if (options.forceRestart) {
        startConfig.params.force.stop = true;
      }
      rosCtx.startConfig(startConfig, null);
    },
    [startConfig, rosCtx.startConfig]
  );

  const handleConnectToProvider = useCallback(() => {
    rosCtx.connect(startConfig.params, false);
  }, [startConfig, rosCtx.connect]);

  const createTableRow = useMemo(() => {
    const hostname = startConfig.params.name || startConfig.params.host;
    const port = startConfig.params.port !== 0 ? `:${startConfig.params.port}` : "";
    const domainTitle = startConfig.params.rosVersion === "2" ? "ROS_DOMAIN_ID" : "Network ID";
    const rmwImpl = startConfig.params.rmw.current !== "RMW_IMPLEMENTATION";
    return (
      <TableRow key={startConfig.params.id} style={{ display: "flex" }}>
        <TableCell
          style={{
            padding: 2,
            flexGrow: 1,
            flexShrink: 1,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <Tooltip
            title={
              <div>
                <Typography fontWeight="bold" fontSize="inherit">
                  {hostname}
                </Typography>
                <Stack direction="row" spacing={"0.2em"}>
                  <Typography fontWeight="bold" fontSize="inherit">
                    {domainTitle}:
                  </Typography>
                  <Typography fontSize="inherit">{startConfig.params.domainId}</Typography>
                </Stack>
                {rmwImpl && (
                  <Stack direction="row" spacing={"0.2em"}>
                    {/* <Typography fontWeight="bold" fontSize="inherit">
                    RMW_IMPLEMENTATION:
                  </Typography> */}
                    <Typography fontSize="inherit">{startConfig.params.rmw.current}</Typography>
                  </Stack>
                )}
              </div>
            }
            disableInteractive
          >
            <Stack direction="row" spacing="0.5em" flexGrow={1}>
              <Link
                noWrap
                href="#"
                underline="none"
                color="inherit"
                onClick={() => {}}
                sx={{ flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
              >
                <Typography variant="body2">
                  {hostname}
                  {port}
                </Typography>
              </Link>
              <Typography color="grey" variant="body2">
                [{startConfig.params.domainId}]
              </Typography>
              {rmwImpl && (
                <Typography
                  color="grey"
                  variant="body2"
                  sx={{ flexShrink: 100, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {startConfig.params.rmw.current}
                </Typography>
              )}
            </Stack>
          </Tooltip>
        </TableCell>
        <TableCell
          style={{
            padding: 0,
            flexShrink: 0,
          }}
        >
          <Stack direction="row" spacing="0.2em">
            {window.commandExecutor ? (
              <Tooltip
                title={
                  <div>
                    <Typography fontWeight="bold" fontSize="inherit">
                      Start provider if the provider is not running yet. If the provider is already running, it will be connected to.
                    </Typography>
                    <Stack direction="row" spacing={"0.2em"}>
                      <Typography fontWeight="bold" fontSize="inherit">
                        Shift or long press:
                      </Typography>
                      <Typography fontSize="inherit">force restart mas nodes</Typography>
                    </Stack>
                  </div>
                }
                placement="bottom"
                disableInteractive
              >
                <span>
                  <LongPressIconButton
                    onClick={(event) => {
                      // remove focus to ignore Enter propagation from PasswortDialog
                      (event.currentTarget as HTMLElement).blur();
                      handleStartProvider({ forceRestart: event.nativeEvent.shiftKey });
                    }}
                    onLongPress={() => handleStartProvider({ forceRestart: true })}
                    color="info"
                    size="small"
                  >
                    <PlayCircleOutlineIcon fontSize="inherit" />
                  </LongPressIconButton>
                </span>
              </Tooltip>
            ) : (
              <Tooltip
                title={
                  <div>
                    <Typography fontWeight="bold" fontSize="inherit">
                      Click to connect to provider
                    </Typography>
                  </div>
                }
                placement="bottom"
                disableInteractive
              >
                <IconButton
                  onClick={(event) => {
                    // remove focus to ignore Enter propagation from PasswortDialog
                    (event.currentTarget as HTMLElement).blur();
                    handleConnectToProvider();
                  }}
                  color="default"
                  size="small"
                >
                  <JoinFullIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={"Click to edit configuration"} placement="bottom" disableInteractive>
              <IconButton
                onClick={() => {
                  editConfiguration(startConfig);
                }}
                // color="info"
                size="small"
              >
                <EditIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          </Stack>
        </TableCell>
      </TableRow>
    );
  }, [startConfig, handleStartProvider, editConfiguration]);

  return createTableRow;
}
