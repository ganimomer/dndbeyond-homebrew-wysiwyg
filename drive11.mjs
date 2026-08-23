import { connect, PAGE } from "/tmp/cdp.mjs";
const p = await connect(PAGE);
console.log(await p.evaluate(`(() => {
  const v = document.getElementById("field-actions-description-wysiwyg").value;
  const i = v.indexOf("DC 17)");
  return JSON.stringify(v.slice(i, i + 90));
})()`));
p.close();
