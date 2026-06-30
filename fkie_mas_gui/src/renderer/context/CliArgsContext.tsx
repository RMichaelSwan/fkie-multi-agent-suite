import React, { createContext, useCallback, useEffect, useMemo, useReducer, useState } from "react";
import CliArgs from "../assets/cliArgs.json";

type TCliArg = { default: string | boolean | number | undefined; hint: string };

export interface ICliArgsContext {
  updatedArgs: number;
  getArgument: (name: string) => string | boolean | number | undefined;
}

interface ICliArgsProvider {
  children: React.ReactNode;
}

export const CliArgsContext = createContext<ICliArgsContext | null>(null);

export function CliArgsProvider({ children }: ICliArgsProvider): ReturnType<React.FC<ICliArgsProvider>> {
  const [updatedArgs, forceUpdateArgs] = useReducer((x) => x + 1, 0);
  const [cliArgs, setCliArgs] = useState<{ [name: string]: TCliArg }>(CliArgs);

  async function readCommandLineArgs(): Promise<void> {
    const results = await Promise.all(
      Object.keys(CliArgs).map(async (argName) => {
        const result = await window.commandLine?.getArgument(argName);
        return { name: argName, data: { default: result, hint: "" } };
      })
    );
    const newCliArgs: { [name: string]: TCliArg } = {};
    for (const { name, data } of results) {
      newCliArgs[name] = data;
    }
    setCliArgs(newCliArgs);
    forceUpdateArgs();
  }

  useEffect(() => {
    if (window.commandLine) {
      readCommandLineArgs();
    }
  }, [window.commandLine]);

  const getArgument = useCallback(
    (name: string): string | boolean | number | undefined => {
      return cliArgs[name]?.default;
    },
    [cliArgs]
  );

  const value = useMemo(
    () => ({
      updatedArgs,
      getArgument,
    }),
    [updatedArgs, getArgument]
  );

  return <CliArgsContext.Provider value={value}>{children}</CliArgsContext.Provider>;
}

export default CliArgsProvider;
