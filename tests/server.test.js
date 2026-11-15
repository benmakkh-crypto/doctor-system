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
ok(nv.order[0] === 6 && nv.order[1] === 10 && nv.order.length === A.SCHEMA_LEN, "order cleaned and completed");
ok(nv.d[6].n === "التبرعات والداعمون" && nv.d[6].c === "#123456" && !(nv.d[0] && nv.d[0].h), "dept override saved; dashboard cannot be hidden");
ok(nv.sec[6][0][2].join() === "6,7" && nv.sec[6][1][2].length === AM(T, "bootstrap").data.schema.G[6].items.length - 2, "sections dedupe and keep every module");
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
// حذف المؤسسة (أرشفة) واستعادتها، وترتيب المؤسسات
const ordBefore = AM(T, "listOrgs").data.map(o => o.id);
ok(ordBefore.length >= 2, "at least two organisations to order");
const rev = ordBefore.slice().reverse();
ok(AM(T, "orderOrgs", { ids: rev }).ok && JSON.stringify(AM(T, "listOrgs").data.map(o => o.id)) === JSON.stringify(rev), "organisations reordered");
const victim = rev.find(id => id !== "main");
ok(AM(T, "setOrgStatus", { id: victim, status: "archived" }).ok && !A.platformPublic().orgs.some(o => AM(T, "listOrgs").data.find(x => x.id === victim).code === o.code), "archived organisation hidden from the portal");
ok(AM(T, "setOrgStatus", { id: "main", status: "archived" }).code === "VALIDATION", "main organisation cannot be deleted");
ok(AM(T, "setOrgStatus", { id: victim, status: "active" }).ok, "archived organisation restored");
AM(T, "orderOrgs", { ids: ordBefore });
// مركز الحوكمة
const pdf = Buffer.from("%PDF-1.4 governance test").toString("base64");
let gv = AM(T, "govGet", { cycle: "2026" });
ok(gv.ok && gv.data.def.standards.length === 3 && gv.data.score.readyPct === 0, "governance centre loads with three standards");
gv = AM(T, "govUpload", { cycle: "2026", key: "gaMinutes", name: "محاضر.pdf", mime: "application/pdf", data: pdf });
const shared = gv.data.def.standards.flatMap(s => s.ind).filter(i => i.docs.includes("gaMinutes")).length;
ok(gv.ok && gv.data.docs.gaMinutes.has && shared >= 5 && gv.data.score.ready === gv.data.def.standards.flatMap(s => s.ind).reduce((a, i) => a + i.docs.filter(k => k === "gaMinutes").length, 0), "one upload satisfies every indicator that needs it");
ok(AM(T, "govUpload", { cycle: "2026", key: "nope", name: "x.pdf", mime: "application/pdf", data: pdf }).code === "VALIDATION", "unknown evidence rejected");
ok(AM(T, "govUpload", { cycle: "2026", key: "bylaws", name: "x.exe", mime: "application/x-msdownload", data: pdf }).code === "VALIDATION", "unsafe file type rejected");
ok(AM(T, "govFile", { cycle: "2026", key: "gaMinutes" }).data.data === pdf, "evidence downloads intact");
ok(AM(T, "govDocMeta", { cycle: "2026", key: "branches", na: true }).code === "VALIDATION" && AM(T, "govDocMeta", { cycle: "2026", key: "branches", na: true, naWhy: "لا فروع للجمعية" }).data.docs.branches.na, "not-applicable needs a reason");
gv = AM(T, "govAnswer", { cycle: "2026", ind: "C1", v: "full", note: "مكتمل" });
ok(gv.data.score.compPct === 100 && AM(T, "govAnswer", { cycle: "2026", ind: "C2", v: "part" }).data.score.compPct === 75, "self-assessment scored");
gv = AM(T, "govCopy", { from: "2026", to: "2027" });
ok(gv.data.copied === 2 && gv.data.docs.gaMinutes.has && !gv.data.ans.C1, "copy carries documents, not answers, to the new cycle");
gv = AM(T, "govCustomDoc", { cycle: "2026", title: "شهادة الجودة", g: "found" });
ok(Object.values(gv.data.lib).some(d => d.t === "شهادة الجودة"), "custom document added to the library");
ok(A.api(T, "govUpload", { __org: "*", cycle: "2026", key: "bylaws", name: "a.pdf", mime: "application/pdf", data: pdf }).code === "VALIDATION", "governance writes need an organisation");
ok(A.api(T, "govGet", { __org: "*", cycle: "2026" }).data.overview.some(o => o.readyPct > 0), "platform overview shows readiness per organisation");
// الهيكل التنظيمي
let tr = AM(T, "treeGet");
ok(tr.ok && tr.data.template && tr.data.tree.children.length === 3, "organisation structure starts from the ready template");
const t2 = JSON.parse(JSON.stringify(tr.data.tree)); t2.children[0].children.push({ name: "لجنة جديدة", type: "لجنة", code: "BOD-C99", meta: { "الاختصاص": "اختبار" }, children: [], evil: "<script>" });
tr = AM(T, "treeSave", { tree: t2, log: "إضافة لجنة" });
ok(tr.ok && tr.data.saved && tr.data.tree.children[0].children.some(c => c.code === "BOD-C99" && !c.evil), "structure saved and sanitised");
ok(AM(T, "treeGet").data.tree.children[0].children.length === t2.children[0].children.length, "structure persists per organisation");
ok(AM(T, "treeSave", { reset: "empty" }).data.tree.children.length === 0 && AM(T, "treeSave", { reset: "template" }).data.tree.children.length === 3, "structure can be reset");
{ const g0 = A.api(T, "treeGet", { __org: "*" }).data.tree; const g1 = JSON.parse(JSON.stringify(g0)); g1.children[0].children.push({ id: "gx", name: "لجنة عامة جديدة", type: "لجنة", children: [] });
  ok(A.api(T, "treeSave", { __org: "*", tree: g1, log: "t" }).ok, "platform supervisor edits the general structure");
  ok(A.api(T, "treeGet", { __org: "*" }).data.saved && A.api(T, "treeGet", { __org: "*" }).data.tree.children[0].children.some(c => c.id === "gx"), "general structure saved");
  const ap = A.api(T, "treeSave", { __org: "*", apply: "all" }); ok(ap.ok && ap.data.applied >= 1, "general structure applied to all organisations");
  ok(AM(T, "treeGet").data.tree.children[0].children.some(c => c.id === "gx"), "organisation received the general structure");
  ok(A.api(T, "treeSave", { __org: "*", reset: "template" }).ok, "general structure reset to the original template"); }
{ const t0 = JSON.parse(JSON.stringify(A.api(T, "treeGet", { __org: "*" }).data.tree)); t0.children = t0.children.filter(c => c.code !== "GEO"); t0.name = "المجلس العام";
  ok(A.api(T, "treeSave", { __org: "*", tree: t0 }).ok && !A.api(T, "treeGet", { __org: "*" }).data.tree.children.some(c => c.code === "GEO"), "general structure without the electoral branch");
  const ag = A.api(T, "treeSave", { __org: "*", addGeo: 1 }); ok(ag.ok && ag.data.tree.name === "المجلس العام" && ag.data.tree.children.some(c => c.code === "GEO"), "electoral branch added, existing edits kept");
  const cnt = {}; (function w(n) { cnt[n.type] = (cnt[n.type] || 0) + 1; n.children.forEach(w); })(ag.data.tree);
  ok(cnt["محافظة"] === 17 && cnt["ولاية"] === 27 && cnt["حي محلي"] === 280 && cnt["قرية"] === 1297, "17 governorates, 27 states, 280 districts, 1297 villages");
  ok(A.api(T, "treeSave", { __org: "*", addGeo: 1 }).code === "VALIDATION", "electoral branch not added twice");
  const v = JSON.parse(JSON.stringify(ag.data.tree)); v.children.find(c => c.code === "GEO").children[0].meta["عدد السكان"] = "120000"; v.children.find(c => c.code === "GEO").children[0].head = "ممثل المحافظة";
  ok(A.api(T, "treeSave", { __org: "*", tree: v }).data.tree.children.find(c => c.code === "GEO").children[0].meta["عدد السكان"] === "120000", "governorate fields saved");
  A.api(T, "treeSave", { __org: "*", reset: "template" }); }
{ const g = A.api(T, "treeGet", { __org: "*" }); ok(g.ok && g.data.general && g.data.tree.children.length === 3 && g.data.orgs.length >= 1 && g.data.orgs.every(o => typeof o.count === "number"), "platform view shows the general structure and the listed organisations"); }
const bomb = { name: "x", children: [] }; let cur = bomb; for (let i = 0; i < 30; i++) { const n = { name: "x" + i, children: [] }; cur.children.push(n); cur = n; }
ok(AM(T, "treeSave", { tree: bomb }).data.tree && true, "deep trees are truncated safely");
// بوابة المنصة وهوية الجهة القابلة للتعديل
const pp = A.platformPublic();
ok(pp.ok && pp.orgs.length >= 1 && pp.orgs.every(o => o.code && o.name && o.type) && Object.keys(pp.types).length >= 1, "platform portal lists organisations by type");
ok(!JSON.stringify(pp).includes("pwHash") && !JSON.stringify(pp).includes("email"), "portal exposes no private fields");
ok(AM(T, "saveSettings", { orgName: "", threshold: 5000, sod: false, notify: false, site: { url: "", city: "", phone: "", email: "", about: "نبذة", stats: true, aboutTitle: "مؤسسة تنموية رائدة", values: "الأمانة، الإتقان", commit: "شفافية تامة", tagline: "معًا للأثر" } }).ok, "admin saves site identity");
const prf = A.sitePublic("MAIN").profile;
ok(prf.aboutTitle === "مؤسسة تنموية رائدة" && prf.values === "الأمانة، الإتقان" && prf.commit === "شفافية تامة" && prf.tagline === "معًا للأثر", "public site receives editable identity");
ok(A.platformPublic().orgs.find(o => o.code === "MAIN").tagline === "معًا للأثر", "portal cache refreshed after save");
A.logout(ST);
ok(A.api(ST, "bootstrap").code === "AUTH", "logout ends session");
ok(A.api("forged-token", "bootstrap").code === "AUTH", "forged token rejected");
ok(AM(T, "emptyTrash").ok && AM(T, "clearSamples").ok, "admin cleanup");

