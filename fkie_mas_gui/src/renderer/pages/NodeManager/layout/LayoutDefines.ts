const LAYOUT_TAB_SETS = {
  CENTER: "main",
  DOMAINS: "domains",
  HOSTS: "hosts",
  LEFT_TOP: "left_top",
  LEFT_BOTTOM: "left_bottom",
  BORDER_TOP: "border_top",
  BORDER_RIGHT: "border_right",
  BORDER_LEFT: "border_left",
  BORDER_BOTTOM: "border_bottom",
};

const LAYOUT_TABS = {
  ABOUT: "about-tab",
  NODES: "nodes-tab",
  PACKAGES: "packages-tab",
  HOSTS: "hosts-tab",
  PARAMETER: "parameter-tab",
  DETAILS: "details-tab",
  TOPICS: "topics-tab",
  SERVICES: "services-tab",
  SETTINGS: "settings-tab",
  LOGGING: "logging-tab",
  DOMAIN: "domain-tab",
  EDITOR: "editor-tab",
  NODE_LOGGER: "node-logger-tab",
  PROVIDER_LAUNCH_CONTROL: "provider-launch-control-tab",
  SERVICE_CALLER: "service-caller-tab",
  TERMINAL: "terminal-tab",
  TOPIC_ECHO: "topic-echo-tab",
  TOPIC_PUBLISHER: "topic-publisher-tab"
};

const LAYOUT_TAB_LIST = Object.keys(LAYOUT_TABS).map((key) => {
  return LAYOUT_TABS[key];
});

export { LAYOUT_TAB_LIST, LAYOUT_TAB_SETS, LAYOUT_TABS };
