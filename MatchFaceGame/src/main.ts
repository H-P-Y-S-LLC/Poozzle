import "./ui/styles.css";
import { ConfigLoader } from "./config/ConfigLoader.js";
import { I18n } from "./ui/i18n.js";
import { HudView } from "./ui/HudView.js";
import { GameFlow } from "./flow/GameFlow.js";
import { setLogLevel } from "./core/Logger.js";

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

setLogLevel(import.meta.env.DEV ? "debug" : "warn");

const gameRoot = document.createElement("div");
gameRoot.id = "game-root";
const uiRoot = document.createElement("div");
uiRoot.className = "hud-layer";
app.append(gameRoot, uiRoot);

const i18n = new I18n();
const hud = new HudView(uiRoot, i18n);
const flow = new GameFlow(gameRoot, new ConfigLoader(), i18n, hud, uiRoot);

// Enable "add to home screen" / standalone fullscreen on mobile browsers.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  });
}

// Debug/testing handle (used by automated smoke tests).
(window as unknown as Record<string, unknown>).__mf = { flow };

flow.boot().catch((err: unknown) => {
  const box = document.createElement("div");
  box.className = "hud-loading";
  box.textContent = `Failed to start: ${(err as Error).message}`;
  uiRoot.appendChild(box);
  console.error(err);
});
