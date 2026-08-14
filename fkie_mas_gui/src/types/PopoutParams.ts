import { CmdType } from "./CmdType";
import { TFileRange } from "./FileRange";
import { TEnvEntry } from "./TEnvEntry";
import { TParameterRequest } from "./TParameterRequest";

export type PopoutParams = Record<
  string,
  string | number | boolean | undefined | CmdType | TEnvEntry[] | TFileRange | TParameterRequest | null
>;
