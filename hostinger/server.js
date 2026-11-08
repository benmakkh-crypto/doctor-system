/*
 * خادم نافذ على هوستنجر (Node.js 18+).
 *   /                 بوابة نافذ (دليل الجهات)        /?org=CODE          موقع الجهة
 *   /system/          النظام (شاشة الدخول)            /system/?page=site&org=CODE  موقع الجهة (توافق مع روابط Apps Script)
 *   /api/public[?org=CODE]  بيانات البوابة أو الجهة بصيغة JSON
 *   /app/  /docs/  /demo/  /site/   ملفات ثابتة (التطبيق، الأدلة، النسخة التجريبية)
 *   POST /rpc         بديل google.script.run
 * متغيرات البيئة: PORT، PUBLIC_URL، DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME أو DATA_DIR،
 *   SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS لإرسال البريد من info@nafithapp.com.
 */
"use strict";
const http = require("http"), fs = require("fs"), path = require("path"), zlib = require("zlib");
const { createRuntime } = require("./runtime");
const { openStore } = require("./store");

const ROOT = path.join(__dirname, "..");
const env = process.env;
const PORT = +env.PORT || 3000;
const PUBLIC_URL = (env.PUBLIC_URL || "https://nafithapp.com").replace(/\/+$/, "");
const RPC = new Set(["getPublicConfig", "login", "logout", "api", "sitePublic", "siteSubmit", "platformPublic"]);
const STATIC = ["app", "docs", "demo", "site"];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".pdf": "application/pdf", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".jpg": "image/jpeg", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8" };

// يجعل google.script.run وgoogle.script.url تعمل في المتصفح عبر /rpc
const SHIM = `<script>(function(){function R(h){return new Proxy({},{get:function(_,k){
if(k==="withSuccessHandler")return function(f){return R(Object.assign({},h,{s:f}))};
if(k==="withFailureHandler")return function(f){return R(Object.assign({},h,{f:f}))};
if(k==="withUserObject")return function(){return R(h)};
return function(){var a=[].slice.call(arguments);fetch("/rpc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fn:k,args:a})})
.then(function(r){return r.json()}).then(function(j){if(j&&j.__error){if(h.f)h.f(new Error(j.__error))}else if(h.s)h.s(j.result)})
.catch(function(e){if(h.f)h.f(e)})}}})}
var P={};new URLSearchParams(location.search).forEach(function(v,k){P[k]=v});
window.google={script:{get run(){return R({})},url:{getLocation:function(cb){cb({parameter:P,hash:location.hash.slice(1)})}},host:{close:function(){}}}};
window.__NAFITH_HOST__=true})();</script>`;

