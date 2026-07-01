import { AutoUpdateProvider } from "./context/AutoUpdateContext";
import { MonacoProvider } from "./context/MonacoContext";
import { MonacoInitProvider } from "./context/MonacoInitContext";
import NodeManager from "./pages/NodeManager/NodeManager";

export default function App(): JSX.Element {
  return (
    <AutoUpdateProvider>
      <MonacoProvider>
        <MonacoInitProvider>
          <NodeManager />
        </MonacoInitProvider>
      </MonacoProvider>
    </AutoUpdateProvider>
  );
}
