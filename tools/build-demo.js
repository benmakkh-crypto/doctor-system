// يبني index.html: نسخة HTML مستقلة من النظام تعمل في أي متصفح.
// الاستخدام: node tools/build-demo.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");

const server = read("src/Code.gs") + "\n" + read("src/Schema.gs") +
  "\nreturn {setup:setup,login:login,logout:logout,api:api,getPublicConfig:getPublicConfig,dailyBackup:dailyBackup};";
let runtime = read("tools/demo-runtime.js");
const token = '"/*@@SERVER@@*/\\nreturn {setup:setup,login:login,logout:logout,api:api,getPublicConfig:getPublicConfig,dailyBackup:dailyBackup};"';
if (!runtime.includes(token)) throw new Error("server token not found in demo-runtime.js");
runtime = runtime.replace(token, () => JSON.stringify(server).replace(/<\/script/gi, "<\\/script"));

let html = read("src/Index.html");
const at = html.indexOf("</head>");
if (at < 0) throw new Error("no </head>");
html = html.slice(0, at) +
  "<!-- نسخة تجريبية مستقلة: تُبنى آليًا من src/ بالأمر node tools/build-demo.js. لا تعدّلها يدويًا. -->\n<script>" +
  runtime.replace(/<\/script/gi, "<\\/script") + "</script>\n" + html.slice(at);
html = html.replace("<title>نظام الدكتور</title>", "<title>نظام الدكتور — نسخة تجريبية</title>");
html = html.replace("<span>اتصال مشفّر عبر Google</span>", "<span>نسخة تجريبية · تعمل داخل المتصفح</span>");
fs.writeFileSync(path.join(root, "index.html"), html);
console.log("index.html", (html.length / 1024).toFixed(0) + " KB");
