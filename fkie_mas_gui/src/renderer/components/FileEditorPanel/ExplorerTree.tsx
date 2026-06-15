import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ArrowRightIcon from "@mui/icons-material/ArrowRight";
import { SimpleTreeView } from "@mui/x-tree-view";
import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useState } from "react";

import { LaunchArgument, LaunchIncludedFile } from "@/renderer/models";
import { createUriPath } from "@/renderer/monaco/utils";
import { Provider } from "@/renderer/providers";
import { TLaunchArg } from "@/types";
import FileTreeItem from "./FileTreeItem";
import { TLaunchIncludeItem } from "./types";

export function equalLaunchArgs(launchArgs: TLaunchArg[], argList: LaunchArgument[]): boolean {
  if (launchArgs && launchArgs.length > 0) {
    const notEqual = argList?.filter((item) => {
      const found = launchArgs.filter(
        (li) => li.name === item.name && (li.value === item.value || (!li.value && !item.value))
      );
      return !(found.length > 0 || item.value?.search("/\\$\\(") !== -1);
    });
    return notEqual.length === 0;
  }
  return true;
}

export type SelectedFile = {
  uriPath: string;
  launchArgs: TLaunchArg[];
};

interface ExplorerTreeProps {
  editorId: string;
  provider: Provider;
  rootFilePath: string;
  includedFiles: LaunchIncludedFile[];
  selectedFile: SelectedFile;
  modifiedUriPaths: string[];
  // Optional: control state from parent
  expandedItems: string[];
  onExpandedItemsChange: Dispatch<SetStateAction<string[]>>;
}

export default function ExplorerTree(props: ExplorerTreeProps): JSX.Element {
  const {
    editorId,
    provider,
    rootFilePath,
    includedFiles,
    selectedFile = { uriPath: "", launchArgs: [] },
    modifiedUriPaths = [],
    expandedItems: externalExpanded,
    onExpandedItemsChange: externalOnChange,
  } = props;

  // Internal state as fallback if nothing is provided from outside
  const [internalExpanded, setInternalExpanded] = useState<string[]>([]);
  const expandedExplorerResults = externalExpanded ?? internalExpanded;
  const setExpandedExplorerResults = externalOnChange ?? setInternalExpanded;

  const [includeRoot, setIncludeRoot] = useState<TLaunchIncludeItem>();

  // Build tree structure from included files
  useEffect(() => {
    if (!provider) return;
    const providerHost = provider.host();
    if (!providerHost) return;

    const rootItem: TLaunchIncludeItem = {
      uriPath: createUriPath(provider.id, rootFilePath),
      children: [],
      file: {
        inc_path: rootFilePath,
        exists: true,
        rec_depth: -1,
        line_number: -1,
        conditional_excluded: false,
      } as LaunchIncludedFile,
    };

    let currentFile: TLaunchIncludeItem = rootItem;
    for (const file of includedFiles) {
      const incItem: TLaunchIncludeItem = {
        children: [],
        uriPath: createUriPath(provider.id, file.inc_path),
        file: file,
      };
      let curDepth = currentFile.file.rec_depth || 0;
      const fileDepth = file.rec_depth || 0;
      if (fileDepth - 1 === curDepth) {
        currentFile.children.push(incItem);
      } else if (fileDepth - 1 > curDepth) {
        currentFile = currentFile.children.slice(-1)[0];
        currentFile.children.push(incItem);
      } else {
        currentFile = rootItem;
        curDepth = currentFile.file.rec_depth || 0;
        while (fileDepth - 1 > curDepth) {
          currentFile = currentFile.children.slice(-1)[0];
          curDepth = currentFile.file.rec_depth || 0;
        }
        currentFile.children.push(incItem);
      }
    }
    setIncludeRoot(rootItem);
  }, [includedFiles, provider, rootFilePath]);

  // Generate a stable ID for a given item
  const getStableId = useCallback((item: TLaunchIncludeItem, lineNumber: number, siblingIndex: number): string => {
    const key = `${lineNumber}-${item.file.inc_path}-${item.file.line_number}-${siblingIndex}`;
    return key;
  }, []);

  // Compute expanded items separately (no setState during render!)
  useEffect(() => {
    if (!includeRoot) return;
    const findPathToSelected = (
      item: TLaunchIncludeItem,
      lineNumber: number,
      siblingIndex: number,
      parentItems: string[]
    ): string[] | null => {
      const id = getStableId(item, lineNumber, siblingIndex);
      const pathList = [...parentItems, id];

      const isSelected =
        selectedFile.uriPath === item.uriPath &&
        (item.uriPath.endsWith(`:${rootFilePath}`) || equalLaunchArgs(selectedFile.launchArgs, item.file.args || []));

      if (isSelected) return pathList;

      for (let i = 0; i < item.children.length; i++) {
        const found = findPathToSelected(item.children[i], item.file.line_number, siblingIndex + 1, pathList);
        if (found) return found;
      }
      return null;
    };

    const path = findPathToSelected(includeRoot, 0, 0, []);
    if (path) {
      setExpandedExplorerResults((prev: string[]) => {
        const merged = new Set<string>([...prev, ...path]);
        return Array.from(merged);
      });
    }
  }, [includeRoot, selectedFile, rootFilePath, getStableId, setExpandedExplorerResults]);

  // Render tree without any state updates
  const includeFilesToTree = useCallback(
    (item: TLaunchIncludeItem, lineNumber: number, siblingIndex: number): JSX.Element => {
      if (!item) return <></>;
      const id = getStableId(item, lineNumber, siblingIndex);
      const selected =
        selectedFile.uriPath === item.uriPath &&
        (item.uriPath.endsWith(`:${rootFilePath}`) || equalLaunchArgs(selectedFile.launchArgs, item.file.args || []));

      return (
        <FileTreeItem
          key={id}
          editorId={editorId}
          itemId={id}
          item={item}
          modified={modifiedUriPaths.includes(item.uriPath)}
          selected={selected}
        >
          {item.children.map((child) => includeFilesToTree(child, item.file.line_number, siblingIndex + 1))}
        </FileTreeItem>
      );
    },
    [modifiedUriPaths, editorId, rootFilePath, selectedFile, getStableId]
  );

  const treeContent = useMemo(() => {
    if (includeRoot) {
      return includeFilesToTree(includeRoot, 0, 0);
    }
    return <></>;
  }, [includeRoot, includeFilesToTree]);

  return (
    <SimpleTreeView
      id="explorer-tree"
      aria-label="Explorer"
      expansionTrigger="iconContainer"
      expandedItems={expandedExplorerResults}
      slots={{ collapseIcon: ArrowDropDownIcon, expandIcon: ArrowRightIcon }}
      onExpandedItemsChange={(_event, itemIds) => setExpandedExplorerResults(itemIds)}
      onSelectedItemsChange={(_event, itemId) => {
        if (itemId) {
          const copyExpanded = [...expandedExplorerResults];
          const index = copyExpanded.indexOf(itemId);
          if (index === -1) {
            copyExpanded.push(itemId);
          } else {
            copyExpanded.splice(index, 1);
          }
          setExpandedExplorerResults(copyExpanded);
        }
      }}
      sx={{ flexGrow: 1, overflow: "auto" }}
    >
      {treeContent}
    </SimpleTreeView>
  );
}
