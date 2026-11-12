// Generates Android launcher icons, splash screens and Play Store graphics from assets/*.svg
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const res = 'android/app/src/main/res';
const icon = readFileSync('assets/icon.svg');
const fg = readFileSync('assets/icon-foreground.svg');
const BG = '#0A0F1A';

const legacy = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const fgSize = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

const mask = (size, round) =>
  Buffer.from(round
    ? `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`
    : `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.2}"/></svg>`);

for (const [d, s] of Object.entries(legacy)) {
  const dir = `${res}/mipmap-${d}`;
  mkdirSync(dir, { recursive: true });
  const base = await sharp(icon, { density: 300 }).resize(s, s).png().toBuffer();
  await sharp(base).composite([{ input: mask(s, false), blend: 'dest-in' }]).png().toFile(`${dir}/ic_launcher.png`);
  await sharp(base).composite([{ input: mask(s, true), blend: 'dest-in' }]).png().toFile(`${dir}/ic_launcher_round.png`);
  await sharp(fg, { density: 300 }).resize(fgSize[d], fgSize[d]).png().toFile(`${dir}/ic_launcher_foreground.png`);
}
writeFileSync(`${res}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);

// Splash: dark background, centred mark
async function splash(w, h, out) {
  const s = Math.round(Math.min(w, h) * 0.42);
  const mark = await sharp(fg, { density: 300 }).resize(s, s).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: '#070A10' } })
    .composite([{ input: mark, gravity: 'center' }]).png().toFile(out);
}
const ports = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [d, [w, h]] of Object.entries(ports)) {
  await splash(w, h, `${res}/drawable-port-${d}/splash.png`);
  await splash(h, w, `${res}/drawable-land-${d}/splash.png`);
}
await splash(480, 320, `${res}/drawable/splash.png`);

// Play Store assets
mkdirSync('store/graphics', { recursive: true });
await sharp(icon, { density: 300 }).resize(512, 512).flatten({ background: BG }).png().toFile('store/graphics/icon-512.png');
const feature = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <radialGradient id="a" cx="85%" cy="0%" r="80%"><stop offset="0" stop-color="#8b7cff" stop-opacity=".35"/><stop offset="1" stop-color="#8b7cff" stop-opacity="0"/></radialGradient>
    <radialGradient id="b" cx="0%" cy="100%" r="70%"><stop offset="0" stop-color="#5cf2e3" stop-opacity=".25"/><stop offset="1" stop-color="#5cf2e3" stop-opacity="0"/></radialGradient>
    <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="640" y1="120" x2="900" y2="380"><stop offset="0" stop-color="#7af7ea"/><stop offset="1" stop-color="#8b7cff"/></linearGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#ffffff" stroke-opacity=".04"/></pattern>
  </defs>
  <rect width="1024" height="500" fill="#070a10"/>
  <rect width="1024" height="500" fill="url(#grid)"/>
  <rect width="1024" height="500" fill="url(#a)"/><rect width="1024" height="500" fill="url(#b)"/>
  <g transform="translate(770 250)">
    <circle r="150" fill="none" stroke="url(#g)" stroke-opacity=".35" stroke-width="3"/>
    <circle r="195" fill="none" stroke="#5cf2e3" stroke-opacity=".14" stroke-width="2" stroke-dasharray="4 14"/>
    <g stroke="url(#g)" stroke-width="26" stroke-linecap="round" transform="translate(-770 -250)">
      <path d="M686 232v36"/><path d="M728 196v108"/><path d="M770 164v172"/><path d="M812 200v100"/><path d="M854 232v36"/>
    </g>
  </g>
  <text x="70" y="215" font-family="Inter" font-size="80" font-weight="700" letter-spacing="-1" fill="#e9eef6">Pre<tspan fill="#5cf2e3">Call</tspan></text>
  <text x="72" y="275" font-family="Inter, DejaVu Sans, sans-serif" font-size="32" fill="#9aa7ba">Mic &amp; camera test for calls</text>
  <text x="72" y="330" font-family="DejaVu Sans Mono, monospace" font-size="18" letter-spacing="3" fill="#5cf2e3">NOISE · CLARITY · TONE · ECHO · VIDEO</text>
</svg>`);
await sharp(feature).png().toFile('store/graphics/feature-graphic-1024x500.png');
console.log('icons done');
