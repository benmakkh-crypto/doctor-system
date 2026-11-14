// يدمج «مركز الحوكمة» في إدارة «التأسيس والحوكمة» (GOV): عنوان «مركز الحوكمة» أولًا. آمن للتكرار.
const fs = require("fs"), path = require("path");
const file = path.join(__dirname, "..", "src", "Schema.gs");
const src = fs.readFileSync(file, "utf8"), head = src.slice(0, src.indexOf("{"));
const S = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));
const g = S.G.find(x => x.c === "GOV");
const name = "مركز الحوكمة", desc = "المعايير والمؤشرات والشواهد ونسبة الجاهزية ومكتبة المستندات";
let i = g.items.indexOf(name); if (i < 0) { g.items.push(name); g.idesc.push(desc); i = g.items.length - 1; } else g.idesc[i] = desc;
let sec = g.sec.find(s => s[0] === "الحوكمة" || s[0] === "مركز الحوكمة");
if (!sec) { sec = ["مركز الحوكمة", []]; g.sec.unshift(sec); }
sec[0] = "مركز الحوكمة"; sec[1] = [i].concat(sec[1].filter(x => x !== i));
g.sec = [sec].concat(g.sec.filter(s => s !== sec));
g.d = "مركز الحوكمة والمعايير والشواهد، والتأسيس والعضويات، والاجتماعات، والتخطيط الاستراتيجي";
fs.writeFileSync(file, head + JSON.stringify(S, null, 1) + ";\n");
console.log("GOV sections:", g.sec.map(s => s[0]).join(" | "));
