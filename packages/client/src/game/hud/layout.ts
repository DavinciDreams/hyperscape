import { UI } from "../../constants/ui";
import { zIndex } from "../../constants/tokens";

export const HUD_SAFE_MARGIN_PX = 16;

export const HUD_FRAME = {
  top: `calc(${UI.SAFE_AREAS.TOP} + ${HUD_SAFE_MARGIN_PX}px)`,
  right: `calc(${UI.SAFE_AREAS.RIGHT} + ${HUD_SAFE_MARGIN_PX}px)`,
  bottom: `calc(${UI.SAFE_AREAS.BOTTOM} + ${HUD_SAFE_MARGIN_PX}px)`,
  left: `calc(${UI.SAFE_AREAS.LEFT} + ${HUD_SAFE_MARGIN_PX}px)`,
  topCenterOffset: `calc(${UI.SAFE_AREAS.TOP} + 16px)`,
  topCenterSecondaryOffset: `calc(${UI.SAFE_AREAS.TOP} + 72px)`,
  progressBottomOffset: `calc(${UI.SAFE_AREAS.BOTTOM} + 15vh)`,
} as const;

export const HUD_LAYERS = {
  cluster: zIndex.panelActive,
  floating: zIndex.overlay,
  notification: zIndex.toast,
  celebratory: zIndex.critical,
} as const;