// ===== إدارة العهد =====
{ let g = AM(T, "astGet"); ok(g.ok && g.data.set.depts.length && g.data.assets.length === 0, "custody module starts empty with default lists");
  const st0 = g.data.set; const loc = st0.locs[2].id, cat = st0.cats[0].id;
  ok(AM(T, "astSaveAsset", { item: { name: "" } }).code === "VALIDATION", "asset needs a name");
  let r = AM(T, "astSaveAsset", { item: { name: "حاسب محمول", cat, loc, sn: "SN-1" } }); ok(r.ok && r.data.assets[0].no === "A-0001" && r.data.assets[0].status === "store", "asset added with auto number in store");
  const aid = r.data.id; ok(AM(T, "astSaveAsset", { item: { name: "شاشة", cat, loc, sn: "SN-1" } }).code === "VALIDATION", "duplicate serial rejected");
  r = AM(T, "astSaveEmp", { item: { name: "موظف أول", dept: st0.depts[0].id, loc: st0.locs[0].id } }); const e1 = r.data.id; ok(r.ok && r.data.emps[0].no === "E-001", "employee added");
  const e2 = AM(T, "astSaveEmp", { item: { name: "موظف ثان" } }).data.id;
  ok(AM(T, "astMove", { type: "transfer", asset: aid, emp: e2 }).code === "VALIDATION", "cannot transfer an asset in store");
  ok(AM(T, "astMove", { type: "issue", asset: aid, emp: e1, date: "2026-11-10", due: "2026-11-01" }).code === "VALIDATION", "due date before issue rejected");
  r = AM(T, "astMove", { type: "issue", asset: aid, emp: e1, date: "2026-11-10", due: "2026-12-10", purpose: "مهام العمل" });
  let a = r.data.assets.find(x => x.id === aid); ok(r.ok && a.status === "custody" && a.holder === e1 && r.data.moves[0].type === "issue" && r.data.moves[0].no === "M-0002", "asset issued to employee");
  ok(AM(T, "astMove", { type: "issue", asset: aid, emp: e2 }).code === "VALIDATION", "cannot issue an asset already in custody");
  ok(AM(T, "astMove", { type: "transfer", asset: aid, emp: e1 }).code === "VALIDATION", "cannot transfer to the same holder");
  r = AM(T, "astMove", { type: "transfer", asset: aid, emp: e2, reason: "تغيير مهام" }); a = r.data.assets.find(x => x.id === aid); ok(a.holder === e2 && r.data.moves[0].from.emp === e1, "custody transferred");
  ok(AM(T, "astDelEmp", { id: e2 }).code === "VALIDATION", "employee with custody cannot be deleted");
  ok(AM(T, "astDelAsset", { id: aid }).code === "VALIDATION", "asset in custody cannot be deleted");
  r = AM(T, "astMove", { type: "return", asset: aid, status: "maint", loc: st0.locs[3].id, acc: ["كابل الطاقة"] }); a = r.data.assets.find(x => x.id === aid); ok(a.status === "maint" && !a.holder && r.data.moves[0].acc[0] === "كابل الطاقة", "custody returned to maintenance");
  r = AM(T, "astSaveAsset", { item: Object.assign({}, a, { name: "حاسب محمول Dell" }), status: "store" }); ok(r.data.assets.find(x => x.id === aid).status === "store" && r.data.moves[0].type === "status", "status change recorded as a movement");
  ok(AM(T, "astSet", { set: { aPre: "AS-", aNext: 50, warnDays: 10, depts: [{ id: "d1", n: "الإدارة العامة", c: "#123456" }] } }).data.set.aNext === 50, "settings saved");
  ok(AM(T, "astSaveAsset", { item: { name: "طابعة", cat, loc } }).data.assets[0].no === "AS-0050", "numbering follows settings");
  r = AM(T, "astSamples", {}); ok(r.ok && r.data.assets.filter(x => x.sample).length === 12 && r.data.moves.some(m => m.type === "transfer"), "explanatory sample data added");
  { const loc0 = r.data.set.locs.find(l => /مخزن/.test(l.n)).id; let c = AM(T, "astCount", { op: "start", loc: loc0 }); ok(c.ok && c.data.counts[0].status === "open" && Object.keys(c.data.counts[0].items).length > 0, "asset stocktake started for a location");
    const cid = c.data.id, ids = Object.keys(c.data.counts[0].items); ok(AM(T, "astCount", { op: "start", loc: loc0 }).code === "VALIDATION", "one open stocktake per location");
    ok(AM(T, "astCount", { op: "approve", id: cid, items: { [ids[0]]: { f: 1 } } }).code === "VALIDATION", "stocktake cannot be approved while items are unchecked");
    const it = {}; ids.forEach((k, i) => it[k] = { f: i === 0 ? 0 : 1, cond: i === 1 ? r.data.set.conds[1].id : undefined });
    c = AM(T, "astCount", { op: "approve", id: cid, items: it }); const a0 = c.data.assets.find(x => x.id === ids[0]), a1 = c.data.assets.find(x => x.id === ids[1]);
    ok(c.ok && c.data.counts[0].status === "approved" && a0.missing && a1.cond === r.data.set.conds[1].id && c.data.moves.some(m => m.type === "count"), "stocktake approved: missing flagged and condition updated");
    ok(AM(T, "astCount", { op: "save", id: cid, items: {} }).code === "VALIDATION", "approved stocktake is locked"); }
  ok(AM(T, "astSamples", { clear: 1 }).data.assets.every(x => !x.sample), "sample data cleared");
  ok(A.api(T, "astGet", { __org: "*" }).data.all === 1, "platform overview of custody per organisation");
  ok(A.api(T, "astMove", { __org: "*", type: "issue" }).code === "VALIDATION", "custody actions need an organisation"); }

