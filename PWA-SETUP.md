# PWA Setup Complete ✅

The window app is now configured as a Progressive Web App (PWA) and can be installed on desktop and mobile devices.

## ✅ What's Been Configured

1. **Manifest.json** - Updated with proper icon configuration
2. **Service Worker** - Auto-registered via `next-pwa` (already configured)
3. **Install Prompt Component** - Added for better user experience
4. **Meta Tags** - All PWA meta tags configured in layout.tsx
5. **Theme Colors** - Green Power branding (#5d7a5d)

## 📱 How to Install

### Desktop (Chrome/Edge)
1. Visit the app in your browser
2. Look for the install icon in the address bar (or install prompt will appear)
3. Click "Install" to add to your desktop/app launcher

### Mobile (iOS)
1. Open the app in Safari
2. Tap the Share button
3. Select "Add to Home Screen"
4. The app will appear on your home screen

### Mobile (Android)
1. Open the app in Chrome
2. Look for the install prompt banner
3. Tap "Install" or use the browser menu → "Add to Home Screen"

## 🎨 Icon Setup (Required for Full PWA Experience)

To complete the PWA setup, you need to add icon files:

### Required Icon Sizes:
- `icon-72x72.png`
- `icon-96x96.png`
- `icon-128x128.png`
- `icon-144x144.png`
- `icon-152x152.png`
- `icon-192x192.png` ⭐ (Most important)
- `icon-384x384.png`
- `icon-512x512.png` ⭐ (Most important)

### How to Generate Icons:

**Option 1: Online Tool (Easiest)**
1. Visit https://realfavicongenerator.net/ or https://www.pwabuilder.com/imageGenerator
2. Upload your logo/image (512x512 recommended)
3. Download all sizes
4. Place them in `/public` directory

**Option 2: ImageMagick (If installed)**
```bash
# Create base 512x512 icon first, then:
cd window-app/public
convert icon-512x512.png -resize 72x72 icon-72x72.png
convert icon-512x512.png -resize 96x96 icon-96x96.png
convert icon-512x512.png -resize 128x128 icon-128x128.png
convert icon-512x512.png -resize 144x144 icon-144x144.png
convert icon-512x512.png -resize 152x152 icon-152x152.png
convert icon-512x512.png -resize 192x192 icon-192x192.png
convert icon-512x512.png -resize 384x384 icon-384x384.png
```

**Option 3: Design Tool**
- Create a 512x512 PNG with your logo/branding
- Export/resize to all required sizes
- Place all files in `/public` directory

### Note:
- The app will work without icons, but installation prompts may not appear
- Icons must be PNG format
- Recommended: Use a green/energy-themed icon matching your brand

## 🔧 Technical Details

### Service Worker
- Automatically registered by `next-pwa`
- Located at: `/public/sw.js`
- Handles app caching and offline functionality

### Install Prompt
- Component: `components/InstallPrompt.tsx`
- Automatically shows when browser supports installation
- Respects user dismissal (won't show again for 7 days)

### Manifest Configuration
- **Name**: Green Power Customer Portal
- **Short Name**: Green Power
- **Display Mode**: Standalone (opens without browser UI)
- **Start URL**: `/`
- **Theme Color**: #5d7a5d (Green Power brand color)

## 🚀 Testing

1. **Development**: Run `npm run dev` and visit `http://localhost:3001`
2. **Check Console**: Look for service worker registration messages
3. **Test Install**: Try installing the app on your device
4. **Verify Icons**: Check that icons appear correctly after installation

## 📝 Next Steps

1. ✅ Create and add icon files to `/public` directory
2. ✅ Test installation on different devices
3. ✅ Deploy to production (HTTPS required for full PWA features)
4. ✅ Test offline functionality (if needed)

## 🐛 Troubleshooting

**Install prompt not showing?**
- Make sure you're on HTTPS (or localhost)
- Check that service worker is registered (DevTools → Application → Service Workers)
- Verify manifest.json is accessible at `/manifest.json`

**Icons not appearing?**
- Check that icon files exist in `/public` directory
- Verify icon paths in `manifest.json` match actual files
- Clear browser cache and try again

**Service worker not registering?**
- Check browser console for errors
- Verify `next-pwa` is installed: `npm list next-pwa`
- Check `next.config.js` has `withPWA` wrapper

---

**Status**: ✅ PWA Configuration Complete
**Icons**: ⚠️ Need to be added (see Icon Setup section above)
