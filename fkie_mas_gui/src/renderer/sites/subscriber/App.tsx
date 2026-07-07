import { Alert, Stack } from "@mui/material";
import { useEffect, useState } from "react";

import { useAlwaysCurrentRef } from "@/renderer/hooks/useAlwaysCurrentRef";
import { useLoggingContext } from "@/renderer/hooks/useLoggingContext";
import { useRosContext } from "@/renderer/hooks/useRosContext";
import { useSettingsContext } from "@/renderer/hooks/useSettingsContext";
import { getFileName } from "../../models";
import TopicEchoPanel from "../../pages/NodeManager/panels/TopicEchoPanel";
import SubscriberProvider from "../../providers/SubscriberProvider";

interface ISubscriberInfo {
  id: string;
  provider: SubscriberProvider;
  topic: string;
  showOptions: boolean;
  noData: boolean;
}

export default function SubscriberApp(): JSX.Element {
  const logCtx = useLoggingContext();
  const rosCtx = useRosContext();
  const settingsCtx = useSettingsContext();
  const logCtxRef = useAlwaysCurrentRef(logCtx);
  const settingsCtxRef = useAlwaysCurrentRef(settingsCtx);
  const [connectingHost, setConnectingHost] = useState<string>("");
  const [subInfo, setSubInfo] = useState<ISubscriberInfo | null>(null);
  const [stopRequested, setStopRequested] = useState<string>("");
  const appInfoRef = useAlwaysCurrentRef(subInfo);

  async function initProvider(): Promise<void> {
    const queryString = window.location.search;
    console.log(`queryString: ${queryString}`);
    const urlParams = new URLSearchParams(queryString);
    const id = urlParams.get("id");
    const host = urlParams.get("host");
    const port = urlParams.get("port");
    const topic = urlParams.get("topic");
    const showOptionsParam = urlParams.get("showOptions");
    const showOptions = showOptionsParam ? JSON.parse(showOptionsParam) : false;
    const noDataParam = urlParams.get("noData");
    const noData = noDataParam ? JSON.parse(noDataParam) : false;
    if (!host || !port) {
      logCtx.error(`invalid address ${host}:${port}`, "");
      return;
    }
    if (!topic) {
      logCtx.error(`invalid topic ${topic}`, "");
      return;
    }
    if (!id) {
      logCtx.error(`no id found ${id}`, "");
      return;
    }
    document.title = `Echo - ${getFileName(topic)}`;
    const prov = new SubscriberProvider(logCtxRef, settingsCtxRef, host, "", Number.parseInt(port), false);
    setConnectingHost(`${prov.connection.uri}`);
    if (await prov.init()) {
      rosCtx.addProvider(prov);
      setConnectingHost("");
      setSubInfo({
        id: id,
        provider: prov,
        topic: topic,
        showOptions: showOptions,
        noData: noData,
      });
    } else {
      logCtx.error(`connection to ${host}:${port} failed`, "");
    }
  }

  useEffect(() => {
    // Anything in here is fired on component mount.
    window.subscriberManager?.onClose(async (id: string) => {
      logCtx.info(
        `Stopping subscriber node for '${appInfoRef.current?.topic} on '${appInfoRef.current?.provider.name()}'`,
        ""
      );
      await appInfoRef.current?.provider.stopSubscriber(appInfoRef.current.topic);
      window.subscriberManager?.close(id);
    });
    initProvider();
    return (): void => {
      // Anything in here is fired on component unmount.
    };
  }, []);

  return (
    <Stack width="100%" height="100vh">
      {connectingHost && (
        <Alert severity="info" style={{ minWidth: 0 }}>
          connecting to {connectingHost}
        </Alert>
      )}
      {subInfo && rosCtx.mapProviderRosNodes.size > 0 && (
        <TopicEchoPanel
          showOptions
          provider={subInfo.provider}
          defaultTopic={subInfo.topic}
          defaultNoData={subInfo.noData}
        />
      )}
    </Stack>
  );
}
