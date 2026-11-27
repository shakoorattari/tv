# Strand TV for Android TV

The launcher opens https://shakoorattari.com/tv/ in Android System WebView. Use a TV with Android 6.0 or later and an up-to-date WebView. Open the app online once to prepare offline startup. Saved direct videos are available from **Offline**. Google sign-in on Android TV requires Android 14 or later and compatible Google Play services. See the [Firebase setup guide](../docs/DEVELOPMENT.md#enable-google-profiles-and-sync). Back closes fullscreen video or a dialog, retraces navigation, then exits. External providers use an installed app when available.

After a reviewed merge to main, download strand-tv.apk using the website footer. Transfer it to a TV you own or administer, open it with the TV’s file manager, and follow the device’s installation prompts. Future release APKs use the same application ID and signing certificate.

Build locally with JDK 17, Gradle 8.9 and the Android SDK (platform 35). Run `gradle --project-dir android :app:assembleDebug` from the repository root. PR builds attach a separately signed preview package with a distinct application ID. Production signing uses the TV_KEYSTORE and TV_KEY_PASSWORD secrets on the main-only github-pages environment.
