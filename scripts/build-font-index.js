#!/usr/bin/env node
/* =============================================================================
   build-font-index.js — maakt assets/fonts/index.json
   -----------------------------------------------------------------------------
   Leest van elk .ttf/.otf/.woff-bestand in assets/fonts de 'name'- en
   'OS/2'-tabel (en 'fvar' voor variabele fonts) en schrijft één JSON met per
   bestand: familienaam, stijl, gewicht, italic, formaat en grootte. De tool
   gebruikt dit om te zoeken, te previewen en fonts uit een stijlgids
   automatisch te vinden.

   Gebruik:  node scripts/build-font-index.js      (ook: npm run fonts)
   Geen dependencies. .ttc en .fon worden overgeslagen (browsers laden die
   niet betrouwbaar via @font-face).
   ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'fonts');
const OUT = path.join(DIR, 'index.json');
const FORMATS = { '.ttf': 'truetype', '.otf': 'opentype', '.woff': 'woff', '.woff2': 'woff2' };

/* --- binaire hulpjes --- */
function u16(b, o) { return b.readUInt16BE(o); }
function u32(b, o) { return b.readUInt32BE(o); }

function tables(buf) {
  let off = 0;
  let tag = buf.toString('latin1', 0, 4);
  if (tag === 'ttcf') off = u32(buf, 12);                 // eerste font uit een collectie
  const numTables = u16(buf, off + 4);
  const out = {};
  for (let i = 0; i < numTables; i++) {
    const p = off + 12 + i * 16;
    if (p + 16 > buf.length) break;
    out[buf.toString('latin1', p, p + 4)] = { offset: u32(buf, p + 8), length: u32(buf, p + 12) };
  }
  return out;
}

function decodeName(buf, platformID, encodingID, start, len) {
  const slice = buf.subarray(start, start + len);
  // Windows (3) en Unicode (0) zijn UTF-16BE; Macintosh (1) is MacRoman ~ latin1
  if (platformID === 3 || platformID === 0) {
    let s = '';
    for (let i = 0; i + 1 < slice.length; i += 2) s += String.fromCharCode((slice[i] << 8) | slice[i + 1]);
    return s;
  }
  return slice.toString('latin1');
}

function readNames(buf, t) {
  const names = {};
  if (!t.name) return names;
  const base = t.name.offset;
  if (base + 6 > buf.length) return names;
  const count = u16(buf, base + 2);
  const strBase = base + u16(buf, base + 4);
  for (let i = 0; i < count; i++) {
    const r = base + 6 + i * 12;
    if (r + 12 > buf.length) break;
    const platformID = u16(buf, r), encodingID = u16(buf, r + 2), langID = u16(buf, r + 4);
    const nameID = u16(buf, r + 6), len = u16(buf, r + 8), off = u16(buf, r + 10);
    if (strBase + off + len > buf.length) continue;
    // Voorkeur: Windows/Engels (3, x, 0x409); anders wat er is
    const isEnglish = platformID === 3 ? (langID === 0x409) : (platformID === 1 ? langID === 0 : true);
    const val = decodeName(buf, platformID, encodingID, strBase + off, len).replace(/\0/g, '').trim();
    if (!val) continue;
    const key = nameID;
    if (!names[key] || (isEnglish && !names[key].english)) names[key] = { value: val, english: isEnglish };
  }
  const get = id => (names[id] ? names[id].value : '');
  return { family: get(16) || get(1), subfamily: get(17) || get(2), full: get(4), ps: get(6) };
}

function readOS2(buf, t) {
  if (!t['OS/2']) return {};
  const o = t['OS/2'].offset;
  if (o + 64 > buf.length) return {};
  const weightClass = u16(buf, o + 4);
  const fsSelection = u16(buf, o + 62);
  return { weight: weightClass, italic: !!(fsSelection & 1), oblique: !!(fsSelection & 512) };
}

function readFvarWeight(buf, t) {
  if (!t.fvar) return null;
  const o = t.fvar.offset;
  if (o + 16 > buf.length) return null;
  const axesOffset = u16(buf, o + 4), axisCount = u16(buf, o + 8), axisSize = u16(buf, o + 10);
  for (let i = 0; i < axisCount; i++) {
    const a = o + axesOffset + i * axisSize;
    if (a + 20 > buf.length) break;
    if (buf.toString('latin1', a, a + 4) === 'wght') {
      const min = buf.readInt32BE(a + 4) / 65536, max = buf.readInt32BE(a + 12) / 65536;
      return [Math.round(min), Math.round(max)];
    }
  }
  return null;
}

