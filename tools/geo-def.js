// التقسيم الجغرافي والانتخابي: 17 محافظة ← 27 ولاية ← 280 حيًّا محليًا ← 1297 قرية.
// كل مستوى يُنتخب ممثلوه من المستوى الذي تحته، ورئيس المجلس العام يُنتخب من ممثلي المحافظات.
// الأسماء مؤقتة (المحافظة 1، الولاية 1…) تُعدَّل من النظام أو تُستورد.
"use strict";
function spread(total, parts) { const b = Math.floor(total / parts), r = total % parts; return Array.from({ length: parts }, (_, i) => b + (i < r ? 1 : 0)); }
const p2 = n => String(n).padStart(2, "0"), p3 = n => String(n).padStart(3, "0"), p4 = n => String(n).padStart(4, "0");
module.exports = function geo() {
  const LV = { gov: 17, wil: 27, hay: 280, vil: 1297 };
  const wPer = spread(LV.wil, LV.gov), hPer = spread(LV.hay, LV.wil), vPer = spread(LV.vil, LV.hay);
  let w = 0, h = 0, v = 0;
  const govs = wPer.map((wn, gi) => ({
    id: "g" + p2(gi + 1), name: "المحافظة " + (gi + 1), type: "محافظة", code: "GOV-" + p2(gi + 1), meta: {}, children: Array.from({ length: wn }, () => {
      const wi = ++w, hn = hPer[wi - 1];
      return { id: "w" + p2(wi), name: "الولاية " + wi, type: "ولاية", code: "W-" + p2(wi), meta: {}, children: Array.from({ length: hn }, () => {
        const hi = ++h, vn = vPer[hi - 1];
        return { id: "h" + p3(hi), name: "الحي المحلي " + hi, type: "حي محلي", code: "D-" + p3(hi), meta: {}, children: Array.from({ length: vn }, () => { const vi = ++v; return { id: "v" + p4(vi), name: "القرية " + vi, type: "قرية", code: "V-" + p4(vi), meta: {}, children: [] }; }) };
      }) };
    })
  }));
  return { id: "geo", name: "الهيئة الانتخابية — المحافظات", type: "هيئة انتخابية", code: "GEO", meta: { "آلية الانتخاب": "تنتخب 1297 قرية ممثلي 280 حيًّا محليًا، وتنتخب الأحياء ممثلي 27 ولاية، وتنتخب الولايات ممثلي 17 محافظة، ويُنتخب رئيس المجلس العام من ممثلي المحافظات." }, children: govs };
};
