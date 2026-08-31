// @ts-nocheck
/**
 * Works out the version a release should carry.
 *
 * The tags are the record of what has shipped — nothing is committed back to
 * `main`, which the branch ruleset would refuse anyway — so the next version is
 * read off the last tag rather than out of a file.
 *
 *   node scripts/next-version.mjs --bump patch
 *   node scripts/next-version.mjs --version 0.1.0   # an exact version wins
 *
 * Prints the bare version to stdout. Exits non-zero, with the reason on stderr,
 * rather than guessing.
 */
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const RELEASE = /^v(\d+)\.(\d+)\.(\d+)$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

/**
 * Every `vX.Y.Z` tag, newest first.
 *
 * Ordered by `git tag --sort=-v:refname`, which compares the numbers as
 * numbers. Plain lexical sorting would put v0.9.0 above v0.10.0 and quietly
 * release backwards.
 */
function releaseTags() {
  const out = execFileSync("git", ["tag", "--list", "v*", "--sort=-v:refname"], {
    encoding: "utf8",
  });
  return out.split("\n").filter((tag) => RELEASE.test(tag));
}

const exact = valueOf("--version");
if (exact !== undefined) {
  if (!/^\d+\.\d+\.\d+$/.test(exact)) fail(`--version "${exact}" is not X.Y.Z.`);
  if (releaseTags().includes(`v${exact}`)) fail(`v${exact} has already been released.`);
  console.log(exact);
  process.exit(0);
}

const bump = valueOf("--bump") ?? "patch";
if (!["major", "minor", "patch"].includes(bump)) {
  fail(`--bump "${bump}" is not major, minor or patch.`);
}

const [latest] = releaseTags();
if (!latest) {
  // Nothing has shipped, so there is no base to bump from: bumping a patch off
  // package.json's 0.1.0 would make the first release 0.1.1, which nobody
  // means. Say so and let the caller name the version.
  fail("No vX.Y.Z tag yet, so there is nothing to bump from. Pass --version for the first release.");
}

const [, major, minor, patch] = latest.match(RELEASE).map(Number);
const next =
  bump === "major"
    ? [major + 1, 0, 0]
    : bump === "minor"
      ? [major, minor + 1, 0]
      : [major, minor, patch + 1];

console.log(next.join("."));
