import type { Location } from "react-router-dom";

export type RouteModalLocationState = {
  backgroundLocation?: Location;
};

export function getBackgroundLocation(state: unknown) {
  if (
    typeof state === "object" &&
    state !== null &&
    "backgroundLocation" in state &&
    typeof (state as RouteModalLocationState).backgroundLocation?.pathname === "string"
  ) {
    return (state as RouteModalLocationState).backgroundLocation ?? null;
  }

  return null;
}
