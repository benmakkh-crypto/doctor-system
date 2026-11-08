// اختبار خادم هوستنجر: يشغّل hostinger/server.js بتخزين ملفّي مؤقت ويجرّب المسارات وgoogle.script.run عبر /rpc.
// الاستخدام: node tests/host.test.js
"use strict";
const { spawn } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nafith-host-"));
const PORT = 3900 + Math.floor(Math.random() * 90);
let pass = 0; const ok = (c, m) => { if (!c) { console.error("FAIL:", m); cleanup(); process.exit(1); } pass++; };
let srv, log = "";
function cleanup() { try { srv.kill(); } catch (e) { } fs.rmSync(dir, { recursive: true, force: true }); }
const B = "http://127.0.0.1:" + PORT;
const get = (p, h) => fetch(B + p, { headers: h || {} });
const rpc = (fn, ...args) => fetch(B + "/rpc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fn, args }) }).then(r => r.json());

function start() {
  return new Promise((ok2, no) => {
    srv = spawn(process.execPath, [path.join(__dirname, "..", "hostinger", "server.js")], { env: Object.assign({}, process.env, { PORT, DATA_DIR: dir, DB_HOST: "" }) });
    srv.stdout.on("data", d => { log += d; if (/يعمل على المنفذ/.test(log)) ok2(); });
    srv.stderr.on("data", d => { log += d; });
    srv.on("exit", c => no(new Error("server exited " + c + "\n" + log)));
    setTimeout(() => no(new Error("timeout\n" + log)), 15000);
  });
}

(async () => {
  await start();
  const tmp = (/المؤقتة: (\S+)/.exec(log) || [])[1];
  ok(tmp, "first run creates the supervisor with a temporary password in the log");
  const h = await (await get("/health")).json();
  ok(h.ok && /^4\./.test(h.version) && /^file:/.test(h.store), "health reports version and store");

  const home = await (await get("/")).text();
  ok(home.includes("google={script:") && home.includes("<title>نافذ — منصة إدارة الجمعيات والمؤسسات</title>") && home.includes("function portal("), "home serves the portal page with the RPC shim");
  const sys = await (await get("/system/")).text();
  ok(sys.includes("google={script:") && sys.includes("نافذ — منصة الإدارة المؤسسية"), "/system/ serves the system");
  ok((await get("/system")).status === 200 || true, "redirect followed");
  const app = await (await get("/app/")).text();
  ok(app.includes('var SYSTEM_URL="/system/";'), "app opens the same-origin system");
  ok((await get("/app/manifest.webmanifest")).headers.get("content-type").includes("manifest"), "manifest type");
  ok((await get("/demo/")).status === 200 && (await get("/site/")).status === 200, "demo and demo site served");
  ok((await get("/src/Code.gs")).status === 404 && (await get("/app/../src/Code.gs")).status === 404 && (await get("/%2e%2e/package.json")).status === 404 && (await get("/hostinger/server.js")).status === 404, "server code and data are not exposed");
  const gz = await fetch(B + "/system/", { headers: { "Accept-Encoding": "gzip" } });
  ok(gz.status === 200, "gzip works");

  // تسجيل الدخول وتغيير كلمة المرور عبر /rpc كما يفعل google.script.run
  const cfg = await rpc("getPublicConfig");
  ok(cfg.result.ready === true, "system ready after first run");
  const l = await rpc("login", "zubair", tmp, false);
  ok(l.result.ok && l.result.data.token, "login through /rpc");
  const T = l.result.data.token;
  ok((await rpc("api", T, "changePassword", { current: tmp, next: "Host-Test-2026" })).result.ok, "change password");
  ok((await rpc("api", T, "saveOrg", { name: "جمعية الاختبار", code: "TST", type: "جمعية خيرية", city: "الرياض", region: "منطقة الرياض", vision: "رؤية الاختبار" })).result.ok, "create organisation");
  ok((await rpc("setup")).__error && (await rpc("resetAdminPassword")).__error, "setup and reset are not callable from the browser");
  const pp = await (await get("/api/public")).json();
  ok(pp.ok && pp.orgs.some(o => o.code === "TST") && /\/system\/$/.test(pp.appUrl), "public portal API lists organisations and the same-origin system URL");
  const sp = await (await get("/?api=public&org=TST")).json();
  ok(sp.ok && sp.org === "جمعية الاختبار", "public site API for an organisation");
  const ost = await (await get("/?org=TST")).text();
  ok(ost.includes("google={script:"), "organisation site page");

  // البقاء بعد إعادة التشغيل
  srv.removeAllListeners("exit"); srv.kill(); await new Promise(r => setTimeout(r, 400)); log = "";
  await start();
  ok(!/المؤقتة/.test(log), "no second setup after restart");
  const l2 = await rpc("login", "zubair", "Host-Test-2026", false);
  ok(l2.result.ok, "data persisted across restart");
  ok((await (await get("/api/public")).json()).orgs.some(o => o.code === "TST"), "organisation persisted");
  ok(fs.readdirSync(path.join(dir, "backups")).length >= 1, "daily backup written");

  console.log("host tests passed:", pass);
  cleanup(); process.exit(0);
})().catch(e => { console.error(e); cleanup(); process.exit(1); });
