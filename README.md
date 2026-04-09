# Trollii — Deployment Guide

Smart meal planning, live supermarket prices, and AI-powered budget tracking. This project is a React + Vite web app wrapped with Capacitor to deploy as native iOS and Android apps from a single codebase.

## What you get

- **Web app** at www.trolliiapp.com (hosted on Vercel)
- **iOS app** for the Apple App Store
- **Android app** for Google Play Store

All three share 95% of the same codebase.

---

## Project structure

```
trollii/
├── api/
│   └── anthropic.js          # Vercel serverless proxy for Claude API
├── public/
│   ├── icon.svg              # Source logo
│   ├── icon-192.png          # PWA icon
│   ├── icon-512.png          # PWA icon
│   ├── icon-1024.png         # App store icon
│   ├── apple-touch-icon.png  # iOS home screen
│   └── manifest.json         # PWA manifest
├── src/
│   ├── main.jsx              # React entry + Capacitor native setup
│   └── App.jsx               # Full Trollii app (meal planning, shopping list, AI)
├── capacitor.config.ts       # Capacitor native config
├── vite.config.js            # Vite bundler config
├── index.html                # HTML shell
├── package.json              # Dependencies and scripts
└── .env.example              # Env var template
```

---

## Prerequisites

Before starting, install these on your machine:

