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

// Standalone full-screen setup. iOS must NOT see a <link rel="manifest">:
// with a manifest iOS follows its display mode and ignores black-translucent
// (opaque status bar, viewport clipped by ~59px). Inject it only for non-iOS.
function isIosDevice(): boolean {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

if (import.meta.env.PROD) {
  if (!isIosDevice()) {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "./manifest.webmanifest";
    document.head.appendChild(link);
  }
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    });
  }
}

// Debug/testing handle (used by automated smoke tests).
(window as unknown as Record<string, unknown>).__mf = { flow };

function hideBootSplash(): void {
  const splash = document.getElementById("boot-splash");
  if (!splash) return;
  splash.classList.add("hide");
  window.setTimeout(() => splash.remove(), 400);
}

flow
  .boot()
  .then(hideBootSplash)
  .catch((err: unknown) => {
    hideBootSplash();
    const box = document.createElement("div");
    box.className = "hud-loading";
    box.textContent = `Failed to start: ${(err as Error).message}`;
    uiRoot.appendChild(box);
    console.error(err);
  });
