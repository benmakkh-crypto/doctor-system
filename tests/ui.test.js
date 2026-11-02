const { chromium } = require("playwright");
const { makeGas } = require("./gas-mock");
const fs = require("fs");
const OUT = __dirname + "/shots/"; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const g = makeGas(), A = g.__api;
  const pw = /المؤقتة: (\S+)/.exec(A.setup())[1];
  // seed: change admin pw + samples so the app opens in a working state
  let T = A.login("zubair", pw, false).data.token;
  A.api(T, "changePassword", { current: pw, next: "Admin2026pass" });
  A.api(T, "addSamples", { __org: "main" });
  A.api(T, "saveSettings", { __org: "main", orgName: "جمعية البر الخيرية (تجربة)", threshold: 5000, sod: false, notify: true });
  const sara = A.api(T, "saveUser", { username: "sara", name: "سارة القحطاني", role: "contributor", depts: [6, 10] }).data.password;

  const html = fs.readFileSync(require("path").join(__dirname, "../src/Index.html"), "utf8");
  const browser = await chromium.launch();
  const errors = [];
  async function page(w, h, dark) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? "dark" : "light", locale: "ar-SA" });
    const p = await ctx.newPage();
    p.on("pageerror", e => errors.push("pageerror: " + e.message));
    p.on("console", m => { if (m.type() === "error" && !/fonts|ERR_|net::/.test(m.text())) errors.push("console: " + m.text()) });
    await p.exposeFunction("__gas", (fn, args) => JSON.stringify(A[fn](...JSON.parse(args)) ?? null));
    await p.addInitScript(() => { try { localStorage.setItem("ds.org", "main"); } catch (e) { }
      const mk = h => new Proxy({}, { get(_, k) {
        if (k === "withSuccessHandler") return f => mk({ ...h, s: f });
        if (k === "withFailureHandler") return f => mk({ ...h, f });
        return (...a) => { setTimeout(() => window.__gas(k, JSON.stringify(a)).then(r => h.s && h.s(JSON.parse(r))).catch(e => h.f && h.f(e)), 30) };
      } });
      window.google = { script: { get run() { return mk({}) } } };
    });
    await p.route("https://fonts.googleapis.com/**", r => r.fulfill({ body: "", contentType: "text/css" }));
    await p.route("https://app.test/", r => r.fulfill({ body: html, contentType: "text/html; charset=utf-8" }));
    await p.goto("https://app.test/", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(400);
    return p;
  }
  const p = await page(1360, 860);
  await p.screenshot({ path: OUT + "01-login.png" });
  await p.fill("#lgUser", "zubair"); await p.fill("#lgPass", "wrong-pass1"); await p.click("#lgBtn");
  await p.waitForSelector("#lgMsg:not([hidden])"); await p.waitForTimeout(500);
  console.log("wrong pw msg:", await p.textContent("#lgMsg"));
  await p.fill("#lgPass", "Admin2026pass"); await p.click("#lgBtn");
  await p.waitForSelector("body:not(.auth)", { timeout: 5000 }); await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + "02-home.png", fullPage: false });
  await p.screenshot({ path: OUT + "02b-home-full.png", fullPage: true });
  // open a record drawer
  await p.evaluate(() => location.hash = "focus"); await p.waitForTimeout(400); await p.click(".queue button >> nth=0"); await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + "03-drawer.png" });
  // approve from inbox
  await p.keyboard.press("Escape");
  await p.evaluate(() => location.hash = "inbox"); await p.waitForTimeout(400);
  const before = await p.locator("[data-quick]").count();
  await p.click("[data-quick][data-st='مكتمل'] >> nth=0"); await p.waitForTimeout(600);
  console.log("approve buttons before/after:", before, await p.locator("[data-quick]").count());
  // users page + new user
  await p.evaluate(() => location.hash = "users"); await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + "04-users.png" });
  await p.click("[data-newuser]"); await p.fill("#u_un", "khalid"); await p.fill("#u_nm", "خالد الزهراني"); await p.selectOption("#u_rl", "viewer");
  await p.click("#usBtn"); await p.waitForTimeout(600);
  console.log("secret shown:", await p.locator("#secPw").count());
  await p.screenshot({ path: OUT + "05-secret.png" });
  await p.click("[data-close] >> nth=-1");
  // create a donation through the form (with validation error first)
  await p.evaluate(() => location.hash = "m6-6"); await p.waitForTimeout(400);
  await p.click(".dhead [data-add], .head [data-add]"); await p.waitForTimeout(300);
  await p.fill("#f_title", "تبرع تجريبي من الواجهة"); await p.fill("#f_donor", "عبدالله"); await p.fill("#f_amount", "750"); await p.fill("#f_phone", "123");
  await p.click("#saveBtn"); await p.waitForTimeout(300);
  console.log("phone error:", await p.textContent("label[data-f='phone'] .msg"));
  await p.fill("#f_phone", "0551234567"); await p.click("#saveBtn"); await p.waitForTimeout(700);
  console.log("toast:", await p.textContent("#toast"));
  await p.screenshot({ path: OUT + "06-module.png" });
  // audit
  await p.evaluate(() => location.hash = "audit"); await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + "07-audit.png" });
  console.log("audit rows:", await p.locator("tbody tr").count());
  // logout
  await p.click(".me-acts .danger"); await p.click("#cfYes"); await p.waitForTimeout(400);
  console.log("logged out:", await p.evaluate(() => document.body.classList.contains("auth")), await p.textContent("#lgMsg"));

  // mobile + dark: contributor first login forced password change
  const m = await page(390, 844, true);
  await m.screenshot({ path: OUT + "08-login-mobile-dark.png" });
  await m.fill("#lgUser", "sara"); await m.fill("#lgPass", sara); await m.click("#lgBtn"); await m.waitForTimeout(700);
  await m.screenshot({ path: OUT + "09-force-change.png" });
  await m.fill("#pwCur", sara); await m.fill("#pwNew", "Sara2026pass!"); await m.fill("#pwRep", "Sara2026pass!"); await m.click("#pwBtn");
  await m.waitForSelector("body:not(.auth)", { timeout: 5000 }); await m.waitForTimeout(700);
  await m.screenshot({ path: OUT + "10-mobile-home.png" });
  const navDepts = await m.evaluate(() => [...document.querySelectorAll("#nav a")].map(a => a.textContent.trim()));
  console.log("contributor nav:", navDepts.join(" | "));
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log("mobile horizontal overflow px:", overflow);
  console.log("ERRORS:", errors.length ? errors : "none");
  await browser.close();
})().catch(e => { console.error(e); process.exit(1) });