- **Node.js 20 or newer** — https://nodejs.org
- **Git** — https://git-scm.com
- **For iOS builds:** Mac with Xcode 15+ and CocoaPods (`sudo gem install cocoapods`)
- **For Android builds:** [Android Studio](https://developer.android.com/studio) with SDK 34+
- **Accounts:**
  - [Vercel](https://vercel.com) (free) for web hosting
  - [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
  - [Google Play Console](https://play.google.com/console) ($25 one-time)
  - [Anthropic Console](https://console.anthropic.com) for your API key
  - [GitHub](https://github.com) (free) — recommended for CI deploys

---

## Part 1 — Initial setup

### 1.1 Clone and install

```bash
# From the folder containing this project
cd trollii
npm install
```

### 1.2 Configure environment variables

Copy the template and add your Anthropic API key:

```bash
cp .env.example .env
```

Edit `.env` and set:

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

**Important:** never commit `.env` to Git. The `.gitignore` file excludes it.

### 1.3 Test locally

```bash
npm run dev
```

Open http://localhost:5173 — you should see Trollii running. The AI/pricing features won't work locally until you set up the Vercel dev environment (see Part 2).

---

## Part 2 — Deploy the web app to Vercel

### 2.1 Push to GitHub

```bash
git init
git add .
git commit -m "Initial Trollii commit"
git branch -M main
# Create a new repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/trollii.git
git push -u origin main
```

### 2.2 Import project on Vercel

1. Go to https://vercel.com/new
2. Click **Import** next to your `trollii` GitHub repo
3. Framework preset will auto-detect as **Vite**
4. Before clicking Deploy, expand **Environment Variables** and add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your Anthropic API key
5. Click **Deploy**

After about 90 seconds you'll get a URL like `trollii.vercel.app`.

### 2.3 Connect your custom domain

1. In the Vercel project dashboard, go to **Settings → Domains**
2. Add `www.trolliiapp.com` and `trolliiapp.com`
3. Vercel will show DNS records you need to add at your domain registrar:
   - An **A record** for the root domain (`@`) pointing to `76.76.21.21`
   - A **CNAME record** for `www` pointing to `cname.vercel-dns.com`
4. Wait 5–60 minutes for DNS propagation
5. Vercel will automatically issue an SSL certificate

Your web app is now live at https://www.trolliiapp.com.

---

## Part 3 — Build the iOS app

### 3.1 Initialize Capacitor iOS platform

On a Mac:

```bash
cd trollii
npm run build
npx cap add ios
npx cap sync ios
```

This creates an `ios/` folder containing a native Xcode project.

### 3.2 Configure the iOS project

Open Xcode:

```bash
npx cap open ios
```

In Xcode:

1. Select the **App** project in the sidebar
2. Under **Signing & Capabilities**:
   - Check **Automatically manage signing**
   - Select your Apple Developer team
3. Under **General → Identity**:
   - **Display Name:** Trollii
   - **Bundle Identifier:** `app.trollii` (must match `capacitor.config.ts`)
   - **Version:** 1.0.0
   - **Build:** 1
4. Under **General → App Icons and Launch Screen**:
   - Drag `public/icon-1024.png` into the AppIcon asset set, then use Xcode's icon generator or a tool like [appicon.co](https://appicon.co) to generate all required sizes
5. **Info.plist** — add these usage descriptions (Xcode → App → Info tab):
   - `NSLocationWhenInUseUsageDescription`: "Trollii uses your location to automatically set the correct currency and suggest nearby supermarkets."

### 3.3 Test on simulator and device

```bash
# In Xcode, pick a simulator and press the play button
# Or run on a connected device:
npx cap run ios
```

### 3.4 Submit to App Store

1. In Xcode: **Product → Archive**
2. Once archived, **Distribute App → App Store Connect → Upload**
3. Go to https://appstoreconnect.apple.com
4. Create a new app with bundle ID `app.trollii`
5. Fill in the listing:
   - **App name:** Trollii
   - **Subtitle:** Smart meal planning & budgeting
   - **Description:** (write a compelling 200-word description)
   - **Keywords:** meal planning, grocery, budget, shopping list, recipes
   - **Category:** Food & Drink (Primary), Lifestyle (Secondary)
   - **Screenshots:** you need at least 6.7" (iPhone Pro Max) and 5.5" sizes
   - **Privacy Policy URL:** required — host at trolliiapp.com/privacy
6. **Submit for Review**

Apple review typically takes 1–3 days.

---

## Part 4 — Build the Android app

### 4.1 Initialize Capacitor Android platform

```bash
cd trollii
npm run build
npx cap add android
npx cap sync android
```

This creates an `android/` folder containing a native Gradle project.

### 4.2 Configure in Android Studio

```bash
npx cap open android
```

In Android Studio:

1. Wait for Gradle sync to finish
2. Open `android/app/src/main/AndroidManifest.xml` and verify:
   - `<uses-permission android:name="android.permission.INTERNET" />` is present
   - `<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />` for geolocation
3. Open `android/app/build.gradle` and set:
   - `applicationId "app.trollii"`
   - `versionCode 1`
   - `versionName "1.0.0"`
4. **App icons:** right-click `android/app/src/main/res` → New → Image Asset → choose `public/icon-1024.png`

### 4.3 Test on emulator and device

In Android Studio, click the green play button. Choose an emulator or connected device.

### 4.4 Build a signed release bundle

1. **Build → Generate Signed Bundle / APK**
2. Choose **Android App Bundle (.aab)** — required for Play Store
3. Create a new keystore (save this file somewhere safe — you cannot recover it):
   - Keystore path: `~/trollii-release.keystore`
   - Password: strong password
   - Alias: `trollii`
4. Choose **release** variant and finish
5. The `.aab` file appears in `android/app/release/`

### 4.5 Submit to Google Play

1. Go to https://play.google.com/console
2. **Create app** with:
   - **App name:** Trollii
   - **Default language:** English (UK)
   - **App or game:** App
   - **Free or paid:** Free
3. Complete the required sections in the dashboard:
   - Store listing (description, screenshots, feature graphic 1024×500)
   - Content rating questionnaire
   - Target audience and content
   - Data safety form
   - Privacy policy URL
4. **Production → Create new release**
5. Upload your `.aab` file
6. **Review release → Start rollout to Production**

Google review typically takes a few hours to a day.

---

## Part 5 — Ongoing development

### Updating the web app

```bash
# Make changes in src/App.jsx
git add .
git commit -m "Your changes"
git push
```

Vercel auto-deploys every push to `main`.

### Updating the iOS/Android apps

```bash
# After making changes
npm run build
npx cap sync

# Then open the native project and rebuild
npx cap open ios      # or
npx cap open android
```

Each new version needs a bumped version number:

- **iOS:** Xcode → General → Version/Build
- **Android:** `android/app/build.gradle` → versionCode (+1) and versionName

Then archive/upload as before.

---

## Part 6 — Required legal documents

Both Apple and Google require a **privacy policy** URL. Host one at `https://www.trolliiapp.com/privacy`. The policy should mention:

- That the app sends meal planning data to Anthropic's Claude API for generating budget advice
- That shopping list data is stored locally on the device
- That affiliate links to supermarket websites are used
- Location permission is optional and only used to determine currency
- No personal data is sold or shared beyond what's necessary for the above

You can generate one at https://app.termly.io or use a template from https://www.freeprivacypolicy.com.

---

## Part 7 — Affiliate IDs

The app is wired up to support affiliate tracking. When you register with each program, edit `src/App.jsx` and find the `AFF` config object. Replace `YOUR_TESCO_AWIN_ID` etc. with your actual IDs.

- **Awin** (UK/EU supermarkets): https://www.awin.com
- **Amazon Associates** (Whole Foods): https://affiliate-program.amazon.com
- **Impact** (Walmart, Target): https://impact.com
- **Instacart Tastemakers**: https://www.instacart.com/tastemakers
- **Commission Factory** (AU): https://commissionfactory.com

---

## Troubleshooting

**"Command failed: npx cap add ios" on a non-Mac**
iOS builds require a Mac. There's no way around this.

**"ANTHROPIC_API_KEY is not defined" in Vercel**
Go to Vercel → Settings → Environment Variables and add it, then redeploy.

**App icon is blurry in the app stores**
Start from the 1024×1024 PNG and use [appicon.co](https://appicon.co) to generate all required sizes properly.

**DNS not propagating**
Give it up to 24 hours. You can check status at https://www.whatsmydns.net.

**Capacitor plugin not working on native**
Run `npx cap sync` after installing any new `@capacitor/*` package, then rebuild.

---

## Quick command reference

```bash
npm run dev              # Local web dev server
npm run build            # Production build
npm run cap:sync         # Build + sync to native projects
npm run cap:ios          # Sync + open Xcode
npm run cap:android      # Sync + open Android Studio
```

---

## Support

- Capacitor docs: https://capacitorjs.com/docs
- Vercel docs: https://vercel.com/docs
- Apple App Store guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play policies: https://play.google.com/about/developer-content-policy/

Good luck with the launch!
