import { defineConfig } from '@playwright/test';

// Generates Play Store screenshots (1080x1920) into store/screenshots/raw. Run: npm run store:shots
const fixtures = `${process.cwd()}/tests/fixtures`;
export default defineConfig({
  testDir: 'tests/store',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4175',
    browserName: 'chromium',
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    permissions: ['microphone', 'camera'],
    launchOptions: {
      executablePath: process.env.CHROME_PATH || undefined,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${fixtures}/person.y4m`,
        `--use-file-for-fake-audio-capture=${fixtures}/voice-good.wav`,
      ],
    },
  },
  webServer: {
    command: 'npx vite preview --port 4175 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: true,
  },
});
