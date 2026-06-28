export type TReplyLogPathItems = {
  success: boolean;

  error?: string;

  paths: TLogPathItem[];
};

export type TLogPathItem = {
  node: string;

  screen_log: string;

  screen_log_exists: boolean;

  ros_log: string;

  ros_log_exists: boolean;
};
