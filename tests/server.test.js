const { makeGas } = require("./gas-mock");
const assert = require("assert");
const g = makeGas(), A = g.__api;
// المشرف العام يعمل داخل المؤسسة الرئيسية في الاختبارات القديمة
const AM = (t, a, p) => A.api(t, a, Object.assign({ __org: "main" }, p || {}));
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
ok(AM(T, "bootstrap").code === "MUST_CHANGE", "bootstrap blocked until password change");
ok(AM(T, "changePassword", { current: adminPw, next: "short" }).code === "VALIDATION", "policy enforced");
ok(AM(T, "changePassword", { current: adminPw, next: "Admin2026pass" }).ok, "password changed");
let b = AM(T, "bootstrap"); ok(b.ok && b.data.me.role === "admin", "admin bootstrap");

// --- users
let u = AM(T, "saveUser", { username: "sara", name: "سارة المحصلة", email: "sara@example.org", role: "contributor", depts: [6] });
ok(u.ok && u.data.password, "contributor created with temp password");
const v = AM(T, "saveUser", { username: "view", name: "مراجع", role: "viewer", depts: [] });
ok(AM(T, "saveUser", { username: "Bad Name", name: "x", role: "viewer" }).code === "VALIDATION", "username format enforced");
ok(AM(T, "saveUser", { username: "zubair", name: "x", role: "viewer" }).code === "VALIDATION", "cannot demote self");