// ===== طلبات الشراء =====
{ let g = AM(T, "prGet"); ok(g.ok && g.data.set.units.length && g.data.reqs.length === 0, "procurement starts empty with default lists");
  const S0 = g.data.set; let r = AM(T, "prSave", { item: { title: "" } }); ok(r.code === "VALIDATION", "request needs a description");
  r = AM(T, "prSave", { item: { title: "تجهيز أجهزة", dept: S0.depts[0].id, need: "2026-12-30", date: "2026-11-01", lines: [{ desc: "حاسب", unit: S0.units[0].id, qty: 2, asset: true }, { desc: "شاشة", qty: 4 }] } });
  ok(r.ok && r.data.reqs[0].status === "draft" && r.data.reqs[0].no === "PR-0001", "draft saved with number");
  const rid = r.data.id;
  ok(AM(T, "prSave", { item: { id: rid, title: "تجهيز أجهزة", dept: S0.depts[0].id, need: "2026-12-30", lines: [{ desc: "حاسب", qty: 2 }] }, submit: 1 }).code === "VALIDATION", "justification required on submit");
  r = AM(T, "prSave", { item: { id: rid, title: "تجهيز أجهزة", dept: S0.depts[0].id, need: "2026-12-30", date: "2026-11-01", just: "موظفون جدد", lines: [{ desc: "حاسب", unit: S0.units[0].id, qty: 2, asset: true, price: 4000 }, { desc: "شاشة", qty: 4 }] }, submit: 1 });
  ok(r.data.reqs[0].status === "pending", "request submitted for approval");
  ok(AM(T, "prSave", { item: { id: rid, title: "x" } }).code === "VALIDATION", "submitted request is locked");
  ok(AM(T, "prReceive", { id: rid, q: { 0: 1 } }).code === "VALIDATION", "cannot receive before approval");
  ok(AM(T, "prDecide", { id: rid, decision: "reject" }).code === "VALIDATION", "rejection needs a reason");
  r = AM(T, "prDecide", { id: rid, decision: "approve", approver: "المدير" }); ok(r.data.reqs[0].status === "supply", "approved goes to supply");
  r = AM(T, "prSup", { item: { name: "مورد أول", cat: S0.scats[0].id } }); const sid = r.data.id; ok(r.data.sups[0].no === "SUP-001", "supplier added");
  r = AM(T, "prSupply", { id: rid, sup: sid, newPo: 1, eta: "2026-12-01", officer: "مسؤول المشتريات" }); ok(r.data.reqs[0].sp.po === "PO-0001", "supply updated with purchase order");
  ok(AM(T, "prReceive", { id: rid, q: { 0: 5 } }).code === "VALIDATION", "cannot receive more than remaining");
  r = AM(T, "prReceive", { id: rid, q: { 0: 2, 1: 1 }, receiver: "أمين المستودع", toAssets: 1 }); ok(r.data.reqs[0].status === "partial" && r.data.rcv[0].no === "RC-0001" && r.data.assets === 2, "partial receipt registered and assets created");
  ok(AM(T, "astGet").data.assets.filter(a => /PR-0001/.test(a.note || "")).length === 2, "received items appear in the asset register");
  r = AM(T, "prReceive", { id: rid, q: { 1: 3 } }); ok(r.data.reqs[0].status === "closed", "request closes automatically when all lines received");
  ok(AM(T, "prDel", { id: rid }).code === "VALIDATION", "submitted requests cannot be deleted");
  ok(AM(T, "prSup", { del: sid }).ok, "supplier without open supply can be deleted");
  r = AM(T, "prSamples", {}); ok(r.ok && r.data.reqs.filter(x => x.sample).length === 8 && r.data.sups.length >= 5, "procurement sample data added");
  ok(AM(T, "prSamples", { clear: 1 }).data.reqs.every(x => !x.sample), "procurement sample data cleared");
  ok(A.api(T, "prGet", { __org: "*" }).data.all === 1, "platform overview of procurement"); }

