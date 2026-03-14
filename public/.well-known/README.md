# Digital Asset Links (for Play Store TWA)

`assetlinks.json` is used when you publish the window-app as an Android app (TWA) on the Google Play Store. It tells Android that your domain is linked to the app package so the app can open your PWA **without the URL bar or browser controls**—full app experience.

**If this file is missing or has the wrong fingerprint,** users will see the green bar with the URL (e.g. `app-roan.vercel.app`) and share/menu icons. Once asset links are correct and deployed, that bar disappears.

**Setup (see `window-app-android/README.md` for full steps):**

1. In `window-app-android`, get SHA256: `keytool -list -v -keystore android.keystore -alias android`
2. Add it: `npx bubblewrap fingerprint add "YOUR_SHA256"`
3. Generate: `npx bubblewrap fingerprint generateAssetLinks`
4. Copy `window-app-android/assetlinks.json` to this folder (overwriting this file).
5. Deploy the window-app so `https://your-domain/.well-known/assetlinks.json` is live.