let RT, store, chain = Promise.resolve(), mailer = null;
const HTML = {};
function page(name) {
  if (!HTML[name] || env.NODE_ENV === "development") HTML[name] = fs.readFileSync(path.join(ROOT, "src", name + ".html"), "utf8");
  return HTML[name];
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function persist() {
  const d = RT.takeDirty(), mails = RT.takeMail();
  chain = chain.then(async () => {
    if (d.sheets.length || d.files.length) await store.save(RT.st, d);
    for (const m of mails) {
      if (!mailer) { console.log("[بريد غير مُرسل: SMTP غير مضبوط]", m.to, m.subject); continue; }
      try { await mailer.sendMail({ from: `"${m.name || "منصة نافذ"}" <${env.SMTP_USER}>`, to: m.to, subject: m.subject, html: m.htmlBody || m.body }); }
      catch (e) { console.error("تعذّر إرسال البريد إلى", m.to, e.message); }
    }
  }).catch(e => console.error("تعذّر الحفظ:", e));
  return chain;
}

function send(res, code, body, type, extra) {
  const h = Object.assign({ "Content-Type": type || "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" }, extra || {});
  if (typeof body === "string" && body.length > 1024 && /gzip/.test(res.req.headers["accept-encoding"] || "")) { body = zlib.gzipSync(body); h["Content-Encoding"] = "gzip"; }
  res.writeHead(code, h); res.end(body);
}
function json(res, o, extra) { send(res, 200, JSON.stringify(o), "application/json; charset=utf-8", Object.assign({ "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" }, extra)); }

function renderHtml(res, params) {
  const out = RT.api.doGet({ parameter: params });           // نفس منطق Apps Script: Index أو Site والعنوان
  let html = page(out.name);
  html = html.replace(/<title>[^<]*<\/title>/, "<title>" + esc(out.title || "نافذ") + "</title>");
  html = html.replace("<head>", "<head>\n" + SHIM);
  persist();
  send(res, 200, html, TYPES[".html"], { "Cache-Control": "no-cache" });
}

function serveStatic(req, res, rel) {
  const base = path.resolve(ROOT);
  let f = path.resolve(base, "." + decodeURIComponent(rel));
  if (!f.startsWith(base + path.sep) || !STATIC.some(d => f.startsWith(path.join(base, d) + path.sep) || f === path.join(base, d))) return send(res, 404, "غير موجود");
  try { if (fs.statSync(f).isDirectory()) { if (!rel.endsWith("/")) return send(res, 301, "", null, { Location: rel + "/" }); f = path.join(f, "index.html"); } } catch (e) { return send(res, 404, "غير موجود"); }
  fs.readFile(f, (err, buf) => {
    if (err) return send(res, 404, "غير موجود");
    const t = TYPES[path.extname(f).toLowerCase()] || "application/octet-stream";
    let body = /^text|json|javascript|svg|manifest/.test(t) ? buf.toString("utf8") : buf;
    // التطبيق يفتح النظام من النطاق نفسه بدل Apps Script
    if (f === path.join(base, "app", "index.html")) body = body.replace(/var SYSTEM_URL="[^"]*";/, 'var SYSTEM_URL="/system/";');
    send(res, 200, body, t, { "Cache-Control": f.endsWith("sw.js") || t.startsWith("text/html") ? "no-cache" : "public, max-age=86400" });
  });
}

function readBody(req, limit) {
  return new Promise((ok, no) => {
    let n = 0; const parts = [];
    req.on("data", c => { n += c.length; if (n > limit) { no(new Error("TOO_LARGE")); req.destroy(); } else parts.push(c); });
    req.on("end", () => ok(Buffer.concat(parts).toString("utf8"))); req.on("error", no);
  });
}

async function handle(req, res) {
  const u = new URL(req.url, "http://x");
  const params = Object.fromEntries(u.searchParams);
  const p = u.pathname;

  if (req.method === "OPTIONS") return send(res, 204, "", null, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type" });

  if (req.method === "POST" && p === "/rpc") {
    let body;
    try { body = JSON.parse(await readBody(req, 25 * 1024 * 1024)); } catch (e) { return json(res, { __error: e.message === "TOO_LARGE" ? "حجم الطلب أكبر من المسموح." : "طلب غير صالح." }); }
    if (!body || !RPC.has(body.fn) || !Array.isArray(body.args)) return json(res, { __error: "عملية غير معروفة." });
    let result;
    try { result = RT.api[body.fn].apply(null, body.args); }
    catch (e) { console.error(body.fn, e); await persist(); return json(res, { __error: "حدث خطأ في الخادم." }); }
    await persist();
    return json(res, { result: result == null ? null : JSON.parse(JSON.stringify(result)) });
  }
  // توافق مع doPost في Apps Script (نماذج الموقع العام من خارج المنصة)
  if (req.method === "POST" && (p === "/" || p === "/system/" || p === "/exec")) {
    let body; try { body = await readBody(req, 2 * 1024 * 1024); } catch (e) { return json(res, { ok: false }); }
    let r; try { r = RT.api.siteSubmit(JSON.parse(body)); } catch (e) { r = { ok: false, message: "طلب غير صالح." }; }
    await persist(); return json(res, r);
  }
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "");

  if (p === "/api/public" || params.api === "public") {
    let r; try { r = params.org ? RT.api.sitePublic(params.org) : RT.api.platformPublic(); } catch (e) { r = { ok: false }; }
    await persist(); return json(res, r, { "Cache-Control": "public, max-age=60" });
  }
  if (p === "/health") return json(res, { ok: true, version: RT.api.APP_VERSION, store: store.kind });
  if (p === "/robots.txt") return send(res, 200, "User-agent: *\nDisallow: /system/\nDisallow: /rpc\n");
  if (p === "/favicon.ico") return serveStatic(req, res, "/app/icons/icon-192.png");
  if (p === "/" || p === "/index.html") return renderHtml(res, Object.assign({ page: "site" }, params));
  if (p === "/system" ) return send(res, 301, "", null, { Location: "/system/" + u.search });
  if (p === "/system/" || p === "/exec") return renderHtml(res, params);
  if (STATIC.some(d => p === "/" + d || p.startsWith("/" + d + "/"))) return serveStatic(req, res, p);
  send(res, 404, "الصفحة غير موجودة", null);
}

async function maybeBackup() {
  const last = +(RT.st.props.HOST_LAST_BACKUP || 0);
  if (Date.now() - last < 20 * 3600 * 1000) return;
  try { await chain; await store.backup(RT.st); RT.st.props.HOST_LAST_BACKUP = String(Date.now()); RT.takeDirty(); await store.save(RT.st, { sheets: ["__props"], files: [] }); console.log("نسخة احتياطية يومية: تمت"); }
  catch (e) { console.error("تعذّر النسخ الاحتياطي:", e); }
}

async function main() {
  store = await openStore(env);
  const st = await store.load();
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    try { mailer = require("nodemailer").createTransport({ host: env.SMTP_HOST, port: +env.SMTP_PORT || 465, secure: (+env.SMTP_PORT || 465) === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }); }
    catch (e) { console.error("nodemailer غير مثبّت؛ لن يُرسل البريد."); }
  }
  RT = createRuntime(st, { appUrl: PUBLIC_URL + "/system/", mailer: !!mailer, ownerEmail: env.SMTP_USER, onBackup: () => { chain = chain.then(() => store.backup(RT.st)); } });
  if (!st.props.SPREADSHEET_ID) {
    // ترحيل لمرة واحدة من Google Sheets: متغير البيئة NAFITH_IMPORT (JSON مضغوط gzip بترميز base64) أو الملف DATA_DIR/import.json.
    // لا يُوضع في المستودع لأنه يحوي بيانات المستخدمين.
    const impFile = path.join(env.DATA_DIR || path.join(ROOT, "..", "nafith-data"), "import.json");
    const raw = env.NAFITH_IMPORT ? zlib.gunzipSync(Buffer.from(env.NAFITH_IMPORT, "base64")).toString("utf8") : (fs.existsSync(impFile) ? fs.readFileSync(impFile, "utf8") : "");
    if (raw) {
      const data = JSON.parse(raw);
      Object.assign(st.sheets, data.sheets || {}); Object.assign(st.props, data.props || {});
      st.props.SPREADSHEET_ID = "NAFITH-DB"; st.props.FOLDER_ID = st.props.FOLDER_ID || "F0"; st.props.FILES_FOLDER_ID = st.props.FILES_FOLDER_ID || "F1"; st.props.BACKUP_FOLDER_ID = st.props.BACKUP_FOLDER_ID || "F2";
      await store.save(st, { sheets: Object.keys(st.sheets).concat("__props"), files: [] });
      console.log("استُوردت بيانات Google Sheets:", Object.keys(data.sheets || {}).length, "جداول. يمكن حذف NAFITH_IMPORT الآن.");
    } else {
      console.log(RT.api.setup());   // أول تشغيل: ينشئ الجداول وحساب المشرف العام وكلمة مرور مؤقتة تظهر في السجل
    }
    RT.takeDirty(); await store.save(st, { sheets: Object.keys(st.sheets).concat("__props"), files: [] });
  }
  try { RT.api.getPublicConfig(); await persist(); } catch (e) { console.error(e); } // يشغّل الترحيل التلقائي للمخطط
  maybeBackup(); setInterval(maybeBackup, 6 * 3600 * 1000).unref();
  http.createServer((req, res) => handle(req, res).catch(e => { console.error(e); try { send(res, 500, "خطأ في الخادم"); } catch (x) { } }))
    .listen(PORT, () => console.log(`نافذ ${RT.api.APP_VERSION} يعمل على المنفذ ${PORT} · التخزين: ${store.kind}`));
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { main, handle };
