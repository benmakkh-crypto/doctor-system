const { makeGas } = require("./gas-mock");
const assert = require("assert");
const g = makeGas(), A = g.__api;
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
const today = new Date().toISOString().slice(0, 10);

const msg = A.setup();
const adminPw = /المؤقتة: (\S+)/.exec(msg)[1];
ok(adminPw.length >= 12, "temp password generated");
ok(A.getPublicConfig().ready, "ready after setup");

// --- login & forced change
ok(!A.login("zubair", "wrong", false).ok, "wrong password rejected");
let r = A.login("ZUBAIR ", adminPw, false); ok(r.ok && r.data.mustChange, "login (case-insensitive) with mustChange");
let T = r.data.token;
ok(A.api(T, "bootstrap").code === "MUST_CHANGE", "bootstrap blocked until password change");
ok(A.api(T, "changePassword", { current: adminPw, next: "short" }).code === "VALIDATION", "policy enforced");
ok(A.api(T, "changePassword", { current: adminPw, next: "Admin2026pass" }).ok, "password changed");
let b = A.api(T, "bootstrap"); ok(b.ok && b.data.me.role === "admin", "admin bootstrap");

// --- users
let u = A.api(T, "saveUser", { username: "sara", name: "سارة المحصلة", email: "sara@example.org", role: "contributor", depts: [6] });
ok(u.ok && u.data.password, "contributor created with temp password");
const v = A.api(T, "saveUser", { username: "view", name: "مراجع", role: "viewer", depts: [] });
ok(A.api(T, "saveUser", { username: "Bad Name", name: "x", role: "viewer" }).code === "VALIDATION", "username format enforced");
ok(A.api(T, "saveUser", { username: "zubair", name: "x", role: "viewer" }).code === "VALIDATION", "cannot demote self");

// --- samples & numbering
ok(A.api(T, "addSamples").data.count === 56, "samples added");
const nos = A.api(T, "bootstrap").data.records.map(x => x.no);
ok(nos.every(n => /^[A-Z]{3}-\d{4}-\d{5}$/.test(n)), "sequential numbers " + nos[0]);

// --- contributor scoped to dept 6
let s = A.login("sara", u.data.password, true); const ST = s.data.token;
A.api(ST, "changePassword", { current: u.data.password, next: "Sara2026pass" });
let sb = A.api(ST, "bootstrap").data;
ok(sb.records.every(x => x.g === 6), "contributor sees only dept 6 (" + sb.records.length + ")");
ok(A.api(ST, "create", { g: 7, m: 2, title: "x", date: today, f: { amount: 10 } }).code === "FORBIDDEN", "cannot create outside depts");
let c = A.api(ST, "create", { g: 6, m: 6, title: "تبرع كبير", date: today, f: { donor: "مؤسسة س", amount: 12000, receipt: "RC-1" } });
ok(c.ok && c.data.record.createdBy === "sara", "server stamps createdBy");
const big = c.data.record.id;
ok(A.api(ST, "status", { id: big, status: "مكتمل" }).code === "FORBIDDEN", "contributor cannot close above threshold");
ok(A.api(ST, "status", { id: big, status: "مرفوض" }).code === "VALIDATION", "rejection needs a reason");
ok(A.api(ST, "create", { g: 6, m: 6, title: "مكرر", date: today, f: { donor: "س", amount: 5, receipt: "RC-1" } }).field === "receipt", "duplicate receipt blocked server-side");
ok(A.api(ST, "create", { g: 6, m: 6, title: "x", date: today, f: { donor: "س", amount: 5, phone: "123" } }).field === "phone", "phone validated server-side");
ok(A.api(ST, "create", { g: 6, m: 6, title: "x", date: today, f: { donor: "س", amount: 5, method: "بيتكوين" } }).field === "method", "select validated server-side");
let ap = A.api(T, "status", { id: big, status: "مكتمل" });
ok(ap.ok && ap.data.decision && ap.data.decision.by === "zubair", "admin approval recorded as decision");
ok(g.__mails.some(m => m.to === "sara@example.org"), "creator notified by email");
let up = A.api(ST, "update", { id: big, g: 6, m: 6, title: "تبرع كبير", date: today, f: { donor: "مؤسسة س", amount: 15000, receipt: "RC-1" } });
ok(up.ok && up.data.record.status === "بانتظار الاعتماد" && !up.data.decision, "changing approved amount returns it to pending");
ok(A.api(ST, "update", { id: big, base: "2000-01-01", g: 6, m: 6, title: "y", date: today, f: { donor: "مؤسسة س", amount: 1 } }).code === "CONFLICT", "stale edit detected");

