import { Stack } from "@mui/material";
import { useEffect, useState } from "react";

import { useAlwaysCurrentRef } from "@/renderer/hooks/useAlwaysCurrentRef";
import { useLoggingContext } from "@/renderer/hooks/useLoggingContext";
import { useRosContext } from "@/renderer/hooks/useRosContext";
import { useSettingsContext } from "@/renderer/hooks/useSettingsContext";
import { getFileName } from "../../models";
import TopicPublishPanel from "../../pages/NodeManager/panels/TopicPublishPanel";
import PublisherProvider from "../../providers/PublisherProvider";

interface IPublisherInfo {
  id: string;
  provider: PublisherProvider;
  topicName: string;
  topicType: string;
}

export default function PublisherApp(): JSX.Element {
  const logCtx = useLoggingContext();
  const rosCtx = useRosContext();
  const settingsCtx = useSettingsContext();
  const logCtxRef = useAlwaysCurrentRef(logCtx);
  const settingsCtxRef = useAlwaysCurrentRef(settingsCtx);
  const [pubInfo, setPubInfo] = useState<IPublisherInfo | null>(null);
  const appInfoRef = useAlwaysCurrentRef(pubInfo);

  async function initProvider(): Promise<void> {
    const queryString = window.location.search;
    console.log(`queryString: ${queryString}`);
    const urlParams = new URLSearchParams(queryString);
    const id = urlParams.get("id");
    const host = urlParams.get("host");
    const port = urlParams.get("port");
    const topic = urlParams.get("topicName");
    const topicType = urlParams.get("topicType");
    if (!host || !port) {
      logCtx.error(`invalid address ${host}:${port}`, "");
      return;
    }
    if (!topic) {
      logCtx.error(`invalid topic ${topic}`, "");
      return;
    }
    if (!topicType) {
      logCtx.error(`invalid topicType ${topicType}`, "");
      return;
    }
    if (!id) {
      logCtx.error(`no id found ${id}`, "");
      return;
    }
    document.title = `Publish - ${getFileName(topic)}`;
    const prov = new PublisherProvider(logCtxRef, settingsCtxRef, host, "", Number.parseInt(port), false);
    if (await prov.init()) {
      rosCtx.addProvider(prov);
      setPubInfo({
        id: id,
        provider: prov,
        topicName: topic,
        topicType: topicType,
      });
    } else {
      logCtx.error(`connection to ${host}:${port} failed`, "");
    }
  }

  useEffect(() => {
    // Anything in here is fired on component mount.
    window.publishManager?.onClose(async (id: string) => {
      logCtx.info(
        `Stopping publisher node for '${appInfoRef.current?.topicName}' on '${appInfoRef.current?.provider.name()}'`,
        ""
      );
      await appInfoRef.current?.provider.stopPublisher(appInfoRef.current?.topicName);
      window.publishManager?.close(id);
    });
    initProvider();
    return (): void => {
      // Anything in here is fired on component unmount.
    };
  }, []);

  return (
    <Stack width="100%" height="100vh">
      {pubInfo && rosCtx.mapProviderRosNodes.size > 0 && (
        <TopicPublishPanel
          topicName={pubInfo.topicName}
          topicType={pubInfo.topicType}
          providerId={pubInfo.provider.id}
        />
      )}
    </Stack>
  );
}
