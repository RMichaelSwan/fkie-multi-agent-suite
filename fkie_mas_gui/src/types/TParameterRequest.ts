import { TFileRange } from "./FileRange";

export type TParameterRequest = {
  nodeName: string; // only used to shorten the parameter name and for messages
  paramName: string; // full or relative parameter name
  paramValue?: string;
  paramType?: string;
  /** location of the node definition - required to locate the node block */
  fileRange: TFileRange | null;
};
