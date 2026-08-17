/**
 * Background entry. Shared source; the manifest wires it as a service worker
 * (Chrome) or a background script (Firefox) — that difference is the whole
 * "thin per-browser layer".
 *
 * Nothing here needs to run yet; it exists so both manifests resolve and so we
 * have a home for future cross-cutting work (storage sync of user templates,
 * message routing between content scripts, context-menu actions).
 */
import { browser, BROWSER } from "../platform/browser.js";

browser.runtime.onInstalled.addListener(() => {
  console.info(`[homebrew-wysiwyg] installed (${BROWSER} build)`);
});