// ===== العقود والالتزامات =====
{ let g = AM(T, "ctGet"); ok(g.ok && g.data.set.types.length && g.data.cts.length === 0, "contracts start empty");
  const S0 = g.data.set; let r = AM(T, "ctSet", { set: { parties: [{ n: "شركة أ" }], owners: [{ n: "مسؤول 1" }] } }); const P = r.data.set.parties[0].id, O = r.data.set.owners[0].id;
  ok(AM(T, "ctSave", { item: { title: "خدمات", party: P, start: "2026-12-01", end: "2026-11-01" } }).code === "VALIDATION", "end before start rejected");
  r = AM(T, "ctSave", { item: { title: "خدمات تشغيل", party: P, type: S0.types[0].id, start: "2026-01-01", end: "2027-01-01", value: 60000, owner: O } }); const cid = r.data.id; ok(r.data.cts[0].no === "CT-0001" && r.data.cts[0].status === "draft", "contract draft created");
  ok(AM(T, "ctInst", { id: cid, insts: [{ due: "2026-02-01", amount: 40000 }, { due: "2026-06-01", amount: 30000 }] }).code === "VALIDATION", "installments cannot exceed contract value");
  r = AM(T, "ctInst", { id: cid, insts: [{ due: "2026-02-01", amount: 30000 }, { due: "2026-06-01", amount: 30000 }] }); ok(r.data.cts[0].insts.length === 2 && r.data.cts[0].insts[0].no === "INS-0001", "installment schedule saved");
  ok(AM(T, "ctPay", { ct: cid, inst: r.data.cts[0].insts[0].id, amount: 100 }).code === "VALIDATION", "no payment before activation");
  r = AM(T, "ctSave", { item: { id: cid }, status: "active" }); ok(r.data.cts[0].status === "active", "contract activated");
  ok(AM(T, "ctSave", { item: { id: cid, title: "خدمات تشغيل", party: P, start: "2026-01-01", end: "2027-01-01", value: 99999 } }).code === "VALIDATION", "active contract value changes only via change request");
  const i1 = r.data.cts[0].insts[0].id; ok(AM(T, "ctPay", { ct: cid, inst: i1, amount: 31000 }).code === "VALIDATION", "payment cannot exceed installment remaining");
  r = AM(T, "ctPay", { ct: cid, inst: i1, amount: 15000, method: S0.methods[0].id }); ok(r.data.pays[0].no === "PAY-0001" && r.data.pays[0].amount === 15000, "partial payment recorded");
  r = AM(T, "ctOb", { item: { ct: cid, title: "تسليم تقرير", due: "2026-03-01", owner: O } }); const bid = r.data.id; ok(r.data.obs[0].no === "OBL-0001" && r.data.obs[0].status === "open", "obligation added");
  ok(AM(T, "ctOb", { item: { id: bid }, done: 1 }).code === "VALIDATION", "completion requires proof document");
  ok(AM(T, "ctOb", { item: { id: bid }, follow: "تم التواصل مع المورد" }).data.obs[0].fol.length === 1, "follow-up note recorded");
  ok(AM(T, "ctSave", { item: { id: cid }, status: "closed", note: "انتهاء" }).code === "VALIDATION", "cannot close with open obligations");
  r = AM(T, "ctChg", { item: { ct: cid, title: "تمديد", reason: "زيادة النطاق", delta: 5000, newEnd: "2027-03-01" }, submit: 1 }); const gid = r.data.id; ok(r.data.chgs[0].status === "pending" && r.data.cts[0].value === 60000, "change request does not alter the contract before approval");
  r = AM(T, "ctChg", { item: { id: gid }, decide: "approve", approver: "المدير" }); ok(r.data.cts[0].value === 65000 && r.data.cts[0].end === "2027-03-01" && r.data.chgs[0].status === "approved", "approved change updates value and end date");
  ok(AM(T, "ctDel", { id: cid }).code === "VALIDATION", "active contract cannot be deleted");
  r = AM(T, "ctSamples", {}); ok(r.ok && r.data.cts.filter(c => c.sample).length === 4 && r.data.chgs.some(x => x.sample), "contracts sample data added");
  ok(AM(T, "ctSamples", { clear: 1 }).data.cts.every(c => !c.sample), "contracts sample data cleared");
  ok(Array.isArray(AM(T, "ctGet").data.sups), "procurement suppliers available as contract parties");
  ok(A.api(T, "ctGet", { __org: "*" }).data.all === 1, "platform overview of contracts"); }
// حركة المخزون
{ let g = AM(T, "invGet"); ok(g.ok && g.data.set.units.length && g.data.items.length === 0, "inventory starts empty");
  const U = g.data.set.units, rz = U.find(u => u.n === "رزمة").id, mt = U.find(u => u.n === "متر").id;
  ok(AM(T, "invWh", { item: { name: "" } }).code === "VALIDATION", "warehouse needs a name");
  let r = AM(T, "invWh", { item: { name: "الرئيسي" } }); const W1 = r.data.id; ok(r.data.whs[0].code === "WH-001" && r.data.set.defWh === W1, "first warehouse becomes default");
  r = AM(T, "invWh", { item: { name: "الفرع" } }); const W2 = r.data.id;
  r = AM(T, "invItem", { item: { name: "ورق طباعة", unit: rz, reorder: 20 } }); const I1 = r.data.id; ok(r.data.items[0].code === "IT-0001", "item defined with code");
  r = AM(T, "invItem", { item: { name: "سلك", unit: mt } }); const I2 = r.data.id;
  ok(AM(T, "invMov", { item: { type: "in", item: I1, wh: W1, qty: 1.5, date: "2026-10-01", ref: "R1" }, post: 1 }).code === "VALIDATION", "unit decimals enforced");
  ok(AM(T, "invMov", { item: { type: "in", item: I2, wh: W1, qty: 10.25, date: "2026-10-01", ref: "R1" }, post: 1 }).ok, "decimal unit accepts decimals");
  ok(AM(T, "invMov", { item: { type: "in", item: I1, wh: W1, qty: 5, date: "2026-10-02" }, post: 1 }).code === "VALIDATION", "document reference required to post");
  r = AM(T, "invMov", { item: { type: "open", item: I1, wh: W1, qty: 100, date: "2026-10-01" }, post: 1 }); ok(r.ok && r.data.movs[0].status === "posted", "opening balance posted");
  ok(AM(T, "invMov", { item: { type: "open", item: I1, wh: W1, qty: 5, date: "2026-10-01" }, post: 1 }).code === "VALIDATION", "one opening balance per item and warehouse");
  ok(AM(T, "invMov", { item: { type: "out", item: I1, wh: W1, qty: 120, date: "2026-10-05", ref: "I1" }, post: 1 }).code === "VALIDATION", "negative balance prevented");
  ok(AM(T, "invMov", { item: { type: "out", item: I1, wh: W1, qty: 5, date: "2026-09-01", ref: "I0" }, post: 1 }).code === "VALIDATION", "back-dated issue before stock existed prevented");
  r = AM(T, "invMov", { item: { type: "out", item: I1, wh: W1, qty: 15, date: "2026-10-05", ref: "ISS-1" }, post: 1 }); const M1 = r.data.id;
  ok(AM(T, "invMov", { item: { id: M1, type: "out", item: I1, wh: W1, qty: 1, ref: "x" } }).code === "VALIDATION", "posted movement cannot be edited");
  ok(AM(T, "invMov", { item: { id: M1 }, del: 1 }).code === "VALIDATION", "posted movement cannot be deleted");
  r = AM(T, "invMov", { item: { id: M1 }, reverse: 1, note: "خطأ إدخال", date: "2026-10-06" }); ok(r.ok && r.data.movs[0].revOf === M1 && r.data.movs.find(m => m.id === M1).reversed, "documented reversal");
  ok(AM(T, "invMov", { item: { id: M1 }, reverse: 1, note: "مرة أخرى" }).code === "VALIDATION", "cannot reverse twice");
  r = AM(T, "invMov", { item: { type: "in", item: I1, wh: W1, qty: 3, date: "2026-10-07" } }); const D1 = r.data.id; ok(r.data.movs[0].status === "draft", "draft movement saved");
  ok(AM(T, "invMov", { item: { id: D1 }, del: 1 }).ok, "draft movement deleted");
  ok(AM(T, "invTr", { item: { from: W1, to: W1, lines: [{ item: I1, qty: 5 }] } }).code === "VALIDATION", "transfer needs two different warehouses");
  ok(AM(T, "invTr", { item: { from: W1, to: W2, date: "2026-10-08", lines: [{ item: I1, qty: 500 }] }, post: 1 }).code === "VALIDATION", "transfer cannot exceed source balance");
  g = AM(T, "invGet").data; ok(!g.trs.some(t => t.status === "posted") && g.movs.every(m => m.type !== "tout"), "failed transfer leaves no movements");
  r = AM(T, "invTr", { item: { from: W1, to: W2, date: "2026-10-08", lines: [{ item: I1, qty: 10 }] }, post: 1 }); const TR = r.data.id;
  ok(r.data.trs[0].status === "posted" && r.data.movs.filter(m => m.tr === TR).length === 2, "transfer posts two linked entries");
  ok(AM(T, "invItem", { item: { id: I1, name: "ورق طباعة", unit: U[0].id } }).code === "VALIDATION", "unit locked once item has movements");
  r = AM(T, "invCount", { item: { wh: W1, date: "2026-10-09", lines: [{ item: I1, actual: 87 }] } }); const C1 = r.data.id; ok(r.data.counts[0].lines[0].book === 90 && r.data.counts[0].lines[0].diff === -3, "count compares book with actual");
  ok(AM(T, "invCount", { item: { id: C1, wh: W1, date: "2026-10-09", lines: [{ item: I1, actual: 87 }] }, submit: 1 }).code === "VALIDATION", "difference needs a reason");
  r = AM(T, "invCount", { item: { id: C1, wh: W1, date: "2026-10-09", reason: "d1", lines: [{ item: I1, actual: 87 }] }, submit: 1 }); ok(r.data.counts[0].status === "pending" && !r.data.movs.some(m => m.cnt === C1), "pending count does not affect stock");
  r = AM(T, "invCount", { item: { id: C1 }, decide: "approve" }); ok(r.data.counts[0].status === "approved" && r.data.movs.some(m => m.cnt === C1 && m.type === "adjm" && m.qty === 3), "approved count posts adjustment");
  ok(AM(T, "invCount", { item: { id: C1 }, del: 1 }).code === "VALIDATION", "approved count cannot be deleted");
  ok(AM(T, "invItem", { item: { id: I1 }, del: 1 }).code === "VALIDATION", "item with movements cannot be deleted");
  ok(AM(T, "invWh", { item: { id: W1 }, del: 1 }).code === "VALIDATION", "warehouse with movements cannot be deleted");
  ok(AM(T, "invSet", { set: { units: U.filter(u => u.id !== mt) } }).code === "VALIDATION", "used unit cannot be removed");
  ok(AM(T, "invSet", { set: { noNeg: false, mPre: "MV-" } }).data.set.mPre === "MV-", "inventory settings saved");
  r = AM(T, "invSamples", {}); ok(r.ok && r.data.items.filter(i => i.sample).length === 12 && r.data.trs.some(t => t.sample) && r.data.counts.some(c => c.sample && c.status === "pending"), "inventory sample data added");
  r = AM(T, "invSamples", { clear: 1 }); ok(r.data.items.every(i => !i.sample) && r.data.whs.length === 2, "inventory sample data cleared");
  ok(A.api(T, "invGet", { __org: "*" }).data.all === 1, "platform overview of inventory"); }
