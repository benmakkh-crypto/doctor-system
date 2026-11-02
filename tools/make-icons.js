// يولّد أيقونات تطبيق نافذ (PWA): node tools/make-icons.js
const sharp = require("sharp"), path = require("path");
const out = path.join(__dirname, "..", "app", "icons");
const star = (cx, cy, r, k = .78) => { let p = ""; for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + i * Math.PI / 8, rr = i % 2 ? r * k : r; p += (i ? "L" : "M") + (cx + rr * Math.cos(a)).toFixed(1) + " " + (cy + rr * Math.sin(a)).toFixed(1); } return p + "Z"; };
function svg(maskable) {
  const r = maskable ? 0 : 110, s = maskable ? .8 : 1, c = 256;
  let lat = ""; for (let y = -40; y < 560; y += 80) for (let x = -40; x < 560; x += 80) lat += `<path d="${star(x, y, 26)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><radialGradient id="g" cx="75%" cy="20%" r="95%"><stop offset="0" stop-color="#1a7a62"/><stop offset=".5" stop-color="#0b3f33"/><stop offset="1" stop-color="#05211b"/></radialGradient>
  <linearGradient id="gd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8e2a4"/><stop offset="1" stop-color="#c9a227"/></linearGradient></defs>
  <rect width="512" height="512" rx="${r}" fill="url(#g)"/>
  <g fill="none" stroke="#deb24e" stroke-opacity=".14" stroke-width="2">${lat}</g>
  <g transform="translate(${c} ${c}) scale(${s}) translate(${-c} ${-c})">
   <path d="${star(c, c, 190, .8)}" fill="none" stroke="#deb24e" stroke-width="5" stroke-opacity=".55"/>
   <path d="${star(c, c, 160, .8)}" fill="url(#gd)"/>
   <path d="${star(c, c, 132, .8)}" fill="none" stroke="#0b3f33" stroke-width="4" stroke-dasharray="10 9" stroke-opacity=".45"/>
   <text x="${c}" y="${c + 40}" text-anchor="middle" font-family="Amiri" font-size="190" font-weight="700" fill="#0b3f33">ن</text>
  </g></svg>`;
}
(async () => {
  for (const [n, m, sz] of [["icon-192.png", 0, 192], ["icon-512.png", 0, 512], ["maskable-512.png", 1, 512], ["maskable-192.png", 1, 192], ["apple-touch-icon.png", 1, 180], ["favicon-32.png", 0, 32]])
    await sharp(Buffer.from(svg(m))).resize(sz, sz).png().toFile(path.join(out, n));
  console.log("icons ok");
})();
