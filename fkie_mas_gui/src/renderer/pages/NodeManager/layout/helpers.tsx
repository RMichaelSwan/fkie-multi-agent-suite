import { IconButton, Tooltip } from "@mui/material";
import { Model } from "flexlayout-react";
import { emitToggleComponent } from "./events";

export function pAddTabStickyButton(props: {
  model: Model;
  container: React.ReactNode[];
  id: string;
  title: string;
  reactNode: React.ReactNode;
  setId: string;
  icon: React.ReactNode;
  tooltipLoc?:
    | "right"
    | "top"
    | "bottom"
    | "bottom-end"
    | "bottom-start"
    | "left-end"
    | "left-start"
    | "left"
    | "right-end"
    | "right-start"
    | "top-end"
    | "top-start"
    | undefined;
  force?: boolean;
}): void {
  if (props.force || !props.model.getNodeById(props.id)) {
    props.container.push(
      <Tooltip
        key={`tooltip-${props.id}`}
        title={props.title}
        placement={props.tooltipLoc || "right"}
        disableInteractive
      >
        <span>
          <IconButton
            onClick={() => {
              emitToggleComponent({
                id: props.id,
                title: props.title,
                closable: true,
                component: props.id,
                toNodeId: props.setId,
                config: { reactNode: props.reactNode },
              });
            }}
          >
            {props.icon}
          </IconButton>
        </span>
      </Tooltip>
    );
  }
}
