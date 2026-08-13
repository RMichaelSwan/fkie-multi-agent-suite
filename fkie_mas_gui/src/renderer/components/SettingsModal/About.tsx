import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { Autocomplete, Box, Button, IconButton, Link, Stack, TextField, Tooltip, Typography } from "@mui/material";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import PropTypes from "prop-types";
import { useEffect, useMemo, useState } from "react";

import { useAutoUpdateContext } from "@/renderer/context/AutoUpdateContext";
import licenses from "@/renderer/deps-licenses.json";
import packageJson from "../../../../package.json";
import CopyButton from "../UI/CopyButton";

type LicenseEntry = {
  name: string;
  licenseType?: string;
  installedVersion?: string;
  author?: string;
  link?: string;
};

function LinearProgressWithLabel({ value, ...props }): JSX.Element {
  return (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      <Box sx={{ width: "100%", mr: 1 }}>
        <LinearProgress variant="determinate" {...props} />
      </Box>
      <Box sx={{ minWidth: 35 }}>
        <Typography variant="body2" color="text.secondary">{`${Math.round(value)}%`}</Typography>
      </Box>
    </Box>
  );
}
LinearProgressWithLabel.propTypes = {
  value: PropTypes.number.isRequired,
};

const CHANNELS = ["prerelease", "release"];

