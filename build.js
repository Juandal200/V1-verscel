#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// build.js  —  Converts the GAS-templated Index.html into a static HTML file
// that Vercel can serve. Resolves all <?!= include('X') ?> and logo calls.
// Output: dist/index.html
// ─────────────────────────────────────────────────────────────────────────────
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);

// ── Helpers ──────────────────────────────────────────────────────────────────

function read(filename) {
  return fs.readFileSync(path.join(ROOT, filename), 'utf8');
}

// Resolve <?!= include('FileName') ?> — strips .html suffix if needed
function resolveIncludes(html) {
  return html.replace(/<%!=\s*include\(['"]([^'"]+)['"]\)\s*;?\s*%>/g, function (_, name) {
    const file = name.endsWith('.html') ? name : name + '.html';
    const content = read(file);
    // Recursively resolve nested includes
    return resolveIncludes(content);
  }).replace(/<\?!=\s*include\(['"]([^'"]+)['"]\)\s*;?\s*\?>/g, function (_, name) {
    const file = name.endsWith('.html') ? name : name + '.html';
    const content = read(file);
    return resolveIncludes(content);
  });
}

// Extract the base64 data URL from getLogoDataUrl() in ConfigService.js
function getLogoDataUrl() {
  const config = read('ConfigService.js');
  const match  = config.match(/return\s+"(data:image\/[^"]+)"/);
  return match ? match[1] : '';
}

// ── Main build ────────────────────────────────────────────────────────────────

let html = read('Index.html');

// 1. Inject shim.js BEFORE any other scripts (first thing in <head>)
const shimScript = '<script>\n' + read('shim.js') + '\n</script>';
html = html.replace(/<head>/, '<head>\n' + shimScript);

// 2. Replace APP_CONFIG template call — shim.js handles this at runtime
html = html.replace(
  /window\.APP_CONFIG\s*=\s*<\?!=\s*getClientConfigJson\(\)\s*;?\s*\?>\s*;/g,
  '/* APP_CONFIG loaded by shim.js */'
);

// 3. Replace logo data URL calls
const logoUrl = getLogoDataUrl();
html = html.replace(/<\?!=\s*getLogoDataUrl\(\)\s*\?>/g, logoUrl);

// 4. Resolve all <?!= include('X') ?> tags
html = resolveIncludes(html);

// 5. Write output
fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf8');

const kb = Math.round(fs.statSync(path.join(DIST, 'index.html')).size / 1024);
console.log('✓ dist/index.html  (' + kb + ' KB)');
