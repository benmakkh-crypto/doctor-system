// يضيف «العقود والالتزامات» إلى إدارة «المشاريع والمتابعة» (SCHEMA.G، رمزها PRJ). آمن للتكرار.
const fs = require("fs"), path = require("path");
const file = path.join(__dirname, "..", "src", "Schema.gs");
const src = fs.readFileSync(file, "utf8"), head = src.slice(0, src.indexOf("{"));
const S = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));
const gi = S.G.findIndex(g => g.c === "PRJ"); if (gi < 0) throw new Error("PRJ department not found");
const g = S.G[gi];
const MODS = [["لوحة العقود والالتزامات", "متابعة العقود والالتزامات والدفعات والتنبيهات"], ["سجل العقود", "جميع العقود وقيمها وحالاتها"], ["عقد جديد", "تسجيل عقد وبياناته ومستنده"], ["الالتزامات التعاقدية", "التزامات العقود ومواعيدها وإثبات تنفيذها"], ["دفعات العقود", "جداول الدفعات وتسجيل السداد والمستحقات"], ["تغييرات العقود", "طلبات التعديل المالي والزمني واعتمادها"], ["تقارير العقود", "أرصدة العقود والمتأخر والمستحق والتغييرات"], ["طباعة بطاقة العقد", "معاينة بطاقة العقد وطباعتها"], ["إعدادات العقود", "الأطراف والمسؤولون وأنواع العقود والترقيم"]];
const ids = MODS.map(([n, d]) => { let i = g.items.indexOf(n); if (i < 0) { g.items.push(n); g.idesc.push(d); i = g.items.length - 1; } else g.idesc[i] = d; return i; });
g.sec = g.sec.filter(s => s[0] !== "العقود والالتزامات"); g.sec.splice(1, 0, ["العقود والالتزامات", ids]);
g.n = "المشاريع والعقود والمتابعة"; g.d = (g.d || "").includes("العقود") ? g.d : (g.d ? g.d + " والعقود والالتزامات" : "المشاريع والعقود والالتزامات");
fs.writeFileSync(file, head + JSON.stringify(S, null, 1) + ";\n");
console.log(`«${g.n}» (${gi}): ${g.items.length} وحدة، منها ${ids.length} للعقود`);
