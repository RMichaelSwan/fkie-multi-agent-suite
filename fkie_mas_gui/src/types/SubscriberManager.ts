export const SubscriberManagerEvents = {
  has: "subscriber:has",
  open: "subscriber:open",
  close: "subscriber:close",
  onClose: "subscriber:onClose",
};

export type SubscriberCloseCallback = (editorId: string) => void;

export type TSubscriberConfig = {
  id: string;
  providerId: string;
  host: string;
  port: number;
  topic: string;
  showOptions: boolean;
  noData: boolean;
};

export type TSubscriberManager = {
  open: (props: TSubscriberConfig) => Promise<string | null>;
  close: (id: string) => Promise<boolean>;
  has: (id: string) => Promise<boolean>;
  onClose: (callback: SubscriberCloseCallback) => void;
};
