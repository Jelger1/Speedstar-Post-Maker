/* =============================================================================
   brandkit.js — huisstijl uit een markdown-document destilleren
   -----------------------------------------------------------------------------
   Een stijlgids beschrijft een merk op heel verschillende manieren. Deze module
   leest ze alle vier en smelt ze samen tot één set stijlwaarden:

     1. CSS-variabelen        --clr-accent: #af1c23;   (in ```css-blokken)
     2. Markdown-tabellen     | `--clr-accent` | `#af1c23` | Accenten |
     3. Losse labelregels     Sale kleur: #ab552b
     4. Vormregels            "border-radius: 0" / "strakke rechte hoeken"

   Elke gevonden kleur krijgt een rol (accent / kop / tekst / vlak / achtergrond)
   op basis van trefwoorden in het label — Nederlands én Engels. Fonts worden
   herleid tot een familienaam zonder gewichtsaanduiding.

   Publieke API:  window.IPM.brand.extract(text) -> { roles, colors, fonts, ... }
   ============================================================================= */
window.IPM = window.IPM || {};

window.IPM.brand = (function () {
  'use strict';

  /* Rolherkenning. Volgorde telt: 'accent' wint van 'kop' bij
     "Bijzondere koptekst", en 'kop' wint van 'tekst' bij "H tekst / koppen". */
  var ROLE_TESTS = [
    ['accent',  /(accent|highlight|primair|primary|brand|merk|bijzonder|sale|cta|link|actie)/],
    ['heading', /(heading|head\b|kop|titel|title|display|\bh[1-6]\b|\bh[\s-]?te(?:k)?st\b)/],
    ['panel',   /(panel|vlak|surface|card|kaart|muted|soft|tegel)/],
    ['bg',      /(\bbg\b|background|achtergrond|pagina|page|canvas)/],
    ['ink',     /(text|tekst|body|ink|copy|alinea|paragraph|\bp\b)/]
  ];

  /* Gewichts- en stijlwoorden die niet bij de familienaam horen */
  var WEIGHT_WORDS = /\b(thin|extralight|ultralight|light|book|regular|normal|medium|semibold|demibold|demi|bold|extrabold|heavy|black|italic|oblique|el|lt|rg|sb|bd|it)\b/gi;

  var RE_HEX  = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b/i;
  var RE_VAR  = /--([a-z0-9][a-z0-9-]*)\s*:\s*([^;\n}]+)/gi;

  /* ---------------------------------------------------------------------------
     Kleurhulp
     ------------------------------------------------------------------------- */
  function normalizeHex(hex) {
    var h = String(hex).replace('#', '').toLowerCase();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length === 8) h = h.slice(0, 6);          // alfa negeren
    return '#' + h;
  }

  function hexToRgb(hex) {
    var h = normalizeHex(hex).slice(1);
    if (!/^[0-9a-f]{6}$/.test(h)) return [0, 0, 0];   // ongeldige invoer: nooit NaN doorgeven
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  /* Relatieve luminantie (WCAG) — bepaalt of tekst licht of donker moet zijn */
  function luminance(hex) {
    var c = hexToRgb(hex).map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function contrastRatio(a, b) {
    var l1 = luminance(a), l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  function isLight(hex) { return luminance(hex) > 0.55; }

  function roleFor(label) {
    var l = String(label).toLowerCase();
    for (var i = 0; i < ROLE_TESTS.length; i++) {
      if (ROLE_TESTS[i][1].test(l)) return ROLE_TESTS[i][0];
    }
    return null;
  }

  function prettyLabel(name) {
    return String(name)
      .replace(/^--/, '')
      .replace(/^(clr|color|kleur|c)-/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/`/g, '')
      .trim()
      .slice(0, 40);
  }

  /* ---------------------------------------------------------------------------
     Fontnaam opschonen: "'Built Titling', Georgia, serif" -> "Built Titling"
     ------------------------------------------------------------------------- */
  function cleanFamily(value) {
    var first = String(value).split(',')[0];
    first = first.replace(/["'`]/g, '')
                 .replace(/\.(otf|ttf|woff2?|eot)$/i, '')
                 .replace(/[.;]+$/, '')
                 .trim();

    var stripped = first.replace(WEIGHT_WORDS, '').replace(/\s{2,}/g, ' ').trim();
    if (stripped.length >= 3) first = stripped;

    // Titel-case zodat "built titling" netjes als "Built Titling" toont
    return first.replace(/\S+/g, function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    });
  }

  /* Waarde die écht op een lettertypenaam lijkt (filtert "clamp(2rem, 6vw)" weg) */
  function looksLikeFamily(value) {
    var s = String(value).trim();
    if (!s || s.length > 60) return false;
    if (/[(){};]/.test(s)) return false;
    if (/\d+\s*(px|rem|em|vw|vh|%)/i.test(s)) return false;
    return /[a-z]{3}/i.test(s);
  }

  /* ---------------------------------------------------------------------------
     extract() — het hele document afspeuren en samensmelten
     ------------------------------------------------------------------------- */
  function extract(raw) {
    var text = String(raw || '').replace(/\r\n/g, '\n');

    var colors = [];        // { name, hex, role } in documentvolgorde
    var byHex = {};
    var roles = {};         // eerste treffer per rol wint
    var fonts = { heading: null, body: null };
    var radius = null;
    var name = null;
    var handle = null;

    function addColor(label, hex, primaryLabel) {
      hex = normalizeHex(hex);
      var role = roleFor(primaryLabel || label) || roleFor(label);

      if (!byHex[hex]) {
        byHex[hex] = { name: prettyLabel(primaryLabel || label), hex: hex, role: role };
        colors.push(byHex[hex]);
      } else if (!byHex[hex].role && role) {
        byHex[hex].role = role;
      }
      if (role && !roles[role]) roles[role] = hex;
    }

    function addFont(slot, value) {
      if (!looksLikeFamily(value)) return;
      var fam = cleanFamily(value);
      if (!fam || fam.length < 2) return;
      if (!fonts[slot]) fonts[slot] = fam;
    }

    /* --- 1. CSS-variabelen: --naam: waarde --- */
    var m;
    RE_VAR.lastIndex = 0;
    while ((m = RE_VAR.exec(text)) !== null) {
      var varName = m[1];
      var varVal = m[2].trim();

      var hex = varVal.match(RE_HEX);
      if (hex) { addColor(varName, hex[0], varName); continue; }

      if (/(font|ff|type)/i.test(varName)) {
        if (/(head|kop|titel|title|\bh[\s-]?tekst\b|display)/i.test(varName)) addFont('heading', varVal);
        else if (/(body|text|tekst|base|copy|para)/i.test(varName)) addFont('body', varVal);
        else if (!fonts.heading) addFont('heading', varVal);
        else addFont('body', varVal);
      }
    }

    /* --- 2. Markdown-tabellen: | token | waarde | gebruik | --- */
    text.split('\n').forEach(function (line) {
      var t = line.trim();
      if (t.charAt(0) !== '|') return;

      var cells = t.split('|').slice(1, -1).map(function (c) {
        return c.trim().replace(/`/g, '').replace(/\*\*/g, '');
      });
      if (cells.length < 2) return;
      if (/^[-:\s|]+$/.test(cells.join(''))) return;   // scheidingsrij van de tabel

      var hexCell = null;
      cells.forEach(function (c) { if (!hexCell && RE_HEX.test(c) && c.length <= 12) hexCell = c; });

      if (hexCell) {
        var rest = cells.filter(function (c) { return c !== hexCell; });
        addColor(rest.join(' '), hexCell.match(RE_HEX)[0], rest[0]);
        return;
      }

      // Fontrij herkennen aan een bestandsnaam in een van de cellen
      var isFontRow = cells.some(function (c) { return /\.(otf|ttf|woff2?)$/i.test(c); });
      if (isFontRow) {
        var usage = cells[cells.length - 1];
        var slot = /(kop|head|titel|title|\bh[\s-]?tekst\b|display)/i.test(usage) ? 'heading'
                 : /(body|tekst|text|navigatie|label|knop|button)/i.test(usage) ? 'body'
                 : null;
        if (slot) addFont(slot, cells[0]);
      }
    });

    /* --- 3. Losse regels: "Label: #hex" (of "Label: :2c2c30") --- */
    var RE_LINE = /^[ \t>*-]*([^\n:#|]{2,120}?)\s*:\s*:?\s*(#[0-9a-f]{3,8}|[0-9a-f]{6})[ \t.;]*$/gim;
    while ((m = RE_LINE.exec(text)) !== null) {
      var label = m[1].replace(/\*\*/g, '').trim();
      var value = m[2];
      // Een hex zónder # accepteren we alleen als het label écht een kleurrol is
      if (value.charAt(0) !== '#' && !roleFor(label)) continue;
      addColor(label, value, label);
    }

    /* --- 4. Losse fontregels: "Font voor H tekst: Built Titling Regular" --- */
    var RE_FONT_LINE = /(?:^|\n)([^\n:]{0,100}\b(?:font|lettertype|typeface)\b[^\n:]{0,60}):[ \t]*([^\n;]+)/gi;
    while ((m = RE_FONT_LINE.exec(text)) !== null) {
      var fLabel = m[1], fValue = m[2].trim();
      if (!looksLikeFamily(fValue)) continue;
      var fRole = roleFor(fLabel);
      if (fRole === 'heading') addFont('heading', fValue);
      else if (fRole === 'ink' || fRole === 'accent') addFont('body', fValue);
      else if (!fonts.heading) addFont('heading', fValue);
      else addFont('body', fValue);
    }

    /* --- 5. Vormregels --- */
    var rm = text.match(/border-radius\s*:\s*([0-9.]+)\s*(px|rem|em)?/i);
    if (rm) {
      var val = parseFloat(rm[1]);
      radius = (rm[2] && /rem|em/i.test(rm[2])) ? val * 16 : val;
    }
    if (/(strakke|rechte|scherpe)[,\s]+\s*(en\s+)?(rechte\s+)?hoeken|g[eé]{2}n\s+(border-)?radius|geen\s+afgeronde|no\s+rounded/i.test(text)) {
      radius = 0;
    }

    /* --- 6. Merknaam en handle --- */
    var nm = text.match(/\*{0,2}\s*(?:naam|merk|brand ?name|name)\s*\*{0,2}\s*:\s*\*{0,2}\s*([^\n|*]{2,50})/i);
    if (nm) name = nm[1].split(/[\/|,]/)[0].trim();

    var dm = text.match(/\b([a-z0-9][a-z0-9-]{1,30}\.(?:nl|com|be|de|io|co|eu|org|net|shop))\b/i);
    if (dm) handle = '@' + dm[1].toLowerCase();
    else if (name) handle = '@' + name.toLowerCase().replace(/[^a-z0-9]+/g, '');

    return {
      colors: colors,
      roles: roles,
      fonts: fonts,
      radius: radius,
      name: name,
      handle: handle,
      stats: { colors: colors.length, fonts: (fonts.heading ? 1 : 0) + (fonts.body ? 1 : 0) }
    };
  }

  return {
    extract: extract,
    normalizeHex: normalizeHex,
    hexToRgb: hexToRgb,
    luminance: luminance,
    contrastRatio: contrastRatio,
    isLight: isLight,
    cleanFamily: cleanFamily
  };
})();
