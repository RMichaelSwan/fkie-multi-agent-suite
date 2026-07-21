export const PublishManagerEvents = {
  has: "publisher:has",
  start: "publisher:start",
  close: "publisher:close",
  onClose: "publisher:onClose",
};

export type PublishCloseCallback = (editorId: string) => void;

export type TPublisherConfig = {
  id: string;
  providerId: string;
  host: string;
  port: number;
  topicName: string;
  topicType: string;
};

export type TPublishManager = {
  start: (props: TPublisherConfig) => Promise<string | null>;
  close: (id: string) => Promise<boolean>;
  has: (id: string) => Promise<boolean>;
  onClose: (callback: PublishCloseCallback) => void;
};