// المصروفات التشغيلية
{ let g = AM(T, "exGet"); ok(g.ok && g.data.exps.length === 0 && g.data.set.depts.length, "expenses start empty");
  const D = g.data.set.depts[0].id, CL = g.data.set.classes[0].id, M = g.data.set.methods[0].id;
  let r = AM(T, "exCat", { kind: "cc", item: { n: "المبنى", dept: D } }); const CC = r.data.id; ok(r.data.set.ccs[0].code === "CC-001", "cost center added");
  ok(AM(T, "exCat", { item: { n: "مكتبية" } }).code === "VALIDATION", "category needs classification, cost center and owner");
  r = AM(T, "exSet", { set: { owners: [{ n: "مسؤول 1" }] } }); const OW = r.data.set.owners[0].id;
  r = AM(T, "exCat", { item: { n: "مستلزمات", cls: CL, cc: CC, owner: OW } }); const B = r.data.id; ok(r.data.set.cats[0].code === "BND-001", "expense category added");
  r = AM(T, "exSave", { item: { cat: B, amount: 1200, dept: D, desc: "احتياجات", date: "2026-10-29", due: "2026-10-31" }, submit: 1 }); ok(r.code === "VALIDATION", "invoice required before submit");
  r = AM(T, "exSave", { item: { cat: B, amount: 1200, dept: D, desc: "احتياجات", date: "2026-10-29", due: "2026-10-31" } }); const E = r.data.id; ok(r.data.exps[0].no === "EX-0001" && r.data.exps[0].status === "draft", "expense draft saved");
  ok(AM(T, "exSave", { item: { id: E, cat: B, amount: 1200, dept: D, desc: "احتياجات", date: "2026-10-29" }, submit: 1, hasFile: 1 }).data.exps[0].status === "pending", "expense submitted");
  ok(AM(T, "exPay", { exp: E, amount: 100, method: M }).code === "VALIDATION", "approval does not mean payment: pending cannot be paid");
  ok(AM(T, "exSave", { item: { id: E }, decide: "approve" }).code === "VALIDATION", "segregation of duties blocks self approval");
  ok(AM(T, "exSave", { item: { id: E }, decide: "reject" }).code === "VALIDATION", "rejection needs a reason");
  r = AM(T, "exSave", { item: { id: E }, decide: "approve", self: 1, date: "2026-10-30" }); ok(r.data.exps[0].status === "approved", "expense approved");
  ok(AM(T, "exPay", { exp: E, amount: 2000, method: M, date: "2026-10-30" }).code === "VALIDATION", "payment cannot exceed remaining");
  ok(AM(T, "exPay", { exp: E, amount: 100, method: M, date: "2026-10-01" }).code === "VALIDATION", "payment cannot precede approval");
  r = AM(T, "exPay", { exp: E, amount: 700, method: M, date: "2026-10-30" }); ok(r.data.pays[0].no === "PAY-0001", "partial payment recorded");
  ok(AM(T, "exSave", { item: { id: E }, del: 1 }).code === "VALIDATION", "expense with payments cannot be deleted");
  ok(AM(T, "exSave", { item: { id: E }, decide: "cancel", note: "x" }).code === "VALIDATION", "paid expense cannot be cancelled");
  ok(AM(T, "exCat", { item: { id: B }, del: 1 }).code === "VALIDATION", "used category cannot be deleted");
  r = AM(T, "exSamples", {}); ok(r.ok && r.data.exps.filter(e => e.sample).length === 12 && r.data.set.cats.some(c => c.sample), "expenses sample data added");
  r = AM(T, "exSamples", { clear: 1 }); ok(r.data.exps.length === 1 && !r.data.set.cats.some(c => c.sample), "expenses sample data cleared");
  ok(A.api(T, "exGet", { __org: "*" }).data.all === 1, "platform overview of expenses"); }
{ const o = AM(T, "opsGet"); ok(o.ok && o.data.tot.exp && o.data.tot.inv && o.data.tot.ctr && o.data.tot.purch && o.data.tot.assets, "operational summary for one org");
  const a = A.api(T, "opsGet", { __org: "*" }); ok(a.ok && a.data.all && a.data.orgs.length >= 1 && a.data.tot.exp, "operational summary across orgs"); }