export default function About(): JSX.Element {
  const auCtx = useAutoUpdateContext();
  const [openErrorTooltip, setOpenErrorTooltip] = useState(!!auCtx.updateError);

  const updateCli = auCtx.getUpdateCli(true, true);
  const updateCliRobot = auCtx.getUpdateCli(false, true);

  const channelOptions = useMemo(
    () => [...CHANNELS, ...(auCtx.availableVersions || []).map((v) => v.version).filter((v) => !CHANNELS.includes(v))],
    [auCtx.availableVersions]
  );

  // true if the current selection is a concrete version instead of a channel
  const selectedVersion = useMemo(() => {
    return CHANNELS.includes(auCtx.updateChannel) ? "" : auCtx.updateChannel;
  }, [auCtx.updateChannel]);

  function changelog(data: string[]) {
    return (
      <Box>
        {data.map((entry) => {
          const [header, ...lines] = entry.split("\r\n").filter(Boolean);

          const match = header.match(/\*\*Changes in version (.+) \((.+)\) (.+):\*\*/);

          const version = match?.[1] ?? "unknown";
          const date = match?.[2] ?? "unknown";
          const type = match?.[3] ?? "unknown";

          return (
            <Box key={`${version}-${date}`} sx={{ mb: 3 }}>
              <Typography variant="h6" fontWeight="bold">
                Version {version}
              </Typography>

              <Typography variant="caption" color="text.secondary">
                {date} • {type}
              </Typography>

              <Box sx={{ mt: 1, pl: 2 }}>
                {lines.map((line) => (
                  <Typography key={line} variant="body2">
                    • {line}
                  </Typography>
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>
    );
  }

  /** true if a license-report field contains usable data */
  function hasValue(value?: string): boolean {
    const v = (value || "").trim();
    return !!v && v.toLowerCase() !== "n/a";
  }

  /** Convert repository fields like "git+https://github.com/u/r.git" into a browsable https URL */
  function toRepoUrl(entry: LicenseEntry): string {
    if (!hasValue(entry.link)) return "";
    const url = (entry.link as string)
      .trim()
      .replace(/^git\+/, "")
      .replace(/\.git$/, "")
      .replace(/^git:\/\//, "https://")
      .replace(/^ssh:\/\/git@/, "https://")
      .replace(/^git@([^:]+):/, "https://$1/");
    if (/^https?:\/\//.test(url)) return url;
    const shorthand = url.match(/^(?:github:)?([\w.-]+\/[\w.-]+)$/);
    return shorthand ? `https://github.com/${shorthand[1]}` : "";
  }

  /** npm page of the exact installed version (falls back to the package page) */
  function toNpmUrl(entry: LicenseEntry): string {
    const base = `https://www.npmjs.com/package/${entry.name}`;
    return hasValue(entry.installedVersion) ? `${base}/v/${entry.installedVersion}` : base;
  }

  /** Split author string "Name <mail@host> (https://url)" into name and contact parts */
  function splitAuthor(author?: string): { name: string; contact: string } {
    if (!hasValue(author)) return { name: "", contact: "" };
    const value = (author as string).trim();
    const match = value.match(/^([^<(]*)(.*)$/);
    return { name: (match?.[1] || value).trim(), contact: (match?.[2] || "").trim() };
  }

  // sort dependencies alphabetically by name (case-insensitive, natural number order)
  const sortedLicenses = useMemo(() => {
    const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    return [...(licenses as LicenseEntry[])].sort(
      (a, b) => collator.compare(a.name, b.name) || collator.compare(a.installedVersion || "", b.installedVersion || "")
    );
  }, []);

  return (
    <Stack height="100%" padding="0.3em" overflow="auto">
      {/** Version */}
      <Stack direction="column" justifyItems="center">
        <Stack spacing={1} direction="row" justifyItems="center" alignItems="center">
          <Typography variant="body1" sx={{ fontWeight: "bold" }}>
            Version:
          </Typography>
          <Typography variant="body1">{packageJson.version}</Typography>
          {auCtx.autoUpdateManager && !auCtx.checkingForUpdate && (
            <Button color="primary" onClick={() => auCtx.checkForUpdate()} variant="text">
              check for updates
            </Button>
          )}
          {auCtx.updateError.length > 0 && (
            <IconButton
              edge="start"
              aria-label="error message"
              onClick={() => {
                setOpenErrorTooltip(!openErrorTooltip);
              }}
            >
              <ErrorOutlineIcon
                sx={{
                  fontSize: "inherit",
                  color: "red",
                }}
              />
            </IconButton>
          )}
          {auCtx.checkTimestamp > 0 && (
            <Typography variant="body1" color="grey" sx={{ fontSize: "0.8em" }}>
              last check: {new Date(auCtx.checkTimestamp * 1000).toLocaleString()}
            </Typography>
          )}
        </Stack>
        <Stack ml="1em" direction="column">
          {auCtx.checkedThisRun && !auCtx.checkingForUpdate && !auCtx.updateAvailable && !auCtx.updateError && (
            <Typography variant="body1" color="green">
              Your version is up to date!
            </Typography>
          )}
        </Stack>
        {auCtx.autoUpdateManager && (
          <Stack ml="1em" spacing={0.2} direction="row" alignItems="center">
            <Autocomplete
              handleHomeEndKeys={false}
              disablePortal
              disableClearable
              freeSolo
              id="auto-complete-au-channel"
              size="small"
              options={channelOptions}
              groupBy={(option) => (CHANNELS.includes(option) ? "Channel" : "Version")}
              renderOption={(props, option) => {
                const info = auCtx.availableVersions?.find((v) => v.version === option);
                return (
                  <Box {...props} key={option} component="li" sx={{ display: "flex", gap: "0.5em" }}>
                    <Typography variant="body2">{option}</Typography>
                    {info?.prerelease && (
                      <Typography variant="body2" sx={{ fontStyle: "italic", opacity: 0.6 }}>
                        {" "}
                        - prerelease
                      </Typography>
                    )}
                  </Box>
                );
              }}
              sx={{ margin: 0, width: "16em" }}
              renderInput={(params) => <TextField {...params} label="Update channel / version" />}
              value={auCtx.updateChannel}
              onChange={(_event: unknown, newValue: string | null) => {
                if (!newValue) return;
                // accept known channels, listed versions or a manually typed semver value
                const isVersion = newValue.split(".").length === 3;
                if (channelOptions.includes(newValue) || isVersion) {
                  auCtx.setUpdateChannel(newValue);
                }
              }}
            />

            {auCtx.checkingForUpdate && (
              <Box sx={{ display: "flex" }}>
                <CircularProgress size="1em" />
              </Box>
            )}
            {auCtx.downloadProgress && (
              <Stack spacing={0.2} direction="row">
                <Typography variant="body1">downloading {auCtx?.updateAvailable?.version}</Typography>
                {auCtx.downloadProgress.percent < 100 && (
                  <Box sx={{ width: "100%" }}>
                    <LinearProgressWithLabel value={auCtx.downloadProgress.percent} />
                  </Box>
                )}
              </Stack>
            )}
          </Stack>
        )}

        {auCtx?.updateAvailable?.version && (
          <Stack direction="column" alignItems="left">
            <Typography variant="body1" color="green">
              Version {auCtx.updateAvailable?.version} available
            </Typography>
            {auCtx.autoUpdateManager ? (
              <Stack direction="row" alignItems="center">
                {auCtx.isAppImage ? (
                  <Button color="primary" onClick={() => auCtx.requestInstallUpdate()} variant="text">
                    Restart required
                  </Button>
                ) : auCtx?.installing ? (
                  <CircularProgress style={{ marginLeft: "0.5em" }} size="1em" />
                ) : (
                  <Button
                    color="warning"
                    variant="contained"
                    size="small"
                    onClick={() => auCtx.installDebian(true, true)}
                  >
                    {`Install ${selectedVersion} now`}
                  </Button>
                )}
              </Stack>
            ) : (
              <Typography variant="body1" color="orange">
                {auCtx.autoUpdateManager ? "" : "Update from browser is not available! "}
                Please use the command line instructions below to update.
              </Typography>
            )}
          </Stack>
        )}
        {auCtx.autoUpdateManager && auCtx.isAppImage && auCtx.updateChannel === "prerelease" && (
          <Typography ml="1em" variant="body1" color="orange">
            You must switch to the &lsquo;prerelease&rsquo; branch for Daemon and Discovery
          </Typography>
        )}
        {openErrorTooltip && auCtx.isAppImage && (
          <Stack ml="1em" direction="row" alignItems="center">
            <CopyButton value={auCtx.updateError} />
            <Typography variant="body1" color="red">
              {auCtx.updateError}
            </Typography>
          </Stack>
        )}
        {openErrorTooltip && !auCtx.isAppImage && (
          <Stack ml="1em" direction="column" justifyItems="left">
            <Typography variant="body1" color="red">
              {auCtx.updateError}
            </Typography>
            <Stack mb="0.5em" mt="0.5em" direction="column">
              <Typography variant="body1" color="green">
                You can try to change the default terminal using the following command and run the update again:
              </Typography>
              <Stack ml="1em" direction="row" alignItems="center">
                <Typography variant="body1" color="grey">
                  sudo update-alternatives --config x-terminal-emulator
                </Typography>
                <CopyButton value={"sudo update-alternatives --config x-terminal-emulator"} />
              </Stack>
              <Typography variant="body1" color="green">
                Or try to start the local TTYD.
              </Typography>
            </Stack>
          </Stack>
        )}
        {!auCtx.isAppImage && (
          <Stack ml="1em" direction="column" justifyItems="left">
            <Typography variant="body1">Manual update in the terminal of your choice:</Typography>
            <Stack ml="1em" direction="row" alignItems="center">
              <CopyButton value={updateCli} />
              <Typography variant="body1" color="grey">
                {updateCli}
              </Typography>
            </Stack>
            <Typography ml="0.5em" variant="body2">
              without mas gui:
            </Typography>
            <Stack ml="1em" direction="row" alignItems="center">
              <CopyButton value={updateCliRobot} />
              <Typography variant="body1" color="grey">
                {updateCliRobot}
              </Typography>
            </Stack>
          </Stack>
        )}
        {auCtx?.updateAvailable?.releaseNotes && (
          <Stack ml="1em" mt="0.6em" spacing={0.2} color="grey" direction="column">
            {changelog((auCtx?.updateAvailable?.releaseNotes as unknown as string[]) || [])}
          </Stack>
        )}
      </Stack>
      {/** License */}
      <Stack mt="0.6em" spacing={1} direction="row">
        <Typography variant="body1" sx={{ fontWeight: "bold" }}>
          License:
        </Typography>
        <Typography variant="body1">{packageJson.license}</Typography>
      </Stack>
      {/** Contributors */}
      <Stack mt="0.6em" spacing="0.2em" direction="column">
        <Typography variant="body1" sx={{ fontWeight: "bold" }}>
          Contributors:
        </Typography>
        <Stack paddingLeft="1em">
          {packageJson.contributors.map((item) => (
            <Typography key={`contributor-${item}`} variant="body1">
              {item}
            </Typography>
          ))}
        </Stack>
      </Stack>
      {/** additional software */}
      <Stack mt="0.6em" spacing="0.2em" direction="column">
        <Typography variant="body1" sx={{ fontWeight: "bold" }}>
          Required additional software:
        </Typography>
        <Stack paddingLeft="1em">
          <Link href="https://github.com/tsl0922/ttyd" target="_blank" rel="noopener">
            https://github.com/tsl0922/ttyd
          </Link>
          <Link href="https://github.com/fkie/fkie-multi-agent-suite" target="_blank" rel="noopener">
            https://github.com/fkie/fkie-multi-agent-suite
          </Link>
        </Stack>
      </Stack>
      {/** dependencies */}
      <Typography variant="body1" mt="0.6em" sx={{ fontWeight: "bold" }}>
        List of {sortedLicenses.length} dependencies:
      </Typography>
      <Stack>
        <ul>
          {sortedLicenses.map((item) => {
            const repoUrl = toRepoUrl(item);
            const npmUrl = toNpmUrl(item);
            const { name: authorName, contact: authorContact } = splitAuthor(item.author);

            return (
              <li key={`${item.name}@${item.installedVersion}`}>
                {/* package name -> repository */}
                {repoUrl ? (
                  <Tooltip title={`Repository: ${repoUrl}`} placement="top-start" enterDelay={400} disableInteractive>
                    <Link href={repoUrl} target="_blank" rel="noopener noreferrer">
                      {item.name}
                    </Link>
                  </Tooltip>
                ) : (
                  <Tooltip title="No repository defined for this package" placement="top-start" disableInteractive>
                    <Typography component="span" variant="body1">
                      {item.name}
                    </Typography>
                  </Tooltip>
                )}

                {/* version -> npm */}
                <Typography component="span" variant="body1" sx={{ ml: 0.5, mr: 0.5 }}>
                  @
                </Typography>
                <Tooltip title={`npm package: ${npmUrl}`} placement="top-start" enterDelay={400} disableInteractive>
                  <Link href={npmUrl} target="_blank" rel="noopener noreferrer">
                    {item.installedVersion}
                  </Link>
                </Tooltip>
                <Typography component="span" variant="body1">
                  : {item.licenseType}
                </Typography>

                {/* author, visually subdued */}
                {authorName && (
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 1, fontStyle: "italic" }}
                  >
                    {authorName}
                    {authorContact && (
                      <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>
                        {authorContact}
                      </Typography>
                    )}
                  </Typography>
                )}
              </li>
            );
          })}
        </ul>
      </Stack>
    </Stack>
  );
}
