import { connect, PAGE } from "/tmp/cdp.mjs";
const p = await connect(PAGE);
const R = (expr) => p.evaluate(`(() => { const root = document.getElementById("microbrewery-panel-host").shadowRoot; ${expr} })()`);
const ta = () => p.evaluate(`(() => { const t = document.getElementById("field-actions-description"); const v = t?.value ?? ""; const i = v.indexOf("DC 17)"); return JSON.stringify(v.slice(i, i+70)); })()`);
console.log("before:", await ta());

// Put the caret at the end of that entry and type a plain word.
const spot = await R(`
  const el = [...root.querySelectorAll(".sb-prose")][3];
  const ps = el.querySelectorAll("p"); const last = ps[ps.length-1];
  const r = last.getBoundingClientRect();
  return JSON.stringify({ x: r.right - 3, y: r.top + r.height/2 });
`);
const { x, y } = JSON.parse(spot);
await p.click(x, y);
await p.wait(200);
await p.insertText(" ZZ");
await p.wait(1200);
console.log("after typing:", await ta());
console.log("editor:", await R(`return JSON.stringify([...root.querySelectorAll(".sb-prose")][3].textContent.slice(-40))`));
p.close();
