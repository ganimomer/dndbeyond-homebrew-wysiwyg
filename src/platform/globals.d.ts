/** Injected by the build (`define`) so shared code can branch per target. */
declare const __BROWSER__: "firefox" | "chrome";

/** Lets esbuild's `.css` text loader typecheck as string imports. */
declare module "*.css" {
  const css: string;
  export default css;
}
