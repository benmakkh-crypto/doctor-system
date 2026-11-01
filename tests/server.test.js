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
ok(!A.login("admin", "wrong", false).ok, "wrong password rejected");
let r = A.login("ADMIN ", adminPw, false); ok(r.ok && r.data.mustChange, "login (case-insensitive) with mustChange");
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
ok(A.api(T, "saveUser", { username: "admin", name: "x", role: "viewer" }).code === "VALIDATION", "cannot demote self");

// --- samples & numbering
ok(A.api(T, "addSamples").data.count === 9, "samples added");
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
ok(ap.ok && ap.data.decision && ap.data.decision.by === "admin", "admin approval recorded as decision");
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
ok(A.api(ST, "route", { id: big, to: "admin", note: "راجع" }).data.record.to === "admin", "routed");
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
A.logout(ST);
ok(A.api(ST, "bootstrap").code === "AUTH", "logout ends session");
ok(A.api("forged-token", "bootstrap").code === "AUTH", "forged token rejected");
ok(A.api(T, "emptyTrash").ok && A.api(T, "clearSamples").ok, "admin cleanup");
console.log("server tests passed:", pass);
module.exports = {};