// متابعة المهام
{ let g = AM(T, "tskGet"); ok(g.ok && g.data.tasks.length === 0 && g.data.set.sections.length, "tasks start empty");
  const S0 = g.data.set.sections; let r = AM(T, "tskSet", { set: { emps: [{ n: "أحمد", sec: S0[0].id }] } }); const E = r.data.set.emps[0].id;
  ok(AM(T, "tskSave", { item: { title: "" } }).code === "VALIDATION", "task needs a title");
  ok(AM(T, "tskSave", { item: { title: "مهمة", emp: E, section: S0[1].id } }).code === "VALIDATION", "employee must belong to the section");
  ok(AM(T, "tskSave", { item: { title: "مهمة", recvDate: "2026-10-10", due: "2026-10-01" } }).code === "VALIDATION", "due cannot precede receipt");
  r = AM(T, "tskSave", { item: { title: "اعتماد خطة", emp: E, recvDate: "2026-10-01", due: "2026-10-10" } }); const id = r.data.id; ok(r.data.tasks[0].ref === "000001" && r.data.tasks[0].section === S0[0].id, "task saved with auto reference and section from employee");
  r = AM(T, "tskSave", { item: { id, title: "اعتماد خطة", emp: E, recvDate: "2026-10-01", due: "2026-10-10", delivered: "2026-10-12", status: "doing" } }); ok(r.data.tasks[0].status === "done", "actual delivery completes the task");
  ok(AM(T, "tskSave", { item: { id, title: "اعتماد خطة", status: "cancel" } }).code === "VALIDATION", "cancel needs a reason");
  ok(AM(T, "tskSet", { set: { emps: [] } }).code === "VALIDATION", "used employee cannot be removed");
  r = AM(T, "tskSamples", {}); ok(r.data.tasks.filter(t => t.sample).length === 20, "tasks sample data added");
  r = AM(T, "tskSamples", { clear: 1 }); ok(r.data.tasks.length === 1, "tasks sample data cleared");
  ok(AM(T, "opsGet").data.tot.tsk.total === 1, "tasks in operational summary"); }
// المركبات وحركتها
{ let g = AM(T, "fltGet"); ok(g.ok && g.data.vehs.length === 0 && g.data.set.types.length, "fleet starts empty");
  const TY = g.data.set.types[2].id, LC = g.data.set.locs;
  ok(AM(T, "fltVeh", { item: { type: TY } }).code === "VALIDATION", "vehicle needs a plate");
  let r = AM(T, "fltVeh", { item: { plate: "أ ب ج 123", type: TY, odo0: 1000 } }); const V = r.data.id; ok(r.data.vehs[0].code === "VH-0001", "vehicle added");
  ok(AM(T, "fltVeh", { item: { plate: "أ ب ج 123", type: TY } }).code === "VALIDATION", "plate must be unique");
  r = AM(T, "fltDrv", { item: { name: "سائق 1" } }); const D = r.data.id; ok(r.data.drivers[0].code === "DR-001", "driver added");
  const base = { veh: V, driver: D, from: LC[0].id, to: LC[1].id };
  ok(AM(T, "fltTrip", { item: Object.assign({ outAt: "2026-10-30T09:00", outOdo: 900 }, base) }).code === "VALIDATION", "odometer cannot go below last reading");
  r = AM(T, "fltTrip", { item: Object.assign({ outAt: "2026-10-30T09:00", outOdo: 1000 }, base) }); const TR = r.data.id; ok(r.data.trips[0].status === "open" && r.data.trips[0].no === "TR-0001", "trip departure recorded");
  ok(AM(T, "fltTrip", { item: Object.assign({ outAt: "2026-10-30T10:00", outOdo: 1000 }, base) }).code === "VALIDATION", "no overlapping trips for vehicle");
  ok(AM(T, "fltTrip", { item: { id: TR, backAt: "2026-10-30T08:00", backOdo: 1100 }, back: 1 }).code === "VALIDATION", "return cannot precede departure");
  ok(AM(T, "fltTrip", { item: { id: TR, backAt: "2026-10-30T12:00", backOdo: 990 }, back: 1 }).code === "VALIDATION", "return odometer cannot be lower");
  r = AM(T, "fltTrip", { item: { id: TR, backAt: "2026-10-30T12:00", backOdo: 1120 }, back: 1 }); ok(r.data.trips[0].status === "done" && r.data.trips[0].dist === 120, "return computes distance");
  ok(AM(T, "fltFuel", { item: { veh: V, date: "2026-10-31", odo: 1050, liters: 20 } }).code === "VALIDATION", "fuel odometer cannot go back");
  ok(AM(T, "fltFuel", { item: { veh: V, date: "2026-10-31", odo: 1130, liters: 20, amount: 24, full: 1 } }).data.fuels[0].no === "FL-0001", "fuel recorded");
  r = AM(T, "fltMnt", { item: { veh: V, type: g.data.set.mtypes[0].id, due: "2026-11-01" } }); const M = r.data.id;
  r = AM(T, "fltMnt", { item: { id: M }, start: 1 }); ok(r.data.vehs[0].status === "maint", "starting maintenance puts vehicle in maintenance");
  ok(AM(T, "fltTrip", { item: Object.assign({ outAt: "2026-11-01T09:00", outOdo: 1130 }, base) }).code === "VALIDATION", "vehicle under maintenance cannot travel");
  r = AM(T, "fltMnt", { item: { id: M, done: "2026-11-02", cost: 300 }, done: 1 }); ok(r.data.vehs[0].status === "ready" && r.data.mnts[0].done, "completing maintenance frees vehicle");
  ok(AM(T, "fltVeh", { item: { id: V }, del: 1 }).code === "VALIDATION", "vehicle with records cannot be deleted");
  r = AM(T, "fltSamples", {}); ok(r.data.vehs.filter(v => v.sample).length === 6 && r.data.trips.some(t => t.status === "open"), "fleet sample data added");
  r = AM(T, "fltSamples", { clear: 1 }); ok(r.data.vehs.length === 1 && r.data.drivers.length === 1, "fleet sample data cleared");
  ok(AM(T, "opsGet").data.tot.flt.vehs === 1, "fleet in operational summary"); }
