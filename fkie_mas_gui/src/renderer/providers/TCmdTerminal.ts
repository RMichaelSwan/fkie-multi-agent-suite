export type TCmdTerminal = {
  success: boolean;

  error?: string;

  cmd: string;

  screen: string;

  log: string;

  external: boolean;
};
