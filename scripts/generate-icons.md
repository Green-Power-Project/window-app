# Generating PWA Icons

To generate the required PWA icons, you can:

1. **Use an online tool**: Visit https://realfavicongenerator.net/ or https://www.pwabuilder.com/imageGenerator
2. **Use ImageMagick** (if installed):
   ```bash
   # Create a base 512x512 icon first (icon-512x512.png)
   # Then generate other sizes:
   convert icon-512x512.png -resize 72x72 public/icon-72x72.png
   convert icon-512x512.png -resize 96x96 public/icon-96x96.png
   convert icon-512x512.png -resize 128x128 public/icon-128x128.png
   convert icon-512x512.png -resize 144x144 public/icon-144x144.png
   convert icon-512x512.png -resize 152x152 public/icon-152x152.png
   convert icon-512x512.png -resize 192x192 public/icon-192x192.png
   convert icon-512x512.png -resize 384x384 public/icon-384x384.png
   ```

3. **Use a design tool**: Create a 512x512 PNG with a green power/energy theme, then resize to all required sizes.

**Required sizes:**
- 72x72
- 96x96
- 128x128
- 144x144
- 152x152
- 192x192
- 384x384
- 512x512

**Note**: The app will work without icons, but they're required for a proper PWA installation experience.

**PWA Installation:**
- Icons must be placed in the `/public` directory
- The app is configured as a Progressive Web App (PWA)
- Once icons are added, the app will be installable on:
  - **Desktop**: Chrome, Edge, Safari (look for install prompt in address bar)
  - **Mobile**: iOS Safari, Android Chrome (use "Add to Home Screen")
- After installation, the app opens in fullscreen/standalone mode
- Single-click access from the home screen/app launcher