// المشاريع والمتابعة والداعمون والتأهيل
{ let g = AM(T, "pjGet"); ok(g.ok && g.data.projects.length === 0 && g.data.set.types.length && g.data.set.regions.length, "projects start empty");
  const s = g.data.set, base = { type: s.types[0].id, target: s.targets[0].id, region: s.regions[0].id, start: "2026-10-01", end: "2026-12-31", budget: 5000 };
  ok(AM(T, "pjSave", { item: Object.assign({}, base, { name: "" }) }).code === "VALIDATION", "project needs a name");
  ok(AM(T, "pjSave", { item: Object.assign({}, base, { name: "س", end: "2026-09-01" }) }).code === "VALIDATION", "end cannot precede start");
  let r = AM(T, "pjSave", { item: Object.assign({}, base, { name: "السلة الغذائية" }) }); const P = r.data.id; ok(r.data.projects[0].no === "001001" && r.data.projects[0].status === "plan", "project created with number");
  ok(AM(T, "pjSave", { item: Object.assign({}, base, { name: "السلة الغذائية" }) }).code === "VALIDATION", "project names are unique");
  r = AM(T, "pjSave", { item: Object.assign({}, base, { name: "الحقيبة المدرسية" }) }); const P2 = r.data.id;
  ok(AM(T, "pjLedger", { item: { kind: "out", pid: P, amount: 100, date: "2026-10-05" } }).code === "VALIDATION", "spending cannot exceed balance");
  r = AM(T, "pjLedger", { item: { kind: "in", pid: P, amount: 1000, date: "2026-10-05" } }); ok(r.data.ledger.length === 1, "income recorded");
  ok(AM(T, "pjLedger", { item: { kind: "in", pid: P, amount: 10, date: "2099-01-01" } }).code === "VALIDATION", "no future ledger dates");
  r = AM(T, "pjLedger", { item: { kind: "out", pid: P, amount: 300, date: "2026-10-06" } }); ok(r.data.projects.find(p => p.id === P).status === "run", "spending starts the project");
  r = AM(T, "pjLedger", { item: { kind: "tr", pid: P, to: P2, amount: 200, date: "2026-10-07" } }); ok(r.data.ledger.filter(e => e.tr).length === 2, "transfer creates two linked entries");
  ok(AM(T, "pjLedger", { item: { kind: "tr", pid: P, to: P2, amount: 900, date: "2026-10-07" } }).code === "VALIDATION", "transfer cannot exceed balance");
  r = AM(T, "pjTask", { item: { pid: P, title: "دراسة", phase: "prep", start: "2026-10-01", end: "2026-10-10" } }); const K1 = r.data.id;
  ok(AM(T, "pjTask", { item: { pid: P, title: "تنفيذ", start: "2026-10-05", end: "2026-10-20", dep: K1 } }).code === "VALIDATION", "dependent task starts after predecessor");
  ok(AM(T, "pjTask", { item: { pid: P, title: "x", start: "2026-10-10", end: "2026-10-01" } }).code === "VALIDATION", "task end before start rejected");
  r = AM(T, "pjTask", { item: { id: K1 }, move: "done" }); ok(r.data.tasks[0].pct === 100 && r.data.tasks[0].st === "done", "kanban move to done completes task");
  r = AM(T, "pjKpi", { item: { pid: P, n: "الأسر المستفيدة", target: 100, actual: 40 } }); const KP = r.data.id; r = AM(T, "pjKpi", { item: { id: KP, pid: P, n: "الأسر المستفيدة", target: 100, actual: 70 } }); ok(r.data.kpis[0].hist.length === 2, "kpi history kept");
  r = AM(T, "pjAct", { item: { pid: P, kind: "ben", title: "دفعة أولى", date: "2026-10-08", count: 12 } }); ok(r.data.acts[0].count === 12, "beneficiaries attached");
  ok(AM(T, "pjSave", { item: { id: P }, life: "delete", note: "x" }).code === "VALIDATION", "cannot delete project with balance");
  r = AM(T, "pjSave", { item: { id: P }, life: "complete" }); ok(r.data.projects.find(p => p.id === P).status === "done", "project completed");
  ok(AM(T, "pjLedger", { item: { kind: "in", pid: P, amount: 5, date: "2026-10-09" } }).code === "VALIDATION", "completed project takes no entries");
  ok(AM(T, "pjSave", { item: { id: P }, life: "reopen" }).code === "VALIDATION", "reopen needs a reason");
  r = AM(T, "pjSave", { item: { id: P }, life: "reopen", note: "استكمال" }); ok(r.data.projects.find(p => p.id === P).status === "run", "project reopened");
  r = AM(T, "pjSave", { item: { id: P2 }, life: "delete", note: "مكرر", force: 1 }); ok(r.data.projects.find(p => p.id === P2).deleted === 1, "project soft deleted");
  r = AM(T, "pjSave", { item: { id: P2 }, life: "restore" }); ok(!r.data.projects.find(p => p.id === P2).deleted, "project restored");
  // الداعمون
  ok(AM(T, "pjSup", { item: { name: "داعم", mobile: "0512" } }).code === "VALIDATION", "supporter mobile must be 05 + 8 digits");
  ok(AM(T, "pjSup", { item: { name: "شركة", mobile: "0551234567", taxable: 1, taxType: s.taxIds[0].id, taxNo: "123" } }).code === "VALIDATION", "VAT number format enforced");
  r = AM(T, "pjSup", { item: { name: "شركة الخير", mobile: "0551234567", taxable: 1, taxType: s.taxIds[0].id, taxNo: "300000000000003" } }); const SP = r.data.id; ok(r.data.sups[0].no === "001001", "supporter account added");
  ok(AM(T, "pjSup", { item: { name: "آخر", mobile: "0551234567" } }).code === "VALIDATION", "supporter mobile unique");
  r = AM(T, "pjSms", { to: [SP], text: "شكرًا لدعمكم" }); ok(r.data.sms.length === 1 && r.data.sms[0].n === 1, "sms logged");
  // التأهيل
  r = AM(T, "pjNeed", { item: { name: "نورة", idNo: "1023456781", cat: "ben" } }); const N = r.data.id; ok(r.data.needs[0].status === "need", "rehab candidate added");
  const rb = { rp: s.rhProjects[0].id, kind: s.rhKinds[0].id, need: N, name: "مشغل خياطة", place: "جدة", value: 1200, start: "2026-09-01", end: "2027-09-01", g: { name: "كافل", idNo: "1012345678", mobile: "0550000001" } };
  ok(AM(T, "pjRh", { item: rb }).code === "VALIDATION", "project requires qualified candidate");
  ok(AM(T, "pjNeed", { item: { id: N }, decide: "no" }).code === "VALIDATION", "negative opinion needs justification");
  r = AM(T, "pjNeed", { item: { id: N }, decide: "ok", note: "جدية" }); ok(r.data.needs[0].status === "ok", "candidate qualified");
  ok(AM(T, "pjRh", { item: Object.assign({}, rb, { inst: [{ due: "2026-10-01", amount: 500 }] }) }).code === "VALIDATION", "installments must equal loan value");
  r = AM(T, "pjRh", { item: Object.assign({}, rb, { inst: [{ due: "2026-10-01", amount: 600 }, { due: "2026-11-01", amount: 600 }] }) }); const RH = r.data.id, I1 = r.data.rh[0].inst[0].id; ok(r.data.rh[0].no === "RH-00001" && r.data.rh[0].person === "نورة", "rehab project registered");
  ok(AM(T, "pjRh", { item: Object.assign({}, rb) }).code === "VALIDATION", "one open rehab project per candidate");
  ok(AM(T, "pjRh", { item: { id: RH }, pay: { iid: I1, amount: 700, date: "2026-10-02" } }).code === "VALIDATION", "payment cannot exceed installment");
  r = AM(T, "pjRh", { item: { id: RH }, pay: { iid: I1, amount: 600, date: "2026-10-02" } }); ok(r.data.rh[0].inst[0].paid === 600, "installment paid");
  r = AM(T, "pjRh", { item: { id: RH }, pay: { iid: r.data.rh[0].inst[1].id, amount: 600, date: "2026-11-02" } }); ok(r.data.rh[0].status === "done", "fully paid project completes");
  ok(AM(T, "pjSet", { set: { rhKinds: [] } }).code === "VALIDATION", "used rehab kind cannot be removed");
  r = AM(T, "pjSamples", {}); ok(r.data.projects.filter(p => p.sample).length === 10 && r.data.rh.some(x => x.sample) && r.data.tasks.some(t => t.sample), "projects sample data added");
  r = AM(T, "pjSamples", { clear: 1 }); ok(r.data.projects.length === 2 && r.data.sups.length === 1 && r.data.rh.length === 1, "projects sample data cleared");
  ok(AM(T, "opsGet").data.tot.prj.total === 2, "projects in operational summary");
  ok(A.api(T, "pjGet", { __org: "*" }).data.all === 1, "platform overview of projects"); }