/* Gewicht afleiden uit de stijlnaam als OS/2 onbetrouwbaar is */
const WEIGHT_WORDS = [
  [/\b(hairline|thin)\b/i, 100], [/\b(extra ?light|ultra ?light|air)\b/i, 200], [/\blight\b/i, 300],
  [/\b(regular|normal|book|roman|text)\b/i, 400], [/\bmedium\b/i, 500], [/\b(semi ?bold|demi ?bold|demi)\b/i, 600],
  [/\b(extra ?bold|ultra ?bold)\b/i, 800], [/\bbold\b/i, 700], [/\b(black|heavy|ultra|fat|extra ?black)\b/i, 900]
];
function weightFromName(name) {
  for (const [re, w] of WEIGHT_WORDS) if (re.test(name)) return w;
  return null;
}

function cleanFamily(name) {
  return String(name || '')
    .replace(/\s+(Regular|Italic|Bold|Light|Medium|Thin|Black|Heavy|Book|SemiBold|DemiBold|ExtraBold|ExtraLight|UltraLight|Condensed|Narrow)(\s+Italic)?$/i, '')
    .replace(/\s{2,}/g, ' ').trim();
}

function build() {
  if (!fs.existsSync(DIR)) { console.error('Map niet gevonden: ' + DIR); process.exit(1); }
  const files = fs.readdirSync(DIR).filter(f => FORMATS[path.extname(f).toLowerCase()]).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const fonts = [];
  let skipped = 0;

  for (const file of files) {
    const full = path.join(DIR, file);
    let buf;
    try { buf = fs.readFileSync(full); } catch (err) { skipped++; continue; }
    const ext = path.extname(file).toLowerCase();
    const format = FORMATS[ext];
    let names = {}, os2 = {}, varWeight = null;

    if (format === 'woff' || format === 'woff2') {
      // WOFF-tabellen zijn gecomprimeerd; naam uit bestandsnaam afleiden
      names = { family: cleanFamily(path.basename(file, ext).replace(/[-_]+/g, ' ')), subfamily: '' };
    } else {
      try {
        const t = tables(buf);
        names = readNames(buf, t);
        os2 = readOS2(buf, t);
        varWeight = readFvarWeight(buf, t);
      } catch (err) { names = {}; }
      if (!names.family) names = { family: cleanFamily(path.basename(file, ext).replace(/[-_]+/g, ' ')), subfamily: '' };
    }

    const family = cleanFamily(names.family);
    const style = names.subfamily || 'Regular';
    const nameWeight = weightFromName(style) || weightFromName(names.full || '') || weightFromName(file);
    let weight = os2.weight && os2.weight >= 100 && os2.weight <= 1000 ? Math.round(os2.weight / 100) * 100 : (nameWeight || 400);
    if (nameWeight && Math.abs(nameWeight - weight) >= 300) weight = nameWeight;   // OS/2 zegt soms onzin
    const italic = !!(os2.italic || os2.oblique || /italic|oblique/i.test(style));

    fonts.push({
      file: file,
      family: family,
      style: style,
      weight: varWeight ? varWeight[0] + ' ' + varWeight[1] : String(Math.min(900, Math.max(100, weight))),
      italic: italic,
      format: format,
      size: buf.length
    });
  }

  // Familie-overzicht voor snel zoeken
  const famMap = new Map();
  for (const f of fonts) {
    const key = f.family.toLowerCase();
    if (!famMap.has(key)) famMap.set(key, { family: f.family, files: 0, weights: new Set(), italic: false, size: 0 });
    const fam = famMap.get(key);
    fam.files++; fam.size += f.size; if (f.italic) fam.italic = true;
    String(f.weight).split(' ').forEach(w => fam.weights.add(parseInt(w, 10)));
  }
  const families = [...famMap.values()]
    .map(f => ({ family: f.family, files: f.files, weights: [...f.weights].sort((a, b) => a - b), italic: f.italic, size: f.size }))
    .sort((a, b) => a.family.localeCompare(b.family, 'en', { sensitivity: 'base' }));

  const out = { generated: new Date().toISOString(), count: fonts.length, families, fonts };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`index.json: ${fonts.length} fontbestanden, ${families.length} families (${skipped} overgeslagen)`);
}

build();
