#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// build.js  —  Converts the GAS-templated Index.html into a static HTML file
// that Vercel can serve. Resolves all <?!= include('X') ?> and logo calls.
// Output: dist/index.html
// ─────────────────────────────────────────────────────────────────────────────
const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');
const { minify }    = require('terser');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);

// ── Helpers ──────────────────────────────────────────────────────────────────

function read(filename) {
  return fs.readFileSync(path.join(ROOT, filename), 'utf8');
}

// Strip CSS block comments and JS block + line comments for size reduction.
// Skips strings and URLs (http:// etc) to avoid breaking code.
function stripCssComments(css) {
  // Remove /* ... */ block comments
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function stripJsComments(js) {
  // Use a state machine to skip strings and regex literals
  var result = '';
  var i = 0;
  var len = js.length;
  while (i < len) {
    var ch = js[i];

    // String literals — skip over them unchanged
    if (ch === '"' || ch === "'" || ch === '`') {
      var quote = ch;
      result += ch; i++;
      while (i < len) {
        var c = js[i];
        result += c; i++;
        if (c === '\\') { if (i < len) { result += js[i]; i++; } continue; }
        if (c === quote) break;
      }
      continue;
    }

    // Block comment /* ... */
    if (ch === '/' && js[i+1] === '*') {
      i += 2;
      while (i < len && !(js[i] === '*' && js[i+1] === '/')) i++;
      i += 2;
      // Preserve newlines so line numbers shift minimally
      result += ' ';
      continue;
    }

    // Line comment // ... (but not http:// or similar)
    if (ch === '/' && js[i+1] === '/' && (i === 0 || js[i-1] !== ':')) {
      i += 2;
      while (i < len && js[i] !== '\n') i++;
      continue;
    }

    result += ch; i++;
  }
  return result;
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
  const match  = config.match(/function getLogoDataUrl[\s\S]*?return\s+"(data:image\/[^"]+)"/);
  return match ? match[1] : '';
}

// Extract the pilot avatar data URL from getPilotAvatarUrl() in ConfigService.js
function getPilotAvatarUrl() {
  const config = read('ConfigService.js');
  const match  = config.match(/function getPilotAvatarUrl[\s\S]*?return\s+"(data:image\/[^"]+)"/);
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

// 3. Replace logo and pilot avatar data URL calls
const logoUrl   = getLogoDataUrl();
const avatarUrl = getPilotAvatarUrl();
html = html.replace(/<\?!=\s*getLogoDataUrl\(\)\s*\?>/g, logoUrl);
html = html.replace(/<\?!=\s*getPilotAvatarUrl\(\)\s*\?>/g, avatarUrl);

// 4. Resolve all <?!= include('X') ?> tags
html = resolveIncludes(html);

// 5a. Strip comments from inlined CSS blocks
html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, function(_, open, css, close) {
  return open + stripCssComments(css) + close;
});

// 5b. Strip comments from inlined JS blocks
html = html.replace(/(<script(?:\s[^>]*)?>)([\s\S]*?)(<\/script>)/gi, function(_, open, js, close) {
  // Skip externally-sourced scripts (src="...")
  if (/\bsrc\s*=/.test(open)) return _ ;
  return open + stripJsComments(js) + close;
});

// 6. Minify JS blocks with Terser, then write output
(async function() {
  // Replace each inline <script> block with its minified version
  const scriptRe = /(<script(?:\s[^>]*)?>)([\s\S]*?)(<\/script>)/gi;
  const parts = [];
  let last = 0, match;
  scriptRe.lastIndex = 0;
  while ((match = scriptRe.exec(html)) !== null) {
    parts.push(html.slice(last, match.index));
    const open = match[1], js = match[2], close = match[3];
    if (/\bsrc\s*=/.test(open) || js.trim().length < 20) {
      parts.push(match[0]);
    } else {
      try {
        const result = await minify(js, {
          compress: { drop_console: false, passes: 2 },
          mangle: false,  // keep names — GAS window.xxx pattern requires it
          format: { comments: false }
        });
        parts.push(open + (result.code || js) + close);
      } catch(e) {
        parts.push(match[0]); // fallback to original on error
      }
    }
    last = match.index + match[0].length;
  }
  parts.push(html.slice(last));
  html = parts.join('');

  fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf8');
  const kb = Math.round(fs.statSync(path.join(DIST, 'index.html')).size / 1024);
  console.log('✓ dist/index.html  (' + kb + ' KB)');

  // 7. PWA icons — resize LOGOF.png (2048×2048) via macOS sips
  const logoSrc = path.join(ROOT, 'LOGOF.png');
  if (fs.existsSync(logoSrc)) {
    try {
      execSync('sips -z 192 192 "' + logoSrc + '" --out "' + path.join(DIST, 'icon-192.png') + '" > /dev/null 2>&1');
      execSync('sips -z 512 512 "' + logoSrc + '" --out "' + path.join(DIST, 'icon-512.png') + '" > /dev/null 2>&1');
      console.log('✓ PWA icons generated (192×192, 512×512)');
    } catch(e) {
      console.warn('⚠ Icon generation skipped:', e.message);
    }
  }

  // 8. manifest.json
  fs.writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify({
    name: 'AEROCOMMS',
    short_name: 'AEROCOMMS',
    description: 'ICAO Language Proficiency Training Platform',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d0d0d',
    theme_color: '#0d0d0d',
    orientation: 'any',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ]
  }, null, 2));
  console.log('✓ dist/manifest.json');

  // 9. Service worker
  fs.copyFileSync(path.join(ROOT, 'sw.js'), path.join(DIST, 'sw.js'));
  console.log('✓ dist/sw.js');
})();
