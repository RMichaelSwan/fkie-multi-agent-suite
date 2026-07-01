// Add polyfills for backward compatibility with older browsers
import "react-app-polyfill/ie11";
import "react-app-polyfill/stable";
import { createRoot } from "react-dom/client";
import App from "./App";
import ProviderStack from "./ProviderStack";
import { LoadingScreen } from "./components/loading/LoadingScreen";
import { PersistenceGate } from "./components/loading/PersistenceGate";
import { AppStateProvider } from "./context/AppStateContext";
import CliArgsProvider from "./context/CliArgsContext";
import { SettingsProvider } from "./context/SettingsContext";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <CliArgsProvider>
      <SettingsProvider>
        <AppStateProvider>
          <ProviderStack>
            <PersistenceGate fallback={<LoadingScreen message="Loading settings..." />}>
              <App />
            </PersistenceGate>
          </ProviderStack>
        </AppStateProvider>
      </SettingsProvider>
    </CliArgsProvider>
  );
}
