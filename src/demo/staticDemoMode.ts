export function isStaticDemoMode() {
  return (
    import.meta.env.VITE_STATIC_DEMO === "true" ||
    Reflect.get(globalThis, "__BUDGET_DASHBOARD_STATIC_DEMO__") === true
  );
}
