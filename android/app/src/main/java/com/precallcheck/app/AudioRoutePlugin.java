package com.precallcheck.app;

import android.Manifest;
import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.List;

/**
 * Lets the web layer see which microphones are connected and route call audio
 * to a Bluetooth, wired or built-in device before a test.
 */
@CapacitorPlugin(
    name = "AudioRoute",
    permissions = { @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "bluetooth") }
)
public class AudioRoutePlugin extends Plugin {

    private AudioManager audioManager() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    private boolean hasBluetoothPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return true;
        }
        return getPermissionState("bluetooth") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void requestBluetooth(PluginCall call) {
        if (hasBluetoothPermission()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("bluetooth", call, "bluetoothPermissionCallback");
    }

    @PermissionCallback
    private void bluetoothPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasBluetoothPermission());
        call.resolve(result);
    }

    @PluginMethod
    public void listInputs(PluginCall call) {
        AudioManager am = audioManager();
        JSArray inputs = new JSArray();
        if (am != null) {
            AudioDeviceInfo[] devices = am.getDevices(AudioManager.GET_DEVICES_INPUTS);
            for (AudioDeviceInfo device : devices) {
                JSObject o = new JSObject();
                o.put("id", device.getId());
                o.put("type", typeName(device.getType()));
                CharSequence name = device.getProductName();
                o.put("name", name != null ? name.toString() : "");
                inputs.put(o);
            }
        }
        JSObject result = new JSObject();
        result.put("inputs", inputs);
        result.put("bluetoothPermission", hasBluetoothPermission());
        call.resolve(result);
    }

    @PluginMethod
    public void useRoute(PluginCall call) {
        String route = call.getString("route", "default");
        AudioManager am = audioManager();
        JSObject result = new JSObject();
        if (am == null) {
            result.put("ok", false);
            call.resolve(result);
            return;
        }
        if ("default".equals(route)) {
            clearRoute(am);
            result.put("ok", true);
            call.resolve(result);
            return;
        }
        boolean ok;
        String deviceName = "";
        try {
            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                AudioDeviceInfo pick = pickCommunicationDevice(am, route);
                ok = pick != null && am.setCommunicationDevice(pick);
                if (pick != null && pick.getProductName() != null) {
                    deviceName = pick.getProductName().toString();
                }
            } else {
                ok = legacyRoute(am, route);
            }
        } catch (SecurityException e) {
            ok = false;
        } catch (IllegalArgumentException e) {
            ok = false;
        }
        result.put("ok", ok);
        result.put("device", deviceName);
        call.resolve(result);
    }

    private AudioDeviceInfo pickCommunicationDevice(AudioManager am, String route) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return null;
        }
        List<AudioDeviceInfo> devices = am.getAvailableCommunicationDevices();
        for (AudioDeviceInfo d : devices) {
            int t = d.getType();
            if ("bluetooth".equals(route) && (t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || t == AudioDeviceInfo.TYPE_BLE_HEADSET)) {
                return d;
            }
            if ("wired".equals(route) && (t == AudioDeviceInfo.TYPE_WIRED_HEADSET || t == AudioDeviceInfo.TYPE_USB_HEADSET)) {
                return d;
            }
            if ("builtin".equals(route) && t == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                return d;
            }
        }
        return null;
    }

    @SuppressWarnings("deprecation")
    private boolean legacyRoute(AudioManager am, String route) {
        if ("bluetooth".equals(route)) {
            am.setSpeakerphoneOn(false);
            am.startBluetoothSco();
            am.setBluetoothScoOn(true);
            return true;
        }
        am.setBluetoothScoOn(false);
        am.stopBluetoothSco();
        am.setSpeakerphoneOn("builtin".equals(route));
        return true;
    }

    @SuppressWarnings("deprecation")
    private void clearRoute(AudioManager am) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am.clearCommunicationDevice();
            } else {
                am.setBluetoothScoOn(false);
                am.stopBluetoothSco();
                am.setSpeakerphoneOn(false);
            }
            am.setMode(AudioManager.MODE_NORMAL);
        } catch (SecurityException e) {
            // Nothing to restore if we were never allowed to change it.
        }
    }

    @Override
    protected void handleOnDestroy() {
        AudioManager am = audioManager();
        if (am != null) {
            clearRoute(am);
        }
        super.handleOnDestroy();
    }

    private static String typeName(int type) {
        switch (type) {
            case AudioDeviceInfo.TYPE_BUILTIN_MIC:
                return "builtin_mic";
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
                return "bluetooth_sco";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
                return "wired_headset";
            case AudioDeviceInfo.TYPE_USB_DEVICE:
                return "usb_device";
            case AudioDeviceInfo.TYPE_USB_HEADSET:
                return "usb_headset";
            case 26: // AudioDeviceInfo.TYPE_BLE_HEADSET (API 31)
                return "ble_headset";
            case AudioDeviceInfo.TYPE_TELEPHONY:
                return "telephony";
            default:
                return "other_" + type;
        }
    }
}
