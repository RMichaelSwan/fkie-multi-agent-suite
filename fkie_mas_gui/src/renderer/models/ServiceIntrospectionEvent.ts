export interface ServiceIntrospectionEvent {
  service_name: string;
  event_type: "REQUEST_SENT" | "REQUEST_RECEIVED" | "RESPONSE_SENT" | "RESPONSE_RECEIVED" | string;
  sequence_number: number;
  client_gid: string | number[];
  data: object | null;
  timestamp: number;
}
