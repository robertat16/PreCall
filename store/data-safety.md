# Data safety form: prepared answers

Play Console → Policy → App content → **Data safety**.

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **No** |
| Is all of the user data collected by your app encrypted in transit? | *(not asked when the answer above is No)* |
| Do you provide a way for users to request that their data is deleted? | *(not asked when the answer above is No)* |

Why "No" is correct: Google defines "collect" as transmitting data off the device. PreCall processes microphone and camera
input only in memory on the device, never transmits anything, and contains no SDKs that do. Test scores are stored
locally only (and excluded from backups). See Google's guidance: data processed only on the device is not "collected".

Permissions shown on the listing (no declaration forms needed):
- `RECORD_AUDIO`: mic test
- `CAMERA`: camera and video tests
- `BLUETOOTH_CONNECT` ("Nearby devices"): switch the mic to a Bluetooth headset
- `MODIFY_AUDIO_SETTINGS`: audio routing
- `INTERNET`: required by the WebView runtime; the app makes no network requests (enforced by its Content-Security-Policy)
