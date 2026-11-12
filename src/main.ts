import './styles.css';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { currentPath, type Screen } from './router';
import { aboutScreen } from './screens/about';
import { callScreen } from './screens/call';
import { cameraScreen } from './screens/camera';
import { checkScreen } from './screens/check';
import { compareScreen } from './screens/compare';
import { historyScreen, reportScreen } from './screens/history';
import { homeScreen } from './screens/home';
import { micScreen } from './screens/mic';
import { speakerScreen } from './screens/speaker';
import { videoScreen } from './screens/video';
import { clear } from './ui/dom';
import { activeStreams, releaseStream } from './audio/engine';
import { releaseRoute } from './screens/micflow';

const routes: Record<string, Screen> = {
  '': homeScreen,
  check: checkScreen,
  call: callScreen,
  mic: micScreen,
  speaker: speakerScreen,
  camera: cameraScreen,
  video: videoScreen,
  history: historyScreen,
  report: reportScreen,
  compare: compareScreen,
  about: aboutScreen,
};

const root = document.getElementById('app')!;
let cleanup: (() => void) | void;
let controller: AbortController | null = null;
let depth = 0;

function nav(path: string, replace = false) {
  const target = `#/${path}`;
  if (replace) {
    location.replace(target);
  } else {
    depth++;
    location.hash = target;
  }
}

function back() {
  if (depth > 0) {
    depth--;
    history.back();
  } else {
    location.replace('#/');
  }
}

function render() {
  try {
    if (typeof cleanup === 'function') cleanup();
  } catch {
    /* never block navigation */
  }
  controller?.abort();
  controller = new AbortController();
  const [name, ...params] = currentPath().split('/');
  const screen = routes[name] ?? homeScreen;
  clear(root);
  window.scrollTo({ top: 0 });
  cleanup = screen({ root, params, nav, back, signal: controller.signal });
  // move focus to the screen heading for screen readers
  const heading = root.querySelector('h1, h2') as HTMLElement | null;
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

window.addEventListener('hashchange', render);
// Stop media when the app is backgrounded (mic/camera must not stay open).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && activeStreams.size > 0) {
    [...activeStreams].forEach(releaseStream);
    void releaseRoute();
    render();
  }
});

if (Capacitor.isNativePlatform()) {
  void App.addListener('backButton', () => {
    if (currentPath() === '') void App.exitApp();
    else back();
  });
}

render();
