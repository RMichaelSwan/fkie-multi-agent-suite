import { CommandExecutorEvents, TCommandExecutor, TSystemInfo } from "@/types";
import { ipcMain } from "electron";
import log from "electron-log";
import { spawn, StdioOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { quote } from "shell-quote";
import { Client, ClientChannel, ClientErrorExtensions, ConnectConfig } from "ssh2";
import CommandLine from "./CommandLine";
import { SystemInfo } from "./SystemInfo";

const textDecoder = new TextDecoder();

/**
 * Class CommandExecutor: Execute commands locally or remote using SSH2 interface
 */
export default class CommandExecutor implements TCommandExecutor {
  commandLine: CommandLine | null = null;
  localCredential: ConnectConfig;

  // TODO: read ssh config to get username for a given host
  sshUsers: { [id: string]: string } = {}; // host: user
  sshPorts: { [id: string]: number } = {}; // host: port
  sshKeys: { [id: string]: Buffer } = {}; // host: privateKeys

  privateSshKeys: Buffer[] = [];

  systemInfo?: TSystemInfo;

  /**
   * Terminal configuration and detection options.
   *
   * terminals   -> candidate terminal binaries, in priority order
   * exec        -> option used to execute a command (e.g. "-x /bin/bash -c" or "-e /bin/bash -c")
   * noClose     -> option used to keep terminal open after command (depends on terminal)
   * title       -> option used to set terminal title (depends on terminal)
   */
  terminalOptions: {
    terminals: string[];
    exec: string;
    noClose: string;
    title: string;
  } = {
    terminals: ["/usr/bin/x-terminal-emulator", "/usr/bin/xterm", "/opt/x11/bin/xterm"],
    exec: "-e /bin/bash -c",
    noClose: "",
    title: "",
  };

  constructor(commandLine: CommandLine) {
    this.commandLine = commandLine;
    const sshPath = `${os.homedir()}/.ssh`;
    let currentHost: string | null = null;

    const readSshLine = async (line: string): Promise<void> => {
      const nLine = line.trim();
      if (nLine.startsWith("Host ")) {
        currentHost = nLine.split(" ")[1];
      } else if ((nLine.startsWith("User ") || nLine.startsWith("user ")) && currentHost) {
        const username = nLine.split(" ")[1];
        this.sshUsers[currentHost] = username;
      } else if ((nLine.startsWith("Port ") || nLine.startsWith("port ")) && currentHost) {
        const port = nLine.split(" ")[1];
        this.sshPorts[currentHost] = Number.parseInt(port);
      } else if (nLine.startsWith("IdentityFile ") && currentHost) {
        const identPath: string = nLine.split(" ")[1].replace("~", os.homedir());
        try {
          this.sshKeys[currentHost] = fs.readFileSync(identPath);
        } catch (error) {
          console.error(`error while read specified IdentityFile "${identPath}": ${error}`);
        }
      }
    };

    const readSshConfig = async (): Promise<void> => {
      try {
        // read host/user configuration from ssh config
        fs.readFile(`${sshPath}/config`, "utf8", async (err, data) => {
          if (err) {
            log.warn(`error while read ${sshPath}/config`);
            return;
          }
          const configLines = data.split("\n");

          for (const line of configLines) {
            await readSshLine(line);
          }
          log.info(`found ${Object.keys(this.sshUsers).length} host configurations`);
        });
      } catch (error) {
        console.error(`error while read ssh configuration file "${sshPath}/config": ${error}`);
      }
    };

    readSshConfig();

    try {
      // read private ssh keys
      const files = fs.readdirSync(sshPath);
      files.filter((item) => {
        if (item.startsWith("id_")) {
          const content = fs.readFileSync(`${sshPath}/${item}`);
          if (content.includes("PRIVATE KEY---")) {
            this.privateSshKeys.push(content);
            return true;
          }
        }
        return false;
      });
    } catch (error) {
      console.error(`error while search .ssh directory for private keys: ${error}`);
    }

    log.info(`found ${this.privateSshKeys.length} ssh keys`);
    const fetchSystemInfo = async (): Promise<void> => {
      this.systemInfo = await new SystemInfo().getInfo();
    };
    fetchSystemInfo();

    // create local credential
    this.localCredential = {
      host: os.hostname(),
      port: 0,
      username: "",
      password: "",
      privateKey: "",
    };
  }

  public registerHandlers: () => void = () => {
    ipcMain.handle(CommandExecutorEvents.exec, (_event, credential: ConnectConfig, command: string) => {
      return this.exec(credential, command);
    });

    ipcMain.handle(
      CommandExecutorEvents.execTerminal,
      (_event, credential: ConnectConfig, title: string, command: string) => {
        return this.execTerminal(credential, title, command);
      }
    );
  };

  /**
   * Executes a command using a SSH connection or locally via child_process.
   * @param credential - SSH credential, null for local host.
   * @param command - Command to execute
   * @return Returns response
   */
  public exec: (
    credential: ConnectConfig | null,
    command: string
  ) => Promise<{ result: boolean; message: string; command: string; connectConfig?: ConnectConfig }> = async (
    credential: ConnectConfig | null,
    command: string
  ) => {
    let c = credential;

    // if no credential is given, assumes local host
    if (!c) c = this.localCredential;

    // Set the STDIO config: Ignore or redirect STDOUT/STDERR to current console
    let stdioOptions: StdioOptions | undefined = ["ignore", "pipe", "pipe"];
    const parentOut = !this.commandLine?.getArg("hide-output-from-background-processes");
    if (parentOut) {
      stdioOptions = ["inherit", "pipe", "pipe"];
    }

    const localIps = ["localhost", "127.0.0.1", os.hostname()];

    if (this.systemInfo) {
      for (const ni of this.systemInfo.networkInterfaces || []) {
        localIps.push(ni.ip4);
      }
    }

    if (c.host === undefined || localIps.includes(c.host)) {
      // local command: do not use SSH but child process instead
      return new Promise((resolve) => {
        try {
          let errorString = "";
          let resultString = "";
          log.info(`<cmd>${command}`);
          const child = spawn(command, [], {
            shell: true,
            stdio: stdioOptions,
            detached: false,
          });

          child.on("close", (code) => {
            if (code !== 0) {
              resolve({
                result: false,
                message: errorString,
                command,
              });
            } else {
              resolve({
                result: true,
                message: resultString,
                command,
              });
            }
          });

          child.stdout?.on("data", (data) => {
            if (parentOut) {
              console.log(`${data}`);
              resultString += `${data}`;
              for (const item of `${data}`.split("\n")) {
                if (
                  item.includes("[rosrun] Couldn't find executable") ||
                  item.includes("[ERROR]") ||
                  item.includes("[error]")
                ) {
                  errorString += item;
                }
              }
            }
          });

          child.stderr?.on("data", (data) => {
            if (parentOut) {
              console.error(`${data}`);
            }
            errorString += data;
          });

          child.on("error", (error) => {
            if (parentOut) {
              console.error(`${error}`);
            }
            errorString += error;
          });
        } catch (error) {
          resolve({
            result: false,
            message: `Catch error ${error}`,
            command,
          });
        }
      });
    }

    // command must be executed remotely
    return this.execRemote(c, command, 0);
  };

  /**
   * Executes a command on a remote host via SSH.
   * Tries multiple private keys if authentication fails.
   */
  private execRemote: (
    credential: ConnectConfig,
    command: string,
    keyIndex: number
  ) => Promise<{ result: boolean; message: string; command: string; connectConfig?: ConnectConfig }> = async (
    credential,
    command,
    keyIndex = 0
  ) => {
    console.log(`exec on ${credential.host}: ${command}`);
    const parentOut = !this.commandLine?.getArg("hide-output-from-background-processes");
    const connectionConfig = this.generateConfig(credential, keyIndex);

    return new Promise((resolve) => {
      if (!command) {
        resolve({
          result: false,
          message: "Invalid empty command",
          command,
          connectConfig: connectionConfig,
        });
        return;
      }

      const conn: Client = new Client();
      try {
        conn
          .on("ready", () => {
            conn.exec(command, (err: Error | undefined, sshStream: ClientChannel) => {
              if (credential) {
                log.info(`<ssh:${credential.username}@${credential.host}:${credential.port}>${command}`);
              }
              if (err) {
                resolve({
                  result: false,
                  message: err?.message,
                  command,
                });
                return;
              }
              let errorString = "";

              sshStream
                .on("close", (code: number) => {
                  // TODO: Check code/signal to validate response or errors
                  if (code !== 0) {
                    resolve({
                      result: false,
                      message: errorString,
                      command,
                    });
                  } else {
                    resolve({
                      result: true,
                      message: "",
                      command,
                    });
                  }
                  conn.end();
                })
                .stdout.on("data", (data: Buffer) => {
                  if (parentOut) {
                    console.log(`${textDecoder.decode(data)}`);
                  }
                  resolve({
                    result: true,
                    message: textDecoder.decode(data),
                    command,
                  });
                })
                .stderr.on("data", (data: Buffer) => {
                  if (parentOut) {
                    console.error(`${textDecoder.decode(data)}`);
                  }
                  errorString += textDecoder.decode(data);
                  resolve({
                    result: false,
                    message: textDecoder.decode(data),
                    command,
                  });
                });
            });
          })
          .connect(connectionConfig);

        conn.on("error", async (error: Error & ClientErrorExtensions) => {
          log.warn("CommandExecutor - connect error: ", JSON.stringify(error));
          connectionConfig.password = undefined;
          connectionConfig.privateKey = undefined;
          if (error.level === "client-authentication") {
            if (keyIndex + 1 < this.privateSshKeys.length) {
              const result = await this.execRemote(connectionConfig, command, keyIndex + 1);
              resolve(result);
            } else {
              resolve({
                result: false,
                message: error.message,
                command,
                connectConfig: connectionConfig,
              });
            }
          } else {
            resolve({
              result: false,
              message: error.message,
              command,
            });
          }
        });
      } catch (error) {
        let errorMessage = "Failed to execute remote command";
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        log.info("CommandExecutor - exec error: ", error);
        resolve({
          result: false,
          message: errorMessage,
          command,
        });
      }
    });
  };

  /**
   * Safely build a script argument for "bash -c".
   *
   * Wraps the given script in single quotes and escapes all existing
   * single quotes using the standard shell pattern: ' -> '\''.
   *
   * Example:
   *  script:  ssh host /bin/sh -c 'export FOO='\''bar'\'''
   *  result: 'ssh host /bin/sh -c '\''export FOO='\''bar'\''''
   */
  private buildBashScriptArg(script: string): string {
    const escaped = script.replace(/'/g, `'\\''`);
    return `'${escaped}'`;
  }

  /**
   * Build the command string that will actually be executed by /bin/sh on
   * the local or remote side.
   *
   * - If sshCmd is non-empty, the command is executed remotely via ssh:
   *      sshCmd /bin/sh -c 'command'
   * - Otherwise the command is executed locally:
   *      /bin/sh -c 'command'
   *
   * The inner command is quoted using shell-quote to be safe for /bin/sh -c.
   */
  private buildShellCommand(sshCmd: string, command: string): string {
    const quotedInner = quote([command]); // e.g. 'export FOO=bar; echo test'
    if (sshCmd) {
      return `${sshCmd} /bin/sh -c ${quotedInner}`;
    }
    return `/bin/sh -c ${quotedInner}`;
  }

  /**
   * Executes a command in an external Terminal (using a SSH connection on remote hosts)
   * @param credential - SSH credential, null for local host
   * @param title - Terminal title
   * @param command - Command to execute (will be passed to /bin/sh -c)
   */
  public async execTerminal(
    credential: ConnectConfig | null,
    title: string,
    command: string
  ): Promise<{ result: boolean; message: string; command: string }> {
    let terminalEmulator = "";
    let terminalTitleOpt = this.terminalOptions.title;
    let noCloseOpt = this.terminalOptions.noClose;
    let terminalExecOpt = this.terminalOptions.exec;

    // Try to find a working terminal from the configured list
    for (const t of this.terminalOptions.terminals) {
      try {
        fs.accessSync(t, fs.constants.X_OK);
        const resolvedPath = fs.realpathSync(t, null);
        const basename = path.basename(resolvedPath);

        // Decide how to pass a command to the terminal
        // Many terminals support "-x /bin/bash -c" or "-e /bin/bash -c"
        if (["terminator", "gnome-terminal", "xfce4-terminal"].includes(basename)) {
          terminalExecOpt = "-x /bin/bash -c";
        } else {
          // Default to "-e /bin/bash -c" for xterm and most others
          terminalExecOpt = "-e /bin/bash -c";
        }

        // Configure "no close" behavior and title option depending on terminal
        if (["terminator", "gnome-terminal", "gnome-terminal.wrapper"].includes(basename)) {
          // If your external terminal closes after the execution, you can change this behavior in profiles.
          // You can also create a profile with name 'hold'. This profile will then be loaded by node_manager.
          noCloseOpt = "--profile hold";
          // Title handling can be done via profiles; we keep default here.
        } else if (["xfce4-terminal", "xterm", "lxterm", "uxterm"].includes(basename)) {
          noCloseOpt = "";
          terminalTitleOpt = "-T";
        } else if (["konsole"].includes(basename)) {
          noCloseOpt = "--noclose";
          terminalTitleOpt = "";
        }

        terminalEmulator = t;
        break;
      } catch {
        // continue with next terminal
      }
    }

    if (!terminalEmulator) {
      return {
        result: false,
        message: `No terminal found! Please install one of: ${this.terminalOptions.terminals.join(", ")}`,
        command,
      };
    }

    let terminalTitle = "";
    if (title && terminalTitleOpt) {
      terminalTitle = `${terminalTitleOpt} ${title}`.trim();
    }

    let sshCmd = "";
    if (credential) {
      // generate string for SSH command
      const c: ConnectConfig = this.generateConfig(credential, 0);
      sshCmd = [
        "/usr/bin/ssh",
        "-aqtxXC",
        "-oClearAllForwardings=yes",
        "-oConnectTimeout=30",
        "-oStrictHostKeyChecking=no",
        "-oVerifyHostKeyDNS=no",
        "-oCheckHostIP=no",
        [c.username, c.host].join("@"),
      ].join(" ");
    }

    // Build the script to be executed either locally or remotely via ssh
    const shellCommand = this.buildShellCommand(sshCmd, command);

    // Now wrap that script as a single safe argument for "bash -c"
    const bashCommandArg = this.buildBashScriptArg(shellCommand);

    // Assemble the final command that is executed locally (spawn with shell: true)
    // Example:
    //   x-terminal-emulator -T "Title" --profile hold -x /bin/bash -c 'ssh user@host /bin/sh -c '\''export ...; ros2 ...'\'''
    const parts = [terminalEmulator, terminalTitle, noCloseOpt, terminalExecOpt, bashCommandArg].filter((p) => !!p);

    const cmd = parts.join(" ").replace(/\s+/g, " ").trim();

    return this.exec(null, cmd);
  }

  private wildcardMatch(text: string | undefined, pattern: string) {
    if (text === undefined) {
      return undefined;
    }
    const regexPattern = new RegExp(`^${pattern.replace(/\?/g, ".").replace(/\*/g, ".*")}$`);
    return regexPattern.test(text);
  }

  /**
   * Generate configuration file for SSH connection
   * @param credential - SSH credential
   */
  private generateConfig(credential: ConnectConfig, keyIndex: number): ConnectConfig {
    let privateKey: Buffer | undefined;

    const matchedHosts = Object.keys(this.sshUsers).find((pattern) => {
      const matched = this.wildcardMatch(credential.host, pattern);
      return matched;
    });

    const sshUser: string | undefined = matchedHosts ? this.sshUsers[matchedHosts] : undefined;
    const sshPort: number | undefined = matchedHosts ? this.sshPorts[matchedHosts] : undefined;
    const sshKey: Buffer | undefined = matchedHosts ? this.sshKeys[matchedHosts] : undefined;

    if (!sshKey && !credential.password && keyIndex < this.privateSshKeys.length) {
      // no key in configuration and no password, try find key
      privateKey = this.privateSshKeys[keyIndex];
    }

    const config: ConnectConfig = {
      host: credential.host,
      port: sshPort || credential.port,
      username: sshUser || credential.username || os.userInfo().username,
      password: credential.password || undefined,
      privateKey: sshKey || privateKey,
    };

    return config;
  }
}

/**
 * Downloads and runs the MAS debian install script.
 */
export async function updateDebianPackages(prerelease: boolean = false): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const stdioOptions: StdioOptions | undefined = ["inherit", "pipe", "pipe"];
      const child = spawn(
        "/usr/bin/wget",
        [
          `https://raw.githubusercontent.com/fkie/fkie-multi-agent-suite/refs/heads/${prerelease ? "devel" : "master"}/install_mas_debs.sh`,
          "-O",
          "/tmp/install_mas_debs.sh",
          "&&",
          "bash",
          "/tmp/install_mas_debs.sh",
        ],
        {
          shell: true,
          stdio: stdioOptions,
          detached: false,
        }
      );

      child.on("close", (code) => {
        resolve(code === 0);
      });

      child.stdout?.on("data", (data) => {
        log.info(`${data}`.trim());
      });

      child.stderr?.on("data", (data) => {
        log.info(`${data}`.trim());
      });

      child.on("error", (error) => {
        log.error(`${error}`);
        resolve(false);
      });
    } catch (error) {
      log.error(`${error}`);
      resolve(false);
    }
  });
}
