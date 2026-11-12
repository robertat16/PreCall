import { Capacitor, registerPlugin } from '@capacitor/core';

export type RouteKind = 'default' | 'bluetooth' | 'wired' | 'builtin';

export interface NativeInput {
  id: number;
  type: string;
  name: string;
}

interface AudioRoutePlugin {
  requestBluetooth(): Promise<{ granted: boolean }>;
  listInputs(): Promise<{ inputs: NativeInput[]; bluetoothPermission: boolean }>;
  useRoute(opts: { route: RouteKind }): Promise<{ ok: boolean; device?: string }>;
  openAppSettings(): Promise<void>;
}

const AudioRoute = registerPlugin<AudioRoutePlugin>('AudioRoute');

export const isNative = (): boolean => Capacitor.isNativePlatform();

export interface RouteOption {
  route: RouteKind;
  label: string;
  sub: string;
}

/** Inputs grouped the way a person thinks about them. Native Android only. */
export async function nativeRouteOptions(): Promise<RouteOption[] | null> {
  if (!isNative()) return null;
  try {
    const { inputs } = await AudioRoute.listInputs();
    const opts: RouteOption[] = [{ route: 'default', label: 'Automatic', sub: 'Let Android choose' }];
    const bt = inputs.find((i) => i.type === 'bluetooth_sco' || i.type === 'ble_headset');
    const wired = inputs.find((i) => i.type === 'wired_headset' || i.type === 'usb_headset');
    const builtin = inputs.find((i) => i.type === 'builtin_mic');
    if (bt) opts.push({ route: 'bluetooth', label: bt.name || 'Bluetooth headset', sub: 'Bluetooth mic' });
    if (wired) opts.push({ route: 'wired', label: wired.name || 'Wired headset', sub: wired.type === 'usb_headset' ? 'USB headset' : 'Headset jack mic' });
    if (builtin) opts.push({ route: 'builtin', label: 'Phone mic', sub: 'Built-in microphone' });
    return opts;
  } catch {
    return null;
  }
}

export async function useRoute(route: RouteKind): Promise<boolean> {
  if (!isNative()) return true;
  try {
    const r = await AudioRoute.useRoute({ route });
    if (route === 'bluetooth') {
      // SCO links take a moment to come up.
      await new Promise((res) => setTimeout(res, 900));
    }
    return r.ok;
  } catch {
    return false;
  }
}

export async function openAppSettings(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await AudioRoute.openAppSettings();
    return true;
  } catch {
    return false;
  }
}

export async function requestBluetoothPermission(): Promise<boolean> {
  if (!isNative()) return true;
  try {
    return (await AudioRoute.requestBluetooth()).granted;
  } catch {
    return false;
  }
}
