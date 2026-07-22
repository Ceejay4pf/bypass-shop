# Bypass Shop — Mobile app (Expo)

A thin native shell that loads the live Bypass Shop web app
(https://bypass-shop.vercel.app) full-screen. Everything in the web app —
login, inventory, quotations, PDF export — works inside it. Because it's a
wrapper, you never have to rebuild the app when the website updates: it always
loads the latest deployed version.

## Run it in Expo Go (test on your phone)

1. Install **Expo Go** from the Play Store / App Store on the phone.
2. On the computer, in this `mobile/` folder:
   ```
   npm install
   npx expo start
   ```
3. A QR code appears in the terminal.
   - **Android:** open Expo Go → Scan QR code.
   - **iPhone:** open the Camera app → point at the QR → tap the banner.
4. The app opens. The phone and computer must be on the **same Wi-Fi**.
   (If they're not, run `npx expo start --tunnel` instead.)

## Build a real installable app (.apk for Android)

Expo Go is only for testing. To hand phones an installed app that opens on its
own icon (no Expo Go needed):

1. Create a free account at https://expo.dev
2. In this folder:
   ```
   npm install -g eas-cli
   eas login
   eas build -p android --profile preview
   ```
3. EAS builds in the cloud and gives you a download link for the `.apk`.
   Send it to the shop phones and install.

For the Play Store / App Store use `--profile production` and follow the
`eas submit` steps.

## Change the URL

If the website address ever changes, edit `APP_URL` at the top of `App.js`.

## Icon / splash

Drop a 1024×1024 PNG at `assets/icon.png` before building. Until then Expo
uses a default icon (the app still runs fine in Expo Go without it).
