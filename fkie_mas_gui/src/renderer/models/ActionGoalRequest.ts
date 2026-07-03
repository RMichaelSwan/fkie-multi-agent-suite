export interface ActionGoalRequest {
  action_name: string;
  action_type: string;
  goal: string; // Dictionary structure of the ROS request service as JSON string.
}