// --- split detection
A.api(ST, "create", { g: 6, m: 6, title: "جزء 1", date: today, f: { donor: "فلان", amount: 3000 } });
let sp = A.api(ST, "create", { g: 6, m: 6, title: "جزء 2", date: today, f: { donor: "فلان", amount: 2500 } });
ok(sp.data.record.flags && sp.data.record.flags.includes("split"), "split under threshold flagged");

// --- SoD
A.api(T, "saveSettings", { orgName: "جمعية تجربة", threshold: 5000, sod: true, notify: true });
let mine = A.api(T, "create", { g: 7, m: 2, title: "سند كبير", date: today, f: { amount: 9000 } }).data.record;
ok(A.api(T, "status", { id: mine.id, status: "مكتمل" }).code === "FORBIDDEN", "separation of duties enforced");
ok(A.getPublicConfig().orgName === "جمعية تجربة", "org name public");

// --- routing, escalation, notes, delete
ok(A.api(ST, "route", { id: big, to: "zubair", note: "راجع" }).data.record.to === "zubair", "routed");
ok(A.api(ST, "escalate", { id: big, level: 2, note: "عاجل" }).data.record.pri === 2, "escalated");
ok(A.api(ST, "note", { id: big, text: "تم الاتصال" }).data.record.hist[0].a === "ملاحظة متابعة", "note in history");
ok(A.api(ST, "remove", { id: big }).data.record.deleted === true, "soft delete");
ok(A.api(ST, "purge", { id: big }).code === "FORBIDDEN", "contributor cannot purge");
ok(!A.api(ST, "restore", { id: big }).data.record.deleted, "restore");

// --- attachments
const png = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
let f = A.api(ST, "upload", { id: big, name: "سند.png", mime: "image/png", data: png });
ok(f.ok && f.data.record.files.length === 1, "file attached");
ok(A.api(ST, "upload", { id: big, name: "a.exe", mime: "application/x-msdownload", data: png }).code === "VALIDATION", "file type restricted");
const fid = f.data.record.files[0].id;
ok(A.api(ST, "getFile", { fileId: fid }).data.data === png, "file downloaded intact");

// --- viewer
let vl = A.login("view", v.data.password, false); const VT = vl.data.token;
A.api(VT, "changePassword", { current: v.data.password, next: "View2026pass" });
const vb = A.api(VT, "bootstrap").data;
const withNid = vb.records.find(x => x.f && x.f.nid);
ok(!withNid || /\*{6}/.test(withNid.f.nid), "viewer sees masked national IDs");
ok(A.api(VT, "create", { g: 6, m: 6, title: "x", date: today, f: { donor: "a", amount: 1 } }).code === "FORBIDDEN", "viewer cannot write");
ok(A.api(VT, "getFile", { fileId: fid }).code === "FORBIDDEN", "viewer cannot open attachments");
ok(A.api(VT, "listUsers").code === "FORBIDDEN", "viewer cannot list users");

// --- lockout
for (let i = 0; i < 4; i++) A.login("view", "nope1234", false);
ok(A.login("view", "nope1234", false).code === "LOCKED", "locked after 5 failures");
ok(A.login("view", "View2026pass", false).code === "LOCKED", "correct password refused while locked");

