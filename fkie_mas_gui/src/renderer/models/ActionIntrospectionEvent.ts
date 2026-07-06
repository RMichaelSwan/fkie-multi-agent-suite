export interface ActionIntrospectionEvent {
  action_name: string;
  phase: "send_goal" | "get_result" | "cancel_goal";
  event_type: "REQUEST_SENT" | "REQUEST_RECEIVED" | "RESPONSE_SENT" | "RESPONSE_RECEIVED" | string;
  sequence_number: number;
  client_gid: number[];
  data: object | null;
  timestamp: number;
}
