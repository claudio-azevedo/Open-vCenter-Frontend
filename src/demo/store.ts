import { DEMO_STATE_VERSION } from "./model";
import type { DemoState } from "./model";
import { generateDemoState } from "./seed";

/**
 * Where the demo inventory lives: one JSON document in localStorage
 * (`ovc-demo-state`), mirrored in memory. A cookie can't hold it (4 KB cap; the
 * inventory is a few hundred KB), and it is per-browser by design - every
 * visitor of a demo deployment gets their own random inventory.
 *
 * Other tabs of the same browser (e.g. a console opened in a new tab) write the
 * same key; the `storage` event reloads it here so both stay in sync.
 * Everything degrades to memory-only when storage is unavailable (private
 * window, blocked site data) - the demo still works until the page reloads.
 */

const STORAGE_KEY = "ovc-demo-state";

let state: DemoState | null = null;
let listening = false;

function read(): DemoState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoState;
    return parsed?.version === DEMO_STATE_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function write(s: DemoState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // quota exceeded / storage blocked - keep going in memory
  }
}

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = read();
    if (next) state = next;
  });
}

/** The current state, generating (and saving) a fresh one on first use. */
export function getDemoState(): DemoState {
  listen();
  if (!state) {
    state = read();
    if (!state) {
      state = generateDemoState();
      write(state);
    }
  }
  return state;
}

export function saveDemoState() {
  if (state) write(state);
}

/** Throw the current inventory away and generate a new random one. */
export function resetDemoState(): DemoState {
  state = generateDemoState();
  write(state);
  return state;
}