// الموقع الإلكتروني والعلاقات العامة والتواصل الخارجي
{ let g = AM(T, "wsGet"); ok(g.ok && g.data.c.pages.length === 44 && g.data.c.msgs.length === 20 && g.data.set.site.status === "on", "website starts with embedded pages and message templates");
  ok(AM(T, "wsSave", { col: "menu", item: { title: "الرئيسية" } }).code === "VALIDATION", "menu link required");
  ok(AM(T, "wsSave", { col: "menu", item: { title: "x", link: "javascript:alert(1)" } }).code === "VALIDATION", "unsafe links rejected");
  let r = AM(T, "wsSave", { col: "menu", item: { title: "الرئيسية", link: "/", icon: "home", subs: [{ t: "فرعي", link: "/a" }, { t: "" }] } }); const M1 = r.data.id; ok(r.data.c.menu[0].subs.length === 1, "menu item saved with sub links");
  r = AM(T, "wsSave", { col: "menu", item: { title: "اتصل بنا", link: "/contact" } }); const M2 = r.data.id;
  r = AM(T, "wsSave", { col: "menu", order: [M2, M1] }); ok(r.data.c.menu[0].id === M2, "menu reordered");
  r = AM(T, "wsSave", { col: "news", item: { title: "خبر", date: "2026-11-01", body: '<p onclick="x()">نص</p><script>alert(1)</script>' } }); ok(!/script|onclick/.test(r.data.c.news[0].body) && /نص/.test(r.data.c.news[0].body), "rich text sanitized");
  ok(AM(T, "wsSave", { col: "videos", item: { title: "v", yt: "https://example.com/v" } }).code === "VALIDATION", "youtube link validated");
  r = AM(T, "wsSave", { col: "shortlinks", item: { code: "Zakat", url: "/zakat" } }); ok(r.data.c.shortlinks[0].code === "zakat", "short link normalized");
  ok(AM(T, "wsSave", { col: "shortlinks", item: { code: "zakat", url: "/z" } }).code === "VALIDATION", "short link unique");
  ok(AM(T, "wsSave", { col: "pages", item: { title: "x" } }).code === "VALIDATION", "embedded pages cannot be added");
  const P0 = g.data.c.pages[0].id; r = AM(T, "wsSave", { col: "pages", item: { id: P0 }, status: true }); ok(r.data.c.pages.find(p => p.id === P0).hidden === true, "embedded page hidden");
  ok(AM(T, "wsSave", { col: "pages", item: { id: P0 }, del: 1 }).code === "VALIDATION", "embedded pages cannot be deleted");
  ok(AM(T, "wsSave", { col: "accounts", item: { name: "حساب", mobile: "0551234567", pw: "123" } }).code === "VALIDATION", "weak site password rejected");
  r = AM(T, "wsSave", { col: "accounts", item: { name: "نورهان", mobile: "0532426062", pw: "Secret2026" } }); ok(r.data.c.accounts[0].no === 23043301 && r.data.c.accounts[0].hasPw && !r.data.c.accounts[0].pwh && !r.data.c.accounts[0].salt, "site account saved with hidden password hash");
  ok(AM(T, "wsSave", { col: "accounts", item: { name: "آخر", mobile: "0532426062", pw: "Secret2026" } }).code === "VALIDATION", "site account mobile unique");
  ok(AM(T, "wsSave", { col: "visits", item: { cat: "جهات حكومية", side: "داخلية", title: "زيارة", place: "المقر", date: "2026-11-02" } }).code === "VALIDATION", "visit needs a team");
  r = AM(T, "wsSave", { col: "visits", item: { cat: "جهات حكومية", side: "داخلية", title: "زيارة", place: "المقر", date: "2026-11-02", team: "أحمد، سارة" } }); ok(r.data.c.visits[0].team.length === 2, "visit saved with team");
  ok(AM(T, "wsSave", { col: "partnerships", item: { side: "شركات", name: "ش", d1: "2026-11-02", d2: "2026-10-01" } }).code === "VALIDATION", "partnership end before start rejected");
  ok(AM(T, "wsSave", { col: "smslists", item: { title: "قائمة", nums: "0550000001\n12345" } }).code === "VALIDATION", "invalid numbers rejected");
  r = AM(T, "wsSave", { col: "smslists", item: { title: "قائمة", nums: "0550000001\n966550000002\n0550000001" } }); const SL = r.data.id; ok(r.data.c.smslists[0].nums.length === 2, "numbers normalized and deduplicated");
  r = AM(T, "wsSms", { list: SL, text: "مرحبًا" }); ok(r.data.sms[0].n === 2 && r.data.sms[0].src === "list", "sms to list logged");
  r = AM(T, "wsSms", { nums: "0560000001 0560000002", text: "تذكير" }); ok(r.data.sms[0].n === 2, "bulk sms logged");
  r = AM(T, "wsSave", { col: "contests", item: { title: "مسابقة", d1: "2026-10-01", d2: "2026-10-30", parts: [{ n: "أ", mobile: "0551110001" }, { n: "ب", mobile: "0551110002" }] } }); const CT = r.data.id;
  r = AM(T, "wsDraw", { id: CT, n: 1 }); ok(r.data.c.contests[0].winners.length === 1, "contest draw picks a winner");
  r = AM(T, "wsDraw", { id: CT, n: 5 }); ok(r.data.c.contests[0].winners.length === 2, "no duplicate winners");
  ok(AM(T, "wsDraw", { id: CT, n: 1 }).code === "VALIDATION", "draw stops when pool is empty");
  const mg = g.data.c.msgs[0].id; r = AM(T, "wsSave", { col: "msgs", item: { id: mg }, status: true, ch: "wa" }); ok(r.data.c.msgs.find(m => m.id === mg).wa === true, "message channel toggled");
  ok(AM(T, "wsSet", { key: "social", val: { gtm: "abc" } }).code === "VALIDATION", "GTM id validated");
  r = AM(T, "wsSet", { key: "site", val: { status: "maint", privacy: "<p>سياسة</p><img src=x onerror=alert(1)>" } }); ok(r.data.set.site.status === "maint" && !/onerror/.test(r.data.set.site.privacy), "site settings saved and sanitized");
  r = AM(T, "wsSet", { key: "store", val: { matrix: { don: { rep: { on: true, note: "خلال يومين" } } } } }); ok(r.data.set.store.matrix.don.rep.on === true && r.data.set.store.matrix.don.e.on === true, "payment matrix merged");
  r = AM(T, "wsSet", { key: "design", val: { primary: "#123456", home: ["news", "slider"] } }); ok(r.data.set.design.primary === "#123456" && r.data.set.design.home[0] === "news", "design saved");
  ok(AM(T, "wsSet", { key: "seo", val: { sitemap: "https://a.sa/\nnot-a-url" } }).code === "VALIDATION", "sitemap urls validated");
  r = AM(T, "wsSamples", {}); ok(r.data.c.menu.some(x => x.sample) && r.data.c.visits.some(x => x.sample), "website sample data added");
  r = AM(T, "wsSamples", { clear: 1 }); ok(r.data.c.menu.length === 2 && r.data.c.visits.length === 1, "website sample data cleared");
  ok(AM(T, "opsGet").data.tot.web.visits === 1, "website in operational summary");
  ok(A.api(T, "wsGet", { __org: "*" }).data.all === 1, "platform overview of website"); }
console.log("server tests passed:", pass);
module.exports = {};
