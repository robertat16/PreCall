export interface ScreenCtx {
  root: HTMLElement;
  params: string[];
  nav: (path: string, replace?: boolean) => void;
  back: () => void;
  /** Aborted when the user leaves the screen. */
  signal: AbortSignal;
}

export type Screen = (ctx: ScreenCtx) => void | (() => void);

export function currentPath(): string {
  return location.hash.replace(/^#\/?/, '');
}
