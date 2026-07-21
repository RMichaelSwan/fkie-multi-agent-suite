import { CmdType } from "./CmdType";
import { TFileRange } from "./FileRange";
import { TEnvEntry } from "./TEnvEntry";

export type PopoutParams = Record<
  string,
  string | number | boolean | undefined | CmdType | TEnvEntry[] | TFileRange | null
>;
