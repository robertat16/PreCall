# PreCall: Mic & Camera Test

Test your microphone, headset, speakers and camera before a call, then get clear fixes for anything that’s off.
Everything runs on the device; nothing is uploaded.

**Package:** `com.precallcheck.app` · **Platform:** Android (Capacitor 8, target SDK 36, min SDK 24)

## Features

| Feature | What it does |
| --- | --- |
| Full check | One-minute guided pass: mic, echo and camera combined into one call-readiness score |
| Echo test call | 3 s of silence, then 8 s of reading a sentence. You get a 0–100 score and can hear yourself back |
| Mic analysis | Voice level, background noise, voice-to-noise ratio, clarity / bandwidth (detects Bluetooth “hands-free” narrowband), tone balance (bass/mids/treble vs. a natural voice), distortion/clipping, 50/60 Hz hum, static & crackle, dropouts, echo leak |
| Live mic | Real-time level meter (with target zone and peak hold) and spectrum |
| Speakers | Left / right / both / bass tones and a 40 Hz → 18 kHz sweep of what your speakers/headphones reproduce |
| Camera | Resolution, frame rate, lighting, backlight, contrast, focus and color cast |
| Video test call | Record 10 s of video + audio and watch it back |
| Input routing | Android plugin switches the mic between Bluetooth, wired/USB and the built-in mic |
| History | Results (not recordings) saved locally for comparing headsets over time |

## Tech stack

- **Web app:** Vite + TypeScript, no UI framework. Fonts bundled locally (OFL).
- **Audio:** `getUserMedia` → `AudioWorklet` PCM capture (`public/recorder-worklet.js`), pure-TypeScript DSP (`src/audio/dsp.ts`, `src/audio/analysis.ts`).
- **Camera:** frame sampling to a small canvas and pixel statistics (`src/camera/`).
- **Native shell:** Capacitor 8 (`android/`), plus a custom `AudioRoute` plugin (`android/app/src/main/java/com/precallcheck/app/AudioRoutePlugin.java`).

```
src/
  audio/      dsp.ts (FFT, Welch PSD…) · analysis.ts (scoring) · engine.ts (mic, recording, tones)
  camera/     analysis.ts (frame metrics, scoring) · engine.ts (camera, sampler, recorder)
  native/     audioRoute.ts (JS bridge to the Android plugin)
  screens/    one file per screen (home, check, call, mic, speaker, camera, video, history, about)
  ui/         dom helpers, icons, shared components
  store.ts    localStorage settings + history
tests/
  unit/       DSP + scoring tests with synthetic signals (vitest)
  e2e/        full user flows in Chromium with fake mic/camera (Playwright)
  fixtures/   synthetic voice recordings (normal and Bluetooth-narrowband)
android/      Capacitor Android project
assets/       source SVGs for the app icon
scripts/      make-icons.mjs (launcher icons, splash, store graphics), store screenshots
store/        Play Store listing text, graphics, screenshots, data-safety answers
docs/         privacy policy + landing page (published with GitHub Pages)
```

## Develop

```bash
npm ci
npm run dev          # http://localhost:5173 (use Chrome; allow mic/camera)
npm test             # unit tests
npm run build        # typecheck + production build into dist/
npm run test:e2e     # end-to-end tests (needs `npx playwright install chromium` once)
npm run icons        # regenerate Android icons, splash screens and store graphics from assets/
```

Run on a phone (needs Android Studio):

```bash
npm run sync         # build web app and copy into android/
npx cap open android # then press Run in Android Studio
```

## Build & release (automatic)

Every push to `main` runs **.github/workflows/android.yml**:

1. Typecheck, unit tests, production build, end-to-end tests (screenshots uploaded as an artifact).
2. Android build:
   - With signing secrets → signed **`app-release.aab`** (for Play) and **`app-release.apk`**.
   - Without secrets → `app-debug.apk` (installable for testing).
3. Download the files from the workflow run’s **Artifacts** section.

`versionCode` = 1000 + run number × 10 + attempt (always increases, even on re-runs). `versionName` comes from `package.json`.

Pushing a tag like `v1.0.1` (or publishing a GitHub Release with that tag) also attaches the AAB/APK to the release and, if `PLAY_SERVICE_ACCOUNT_JSON` is set, uploads the bundle to Google Play as a draft on the chosen track (default: closed testing).

### Repository secrets

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64 of the upload keystore (`precall-upload.jks.base64`) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password (also used as the key password) |
| `ANDROID_KEY_ALIAS` | `precall-upload` |
| `PLAY_SERVICE_ACCOUNT_JSON` | *(optional)* Google Play service-account JSON for automatic uploads |

> Keep the upload keystore and its password backed up somewhere safe (a password manager). With Play App Signing, a lost upload key can be reset through Play support, but it’s a hassle.

### Shipping an update

1. Bump `version` in `package.json` (e.g. `1.0.1`) and add a line to `CHANGELOG.md`.
2. Commit and push to `main`, then tag: `git tag v1.0.1 && git push --tags`.
3. Upload the AAB from the release (or let the Play upload step do it), then promote it in Play Console.

## Privacy

No accounts, ads, analytics or network calls. Audio/video stay in memory and are discarded after each test.
Only scores/measurements are stored locally. See [`docs/privacy.html`](docs/privacy.html).
