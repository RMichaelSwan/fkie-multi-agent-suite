// Add polyfills for backward compatibility with older browsers
import "react-app-polyfill/ie11";
import "react-app-polyfill/stable";
import { createRoot } from "react-dom/client";
import App from "./App";
import ProviderStack from "./ProviderStack";
import CliArgsProvider from "./context/CliArgsContext";
import { SettingsProvider } from "./context/SettingsContext";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <CliArgsProvider>
      <SettingsProvider>
        <ProviderStack>
          <App />
        </ProviderStack>
      </SettingsProvider>
    </CliArgsProvider>
  );
}