// --- audit, logout, import
const au = A.api(T, "audit", { limit: 500 }).data;
ok(au.length > 20 && au.some(a => a.action === "قفل الحساب"), "audit trail written (" + au.length + " rows)");
const imp = A.api(T, "importData", { records: [{ g: 6, m: 6, title: "مستورد", date: today, status: "مكتمل", f: { donor: "x", amount: 100 } }, { g: 99, title: "bad" }] });
ok(imp.data.added === 1 && imp.data.skipped === 1, "import validates each row");
// --- menu customisation (admin only)
ok(A.api(ST, "saveNav", { order: [5, 4] }).code === "FORBIDDEN", "non-admin cannot customise menus");
const nv = A.api(T, "saveNav", { order: [6, 10, 6, 99], d: { 6: { n: "التبرعات والداعمون", i: "coins", c: "#123456" }, 0: { h: true } }, sec: { 6: [["قسم جديد", "star", [6, 7, 6, 999]]] }, mod: { "6-6": { n: "تبرع عام", i: "heart", h: false }, "99-1": { n: "x" }, "6-1": { i: "<script>" } } }).data.nav;
ok(nv.order[0] === 6 && nv.order[1] === 10 && nv.order.length === 14, "order cleaned and completed");
ok(nv.d[6].n === "التبرعات والداعمون" && nv.d[6].c === "#123456" && !(nv.d[0] && nv.d[0].h), "dept override saved; dashboard cannot be hidden");
ok(nv.sec[6][0][2].join() === "6,7" && nv.sec[6][1][2].length === 13, "sections dedupe and keep every module");
ok(nv.mod["6-6"].i === "heart" && !nv.mod["99-1"] && !nv.mod["6-1"], "module overrides validated");
ok(A.api(T, "bootstrap").data.settings.nav.order[0] === 6, "nav returned to clients");
ok(A.api(T, "saveNav", { reset: true }).ok && !A.api(T, "bootstrap").data.settings.nav, "reset to defaults");
// --- public website API
const pubd = A.sitePublic();
ok(pubd.ok && pubd.news.length === 3 && pubd.partners.length === 2 && pubd.programs.length >= 2, "public data returns only published news/partners and marketed programs");
ok(!JSON.stringify(pubd).match(/05\d{8}|[12]\d{9}/), "public data leaks no phone or ID numbers");
ok(pubd.stats && pubd.stats.programs > 0, "public aggregate stats present");
const before = A.api(T, "bootstrap").data.records.length;
const sa = A.siteSubmit({ type: "aid", name: "أم خالد", phone: "0551234567", family: 5, kind: "سكن", message: "نحتاج مساعدة" });
ok(sa.ok && /^SPN-/.test(sa.no), "website aid request becomes a SPN record " + sa.no);
const recs2 = A.api(T, "bootstrap").data.records;
const nr = recs2.find(r => r.no === sa.no);
ok(recs2.length === before + 1 && nr.status === "جديد" && nr.createdBy === "website" && nr.m === 14, "record created as new by website in the right module");
ok(A.siteSubmit({ type: "volunteer", name: "متطوع", phone: "123" }).field === "phone", "website validates phone");
ok(A.siteSubmit({ type: "donate", name: "متبرع كريم", phone: "0551234567", amount: 0 }).field === "amount", "website validates donation amount");
ok(A.siteSubmit({ type: "hack", name: "xxx", phone: "0551234567" }).ok === false, "unknown request type rejected");
const hp = A.siteSubmit({ type: "contact", name: "روبوت", phone: "0551234567", message: "spam", website: "http://x" });
ok(hp.ok && A.api(T, "bootstrap").data.records.length === before + 1, "honeypot silently drops bots");
const sd = A.siteSubmit({ type: "donate", name: "متبرع كريم", phone: "0551234567", amount: 500, allocation: "برنامج الحقيبة المدرسية" });
const dr = A.api(T, "bootstrap").data.records.find(r => r.no === sd.no);
ok(sd.ok && dr.g === 6 && dr.status === "جديد" && dr.f.amount === 500, "donation pledge recorded as new (not counted until approved)");
// --- admin-issued passwords (manual / auto, optional forced change)
const mk = A.api(T, "saveUser", { username: "pw.manual", name: "اختبار كلمة يدوية", role: "viewer", password: "Manual2026x", mustChange: false });
ok(mk.ok && mk.data.password === "Manual2026x" && mk.data.mustChange === false, "admin sets a chosen password on create");
const lm = A.login("pw.manual", "Manual2026x");
ok(lm.ok && lm.data.mustChange === false, "chosen password works without forced change");
ok(A.api(T, "saveUser", { username: "pw.weak", name: "ضعيفة", role: "viewer", password: "123" }).field === "password", "weak chosen password rejected on its field");
const rs = A.api(T, "resetPassword", { username: "pw.manual", password: "NewOne2026", mustChange: true });
ok(rs.ok && rs.data.mustChange === true && A.login("pw.manual", "NewOne2026").data.mustChange === true, "admin resets to a chosen password with forced change");
ok(A.api(T, "resetPassword", { username: "pw.manual", password: "abc" }).code === "VALIDATION", "reset enforces password policy");
const ra = A.api(T, "resetPassword", { username: "pw.manual" });
ok(ra.ok && ra.data.password.length >= 12 && A.login("pw.manual", ra.data.password).ok, "auto-generated reset still works");
A.logout(ST);
ok(A.api(ST, "bootstrap").code === "AUTH", "logout ends session");
ok(A.api("forged-token", "bootstrap").code === "AUTH", "forged token rejected");
ok(A.api(T, "emptyTrash").ok && A.api(T, "clearSamples").ok, "admin cleanup");
console.log("server tests passed:", pass);
module.exports = {};
