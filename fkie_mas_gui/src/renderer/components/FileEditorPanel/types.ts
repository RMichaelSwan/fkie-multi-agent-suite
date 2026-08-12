import { Range } from "monaco-editor";

import { TIncludedFile } from "@/renderer/models/TIncludedFile";

type TLaunchIncludeItem = {
  // file entry, may originate from the daemon or from the local editor resolver
  file: TIncludedFile;
  children: TLaunchIncludeItem[];
  uriPath: string;
};

type TSearchResult = {
  file: string;
  text: string;
  lineNumber: number;
  range: Range;
};

export type { TLaunchIncludeItem, TSearchResult };
