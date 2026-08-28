/**
 * Lint rules for the whole repo.
 *
 * Deliberately the *non*-type-checked typescript-eslint set: `tsc` already
 * proves everything a type-aware rule would, twice as fast, and it runs on the
 * same files (see tsconfig.json and tsconfig.test.json). ESLint's job here is
 * the things the compiler doesn't look at — unreachable code, a lost `await`,
 * a regex that can never match.
 *
 *   npm run lint
 */
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "node_modules/",
      // A verbatim capture of D&D Beyond's page, not our code.
      "src/adapter/__fixtures__/",
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    rules: {
      // A leading underscore is this codebase's existing way of saying "this
      // parameter is part of the signature and deliberately unread" — see
      // `write(_monster)` in src/adapter/ddb-monster.ts. Match it, so the rule
      // and the convention agree.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // The extension itself: browser globals, no Node.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: { globals: globals.browser },
  },

  // The UI is Preact hooks, and Preact's `use*` follow React's rules exactly —
  // same call-order constraint, same stale-closure trap — so the plugin catches
  // real bugs here even though no React is involved.
  //
  // Only the two classic rules, not the plugin's `recommended` preset: the rest
  // of that preset is React Compiler analysis, and it does not describe this
  // codebase. It reads an ordinary `ref.current = null` as an illegal mutation
  // and every `useRef` handle as immutable, because the compiler it speaks for
  // does not exist for Preact.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },

  // Build and tooling scripts: Node, and outside the TypeScript project, so
  // ESLint is the only thing checking them at all.
  {
    files: ["*.mjs", "*.js", "scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
    rules: {
      // These files open with `@ts-nocheck`, which is what keeps an editor with
      // `checkJs` on from red-underlining plain JS that was never meant to
      // typecheck. It suppresses nothing in the build, because tsconfig.json
      // has no `allowJs` — there is no compilation here to alter.
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },

  // Tests run under `node:test` against a jsdom document, so they legitimately
  // reach for both sets of globals.
  {
    files: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/test-support/**"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
);
