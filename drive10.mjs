import { connect, PAGE } from "/tmp/cdp.mjs";
const p = await connect(PAGE);
console.log(await p.evaluate(`(() => {
  const out = [];
  for (const t of document.querySelectorAll("textarea")) {
    const v = t.value ?? "";
    out.push({ id: t.id, len: v.length, zz: v.includes(" ZZ"), fire: v.includes("Fireball"), tail: v.slice(-50) });
  }
  return JSON.stringify(out, null, 1);
})()`));
p.close();
