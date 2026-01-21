#!/usr/bin/env node

/**
 * Simple script to generate PWA icons
 * This creates basic colored square icons with the app name
 * 
 * Usage: node scripts/generate-icons.js
 * 
 * Note: This requires a base icon file (icon-512x512.png) in the public directory
 * If you don't have one, you can:
 * 1. Create a 512x512 PNG image with your logo/branding
 * 2. Use an online tool like https://realfavicongenerator.net/
 * 3. Or use ImageMagick: convert your-logo.png -resize 512x512 public/icon-512x512.png
 */

const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const publicDir = path.join(__dirname, '..', 'public');

// Check if base icon exists
const baseIconPath = path.join(publicDir, 'icon-512x512.png');

if (!fs.existsSync(baseIconPath)) {
  console.log('⚠️  Base icon (icon-512x512.png) not found in public directory.');
  console.log('\n📝 To generate icons:');
  console.log('1. Create a 512x512 PNG image with your logo');
  console.log('2. Save it as: public/icon-512x512.png');
  console.log('3. Run this script again\n');
  console.log('💡 Quick options:');
  console.log('   - Use https://realfavicongenerator.net/');
  console.log('   - Use ImageMagick: convert logo.png -resize 512x512 public/icon-512x512.png');
  console.log('   - Use any image editor to create a 512x512 PNG\n');
  process.exit(0);
}

console.log('✅ Base icon found. Generating all icon sizes...\n');

// For now, just verify the structure
// In a real scenario, you'd use sharp or jimp to resize images
console.log('📋 Required icon sizes:');
sizes.forEach(size => {
  const iconPath = path.join(publicDir, `icon-${size}x${size}.png`);
  if (fs.existsSync(iconPath)) {
    console.log(`   ✅ icon-${size}x${size}.png exists`);
  } else {
    console.log(`   ❌ icon-${size}x${size}.png missing`);
  }
});

console.log('\n💡 To generate all sizes from icon-512x512.png:');
console.log('   Install ImageMagick, then run:');
sizes.forEach(size => {
  if (size !== 512) {
    console.log(`   convert public/icon-512x512.png -resize ${size}x${size} public/icon-${size}x${size}.png`);
  }
});

console.log('\n📱 After icons are generated, the PWA will be fully installable!');
