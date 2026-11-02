const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const swapHtml = path.join(distDir, 'swap.html');
const swapDir = path.join(distDir, 'swap');
const swapIndexHtml = path.join(swapDir, 'index.html');

const appDir = path.join(distDir, 'app');
const appIndexHtml = path.join(appDir, 'index.html');

console.log('[postbuild] Ensuring clean Cloudflare Pages directory structure...');

// Handle /swap
if (fs.existsSync(swapHtml)) {
  if (!fs.existsSync(swapDir)) {
    fs.mkdirSync(swapDir, { recursive: true });
  }
  fs.copyFileSync(swapHtml, swapIndexHtml);
  fs.unlinkSync(swapHtml);
  console.log('[postbuild] Successfully created dist/swap/index.html and removed dist/swap.html (eliminating 308 loops).');
} else if (fs.existsSync(swapIndexHtml)) {
  console.log('[postbuild] dist/swap/index.html already exists.');
} else {
  console.warn('[postbuild] Warning: Neither dist/swap.html nor dist/swap/index.html was found.');
}

// Handle /app (serves the React SPA with /app route handling ComingSoonApp)
const sourceHtml = fs.existsSync(swapIndexHtml) ? swapIndexHtml : path.join(distDir, 'index.html');
if (fs.existsSync(sourceHtml)) {
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  fs.copyFileSync(sourceHtml, appIndexHtml);
  console.log('[postbuild] Successfully created dist/app/index.html for clean HTTP 200 on /app.');
} else {
  console.warn('[postbuild] Warning: Could not find source HTML to generate dist/app/index.html.');
}
