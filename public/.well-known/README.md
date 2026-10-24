# `.well-known` files (customer portal domain)

Deploy the window-app so these URLs are live on **`https://customer.gruen-power.cloud`**:

| File | URL | Used by |
|------|-----|---------|
| `assetlinks.json` | `/.well-known/assetlinks.json` | Android TWA (Play Store) |
| `apple-app-site-association` | `/.well-known/apple-app-site-association` | iOS App Store (universal links + associated domains) |

---

## Android — `assetlinks.json`

Used when you publish the window-app as an Android app (TWA) on the Google Play Store. It tells Android that your domain is linked to the app package so the app can open your PWA **without the URL bar or browser controls**.

**If this file is missing or has the wrong fingerprint,** users will see the green bar with the URL and share/menu icons.

**Setup (see `window-app-android/README.md` for full steps):**

1. In `window-app-android`, get SHA256: `keytool -list -v -keystore upload-keystore.jks -alias upload`
2. Add it: `npx bubblewrap fingerprint add "YOUR_SHA256"`
3. Generate: `npx bubblewrap fingerprint generateAssetLinks`
4. Copy `window-app-android/assetlinks.json` to this folder (overwrite this file).
5. Deploy the window-app.

---

## iOS — `apple-app-site-association`

Required for **Associated Domains** on the iOS app (`applinks:` and `webcredentials:` for `customer.gruen-power.cloud`).

**Before deploy — replace the placeholder:**

1. Open [Apple Developer](https://developer.apple.com/account) → **Membership** and copy your **Team ID** (10 characters).
2. In `apple-app-site-association`, replace **`YOUR_APPLE_TEAM_ID`** with that Team ID (both places).
   - Example: `AB12CD34EF.de.gruenpower.customerportal`
3. Bundle ID must stay **`de.gruenpower.customerportal`** (same as Xcode).

**After deploy, verify:**

```bash
curl -sI https://customer.gruen-power.cloud/.well-known/apple-app-site-association
```

- HTTP **200**
- Prefer `Content-Type: application/json` (Next.js `public/` serves it as a static file; if needed, add nginx header on the VPS).

**Apple validator:** [App Search API Validation Tool](https://search.developer.apple.com/appsearch-validation-tool/) — enter `customer.gruen-power.cloud`.

**Paths:** `"paths": ["*"]` opens all portal URLs in the native app when tapped from Mail/Messages etc. Tighten later if you only want specific routes.

---

## OneSignal (iOS + web)

Push uses **OneSignal** (not Firebase) with app ID `66bad4a7-c406-47b4-bd16-4e961d18988a`.

In the **OneSignal dashboard**, add/configure the **Apple iOS** platform for bundle ID `de.gruenpower.customerportal` and upload your **APNs Auth Key** (.p8) from Apple Developer → Keys.
