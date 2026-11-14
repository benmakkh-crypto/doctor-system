// يدمج «إدارة العهد» في إدارة «المستودعات والجرد» (SCHEMA.G): عنوان «الأصول والعهد» ووحداته. آمن للتكرار.
const fs = require("fs"), path = require("path");
const file = path.join(__dirname, "..", "src", "Schema.gs");
const src = fs.readFileSync(file, "utf8"), head = src.slice(0, src.indexOf("{"));
const S = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));
const gi = S.G.findIndex(g => g.c === "WHS"); if (gi < 0) throw new Error("WHS department not found");
const g = S.G[gi];
const MODS = [["لوحة الأصول والعهد", "متابعة الأصول والعهد الشخصية والتنبيهات"], ["سجل الأصول", "قاعدة الأصول ومواقعها وحالتها وقيمتها"], ["إضافة أصل", "تسجيل أصل جديد برقمه وتصنيفه وقيمته"], ["تسليم عهدة", "تسليم أصل من المخزن إلى موظف بمحضر"], ["نقل عهدة", "نقل أصل بين موظفين مع سجل الحركة"], ["استلام عهدة", "إعادة أصل من الموظف وفحص حالته وملحقاته"], ["عهد الموظفين", "أصول كل موظف ومواعيد إعادتها وكشف العهد"], ["حركة العهد", "السجل الموحّد للتسليم والنقل والاستلام"], ["جرد الأصول", "جرد دوري للأصول واعتماد الفروقات ومحضر الجرد"], ["محاضر العهد", "محاضر التسليم والنقل والاستلام وطباعتها"], ["تقارير الأصول والعهد", "تقارير الحالة والموقع والقيمة الدفترية والمتأخرة"], ["إعدادات العهد", "قوائم الإدارات والمواقع والتصنيفات والترقيم"]];
const ids = MODS.map(([n, d]) => { let i = g.items.indexOf(n); if (i < 0) { g.items.push(n); g.idesc.push(d); i = g.items.length - 1; } else g.idesc[i] = d; return i; });
g.sec = g.sec.filter(s => s[0] !== "الأصول والعهد"); g.sec.splice(1, 0, ["الأصول والعهد", ids]);
g.n = g.n.includes("المشتريات") ? g.n : "المستودعات والأصول والعهد";
fs.writeFileSync(file, head + JSON.stringify(S, null, 1) + ";\n");
console.log(`«${g.n}» (${gi}): ${g.items.length} وحدة، منها ${ids.length} للأصول والعهد`);
