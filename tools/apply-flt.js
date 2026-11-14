// يضيف إدارة جديدة «إدارة السير والإركاب» (FLT) في آخر SCHEMA.G دون تغيير أرقام الإدارات القائمة. آمن للتكرار.
const fs = require("fs"), path = require("path");
const file = path.join(__dirname, "..", "src", "Schema.gs");
const src = fs.readFileSync(file, "utf8"), head = src.slice(0, src.indexOf("{"));
const S = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));
let gi = S.G.findIndex(x => x.c === "FLT");
const MODS = [["لوحة المركبات وحركتها", "المركبات وحالاتها ورحلات اليوم والتجديدات القريبة والتنبيهات"], ["سجل المركبات", "بيانات المركبات المسجلة وحالاتها وعداداتها"], ["إضافة مركبة", "تسجيل مركبة جديدة في الأسطول"], ["حركة المركبات", "سجل رحلات المركبات بالخروج والعودة والمسافة"], ["تسجيل رحلة", "خروج المركبة وعودتها بقراءات العداد"], ["السائقون", "بيانات السائقين وحالاتهم وتوفرهم ورخصهم"], ["الوقود والمسافات", "تعبئة الوقود وقراءات العداد ومعدل الاستهلاك"], ["الصيانة والتجديدات", "مواعيد الصيانة وتجديد المستندات وإنجازها"], ["تقارير المركبات", "حركة المركبات والمسافات والوقود والصيانة والتجديدات"], ["إعدادات المركبات", "الإدارات والأنواع والمواقع والأغراض والترقيم والقواعد"], ["دليل المركبات", "ست خطوات لإدارة المركبات وحركتها"]];
if (gi < 0) { S.G.push({ n: "إدارة السير والإركاب", s: "س", c: "FLT", d: "المركبات والسائقون والرحلات والوقود والصيانة والتجديدات", items: [], col: "#1D4ED8", en: "Fleet & Transport", sec: [], idesc: [] }); gi = S.G.length - 1; }
const g = S.G[gi];
const ids = MODS.map(([n, d]) => { let i = g.items.indexOf(n); if (i < 0) { g.items.push(n); g.idesc.push(d); i = g.items.length - 1; } else g.idesc[i] = d; return i; });
g.sec = g.sec.filter(s => s[0] !== "المركبات وحركتها"); g.sec.unshift(["المركبات وحركتها", ids]);
S.F[String(gi)] = S.F[String(gi)] || [{ k: "name", l: "البيان", t: "text", req: 1, col: 1 }, { k: "vehicle", l: "المركبة", t: "text", col: 1 }, { k: "amount", l: "المبلغ", t: "number" }];
fs.writeFileSync(file, head + JSON.stringify(S, null, 1) + ";\n");
console.log(`«${g.n}» (${gi}): ${g.items.length} وحدة`);