// --- samples & numbering
ok(AM(T, "addSamples").data.count === 56, "samples added");
const nos = AM(T, "bootstrap").data.records.map(x => x.no);
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
let ap = AM(T, "status", { id: big, status: "مكتمل" });
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
AM(T, "saveSettings", { orgName: "جمعية تجربة", threshold: 5000, sod: true, notify: true });
let mine = AM(T, "create", { g: 7, m: 2, title: "سند كبير", date: today, f: { amount: 9000 } }).data.record;
ok(AM(T, "status", { id: mine.id, status: "مكتمل" }).code === "FORBIDDEN", "separation of duties enforced");
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
const au = AM(T, "audit", { limit: 500 }).data;
ok(au.length > 20 && au.some(a => a.action === "قفل الحساب"), "audit trail written (" + au.length + " rows)");
const imp = AM(T, "importData", { records: [{ g: 6, m: 6, title: "مستورد", date: today, status: "مكتمل", f: { donor: "x", amount: 100 } }, { g: 99, title: "bad" }] });
ok(imp.data.added === 1 && imp.data.skipped === 1, "import validates each row");
// --- menu customisation (admin only)
ok(A.api(ST, "saveNav", { order: [5, 4] }).code === "FORBIDDEN", "non-admin cannot customise menus");
const nv = AM(T, "saveNav", { order: [6, 10, 6, 99], d: { 6: { n: "التبرعات والداعمون", i: "coins", c: "#123456" }, 0: { h: true } }, sec: { 6: [["قسم جديد", "star", [6, 7, 6, 999]]] }, mod: { "6-6": { n: "تبرع عام", i: "heart", h: false }, "99-1": { n: "x" }, "6-1": { i: "<script>" } } }).data.nav;
ok(nv.order[0] === 6 && nv.order[1] === 10 && nv.order.length === 14, "order cleaned and completed");
ok(nv.d[6].n === "التبرعات والداعمون" && nv.d[6].c === "#123456" && !(nv.d[0] && nv.d[0].h), "dept override saved; dashboard cannot be hidden");
ok(nv.sec[6][0][2].join() === "6,7" && nv.sec[6][1][2].length === 13, "sections dedupe and keep every module");
ok(nv.mod["6-6"].i === "heart" && !nv.mod["99-1"] && !nv.mod["6-1"], "module overrides validated");
ok(AM(T, "bootstrap").data.settings.nav.order[0] === 6, "nav returned to clients");
ok(AM(T, "saveNav", { reset: true }).ok && !AM(T, "bootstrap").data.settings.nav, "reset to defaults");
// --- public website API
const pubd = A.sitePublic();
ok(pubd.ok && pubd.news.length === 3 && pubd.partners.length === 2 && pubd.programs.length >= 2, "public data returns only published news/partners and marketed programs");
ok(!JSON.stringify(pubd).match(/05\d{8}|[12]\d{9}/), "public data leaks no phone or ID numbers");
ok(pubd.stats && pubd.stats.programs > 0, "public aggregate stats present");
const before = AM(T, "bootstrap").data.records.length;
const sa = A.siteSubmit({ type: "aid", name: "أم خالد", phone: "0551234567", family: 5, kind: "سكن", message: "نحتاج مساعدة" });
ok(sa.ok && /^SPN-/.test(sa.no), "website aid request becomes a SPN record " + sa.no);
const recs2 = AM(T, "bootstrap").data.records;
const nr = recs2.find(r => r.no === sa.no);
ok(recs2.length === before + 1 && nr.status === "جديد" && nr.createdBy === "website" && nr.m === 14, "record created as new by website in the right module");
ok(A.siteSubmit({ type: "volunteer", name: "متطوع", phone: "123" }).field === "phone", "website validates phone");
ok(A.siteSubmit({ type: "donate", name: "متبرع كريم", phone: "0551234567", amount: 0 }).field === "amount", "website validates donation amount");
ok(A.siteSubmit({ type: "hack", name: "xxx", phone: "0551234567" }).ok === false, "unknown request type rejected");
const hp = A.siteSubmit({ type: "contact", name: "روبوت", phone: "0551234567", message: "spam", website: "http://x" });
ok(hp.ok && AM(T, "bootstrap").data.records.length === before + 1, "honeypot silently drops bots");
const sd = A.siteSubmit({ type: "donate", name: "متبرع كريم", phone: "0551234567", amount: 500, allocation: "برنامج الحقيبة المدرسية" });
const dr = AM(T, "bootstrap").data.records.find(r => r.no === sd.no);
ok(sd.ok && dr.g === 6 && dr.status === "جديد" && dr.f.amount === 500, "donation pledge recorded as new (not counted until approved)");
// --- multi-organisation platform
const nb = A.api(T, "bootstrap");
ok(nb.data.me.platform === true && nb.data.scope === "*" && nb.data.orgs.some(o => o.id === "main"), "supervisor is platform-level and sees all orgs");
ok(A.api(T, "create", { g: 6, m: 6, title: "x", date: today, f: { donor: "a", amount: 1 } }).message.includes("اختر مؤسسة"), "writes need a chosen org in all-orgs view");
const co = A.api(T, "saveOrg", { name: "جمعية البر بالمدينة", code: "BIRR", type: "جمعية خيرية", sector: "القطاع غير الربحي", vision: "مجتمع متكافل", mission: "خدمة الأسر", goals: "كفالة 500 أسرة", areas: "إغاثي، صحي، غير موجود، إغاثي", branches: "فرع قباء\nفرع العوالي", postal: "42311", city: "المدينة المنورة", manager: "أ. خالد", managerPhone: "0551234567", iban: "SA0380000000608010167519" });
ok(co.ok && co.data.admin.password && co.data.admin.username === "birr.admin", "org created with its admin and auto password");
ok(co.data.org.areas === "إغاثي، صحي" && co.data.org.vision === "مجتمع متكافل" && co.data.org.branches.includes("العوالي") && co.data.org.sector === "القطاع غير الربحي", "classification, vision, goals, areas and branches stored (areas validated and deduped)");
ok(A.api(T, "saveOrg", { name: "خريطة", code: "MAPX", mapUrl: "javascript:alert(1)" }).field === "mapUrl", "map link must be https");
const oid = co.data.org.id;
ok(A.api(T, "saveOrg", { name: "مكرر", code: "BIRR" }).field === "code", "org code must be unique");
ok(A.api(T, "saveOrg", { name: "سيئ", code: "9-AB" }).field === "code", "org code format enforced");
ok(A.api(T, "saveOrg", { name: "سيئ", code: "BADIBAN", iban: "123" }).field === "iban", "IBAN validated");
const mo = A.api(T, "saveOrg", { name: "جمعية الإحسان", code: "IHSAN", managerEmail: "ihsan@example.org", adminUsername: "ihsan.manager", adminPassword: "Ihsan2026ok", adminMustChange: false });
ok(mo.ok && mo.data.admin.username === "ihsan.manager" && mo.data.admin.password === "Ihsan2026ok" && mo.data.admin.emailed === true, "supervisor sets org admin username and password manually");
const wm = g.__mails.find(m => m.to === "ihsan@example.org");
ok(wm && wm.htmlBody.includes("ihsan.manager") && wm.htmlBody.includes("Ihsan2026ok") && wm.htmlBody.includes("https://script.google.com"), "credentials and link emailed to the org automatically");
ok(A.login("ihsan.manager", "Ihsan2026ok").data.mustChange === false, "manual password works without forced change");
ok(A.api(T, "saveOrg", { name: "ضعيفة", code: "WEAK", adminPassword: "123" }).field === "adminPassword", "manual admin password must follow policy");
const ne = A.api(T, "saveOrg", { name: "بلا بريد", code: "NOMAIL", sendEmail: false, managerEmail: "x@example.org" });
ok(ne.ok && ne.data.admin.emailed === false && !g.__mails.some(m => m.to === "x@example.org"), "email can be turned off");
const rse = A.api(T, "resetPassword", { username: "ihsan.manager", sendEmail: true });
ok(rse.data.emailed && g.__mails.filter(m => m.to === "ihsan@example.org").length === 2, "issued password emailed on request");
const oa = A.login("birr.admin", co.data.admin.password); const OT = oa.data.token;
A.api(OT, "changePassword", { current: co.data.admin.password, next: "Birr2026pass" });
const ob = A.api(OT, "bootstrap").data;
ok(ob.scope === oid && ob.records.length === 0 && ob.me.platform === false && ob.settings.orgName === "جمعية البر بالمدينة", "org admin sees only own empty org");
const orec = A.api(OT, "create", { g: 6, m: 6, title: "تبرع في البر", date: today, f: { donor: "محسن", amount: 700 } });
ok(orec.ok && orec.data.record.org === oid && /^DON-/.test(orec.data.record.no), "org record tagged with its org");
ok(!AM(T, "bootstrap").data.records.some(r => r.org === oid), "main org cannot see other org records");
ok(A.api(T, "bootstrap").data.records.some(r => r.org === oid), "supervisor all-orgs view sees every org");
ok(A.api(OT, "status", { id: AM(T, "bootstrap").data.records[0].id, status: "مكتمل" }).code === "NOTFOUND", "org cannot touch another org record");
ok(A.api(OT, "listUsers").data.every(u => u.org === oid), "org admin lists only own users");
ok(A.api(OT, "resetPassword", { username: "sara" }).code === "NOTFOUND", "org admin cannot reset other org passwords");
ok(A.api(OT, "listOrgs").code === "FORBIDDEN", "org admin cannot open the platform directory");
const nu = A.api(OT, "saveUser", { username: "birr.staff", name: "موظف البر", role: "contributor", depts: [] });
ok(nu.ok && A.api(OT, "listUsers").data.some(u => u.username === "birr.staff" && u.org === oid), "org admin creates users in own org");
ok(A.api(OT, "saveUser", { username: "sara", name: "خطف", role: "viewer" }).field === "username", "cannot take over another org username");
const lo = A.api(T, "listOrgs").data.find(o => o.id === oid);
ok(lo.stats.records === 1 && lo.stats.users === 2 && lo.stats.donations === 0, "directory stats per org");
const br = A.api(T, "bulkResetPasswords", { usernames: ["birr.admin", "birr.staff", "zubair"] });
ok(br.data.items.length === 2 && br.data.items[0].code === "BIRR", "supervisor issues passwords in bulk (not for self)");
const imp2 = A.api(T, "importOrgs", { rows: [{ name: "جمعية أ", code: "AAA" }, { name: "", code: "BBB" }, { name: "جمعية ج", code: "CCC", city: "جدة" }] });
ok(imp2.data.done.length === 2 && imp2.data.errors.length === 1 && imp2.data.done[0].password, "bulk import orgs with credentials and row errors");
ok(A.api(T, "setOrgStatus", { id: oid, status: "suspended" }).ok && A.login("birr.staff", "x").code !== "DISABLED", "suspend org");
{ const sl = A.login("birr.admin", br.data.items.find(i => i.username === "birr.admin").password); ok(sl.code === "DISABLED", "suspended org cannot log in " + JSON.stringify(sl)); }
A.api(T, "setOrgStatus", { id: oid, status: "active" });
ok(A.api(T, "setOrgStatus", { id: "main", status: "suspended" }).code === "VALIDATION", "main org cannot be suspended");
ok(A.api(T, "bootstrap", { __org: oid }).data.records.length === 1, "supervisor switches into an org");
const bpw = br.data.items.find(i => i.username === "birr.admin").password;
const OT2 = A.login("birr.admin", bpw).data.token; A.api(OT2, "changePassword", { current: bpw, next: "Birr2026pass2" });
ok(A.api(OT2, "savePrefs", { prefs: { home: { hidden: ["x"] } } }).ok && A.api(OT2, "bootstrap").data.prefs.home.hidden[0] === "x", "per-user layout prefs saved");
ok(A.api(OT2, "saveLayout", { layout: { home: { order: ["a"] } } }).ok && A.api(OT2, "bootstrap").data.settings.layout.home.order[0] === "a", "org default layout saved");
ok(AM(T, "bootstrap").data.settings.layout == null, "layout is per org");
const spb = A.sitePublic("BIRR");
ok(spb.ok && spb.code === "BIRR" && spb.org === "جمعية البر بالمدينة", "public site per org code");
const ss2 = A.siteSubmit({ org: "BIRR", type: "contact", name: "زائر البر", phone: "0551234567", message: "سلام عليكم" });
ok(ss2.ok && A.api(OT2, "bootstrap").data.records.some(r => r.no === ss2.no && r.g === 3), "visitor request lands in the right org");
// --- platform member (view-only across all orgs)
const pm = A.api(T, "saveUser", { username: "nafeth.member", name: "عضو منصة نافذ", role: "viewer", org: "*" });
ok(pm.ok && pm.data.password, "supervisor issues a view-only platform member account");
const PMT = A.login("nafeth.member", pm.data.password).data.token; A.api(PMT, "changePassword", { current: pm.data.password, next: "Member2026ok" });
const pmb = A.api(PMT, "bootstrap").data;
ok(pmb.me.member && !pmb.me.platform && pmb.scope === "*" && pmb.orgs.length >= 2 && pmb.records.some(r => r.org === oid), "member sees every org read-only");
ok(A.api(PMT, "listOrgs").ok && A.api(PMT, "saveOrg", { name: "x", code: "XX" }).code === "FORBIDDEN", "member reads the directory but cannot add orgs");
ok(A.api(PMT, "create", { __org: oid, g: 6, m: 6, title: "x", date: today, f: { donor: "a", amount: 1 } }).code === "FORBIDDEN", "member cannot create");
ok(A.api(PMT, "bootstrap", { __org: oid }).data.scope === oid, "member can switch into any org to view");
ok(A.api(PMT, "listUsers").code === "FORBIDDEN" && A.api(PMT, "savePrefs", { prefs: {} }).ok, "member cannot manage users but keeps own view prefs");
ok(pmb.records.filter(r => r.g === 10 && r.f && r.f.nid).every(r => String(r.f.nid).includes("*")), "member sees masked IDs");
ok(A.api(T, "saveUser", { username: "bad.member", name: "x", role: "contributor", org: "*" }).field === "role", "platform accounts cannot be contributors");
// --- user mobile number
const ph = A.api(T, "saveUser", { __org: "main", username: "with.phone", name: "صاحب جوال", role: "viewer", phone: "+966 55 123 4567" });
ok(ph.ok && ph.data.phone === "0551234567" && A.api(T, "listUsers").data.find(x => x.username === "with.phone").phone === "0551234567", "user mobile stored and normalised");
ok(A.api(T, "saveUser", { username: "bad.phone", name: "x", role: "viewer", phone: "123" }).field === "phone", "mobile validated");
ok(A.api(T, "saveOrg", { name: "جمعية الجوال", code: "PHONE", managerPhone: "0559876543" }).data.admin.phone === "0559876543", "org admin gets the manager mobile");
// --- second system manager (= general supervisor) with full platform powers
const sm = A.api(T, "saveUser", { username: "nafeth.manager", name: "مدير نظام ثانٍ", role: "admin", org: "*" });
const SMT = A.login("nafeth.manager", sm.data.password).data.token; A.api(SMT, "changePassword", { current: sm.data.password, next: "Manager2026ok" });
const smb = A.api(SMT, "bootstrap").data;
ok(smb.me.platform && smb.me.member && smb.scope === "*", "system manager is a full general supervisor");
ok(A.api(SMT, "saveOrg", { name: "جمعية من المدير الثاني", code: "SECOND" }).ok && A.api(SMT, "listOrgs").ok, "system manager adds orgs and reads directory");
// --- admin-issued passwords (manual / auto, optional forced change)
const mk = AM(T, "saveUser", { username: "pw.manual", name: "اختبار كلمة يدوية", role: "viewer", password: "Manual2026x", mustChange: false });
ok(mk.ok && mk.data.password === "Manual2026x" && mk.data.mustChange === false, "admin sets a chosen password on create");
const lm = A.login("pw.manual", "Manual2026x");
ok(lm.ok && lm.data.mustChange === false, "chosen password works without forced change");
ok(AM(T, "saveUser", { username: "pw.weak", name: "ضعيفة", role: "viewer", password: "123" }).field === "password", "weak chosen password rejected on its field");
const rs = AM(T, "resetPassword", { username: "pw.manual", password: "NewOne2026", mustChange: true });
ok(rs.ok && rs.data.mustChange === true && A.login("pw.manual", "NewOne2026").data.mustChange === true, "admin resets to a chosen password with forced change");
ok(AM(T, "resetPassword", { username: "pw.manual", password: "abc" }).code === "VALIDATION", "reset enforces password policy");
const ra = AM(T, "resetPassword", { username: "pw.manual" });
ok(ra.ok && ra.data.password.length >= 12 && A.login("pw.manual", ra.data.password).ok, "auto-generated reset still works");
// --- part permissions: website parts, templates and system theme
ok(AM(T, "saveUser", { username: "webby", name: "محرر الموقع", role: "contributor", depts: [3], password: "Webby2026pass", mustChange: false }).ok, "web contributor created");
const WT = A.login("webby", "Webby2026pass").data.token; const WM = (a, p) => A.api(WT, a, Object.assign({ __org: "main" }, p || {}));
let wb = WM("bootstrap").data;
ok(wb.me.parts["site.tpl"] === 1 && wb.me.parts["site.content"] === 2 && wb.me.parts["sys.theme"] === 0, "contributor default part levels");
ok(WM("saveTheme", { kind: "site", theme: { tpl: "oasis-arch" } }).code === "FORBIDDEN", "view-only template level cannot save");
ok(WM("saveTheme", { kind: "sys", theme: { tpl: "royal" } }).code === "FORBIDDEN", "system theme needs its own part");
ok(AM(T, "saveUser", { username: "webby", name: "محرر الموقع", role: "contributor", depts: [3], caps: { "site.tpl": 2, "site.content": 0, "bogus": 3 } }).ok, "admin sets part levels");
wb = WM("bootstrap").data;
ok(wb.me.parts["site.tpl"] === 2 && wb.me.parts["site.content"] === 0, "part levels applied (" + JSON.stringify(wb.me.parts) + ")");
ok(!wb.records.some(x => x.g === 3 && [0, 1, 4, 5, 7, 8, 9, 10].includes(x.m)), "hidden part's records are not sent");
ok(WM("create", { g: 3, m: 5, title: "خبر", date: today }).code === "FORBIDDEN", "cannot create in a hidden part");
const tdr = WM("saveTheme", { kind: "site", theme: { tpl: "andalus-banner", g: "#123456", gold: "red", radius: 99, order: ["news", "about"] } });
ok(tdr.ok && tdr.data.siteDraft.g === "#123456" && !tdr.data.siteDraft.gold && tdr.data.siteDraft.radius === undefined, "draft saved and sanitised");
ok(WM("saveTheme", { kind: "site", theme: { tpl: "andalus-banner" }, publish: true }).code === "FORBIDDEN", "publishing needs the publish level");
ok(AM(T, "saveTheme", { kind: "site", theme: { tpl: "lazuli-center", hero: "arch" }, publish: true }).ok, "admin publishes template");
ok(A.sitePublic("MAIN").theme.tpl === "lazuli-center", "public site receives published template");
ok(A.api(T, "saveTheme", { __org: "*", kind: "site", theme: { tpl: "x" } }).code === "VALIDATION", "template needs an organisation");
ok(AM(T, "saveTheme", { kind: "sys", theme: { tpl: "royal" } }).ok && AM(T, "bootstrap").data.settings.sysTheme.tpl === "royal", "admin sets system theme for org");
ok(AM(T, "saveTheme", { kind: "site", theme: null, publish: true }).ok && !A.sitePublic("MAIN").theme, "back to original template");
A.logout(ST);
ok(A.api(ST, "bootstrap").code === "AUTH", "logout ends session");
ok(A.api("forged-token", "bootstrap").code === "AUTH", "forged token rejected");
ok(AM(T, "emptyTrash").ok && AM(T, "clearSamples").ok, "admin cleanup");
console.log("server tests passed:", pass);
module.exports = {};
