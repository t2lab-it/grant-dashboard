import { cloneStaticDemoSeedState, type StaticDemoState } from "./staticDemoData";
const STORAGE_KEY = "budget-dashboard.static-demo.v1";
function localStorageAvailable() { return typeof window !== "undefined" && typeof window.localStorage !== "undefined"; }
export function resetStaticDemoStore() { if (localStorageAvailable()) window.localStorage.removeItem(STORAGE_KEY); }
export function readStaticDemoState(): StaticDemoState { if (!localStorageAvailable()) return cloneStaticDemoSeedState(); const raw = window.localStorage.getItem(STORAGE_KEY); return raw === null ? cloneStaticDemoSeedState() : JSON.parse(raw) as StaticDemoState; }
function saveStaticDemoState(state: StaticDemoState) { if (localStorageAvailable()) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
export function mutateStaticDemoState<T>(mutator: (state: StaticDemoState) => T) { const state=readStaticDemoState(); const result=mutator(state); saveStaticDemoState(state); return result; }
export function readClonedStaticDemoState() { return structuredClone(readStaticDemoState()); }
