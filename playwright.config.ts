import { defineConfig, devices } from '@playwright/test';

const chromePath = process.env.CHROME_PATH || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ...devices['Pixel 7'],
    browserName: 'chromium',
    permissions: ['microphone', 'camera'],
    launchOptions: {
      executablePath: chromePath,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        `--use-file-for-fake-audio-capture=${process.cwd()}/tests/fixtures/voice-good.wav`,
      ],
    },
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
