import { Alert, AlertTitle } from "@mui/material";

export default function InfoNoRunningDaemons(): JSX.Element {
  return (
    <Alert severity="info">
      <AlertTitle>No running daemons found</AlertTitle>
      Please start a MAS daemon or join one to view ROS nodes.
    </Alert>
  );
}
