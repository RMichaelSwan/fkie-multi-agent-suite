import { Stack } from "@mui/material";
import { useEffect, useState } from "react";

import { useAlwaysCurrentRef } from "@/renderer/hooks/useAlwaysCurrentRef";
import { useLoggingContext } from "@/renderer/hooks/useLoggingContext";
import { useRosContext } from "@/renderer/hooks/useRosContext";
import { useSettingsContext } from "@/renderer/hooks/useSettingsContext";
import ActionPanel from "@/renderer/pages/NodeManager/panels/ActionPanel";
import Provider from "@/renderer/providers/Provider";
import { getFileName } from "../../models";
import ServiceProvider from "../../providers/ServiceProvider";

interface IAppInfo {
  id: string;
  provider: Provider;
  serviceName: string;
  serviceType: string;
}

export default function ActionSendGoalApp(): JSX.Element {
  const logCtx = useLoggingContext();
  const rosCtx = useRosContext();
  const settingsCtx = useSettingsContext();
  const logCtxRef = useAlwaysCurrentRef(logCtx);
  const settingsCtxRef = useAlwaysCurrentRef(settingsCtx);
  const [appInfo, setAppInfo] = useState<IAppInfo | null>(null);
  const appInfoRef = useAlwaysCurrentRef(appInfo);

  async function initProvider(): Promise<void> {
    const queryString = window.location.search;
    console.log(`queryString: ${queryString}`);
    const urlParams = new URLSearchParams(queryString);
    const id = urlParams.get("id");
    const host = urlParams.get("host");
    const port = urlParams.get("port");
    const serviceName = urlParams.get("serviceName");
    const serviceType = urlParams.get("serviceType");
    if (!host || !port) {
      logCtx.error(`invalid address ${host}:${port}`, "");
      return;
    }
    if (!serviceName) {
      logCtx.error(`invalid serviceName ${serviceName}`, "");
      return;
    }
    if (!serviceType) {
      logCtx.error(`invalid serviceType ${serviceType}`, "");
      return;
    }
    if (!id) {
      logCtx.error(`no id found ${id}`, "");
      return;
    }
    document.title = `Action - ${getFileName(serviceName)}`;
    const prov = new ServiceProvider(logCtxRef, settingsCtxRef, host, "", Number.parseInt(port), false);
    if (await prov.init()) {
      rosCtx.addProvider(prov);
      setAppInfo({
        id: id,
        provider: prov,
        serviceName: serviceName,
        serviceType: serviceType,
      });
    } else {
      logCtx.error(`connection to ${host}:${port} failed`, "");
    }
  }

  useEffect(() => {
    window.serviceManager?.onClose(async (id: string) => {
      await appInfoRef.current?.provider.stopAction(appInfoRef.current.serviceName);
      window.serviceManager?.close(id);
    });
    initProvider();
    return (): void => {
      // Anything in here is fired on component unmount.
    };
  }, []);

  return (
    <Stack width="100%" height="100vh">
      {appInfo && rosCtx.mapProviderRosNodes.size > 0 && (
        <ActionPanel
          actionName={appInfo.serviceName}
          actionType={appInfo.serviceType}
          providerId={appInfo.provider.id}
          showOptions={true}
        />
      )}
    </Stack>
  );
}
