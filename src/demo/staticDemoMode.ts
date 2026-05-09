export function isStaticDemoMode() {
  return (
    import.meta.env.VITE_STATIC_DEMO === "true" ||
    Reflect.get(globalThis, "__BUDGET_DASHBOARD_STATIC_DEMO__") === true
  );
}

export const STATIC_DEMO_RESET_EVENT = "budget-dashboard:static-demo-reset";

export function notifyStaticDemoReset() {
  window.dispatchEvent(new Event(STATIC_DEMO_RESET_EVENT));
}
