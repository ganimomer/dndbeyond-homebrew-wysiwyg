/**
 * Single import point for the extension API. `webextension-polyfill` gives us
 * a promise-based `browser.*` namespace that behaves identically on Firefox
 * (native) and Chrome (shimmed over `chrome.*`), so nothing else in the
 * codebase has to care which browser it runs in.
 */
import browser from "webextension-polyfill";

export { browser };

/** The build target this bundle was produced for. */
export const BROWSER: "firefox" | "chrome" = __BROWSER__;
