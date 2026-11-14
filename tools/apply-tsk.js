// يضيف «متابعة المهام» إلى «الإدارة التنفيذية» (SCHEMA.G، رمزها EXE). آمن للتكرار.
const fs = require("fs"), path = require("path");
const file = path.join(__dirname, "..", "src", "Schema.gs");
const src = fs.readFileSync(file, "utf8"), head = src.slice(0, src.indexOf("{"));
const S = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));
const g = S.G.find(x => x.c === "EXE"); if (!g) throw new Error("EXE department not found");
const MODS = [["لوحة متابعة المهام", "الإنجاز والتأخير والتوزيع حسب الحالة والقسم والموظف"], ["بيانات المهام", "جدول الإدخال اليومي للمهام وتواريخها ومسؤوليها"], ["إعدادات متابعة المهام", "الجهات والأقسام والموظفون والحالات"], ["دليل متابعة المهام", "خطوات متابعة المهام"]];
const ids = MODS.map(([n, d]) => { let i = g.items.indexOf(n); if (i < 0) { g.items.push(n); g.idesc.push(d); i = g.items.length - 1; } else g.idesc[i] = d; return i; });
g.sec = g.sec.filter(s => s[0] !== "متابعة المهام"); g.sec.splice(1, 0, ["متابعة المهام", ids]);
fs.writeFileSync(file, head + JSON.stringify(S, null, 1) + ";\n");
console.log(`«${g.n}»: ${g.items.length} وحدة، منها ${ids.length} للمهام`);
