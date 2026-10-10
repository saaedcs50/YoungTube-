<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/3cc73573-4f3e-419f-9d9b-e6bc4273e519

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Android (Capacitor) & In-Place Updates

### 1. Build & Sync Web Bundle
Always build the web assets and synchronize them to the Android project before assembling an APK:
```bash
npm run build
npx cap sync android
# Or using the shorthand:
npm run cap:sync
```

### 2. Update Identity & Data Preservation Rules
Android treats a new APK as an **UPDATE (preserving local Dexie/IndexedDB databases, offline downloads, and parent preferences)** only when all three conditions are met:
1. **Identical `applicationId`**: Permanently fixed as `app.youngtube.app` in `capacitor.config.ts`, `android/app/build.gradle`, and `AndroidManifest.xml`.
2. **Matching Signing Certificate**: The APK must be signed with the same persistent release keystore.
3. **Monotonically Increasing `versionCode`**: Each subsequent release must have a higher `versionCode` (e.g. 2 -> 3 -> 4).

> **Important Migration Notice**: If an existing device has an APK installed that was signed with a previous ephemeral/debug key (e.g. default GitHub runner debug keystore), Android will block the first update with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. That device requires **one final uninstall** before installing the first APK signed with the permanent release keystore. **All future updates signed with the permanent key will install smoothly over the existing app without wiping data.**

### 3. Release Signing Setup (Local & CI)
1. Copy `android/signing.properties.example` to `android/signing.properties`:
   ```bash
   cp android/signing.properties.example android/signing.properties
   ```
2. Generate your permanent keystore (do this once and back it up safely):
   ```bash
   keytool -genkey -v -keystore android/youngtube-release.keystore -alias youngtube -keyalg RSA -keysize 2048 -validity 10000
   ```
3. Enter your passwords and keystore details in `android/signing.properties`:
   ```properties
   storeFile=youngtube-release.keystore
   storePassword=YourKeystorePassword
   keyAlias=youngtube
   keyPassword=YourKeyPassword
   ```
   *(Alternatively, provide `YOUNGTUBE_KEYSTORE_PATH`, `YOUNGTUBE_KEYSTORE_PASSWORD`, `YOUNGTUBE_KEY_ALIAS`, and `YOUNGTUBE_KEY_PASSWORD` as environment variables).*

4. Build the release APK:
   ```bash
   cd android
   ./gradlew assembleRelease -PversionCode=2 -PversionName="1.0.1"
   ```

5. Install or update on device without uninstalling:
   - Sideload directly by opening the APK on the Android device (tap "Update").
   - Or install via ADB:
     ```bash
     adb install -r app/build/outputs/apk/release/app-release.apk
     ```

