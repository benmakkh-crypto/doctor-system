// يدمج tools/taxonomy.js في src/Schema.gs بعد التحقق من اكتماله.
// الاستخدام: node tools/apply-taxonomy.js
const fs = require("fs"), path = require("path");
const file = path.join(__dirname, "..", "src", "Schema.gs");
const src = fs.readFileSync(file, "utf8");
const head = src.slice(0, src.indexOf("{"));
const S = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));
const T = require("./taxonomy.js");

const errs = [];
if (T.length !== S.G.length) errs.push(`عدد الإدارات ${T.length} ≠ ${S.G.length}`);
const contrast = hex => { // تباين اللون مع الأبيض (WCAG)
  const l = hex.match(/\w\w/g).map(h => { const c = parseInt(h, 16) / 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
  return 1.05 / (.2126 * l[0] + .7152 * l[1] + .0722 * l[2] + .05);
};
let total = 0;
S.G.forEach((g, i) => {
  const t = T[i], n = g.items.length; total += n;
  if (t.idesc.length !== n) errs.push(`${g.n}: الأوصاف ${t.idesc.length} ≠ الوحدات ${n}`);
  const seen = t.sec.flatMap(s => s[1]).sort((a, b) => a - b);
  if (seen.join() !== [...Array(n).keys()].join()) errs.push(`${g.n}: العناوين الفرعية لا تغطي كل وحدة مرة واحدة (${seen.join()})`);
  if (contrast(t.col) < 4.5) errs.push(`${g.n}: تباين اللون ${t.col} = ${contrast(t.col).toFixed(2)} أقل من 4.5`);
  g.col = t.col; g.en = t.en; g.sec = t.sec; g.idesc = t.idesc;
});
if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
fs.writeFileSync(file, head + JSON.stringify(S, null, 1) + ";\n");
console.log(`Schema.gs: ${S.G.length} إدارة، ${total} وحدة، ${T.reduce((a, t) => a + t.sec.length, 0)} عنوانًا فرعيًا`);
