// Frames raw 1080x1920 captures (store/screenshots/raw) into captioned Play Store screenshots.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const shots = [
  ['home', 'Sound and look your best', 'A one-minute check before every call'],
  ['bt-card', 'Spots muffled Bluetooth', 'Know when your headset sounds like a phone line'],
  ['call-top', 'A scored test call', 'Hear yourself back, with clear fixes'],
  ['call-tone', 'See how your voice sounds', 'Tone, clarity, noise, hum and static'],
  ['compare', 'Compare headsets', 'Side by side, so you pick the best mic'],
  ['camera-report', 'Look sharp on video', 'Lighting, focus, color and framing'],
  ['check-summary', 'Ready in one minute', 'Mic, echo and camera in one score'],
  ['about', 'Private by design', 'Everything stays on your phone'],
];

const W = 1080, H = 1920;
const SW = 840; // screenshot width inside the frame
const SH = Math.round((SW / 1080) * 1920);
const TOP = 400;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

mkdirSync('store/screenshots/phone', { recursive: true });
let i = 0;
for (const [raw, title, sub] of shots) {
  i++;
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <radialGradient id="a" cx="90%" cy="0%" r="70%"><stop offset="0" stop-color="#8b7cff" stop-opacity=".32"/><stop offset="1" stop-color="#8b7cff" stop-opacity="0"/></radialGradient>
      <radialGradient id="b" cx="0%" cy="30%" r="60%"><stop offset="0" stop-color="#5cf2e3" stop-opacity=".22"/><stop offset="1" stop-color="#5cf2e3" stop-opacity="0"/></radialGradient>
      <pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#fff" stroke-opacity=".035"/></pattern>
    </defs>
    <rect width="${W}" height="${H}" fill="#070a10"/><rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect width="${W}" height="${H}" fill="url(#a)"/><rect width="${W}" height="${H}" fill="url(#b)"/>
    <text x="${W / 2}" y="190" text-anchor="middle" font-family="Inter" font-weight="700" font-size="${Math.min(76, Math.floor(1700 / title.length))}" letter-spacing="-1.5" fill="#e9eef6">${esc(title)}</text>
    <text x="${W / 2}" y="272" text-anchor="middle" font-family="Inter" font-size="40" fill="#9aa7ba">${esc(sub)}</text>
    <rect x="${(W - SW) / 2 - 3}" y="${TOP - 3}" width="${SW + 6}" height="${SH + 6}" rx="62" fill="none" stroke="#5cf2e3" stroke-opacity=".35" stroke-width="3"/>
  </svg>`);
  const mask = Buffer.from(`<svg width="${SW}" height="${SH}"><rect width="${SW}" height="${SH}" rx="58"/></svg>`);
  const screen = await sharp(`store/screenshots/raw/${raw}.png`).resize(SW, SH).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  await sharp(bg).composite([{ input: screen, left: (W - SW) / 2, top: TOP }]).flatten({ background: '#070a10' }).removeAlpha().png().toFile(`store/screenshots/phone/0${i}.png`);
}
console.log(`composed ${i} screenshots`);
