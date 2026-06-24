import { emitCloseComponent, emitEditorSelectRange } from "@/renderer/pages/NodeManager/layout/events";

export function setupEditorWindowBridge() {
  window.editorManager?.onFileRange((editorId, filePath, fileRange, launchArgs) => {
    if (!fileRange) return;

    emitEditorSelectRange({
      editorId: editorId,
      filePath: filePath,
      fileRange: fileRange,
      launchArgs: launchArgs,
    });
  });

  window.editorManager?.onClose((editorId) => {
    emitCloseComponent({ id: editorId });
  });
}
