import type { Screen } from '../router';
import { topbar } from '../ui/components';
import { h } from '../ui/dom';
import { logo } from '../ui/icons';

declare const __APP_VERSION__: string;

export const aboutScreen: Screen = ({ root, back }) => {
  const sec = (title: string, ...paras: Array<string | HTMLElement>) =>
    h('div', { class: 'card legal' }, h('h3', null, title), ...paras.map((p) => (typeof p === 'string' ? h('p', null, p) : p)));
  root.append(
    topbar('About & privacy', back),
    h('main', { class: 'screen' },
      h('div', { class: 'card center' },
        h('div', { style: 'display:flex;justify-content:center;margin-bottom:8px' }, (() => { const l = logo(); l.classList.add('lg'); return l; })()),
        h('div', { style: 'font-family:var(--display);font-size:22px;font-weight:600' }, 'PreCall'),
        h('div', { class: 'small muted' }, `Mic & camera test · version ${__APP_VERSION__}`)),
      sec('Your privacy',
        'PreCall works entirely on your device. Audio and video are processed locally in memory to measure quality and are never uploaded, shared or sent anywhere. PreCall has no accounts, no ads and no analytics.',
        'Test results (scores and measurements, not recordings) are saved on your phone so you can view your history. You can delete them any time from the History screen, or by clearing the app’s storage.',
        'Recordings for playback exist only until you leave the result screen.'),
      sec('Permissions',
        'Microphone: to record and analyze your voice and background noise. Camera: to preview and analyze your video. Nearby devices (Bluetooth): only so PreCall can switch to your Bluetooth headset’s microphone when you choose it.'),
      sec('How scores work',
        'The test call measures your voice level, background noise, voice-to-noise ratio, clarity (audio bandwidth), tone balance, distortion, electrical hum, static and dropouts, then combines them into a 0–100 score. Narrowband audio (often a Bluetooth headset in hands-free mode) is capped at “Fair” because it noticeably reduces call quality.',
        'Scores are guidance, not lab measurements. Phones and call apps process audio differently, so test with the same headset and position you’ll use on the call.'),
      sec('Good to know',
        'The speaker test checks what your speakers or headphones can reproduce. It is not a hearing test, and PreCall is not a medical device.',
        'Questions or feedback: use the developer contact email on PreCall’s Google Play page.'),
      sec('Open-source',
        'Fonts: Inter, Space Grotesk and JetBrains Mono, licensed under the SIL Open Font License 1.1. Built with Capacitor (MIT).'),
      h('div', { class: 'footer-note' }, `© ${new Date().getFullYear()} PreCall. Made for better calls.`),
    ),
  );
};
