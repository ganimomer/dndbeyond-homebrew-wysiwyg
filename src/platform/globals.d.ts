/** Injected by the build (`define`) so shared code can branch per target. */
declare const __BROWSER__: "firefox" | "chrome";

/** Lets esbuild's `.css` text loader typecheck as string imports. */
declare module "*.css" {
  const css: string;
  export default css;
}

/**
 * Same, for the captured D&D Beyond page used as a test fixture. Test-only —
 * the extension itself never imports HTML.
 */
declare module "*.html" {
  const html: string;
  export default html;
}
