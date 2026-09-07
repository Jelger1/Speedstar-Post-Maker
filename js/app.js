/* =============================================================================
   app.js — Post Studio: state, live preview en export
   -----------------------------------------------------------------------------
   Opbouw:
     1. Constanten & standaardwaarden      6. Eigen lettertypen
     2. DOM-referenties & hulpjes          7. Events
     3. Renderpijplijn                     8. Export
     4. Markdown-frontmatter -> state      9. Opslag & start
     5. Tekstvelden <-> markdown
   ============================================================================= */
(function () {
  'use strict';

  var MD = window.IPM.md;
  var BRAND = window.IPM.brand;

  /* ===========================================================================
     1. CONSTANTEN & STANDAARDWAARDEN
     ========================================================================= */
  var RATIOS = {
    '1:1':  { w: 1080, h: 1080 },
    '4:5':  { w: 1080, h: 1350 },
    '9:16': { w: 1080, h: 1920 }
  };

  var THEMES = ['minimal', 'editorial', 'panel', 'bold', 'band', 'quote'];

  /* Draait de pagina rechtstreeks vanaf schijf? Dan blokkeert de browser
     fetch(), @font-face en CORS-afbeeldingen — daar houden we rekening mee. */
  var IS_FILE = window.location.protocol === 'file:';
  var SERVER_HINT = 'Start de tool via een lokale server (VS Code "Live Server" of "npx serve .").';
  var SERVER_HINT_HTML = 'Start de tool via een lokale server: VS Code <b>Live Server</b> of <code>npx serve .</code>';
  var DEFAULT_STATUS = 'Vul de velden in en sleep een foto — alles ververst direct.';

  /* Smalle schermen: sidebar onder de preview; de stage-hoogte volgt dan de
     inhoud, dus de canvasmaat moet uit de viewport komen (anders krimpt hij
     elke render een stukje verder). */
  var STACKED = window.matchMedia ? window.matchMedia('(max-width: 860px)') : { matches: false };

  /* Geuploade foto's groter dan dit worden verkleind: scheelt geheugen en
     maakt de export een stuk sneller, zonder zichtbaar kwaliteitsverlies. */
  var MAX_IMAGE_EDGE = 4096;
  var MAX_UPLOAD_BYTES = 40 * 1048576;
  var MAX_FONT_BYTES = 8 * 1048576;

  var BRAND_FONT_H = "'Built Titling', 'Bebas Neue', Impact, sans-serif";
  var BRAND_FONT_B = "'Circular Std', 'Inter', system-ui, sans-serif";
  var BRAND_LABEL  = 'Merkstijl — Built Titling + Circular Std';

  /* Interne familienamen voor geüploade lettertypen */
  var CUSTOM_FAMILY = { heading: 'IPM Custom Heading', body: 'IPM Custom Body' };

  /* Lettertypecombinaties. 'brand' wordt overschreven zodra een stijlgids
     eigen fonts aandraagt; 'custom' verschijnt zodra er een font is geüpload. */
  var FONTS = {
    brand:    { label: BRAND_LABEL, h: BRAND_FONT_H, b: BRAND_FONT_B },
    playfair: { label: 'Playfair Display — redactioneel',
                h: "'Playfair Display', Georgia, serif",
                b: "'Inter', system-ui, sans-serif" },
    inter:    { label: 'Inter — modern & neutraal',
                h: "'Inter', system-ui, sans-serif",
                b: "'Inter', system-ui, sans-serif" },
    grotesk:  { label: 'Space Grotesk — technisch',
                h: "'Space Grotesk', 'Inter', sans-serif",
                b: "'Inter', system-ui, sans-serif" },
    bebas:    { label: 'Bebas Neue — impact',
                h: "'Bebas Neue', Impact, sans-serif",
                b: "'Inter', system-ui, sans-serif" }
  };

  /* Meegeleverde beelden en logo's uit /assets */
  var PHOTOS = [
    { src: 'assets/Hero-section-foto.jpg', label: 'Hero' },
    { src: 'assets/Duurzame-kwaliteit-foto-bedsprei.jpg', label: 'Bedsprei' },
    { src: 'assets/6d6fe89d8b204a8b365de5bc8325.webp', label: 'Sfeer' }
  ];
  var LOGOS = [
    { src: '', label: 'Geen' },
    { src: 'assets/logo-dekentje-met-tekst.svg', label: 'Dekentje' },
    { src: 'assets/logo-dekentje-zonder-tekst.svg', label: 'Beeldmerk' },
    { src: 'assets/Logo-plaids.svg', label: 'Plaids' },
    { src: 'assets/Logo-sierkussens.svg', label: 'Sierkussens' },
    { src: 'assets/Logo-bedsprei.svg', label: 'Bedspreien' },
    { src: 'assets/Logo-Picknickkleden.svg', label: 'Picknick' }
  ];

  var SAMPLE = [
    '---',
    'theme: editorial',
    'align: left',
    'position: bottom',
    'accent: #af1c23',
    'overlay: 55',
    '---',
    '',
    '### Nieuw binnen',
    '',
    '# Warmte die blijft hangen',
    '',
    'Handgeweven plaids van Europese merken, met **gratis verzending** in NL & BE.',
    '',
    '> Voor 22:00 besteld, vandaag verzonden.'
  ].join('\n');

  /* Terugvaloptie voor de STYLEGUIDE-knop als fetch geblokkeerd is (file://) */
  var EMBEDDED_BRAND = [
    '# Dekentje — merkrichtlijnen',
    '',
    '| Token | Hex | Gebruik |',
    '|---|---|---|',
    '| `--clr-heading` | `#606556` | Alle koppen |',
    '| `--clr-accent` | `#af1c23` | Accenten, eyebrows, links |',
    '| `--clr-text` | `#2c2c30` | Bodytekst |',
    '| `--clr-bg` | `#fdfdfd` | Pagina-achtergrond |',
    '| `--clr-panel` | `#f3f3f3` | Vlakken en kaarten |',
    '| `--clr-sale` | `#ab552b` | Sale-labels |',
    '',
    'Font voor H tekst: Built Titling Regular',
    'Font voor P tekst: Circular Std Book',
    '',
    'Strakke rechte hoeken gebruiken — geen border-radius.',
    '',
    '**Naam:** Dekentje / Dekentje.nl'
  ].join('\n');

  var DEFAULTS = {
    ratio: '4:5',
    image: null, imageSrc: '', imageName: '', imageRatio: null,
    overlay: 45, zoom: 100, focus: 'center',
    content: SAMPLE, editMode: 'fields',
    markdown: true, autoFit: true,
    theme: 'editorial', font: 'brand',
    accent: '#af1c23', textColor: '#ffffff',
    inkColor: '#2c2c30', panelColor: '#f3f3f3', headColor: '#606556',
    overlayRgb: '0, 0, 0',
    align: 'left', valign: 'bottom',
    textScale: 100, padding: 80, sharp: true,
    badge: '', logo: '', logoSrc: '', logoSize: 120, logoPos: 'br', logoPlate: true,
    format: 'png', exportScale: '1'
  };

  var state = Object.assign({}, DEFAULTS);
  var brandFonts = null;      // { heading, body } uit de laatst geladen stijlgids
  var brandData = null;       // volledige extractie t.b.v. het rapport
  var customFonts = { heading: null, body: null };   // { name, dataUrl, format }
  var lastMetaSig = '';       // voorkomt dat frontmatter je handmatige aanpassingen overschrijft
  var lastHtml = null;        // laatst geplaatste HTML — voorkomt onnodige DOM-vervanging
  var displayW = 0;
  var fitKey = '';            // laatst toegepaste maat (breedte + verhouding)
  var renderQueued = false;
  var renderHandle = 0;
  var renderErrorShown = false;
  var exporting = false;
  var brandFontsOk = null;    // null = nog niet gecontroleerd

  /* ===========================================================================
     2. DOM-REFERENTIES & HULPJES
     ========================================================================= */
  function $(id) { return document.getElementById(id); }
  function radio(name) { var n = document.querySelector('input[name="' + name + '"]:checked'); return n ? n.value : null; }
  function setRadio(name, value) {
    var n = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (n && !n.checked) n.checked = true;
  }
  function setVal(node, value) { if (node && node.value !== String(value)) node.value = value; }
  function setChecked(node, value) { if (node && node.checked !== !!value) node.checked = !!value; }
  function setText(node, text) { if (node && node.textContent !== text) node.textContent = text; }
  function noop() {}

  var el = {
    canvas: $('postCanvas'), shell: $('canvasShell'), stage: $('stage'),
    pcImage: $('pcImage'), pcFlow: $('pcFlow'), pcBody: $('pcBody'),
    pcBadge: $('pcBadge'), pcLogo: $('pcLogo'),
    content: $('content'), charCount: $('charCount'), wordCount: $('wordCount'),
    fieldsEditor: $('fieldsEditor'), markdownEditor: $('markdownEditor'), mdToggleWrap: $('mdToggleWrap'),
    imageDrop: $('imageDrop'), imageInput: $('imageInput'), imageCard: $('imageCard'),
    imageThumb: $('imageThumb'), imageName: $('imageName'), imageSize: $('imageSize'),
    imageRemove: $('imageRemove'), photoPicks: $('photoPicks'),
    mdDrop: $('mdDrop'), mdInput: $('mdInput'), contentMdInput: $('contentMdInput'),
    brandReport: $('brandReport'), brandChips: $('brandChips'), brandSwatches: $('brandSwatches'),
    brandFile: $('brandFile'), brandReset: $('brandReset'), brandInfo: $('brandInfo'),
    font: $('font'), accent: $('accent'), accentHex: $('accentHex'),
    textColor: $('textColor'), textHex: $('textHex'),
    customFontInput: $('customFontInput'),
    customHeadName: $('customHeadName'), customBodyName: $('customBodyName'),
    customHeadClear: $('customHeadClear'), customBodyClear: $('customBodyClear'),
    logoPicks: $('logoPicks'), logoInput: $('logoInput'),
    dimPill: $('dimPill'), themePill: $('themePill'), statusLine: $('statusLine'),
    fitInfo: $('fitInfo'), toast: $('toast'),
    exportBtn: $('exportBtn'), copyBtn: $('copyBtn'),
    envNotice: $('envNotice'), envNoticeTitle: $('envNoticeTitle'),
    envNoticeText: $('envNoticeText'), envNoticeClose: $('envNoticeClose')
  };

  /* Velden van de eenvoudige editor */
  var fieldEls = { label: $('fLabel'), title: $('fTitle'), body: $('fBody'), list: $('fList'), quote: $('fQuote') };

  var toastTimer;
  function toast(message, kind, ms) {
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.className = 'toast is-visible' + (kind ? ' is-' + kind : '');
    var duration = ms || (kind === 'error' ? 7000 : kind === 'warn' ? 5500 : 3200);
    toastTimer = setTimeout(function () { el.toast.className = 'toast'; }, duration);
  }

  /* Gele melding boven de preview: uitleg waarom iets niet werkt en wat de
     gebruiker eraan kan doen. Wordt onthouden per tabblad zodra hij is gesloten. */
  var NOTICE_KEY = 'post-studio-notice-dismissed';
  function showEnvNotice(title, html, force) {
    if (!el.envNotice) return;
    if (!force) {
      try { if (sessionStorage.getItem(NOTICE_KEY) === '1') return; } catch (err) { /* ok */ }
    }
    el.envNoticeTitle.textContent = title;
    el.envNoticeText.innerHTML = html;   // alleen eigen, vaste teksten — geen gebruikersinvoer
    el.envNotice.hidden = false;
  }
  function hideEnvNotice() {
    el.envNotice.hidden = true;
    try { sessionStorage.setItem(NOTICE_KEY, '1'); } catch (err) { /* ok */ }
  }
  function fileNoticeHtml() {
    var lines = [
      'Browsers blokkeren over <code>file://</code> de merklettertypen, het ophalen van <code>STYLEGUIDE.md</code> en de export van meegeleverde foto’s en logo’s.',
      SERVER_HINT_HTML + '.',
      'Zelf geüploade foto’s en lettertypen werken altijd, ook zonder server.'
    ];
    if (brandFontsOk === false) lines.splice(1, 0, 'De merklettertypen zijn nu vervangen door Bebas Neue en Inter.');
    return lines.join(' ');
  }

  function readFile(file, as, done) {
    var reader = new FileReader();
    reader.onload = function () { done(reader.result); };
    reader.onerror = function () { toast('Bestand kon niet worden gelezen: ' + file.name, 'error'); };
    if (as === 'text') reader.readAsText(file); else reader.readAsDataURL(file);
  }

  function humanSize(bytes) {
    return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB'
                           : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  function isDataUrl(value) { return typeof value === 'string' && value.indexOf('data:') === 0; }

  /* Een bestand uit /assets omzetten naar een data-URL. Zo bevat het canvas
     geen externe verwijzingen meer en kan html2canvas nooit "taint" raken.
     Over file:// mislukt dit (fetch is geblokkeerd) - dan blijft het pad staan. */
  function toDataUrl(src) {
    return Promise.resolve()
      .then(function () { return fetch(src); })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.blob();
      })
      .then(function (blob) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result); };
          reader.onerror = function () { reject(reader.error || new Error('read')); };
          reader.readAsDataURL(blob);
        });
      });
  }

  function nextFrame() {
    return new Promise(function (resolve) { requestAnimationFrame(function () { resolve(); }); });
  }
  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }
  /* Twee frames plus een korte pauze: layout, autoFit en font-swap zijn dan
     gegarandeerd verwerkt voordat html2canvas de DOM kloont. */
  function settle() {
    return nextFrame().then(nextFrame).then(function () { return wait(80); });
  }

  /* Kleine sleutel/waarde-opslag in IndexedDB voor dingen die niet in
     localStorage passen: de geüploade foto en eigen lettertypen. */
  var DB = (function () {
    var opening = null;
    function open() {
      if (opening) return opening;
      opening = new Promise(function (resolve, reject) {
        if (!window.indexedDB) { reject(new Error('IndexedDB niet beschikbaar')); return; }
        var req = indexedDB.open('post-studio', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('open')); };
        req.onblocked = function () { reject(new Error('blocked')); };
      });
      opening.catch(function () { opening = null; });
      return opening;
    }
    function run(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction('kv', mode);
          var req = fn(tx.objectStore('kv'));
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { reject(req.error || new Error('tx')); };
        });
      });
    }
    return {
      get: function (key) { return run('readonly', function (s) { return s.get(key); }); },
      set: function (key, value) { return run('readwrite', function (s) { return s.put(value, key); }); },
      del: function (key) { return run('readwrite', function (s) { return s.delete(key); }); }
    };
  })();

  /* Kleurwaarde normaliseren naar #rrggbb. De canvas-context accepteert namen,
     rgb() en hsl(); een ongeldige waarde laat de vorige kleur staan, dus die
     gebruiken we als detectie. */
  var probeCtx = null;
  function toHex(value) {
    var v = String(value || '').trim();
    if (/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(v)) v = '#' + v;
    if (!v) return null;
    try {
      probeCtx = probeCtx || document.createElement('canvas').getContext('2d');
      probeCtx.fillStyle = '#010203';
      probeCtx.fillStyle = v;
      var out = probeCtx.fillStyle;
      if (out === '#010203' && !/^#010203$/i.test(v)) return null;
      return typeof out === 'string' && out.charAt(0) === '#' ? out.toLowerCase() : null;
    } catch (err) { return null; }
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  /* "45", "45%", "0.45" -> 45 */
  function toPercent(value, min, max) {
    var raw = String(value).trim();
    var num = parseFloat(raw.replace(',', '.'));
    if (isNaN(num)) return null;
    if (num <= 1 && /[.,]/.test(raw)) num *= 100;
    return clamp(Math.round(num), min, max);
  }

  function normRatio(value) {
    var v = String(value).toLowerCase().replace(/\s/g, '');
    if (/^(1:1|1x1|square|vierkant|1\/1)$/.test(v)) return '1:1';
    if (/^(4:5|4x5|portrait|portret|5:4|4\/5)$/.test(v)) return '4:5';
    if (/^(9:16|9x16|story|stories|verhaal|reel|9\/16)$/.test(v)) return '9:16';
    return null;
  }

  function normFont(value) {
    var v = String(value).toLowerCase();
    if (FONTS[v]) return v;
    if (/eigen|custom|upload/.test(v)) return FONTS.custom ? 'custom' : null;
    if (/built|circular|merk|brand|huisstijl/.test(v)) return 'brand';
    if (/playfair|serif|redactioneel|editorial/.test(v)) return 'playfair';
    if (/grotesk|mono|tech/.test(v)) return 'grotesk';
    if (/bebas|impact|display/.test(v)) return 'bebas';
    if (/inter|sans|modern|helvetica|arial/.test(v)) return 'inter';
    return null;
  }

  function normTheme(value) {
    var v = String(value).toLowerCase().trim();
    v = { vlak: 'panel', paneel: 'panel', minimaal: 'minimal', citaat: 'quote',
          redactioneel: 'editorial', balk: 'band', vet: 'bold' }[v] || v;
    return THEMES.indexOf(v) !== -1 ? v : null;
  }

  function gcd(a, b) { while (b) { var t = b; b = a % b; a = t; } return a; }

  /* ===========================================================================
     3. RENDERPIJPLIJN
     ========================================================================= */

  /* Het canvas krijgt zijn werkelijke pixelmaat; --u is de ontwerpunit
     (displaybreedte gedeeld door 1080). Zo is de preview identiek aan de export.
     De breedte wordt afgerond op een veelvoud waarbij de hoogte een geheel
     getal is - anders wijkt de export een pixel af van 1080 x 1350. */
  function fitCanvas() {
    var r = RATIOS[state.ratio];
    var box = el.stage.getBoundingClientRect();
    var cs = window.getComputedStyle(el.stage);
    var padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    var padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);

    var availW = Math.max(160, box.width - padX);
    var availH = STACKED.matches
      ? Math.max(240, window.innerHeight * 0.62)      // gestapeld: hoogte volgt de inhoud
      : Math.max(160, box.height - padY);

    var step = r.w / gcd(r.w, r.h);
    var w = Math.min(availW, availH * (r.w / r.h), 760);
    w = Math.max(step * Math.ceil(180 / step), Math.floor(w / step) * step);

    var key = w + ':' + state.ratio;
    if (key !== fitKey) {
      fitKey = key;
      displayW = w;
      el.canvas.style.width = w + 'px';
      el.canvas.style.height = Math.round(w * r.h / r.w) + 'px';
      el.canvas.style.setProperty('--u', (w / r.w).toFixed(5));
    }
  }

  /* Achtergrond: cover-formaat wordt zelf uitgerekend zodat de zoom exact
     werkt en html2canvas dezelfde uitsnede oplevert. */
  function renderImage() {
    if (!state.image) {
      el.pcImage.style.backgroundImage = 'none';
      return;
    }
    var url = 'url("' + state.image + '")';
    if (el.pcImage.style.backgroundImage !== url) el.pcImage.style.backgroundImage = url;

    var r = RATIOS[state.ratio];
    var zoom = state.zoom / 100;

    if (state.imageRatio) {
      var boxRatio = r.w / r.h;
      var bw, bh;
      if (state.imageRatio > boxRatio) { bh = 100; bw = 100 * state.imageRatio / boxRatio; }
      else { bw = 100; bh = 100 * boxRatio / state.imageRatio; }
      el.pcImage.style.backgroundSize = (bw * zoom).toFixed(2) + '% ' + (bh * zoom).toFixed(2) + '%';
    } else {
      el.pcImage.style.backgroundSize = zoom === 1 ? 'cover' : (100 * zoom).toFixed(2) + '% auto';
    }

    el.pcImage.style.backgroundPosition =
      '50% ' + (state.focus === 'top' ? '0%' : state.focus === 'bottom' ? '100%' : '50%');
  }

  function renderStyle() {
    var c = el.canvas;
    var fonts = FONTS[state.font] || FONTS.brand;

    var cls = [
      'post-canvas',
      'theme-' + state.theme,
      'al-' + state.align,
      'va-' + state.valign,
      state.image ? 'has-image' : '',
      state.badge ? 'has-badge' : ''
    ].filter(Boolean).join(' ');
    if (c.className !== cls) c.className = cls;

    c.style.setProperty('--ts', (state.textScale / 100).toFixed(3));
    c.style.setProperty('--pad', state.padding);
    c.style.setProperty('--pc-accent', state.accent);
    c.style.setProperty('--pc-text', state.textColor);
    c.style.setProperty('--pc-head', state.textColor);
    c.style.setProperty('--pc-head-ink', state.headColor);
    c.style.setProperty('--pc-ink', state.inkColor);
    c.style.setProperty('--pc-ink-rgb', BRAND.hexToRgb(state.inkColor).join(', '));
    c.style.setProperty('--pc-panel', state.panelColor);
    c.style.setProperty('--pc-ov', (state.overlay / 100).toFixed(3));
    c.style.setProperty('--pc-ov-rgb', state.overlayRgb);
    c.style.setProperty('--pc-radius', state.sharp ? '0px' : 'calc(var(--u) * 22px)');
    c.style.setProperty('--pc-font-h', fonts.h);
    c.style.setProperty('--pc-font-b', fonts.b);

    setText(el.pcBadge, state.badge);
    el.pcBadge.hidden = !state.badge;

    if (state.logo) {
      if (el.pcLogo.getAttribute('src') !== state.logo) el.pcLogo.src = state.logo;
      el.pcLogo.hidden = false;
      el.pcLogo.className = 'pc-logo pos-' + state.logoPos + (state.logoPlate ? ' has-plate' : '');
      c.style.setProperty('--logo', state.logoSize);
    } else {
      el.pcLogo.hidden = true;
      el.pcLogo.removeAttribute('src');
    }
  }

  /* Tekst krimpt automatisch tot ze binnen de veilige zone past.
     Binaire zoektocht: 8 stappen zijn ruim genoeg en blijven vloeiend. */
  function autoFit() {
    var c = el.canvas;
    c.style.setProperty('--fit', '1');

    var avail = el.pcBody.clientHeight;
    if (!state.autoFit || !avail || el.pcFlow.offsetHeight <= avail) {
      setText(el.fitInfo, 'Schaal 100%');
      return;
    }

    var lo = 0.5, hi = 1, mid;
    for (var i = 0; i < 8; i++) {
      mid = (lo + hi) / 2;
      c.style.setProperty('--fit', mid.toFixed(3));
      if (el.pcFlow.offsetHeight > avail) hi = mid; else lo = mid;
    }
    c.style.setProperty('--fit', lo.toFixed(3));
    setText(el.fitInfo, 'Schaal ' + Math.round(lo * 100) + '%' + (lo <= 0.5 ? ' (tekst past niet, kort in)' : ''));
  }

  /* Bedieningselementen gelijktrekken met de state (na frontmatter of reset) */
  function syncUI() {
    setRadio('ratio', state.ratio);
    setRadio('focus', state.focus);
    setRadio('theme', state.theme);
    setRadio('align', state.align);
    setRadio('valign', state.valign);
    setRadio('format', state.format);
    setRadio('editMode', state.editMode);

    setVal($('overlay'), state.overlay);
    setVal($('zoom'), state.zoom);
    setVal($('textScale'), state.textScale);
    setVal($('padding'), state.padding);
    setVal($('logoSize'), state.logoSize);
    setVal($('logoPos'), state.logoPos);
    setVal($('exportScale'), state.exportScale);
    setVal($('badge'), state.badge);
    setVal(el.font, state.font);
    setVal(el.accent, state.accent);
    setVal(el.textColor, state.textColor);

    setChecked($('mdToggle'), state.markdown);
    setChecked($('autoFit'), state.autoFit);
    setChecked($('sharpCorners'), state.sharp);
    setChecked($('logoPlate'), state.logoPlate);

    setText($('overlayVal'), state.overlay + '%');
    setText($('zoomVal'), state.zoom + '%');
    setText($('textScaleVal'), state.textScale + '%');
    setText($('paddingVal'), String(state.padding));
    setText($('logoSizeVal'), String(state.logoSize));
    setText(el.accentHex, state.accent);
    setText(el.textHex, state.textColor);

    var isFields = state.editMode === 'fields';
    el.fieldsEditor.hidden = !isFields;
    el.markdownEditor.hidden = isFields;
    el.mdToggleWrap.hidden = isFields;

    var r = RATIOS[state.ratio];
    setText(el.dimPill, r.w + ' × ' + r.h);
    setText(el.themePill, state.theme.charAt(0).toUpperCase() + state.theme.slice(1));

    setText(el.charCount, state.content.length + ' tekens');
    setText(el.wordCount, String((MD.splitFrontmatter(state.content).body.trim().match(/\S+/g) || []).length));

    Array.prototype.forEach.call(el.photoPicks.children, function (btn) {
      btn.classList.toggle('is-active', btn.dataset.src === state.imageSrc);
    });
    Array.prototype.forEach.call(el.logoPicks.children, function (btn) {
      btn.classList.toggle('is-active', btn.dataset.src === (state.logoSrc || ''));
    });
  }

  /* Markdown alleen opnieuw ontleden als de tekst of de schakelaar veranderde;
     sliders en resizes hoeven de parser niet te raken. */
  var parseCache = { content: null, markdown: null, parsed: null };
  function parseContent() {
    if (parseCache.parsed && parseCache.content === state.content && parseCache.markdown === state.markdown) {
      return parseCache.parsed;
    }
    var parsed = MD.parse(state.content, { markdown: state.markdown });
    parseCache = { content: state.content, markdown: state.markdown, parsed: parsed };
    return parsed;
  }

  /* Eén doorloop: markdown ontleden, stijl toepassen, tekst plaatsen, passend maken */
  function render() {
    // In veldenmodus is markdown altijd aan: de velden genereren immers markdown
    if (state.editMode === 'fields') state.markdown = true;

    var parsed = parseContent();

    // Frontmatter alleen toepassen als het blok zélf is gewijzigd — anders zou
    // elke toetsaanslag je handmatige schuifjes terugzetten.
    var sig = JSON.stringify(parsed.meta);
    if (sig !== lastMetaSig) {
      lastMetaSig = sig;
      var applied = Object.keys(parsed.meta).length ? applyMeta(parsed.meta) : [];
      if (!exporting) {
        el.statusLine.textContent = applied.length
          ? 'Frontmatter toegepast: ' + applied.map(function (a) { return a.key; }).join(', ')
          : DEFAULT_STATUS;
      }
    }

    fitCanvas();
    renderImage();
    renderStyle();
    if (parsed.html !== lastHtml) {
      el.pcFlow.innerHTML = parsed.html;
      lastHtml = parsed.html;
    }
    autoFit();
    syncUI();
    persistSoon();
  }

  /* Eén fout in de render mag de rest van de tool niet lamleggen */
  function safeRender() {
    try {
      render();
    } catch (err) {
      if (window.console && console.error) console.error(err);
      if (!renderErrorShown) {
        renderErrorShown = true;
        toast('De preview kon niet worden ververst: ' + (err && err.message ? err.message : err), 'error');
      }
    }
  }

  /* Meerdere wijzigingen in één frame bundelen */
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    renderHandle = requestAnimationFrame(function () { renderQueued = false; safeRender(); });
  }

  /* Wachtende render meteen uitvoeren - nodig voor de export, die anders
     een frame achter kan lopen op de laatste wijziging. */
  function flushRender() {
    if (renderQueued) { cancelAnimationFrame(renderHandle); renderQueued = false; }
    render();
  }

  /* ===========================================================================
     4. MARKDOWN-FRONTMATTER -> STATE
     -----------------------------------------------------------------------
     Sleutels zijn genormaliseerd (kleine letters, zonder spaties/streepjes),
     dus "Text Color", "text-color" en "textcolor" komen allemaal hier uit.
     ========================================================================= */
  function applyMeta(meta) {
    var applied = [];

    Object.keys(meta).forEach(function (key) {
      if (key.indexOf('__raw__') === 0) return;

      var value = meta[key];
      var ok = true;
      var tmp;

      switch (key) {
        case 'ratio': case 'format': case 'aspect': case 'formaat': case 'beeldverhouding':
          tmp = normRatio(value); if (tmp) state.ratio = tmp; else ok = false; break;

        case 'theme': case 'sjabloon': case 'preset': case 'template':
          tmp = normTheme(value); if (tmp) state.theme = tmp; else ok = false; break;

        case 'font': case 'fontfamily': case 'lettertype': case 'headingfont': case 'kopfont':
          tmp = normFont(value); if (tmp) state.font = tmp; else ok = false; break;

        case 'accent': case 'accentcolor': case 'accentkleur':
          tmp = toHex(value); if (tmp) state.accent = tmp; else ok = false; break;

        case 'color': case 'textcolor': case 'tekstkleur': case 'text':
          tmp = toHex(value); if (tmp) state.textColor = tmp; else ok = false; break;

        case 'ink': case 'inkcolor': case 'inktkleur':
          tmp = toHex(value); if (tmp) state.inkColor = tmp; else ok = false; break;

        case 'panel': case 'panelcolor': case 'vlakkleur':
          tmp = toHex(value); if (tmp) state.panelColor = tmp; else ok = false; break;

        case 'headingcolor': case 'kopkleur':
          tmp = toHex(value); if (tmp) state.headColor = tmp; else ok = false; break;

        case 'overlay': case 'dim': case 'scrim': case 'donkerte':
          tmp = toPercent(value, 0, 90); if (tmp !== null) state.overlay = tmp; else ok = false; break;

        case 'overlaycolor': case 'scrimcolor':
          tmp = toHex(value);
          if (tmp) state.overlayRgb = BRAND.hexToRgb(tmp).join(', '); else ok = false; break;

        case 'align': case 'textalign': case 'uitlijning':
          tmp = String(value).toLowerCase().trim();
          tmp = { links: 'left', midden: 'center', centre: 'center', rechts: 'right' }[tmp] || tmp;
          if (['left', 'center', 'right'].indexOf(tmp) !== -1) state.align = tmp; else ok = false; break;

        case 'position': case 'valign': case 'vertical': case 'positie': case 'anchor':
          tmp = String(value).toLowerCase().trim();
          tmp = { boven: 'top', midden: 'middle', center: 'middle', onder: 'bottom', beneden: 'bottom' }[tmp] || tmp;
          if (['top', 'middle', 'bottom'].indexOf(tmp) !== -1) state.valign = tmp; else ok = false; break;

        case 'scale': case 'textscale': case 'tekstgrootte': case 'fontsize':
          tmp = toPercent(value, 70, 145); if (tmp !== null) state.textScale = tmp; else ok = false; break;

        case 'padding': case 'margin': case 'marge': case 'inset':
          tmp = parseInt(value, 10);
          if (!isNaN(tmp)) state.padding = clamp(tmp, 32, 160); else ok = false; break;

        case 'zoom': case 'imagezoom': case 'beeldzoom':
          tmp = toPercent(value, 100, 180); if (tmp !== null) state.zoom = tmp; else ok = false; break;

        case 'focus': case 'crop': case 'uitsnede':
          tmp = String(value).toLowerCase().trim();
          tmp = { boven: 'top', midden: 'center', onder: 'bottom' }[tmp] || tmp;
          if (['top', 'center', 'bottom'].indexOf(tmp) !== -1) state.focus = tmp; else ok = false; break;

        case 'badge': case 'handle': case 'author': case 'auteur': case 'bijschrift':
          state.badge = String(value).slice(0, 40); break;

        case 'radius': case 'cornerradius': case 'hoeken':
          tmp = String(value).trim();
          // "recht", "0", "0px" -> strak; "10px", "rond" -> afgerond
          state.sharp = /recht|strak|sharp|geen|none/i.test(tmp) || /^0+(\.0+)?\s*(px|rem|em|%)?$/.test(tmp);
          break;

        case 'autofit':
          state.autoFit = /^(ja|yes|true|aan|on|1)$/i.test(value); break;

        case 'logo':
          tmp = String(value).trim();
          if (/^(geen|none|nee|no|false)$/i.test(tmp)) { state.logo = ''; state.logoSrc = ''; }
          else { state.logo = tmp; state.logoSrc = tmp; embedLogo(tmp); }
          break;

        case 'logosize': case 'logogrootte':
          tmp = parseInt(value, 10);
          if (!isNaN(tmp)) state.logoSize = clamp(tmp, 60, 320); else ok = false; break;

        case 'logoposition': case 'logopos':
          tmp = String(value).toLowerCase().replace(/[^a-z]/g, '');
          tmp = { linksboven: 'tl', rechtsboven: 'tr', linksonder: 'bl', rechtsonder: 'br',
                  topleft: 'tl', topright: 'tr', bottomleft: 'bl', bottomright: 'br' }[tmp] || tmp;
          if (['tl', 'tr', 'bl', 'br'].indexOf(tmp) !== -1) state.logoPos = tmp; else ok = false; break;

        default:
          ok = false;
      }

      if (ok) applied.push({ key: key, value: String(value) });
    });

    return applied;
  }

  /* ===========================================================================
     5. TEKSTVELDEN <-> MARKDOWN
     -----------------------------------------------------------------------
     De markdown in state.content blijft de bron. De velden-editor is een
     vriendelijke laag daarbovenop: velden -> markdown bij elke aanslag, en
     markdown -> velden zodra je van modus wisselt of een bestand laadt.
     Frontmatter en ```style-blokken blijven daarbij ongemoeid.
     ========================================================================= */
  var fieldsMeta = { front: '', extra: '' };

  function fieldsFromContent(content) {
    var src = String(content || '').replace(/\r\n/g, '\n');
    var split = MD.splitFrontmatter(src);
    var front = src.slice(0, src.length - split.body.length);

    var f = { label: '', title: [], body: [], list: [], quote: [], extra: [] };
    var para = [];
    var fence = null;

    function flushPara() { if (para.length) { f.body.push(para.join('\n')); para = []; } }

    split.body.split('\n').forEach(function (line) {
      var t = line.trim();

      if (fence) {                                   // binnen een codeblok: bewaren
        fence.push(line);
        if (/^```/.test(t)) { f.extra.push(fence.join('\n')); fence = null; }
        return;
      }
      if (/^```/.test(t)) { flushPara(); fence = [line]; return; }
      if (!t) { flushPara(); return; }

      var m;
      if ((m = t.match(/^#{3,6}\s+(.*)$/))) { flushPara(); if (!f.label) f.label = m[1]; else para.push(m[1]); return; }
      if ((m = t.match(/^#{1,2}\s+(.*)$/)))  { flushPara(); f.title.push(m[1]); return; }
      if ((m = t.match(/^[-*+]\s+(.*)$/)))   { flushPara(); f.list.push(m[1]); return; }
      if ((m = t.match(/^>\s?(.*)$/)))       { flushPara(); f.quote.push(m[1]); return; }
      if (/^([-*_])\1{2,}$/.test(t.replace(/\s/g, ''))) { flushPara(); return; }   // scheidingslijn
      para.push(t);
    });
    if (fence) f.extra.push(fence.join('\n'));
    flushPara();

    return {
      front: front,
      extra: f.extra.join('\n\n'),
      label: f.label,
      title: f.title.join('\n'),
      body: f.body.join('\n\n'),
      list: f.list.join('\n'),
      quote: f.quote.join(' ')
    };
  }

  function contentFromFields(f) {
    var parts = [];
    var label = f.label.trim();
    var title = f.title.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var body = f.body.replace(/\s+$/, '').replace(/^\n+/, '');
    var list = f.list.split('\n').map(function (l) { return l.trim().replace(/^[-*+•]\s*/, ''); }).filter(Boolean);
    var quote = f.quote.trim();

    if (label) parts.push('### ' + label);
    if (title.length) parts.push(title.map(function (l) { return '# ' + l; }).join('\n'));
    if (body) parts.push(body);
    if (list.length) parts.push(list.map(function (l) { return '- ' + l; }).join('\n'));
    if (quote) parts.push('> ' + quote);
    if (f.extra) parts.push(f.extra);

    var out = parts.join('\n\n');
    return f.front ? f.front + (out ? '\n' + out : '') : out;
  }

  /* Velden vullen vanuit de huidige markdown */
  function fillFields() {
    var f = fieldsFromContent(state.content);
    fieldsMeta.front = f.front;
    fieldsMeta.extra = f.extra;
    Object.keys(fieldEls).forEach(function (k) { setVal(fieldEls[k], f[k]); });
  }

  /* Markdown opbouwen uit wat er nu in de velden staat */
  function contentFromFieldEls() {
    var f = { front: fieldsMeta.front, extra: fieldsMeta.extra };
    Object.keys(fieldEls).forEach(function (k) { f[k] = fieldEls[k].value; });
    return contentFromFields(f);
  }

  function setContent(text, resetMeta) {
    state.content = text;
    if (resetMeta) lastMetaSig = '';   // frontmatter mag opnieuw doorwerken
    setVal(el.content, text);
    fillFields();
    scheduleRender();
  }

  /* Opmaakknoppen boven het markdown-veld: regelprefix aan/uit of vet om de selectie */
  function applyMdAction(action) {
    var ta = el.content;
    var v = ta.value;
    var start = ta.selectionStart, end = ta.selectionEnd;

    if (action === 'bold') {
      var sel = v.slice(start, end) || 'vet';
      ta.setRangeText('**' + sel + '**', start, end, 'select');
      ta.setSelectionRange(start + 2, start + 2 + sel.length);
    } else {
      var prefix = { h1: '# ', h3: '### ', list: '- ', quote: '> ' }[action];
      if (!prefix) return;
      var ls = v.lastIndexOf('\n', start - 1) + 1;
      var le = v.indexOf('\n', end); if (le === -1) le = v.length;
      var lines = v.slice(ls, le).split('\n').map(function (l) {
        var bare = l.replace(/^(#{1,6}\s+|[-*+]\s+|>\s?)/, '');
        return l.indexOf(prefix) === 0 ? bare : prefix + bare;   // tweede klik haalt de opmaak weer weg
      });
      ta.setRangeText(lines.join('\n'), ls, le, 'end');
    }
    ta.focus();
    state.content = ta.value;
    fillFields();
    scheduleRender();
  }

  /* ===========================================================================
     6. EIGEN LETTERTYPEN
     -----------------------------------------------------------------------
     Een geüpload font wordt als @font-face met data-URL in een <style> gezet.
     Dat is bewust geen FontFace-API: html2canvas kloont het document met zijn
     stylesheets, en alleen zo komt het font ook in de export terecht.
     ========================================================================= */
  function fontFormat(name) {
    var ext = (String(name).match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
    return { otf: 'opentype', ttf: 'truetype', woff: 'woff', woff2: 'woff2' }[ext] || null;
  }

  function fontStyleEl() {
    var style = $('customFontStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'customFontStyle';
      document.head.appendChild(style);
    }
    return style;
  }

  function injectCustomFonts() {
    var css = [];
    ['heading', 'body'].forEach(function (slot) {
      var f = customFonts[slot];
      if (!f) return;
      css.push("@font-face { font-family: '" + CUSTOM_FAMILY[slot] + "'; src: url(" + f.dataUrl +
               ") format('" + f.format + "'); font-weight: 100 900; font-style: normal; font-display: block; }");
    });
    fontStyleEl().textContent = css.join('\n');
    rebuildCustomFontEntry();
  }

  function rebuildCustomFontEntry() {
    var h = customFonts.heading, b = customFonts.body;
    if (!h && !b) {
      delete FONTS.custom;
      if (state.font === 'custom') state.font = 'brand';
    } else {
      var famH = h ? CUSTOM_FAMILY.heading : CUSTOM_FAMILY.body;
      var famB = b ? CUSTOM_FAMILY.body : CUSTOM_FAMILY.heading;
      FONTS.custom = {
        label: 'Eigen — ' + [h && h.name, b && b.name].filter(Boolean).join(' + '),
        h: "'" + famH + "', " + BRAND_FONT_H,
        b: "'" + famB + "', " + BRAND_FONT_B
      };
    }
    buildFontSelect();

    setText(el.customHeadName, h ? h.name : 'geen');
    setText(el.customBodyName, b ? b.name : 'geen');
    el.customHeadName.classList.toggle('is-set', !!h);
    el.customBodyName.classList.toggle('is-set', !!b);
    el.customHeadClear.hidden = !h;
    el.customBodyClear.hidden = !b;
  }

  function useCustomFont(slot, file) {
    var format = fontFormat(file.name);
    if (!format) { toast('Kies een OTF-, TTF-, WOFF- of WOFF2-bestand.', 'error'); return; }
    if (file.size > MAX_FONT_BYTES) { toast('Dit lettertype is te groot (' + humanSize(file.size) + '). Maximaal 8 MB.', 'error'); return; }

    readFile(file, 'dataurl', function (dataUrl) {
      var rec = { name: file.name.replace(/\.[^.]+$/, ''), dataUrl: dataUrl, format: format };
      var previous = customFonts[slot];
      customFonts[slot] = rec;
      injectCustomFonts();

      var check = (document.fonts && typeof document.fonts.load === 'function')
        ? document.fonts.load("16px '" + CUSTOM_FAMILY[slot] + "'").then(function (faces) {
            if (!faces || !faces.length) throw new Error('niet geladen');
          })
        : Promise.resolve();

      check.then(function () {
        state.font = 'custom';
        scheduleRender();
        DB.set('font:' + slot, rec).catch(noop);
        toast('Lettertype geladen: ' + rec.name, 'ok');
      }).catch(function () {
        customFonts[slot] = previous;
        injectCustomFonts();
        scheduleRender();
        toast('Dit lettertype kon niet worden gelezen: ' + file.name, 'error');
      });
    });
  }

  function clearCustomFont(slot) {
    customFonts[slot] = null;
    injectCustomFonts();
    DB.del('font:' + slot).catch(noop);
    scheduleRender();
  }

  function restoreCustomFonts() {
    return Promise.all([DB.get('font:heading'), DB.get('font:body')])
      .then(function (res) {
        ['heading', 'body'].forEach(function (slot, i) {
          var rec = res[i];
          if (rec && typeof rec.dataUrl === 'string' && rec.format && rec.name) customFonts[slot] = rec;
        });
      })
      .catch(noop)
      .then(function () {
        injectCustomFonts();          // ruimt ook 'custom' op als er niets bewaard was
        scheduleRender();
      });
  }

  /* ===========================================================================
     MERKSTIJL UIT MARKDOWN
     ========================================================================= */

  /* Lettertypekiezer opbouwen (labels veranderen mee met de merkstijl) */
  function buildFontSelect() {
    var current = state.font || el.font.value;
    el.font.innerHTML = '';
    Object.keys(FONTS).forEach(function (key) {
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = FONTS[key].label;
      el.font.appendChild(opt);
    });
    el.font.value = FONTS[current] ? current : 'brand';
  }

  function setBrandFonts(fonts) {
    brandFonts = fonts || null;
    if (brandFonts && (brandFonts.heading || brandFonts.body)) {
      FONTS.brand.h = "'" + (brandFonts.heading || 'Built Titling') + "', 'Bebas Neue', Impact, sans-serif";
      FONTS.brand.b = "'" + (brandFonts.body || 'Circular Std') + "', 'Inter', system-ui, sans-serif";
      FONTS.brand.label = 'Merkstijl: ' + [brandFonts.heading, brandFonts.body].filter(Boolean).join(' + ');
    } else {
      brandFonts = null;
      FONTS.brand.h = BRAND_FONT_H;
      FONTS.brand.b = BRAND_FONT_B;
      FONTS.brand.label = BRAND_LABEL;
    }
    buildFontSelect();
  }

  /* Snelkeuzetegels voor de meegeleverde beelden en logo's */
  function buildPicks() {
    PHOTOS.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.title = item.label;
      btn.setAttribute('aria-label', 'Foto: ' + item.label);
      btn.dataset.src = item.src;
      btn.style.backgroundImage = 'url("' + item.src + '")';
      btn.addEventListener('click', function () { useAssetImage(item); });
      el.photoPicks.appendChild(btn);
    });

    LOGOS.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.title = item.label;
      btn.setAttribute('aria-label', 'Logo: ' + item.label);
      btn.dataset.src = item.src;
      if (item.src) { btn.style.backgroundImage = 'url("' + item.src + '")'; }
      else { btn.className = 'pick--none'; btn.textContent = 'Geen'; }
      btn.addEventListener('click', function () {
        if (!item.src) { state.logo = ''; state.logoSrc = ''; scheduleRender(); return; }
        useAssetLogo(item);
      });
      el.logoPicks.appendChild(btn);
    });
  }

  /* Meegeleverde afbeelding inladen. Eerst proberen we er een data-URL van te
     maken (betrouwbare export); lukt dat niet (file://), dan het pad zelf. */
  function useAssetImage(item) {
    el.statusLine.textContent = 'Foto laden…';
    toDataUrl(item.src)
      .catch(function () { return item.src; })
      .then(function (url) {
        var img = new Image();
        img.onload = function () {
          state.image = url;
          state.imageSrc = item.src;
          state.imageName = item.src.split('/').pop();
          state.imageRatio = img.naturalWidth / img.naturalHeight;
          el.statusLine.textContent = DEFAULT_STATUS;
          showImageCard(null);
          scheduleRender();
          DB.del('image').catch(noop);
          if (!isDataUrl(url) && IS_FILE) {
            showEnvNotice('Deze foto kan straks niet worden geëxporteerd', fileNoticeHtml());
          }
        };
        img.onerror = function () {
          el.statusLine.textContent = DEFAULT_STATUS;
          toast('Kon ' + item.src + ' niet laden.', 'error');
        };
        img.src = url;
      });
  }

  /* Logo uit /assets: pad direct tonen, data-URL volgt zodra die er is */
  function embedLogo(src) {
    if (!src || isDataUrl(src)) return;
    toDataUrl(src)
      .then(function (url) {
        if (state.logoSrc !== src) return;      // gebruiker koos inmiddels iets anders
        state.logo = url;
        scheduleRender();
      })
      .catch(noop);                             // file://: pad blijft staan, export waarschuwt
  }
  function useAssetLogo(item) {
    state.logo = item.src;
    state.logoSrc = item.src;
    scheduleRender();
    embedLogo(item.src);
  }

  /* Geuploade foto verwerken: te grote beelden worden verkleind zodat de
     preview vloeiend blijft en de export niet minutenlang duurt. De foto wordt
     in IndexedDB bewaard zodat hij een herlaadbeurt overleeft. */
  function useUploadedImage(file) {
    if (!/^image\//.test(file.type)) { toast('Dat is geen afbeelding: ' + file.name, 'error'); return; }
    if (file.size > MAX_UPLOAD_BYTES) { toast('Deze foto is te groot (' + humanSize(file.size) + '). Maximaal 40 MB.', 'error'); return; }

    el.statusLine.textContent = 'Foto verwerken…';
    readFile(file, 'dataurl', function (dataUrl) {
      var img = new Image();
      img.onload = function () {
        var url = dataUrl;
        var w = img.naturalWidth, h = img.naturalHeight;
        var longest = Math.max(w, h);

        if (longest > MAX_IMAGE_EDGE) {
          try {
            var f = MAX_IMAGE_EDGE / longest;
            var cv = document.createElement('canvas');
            cv.width = Math.round(w * f);
            cv.height = Math.round(h * f);
            var ctx = cv.getContext('2d');
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, cv.width, cv.height);
            url = cv.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.92);
          } catch (err) { url = dataUrl; }
        }

        state.image = url;
        state.imageSrc = '';
        state.imageName = file.name;
        state.imageRatio = w / h;
        el.statusLine.textContent = DEFAULT_STATUS;
        showImageCard(file);
        scheduleRender();
        DB.set('image', { dataUrl: url, name: file.name, ratio: w / h, size: file.size }).catch(noop);
        toast('Foto geplaatst: ' + file.name, 'ok');
      };
      img.onerror = function () {
        el.statusLine.textContent = DEFAULT_STATUS;
        toast('Deze afbeelding kan de browser niet weergeven (' + file.name + '). Gebruik JPG, PNG of WebP.', 'error');
      };
      img.src = dataUrl;
    });
  }

  function restoreUploadedImage() {
    if (state.imageSrc) return Promise.resolve();
    return DB.get('image').then(function (rec) {
      if (!rec || !isDataUrl(rec.dataUrl)) return;
      state.image = rec.dataUrl;
      state.imageSrc = '';
      state.imageName = rec.name || 'foto';
      state.imageRatio = rec.ratio || null;
      showImageCard(rec.size ? { size: rec.size } : null);
      scheduleRender();
    }).catch(noop);
  }

  function showImageCard(file) {
    el.imageCard.hidden = !state.image;
    el.imageDrop.hidden = !!state.image;
    if (!state.image) return;
    el.imageThumb.style.backgroundImage = 'url("' + state.image + '")';
    el.imageName.textContent = state.imageName;
    el.imageSize.textContent = file ? humanSize(file.size)
      : (state.imageRatio ? state.imageRatio.toFixed(2) + ' : 1' : 'uit assets');
  }

  function clearImage() {
    state.image = null; state.imageSrc = ''; state.imageName = ''; state.imageRatio = null;
    showImageCard(null);
    scheduleRender();
    DB.del('image').catch(noop);
  }

  /* --- De kern: een stijlgids omzetten in postopmaak.
         Geeft false terug als er niets bruikbaars in het bestand zat. --- */
  function loadBrandText(text, filename, quiet) {
    var b = BRAND.extract(text);
    var inlineMeta = MD.splitFrontmatter(text).meta;

    if (!b.colors.length && !b.fonts.heading && !b.fonts.body && !Object.keys(inlineMeta).length) {
      if (!quiet) toast('Geen stijlwaarden gevonden in ' + filename + '.', 'error');
      return false;
    }

    brandData = b;

    if (b.roles.accent)  state.accent = b.roles.accent;
    if (b.roles.ink)     state.inkColor = b.roles.ink;
    if (b.roles.panel)   state.panelColor = b.roles.panel;
    if (b.roles.heading) state.headColor = b.roles.heading;
    if (b.radius !== null) state.sharp = b.radius === 0;
    if (b.handle && !state.badge) state.badge = b.handle;

    if (b.fonts.heading || b.fonts.body) {
      setBrandFonts(b.fonts);
      state.font = 'brand';
    }

    // Expliciete frontmatter in hetzelfde bestand wint van de gescande waarden
    applyMeta(inlineMeta);

    renderBrandReport(b, filename);
    scheduleRender();
    toast('Merkstijl overgenomen uit ' + filename, 'ok');
    return true;
  }

  function chip(label, value, color) {
    var li = document.createElement('li');
    if (color) {
      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = color;
      li.appendChild(dot);
    }
    var b = document.createElement('b');
    b.textContent = label;
    li.appendChild(b);
    li.appendChild(document.createTextNode(' ' + value));
    return li;
  }

  function renderBrandReport(b, filename) {
    el.brandFile.textContent = filename;
    el.brandReport.hidden = false;
    el.brandReset.hidden = false;
    el.brandChips.innerHTML = '';
    el.brandSwatches.innerHTML = '';

    var labels = { accent: 'accent', heading: 'kop', ink: 'tekst', panel: 'vlak', bg: 'achtergrond' };
    Object.keys(labels).forEach(function (role) {
      if (b.roles[role]) el.brandChips.appendChild(chip(labels[role], b.roles[role], b.roles[role]));
    });
    if (b.fonts.heading) el.brandChips.appendChild(chip('kopfont', b.fonts.heading));
    if (b.fonts.body)    el.brandChips.appendChild(chip('tekstfont', b.fonts.body));
    if (b.radius !== null) el.brandChips.appendChild(chip('hoeken', b.radius === 0 ? 'recht' : b.radius + 'px'));
    if (b.handle) el.brandChips.appendChild(chip('handle', b.handle));

    b.colors.forEach(function (c) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.style.background = c.hex;
      btn.dataset.name = c.name + ' – ' + c.hex;
      btn.setAttribute('aria-label', c.name + ' ' + c.hex);
      btn.addEventListener('click', function () {
        var target = radio('swatchTarget') || 'accent';
        state[target] = c.hex;
        scheduleRender();
        toast(c.hex + ' toegepast als ' + { accent: 'accent', textColor: 'tekstkleur', panelColor: 'vlakkleur' }[target], 'ok');
      });
      el.brandSwatches.appendChild(btn);
    });

    el.brandInfo.textContent = 'Stijlgids: ' + filename + ' — ' + b.colors.length + ' kleuren';

    // Eerlijke waarschuwing: een heel donker accent verdwijnt op donkere fotos
    if (b.roles.accent && BRAND.contrastRatio(b.roles.accent, '#000000') < 2.2) {
      toast('Let op: dit accent heeft weinig contrast op donkere foto’s.', 'warn');
    }
  }

  function clearBrand() {
    brandData = null;
    setBrandFonts(null);
    el.brandReport.hidden = true;
    el.brandReset.hidden = true;
    el.brandInfo.textContent = 'Geen stijlgids geladen';
    scheduleRender();
  }

  /* Merklettertypen echt laden en controleren; zonder server mislukt dit en
     vallen we terug op Bebas Neue / Inter. Dat melden we één keer. */
  function checkBrandFonts() {
    if (!document.fonts || typeof document.fonts.load !== 'function') return;
    Promise.all([
      document.fonts.load("400 16px 'Built Titling'"),
      document.fonts.load("400 16px 'Circular Std'")
    ]).then(function (res) {
      brandFontsOk = res.every(function (faces) { return faces && faces.length > 0; });
    }).catch(function () {
      brandFontsOk = false;
    }).then(function () {
      if (brandFontsOk) return;
      if (IS_FILE) {
        showEnvNotice('Je opent de tool rechtstreeks vanaf schijf (file://)', fileNoticeHtml());
      } else {
        toast('Merklettertypen (Built Titling / Circular Std) konden niet worden geladen — er wordt een vervangend lettertype gebruikt.', 'warn', 7000);
      }
      scheduleRender();
    });
  }

  /* ===========================================================================
     7. EVENTS
     ========================================================================= */
  function on(node, ev, fn) { if (node) node.addEventListener(ev, fn); }

  function bindRadio(name, key, after) {
    Array.prototype.forEach.call(document.querySelectorAll('input[name="' + name + '"]'), function (input) {
      input.addEventListener('change', function () {
        if (!input.checked) return;
        state[key] = input.value;
        if (after) after(input.value);
        scheduleRender();
      });
    });
  }

  function bindRange(id, key) {
    on($(id), 'input', function (e) { state[key] = parseInt(e.target.value, 10); scheduleRender(); });
  }

  function bindCheck(id, key) {
    on($(id), 'change', function (e) { state[key] = e.target.checked; scheduleRender(); });
  }

  function hasFiles(e) {
    var types = e.dataTransfer && e.dataTransfer.types;
    return !!types && Array.prototype.indexOf.call(types, 'Files') !== -1;
  }

  /* Dropzone: klikken, toetsenbord en slepen */
  function bindDrop(zone, input, handler) {
    on(zone, 'click', function () { input.click(); });
    on(zone, 'keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    on(input, 'change', function () {
      if (input.files && input.files[0]) handler(input.files[0]);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) {
        if (!hasFiles(e)) return;
        e.preventDefault(); e.stopPropagation();
        zone.classList.add('is-over');
      });
    });
    ['dragleave', 'dragend'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); zone.classList.remove('is-over'); });
    });
    zone.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); e.stopPropagation();
      zone.classList.remove('is-over');
      handler(e.dataTransfer.files[0]);
    });
  }

  /* Een stijlgids bevat veel tokens en weinig postcopy; zo onderscheiden we
     "geef mij deze stijl" van "gebruik deze tekst". */
  function looksLikeStyleguide(text) {
    var vars = (text.match(/--[a-z][a-z0-9-]*\s*:/gi) || []).length;
    var hex = (text.match(/#[0-9a-f]{6}\b/gi) || []).length;
    var tableRows = (text.match(/^\s*\|.*\|\s*$/gm) || []).length;
    return (vars + hex) >= 4 || tableRows >= 6;
  }

  function setContentFromMd(text, name) {
    setContent(text, true);
    toast('Tekst geladen uit ' + name, 'ok');
  }

  /* Eén ingang voor alle bestanden: afbeelding, tekst, stijlgids of lettertype */
  function routeFile(file, prefer) {
    if (/^image\//.test(file.type)) { useUploadedImage(file); return; }

    if (fontFormat(file.name)) {
      useCustomFont(customFonts.heading && !customFonts.body ? 'body' : 'heading', file);
      return;
    }

    if (/\.(md|markdown|txt)$/i.test(file.name) || /^text\//.test(file.type)) {
      readFile(file, 'text', function (text) {
        if (prefer === 'content') { setContentFromMd(text, file.name); return; }
        if (prefer === 'brand') { loadBrandText(text, file.name); return; }
        // Automatisch herkennen; levert de stijlgids niets op, dan is het tekst
        if (looksLikeStyleguide(text) && loadBrandText(text, file.name, true)) return;
        setContentFromMd(text, file.name);
      });
      return;
    }
    toast('Bestandstype wordt niet ondersteund: ' + file.name, 'error');
  }

  function bindEvents() {
    bindRadio('ratio', 'ratio');
    bindRadio('focus', 'focus');
    bindRadio('theme', 'theme');
    bindRadio('align', 'align');
    bindRadio('valign', 'valign');
    bindRadio('format', 'format');
    bindRadio('editMode', 'editMode', function (mode) {
      if (mode === 'fields') { fillFields(); state.markdown = true; }
      else setVal(el.content, state.content);
    });

    bindRange('overlay', 'overlay');
    bindRange('zoom', 'zoom');
    bindRange('textScale', 'textScale');
    bindRange('padding', 'padding');
    bindRange('logoSize', 'logoSize');

    bindCheck('mdToggle', 'markdown');
    bindCheck('autoFit', 'autoFit');
    bindCheck('sharpCorners', 'sharp');
    bindCheck('logoPlate', 'logoPlate');

    /* Velden -> markdown */
    Object.keys(fieldEls).forEach(function (k) {
      on(fieldEls[k], 'input', function () {
        state.content = contentFromFieldEls();
        setVal(el.content, state.content);
        scheduleRender();
      });
    });

    /* Markdown -> state (en velden blijven stilletjes mee-actueel) */
    on(el.content, 'input', function (e) { state.content = e.target.value; scheduleRender(); });
    Array.prototype.forEach.call(document.querySelectorAll('.mdbtn[data-md]'), function (btn) {
      btn.addEventListener('click', function () { applyMdAction(btn.dataset.md); });
    });

    on($('badge'), 'input', function (e) { state.badge = e.target.value; scheduleRender(); });
    on(el.font, 'change', function (e) { state.font = e.target.value; scheduleRender(); });
    on($('logoPos'), 'change', function (e) { state.logoPos = e.target.value; scheduleRender(); });
    on($('exportScale'), 'change', function (e) { state.exportScale = e.target.value; persistSoon(); });
    on(el.accent, 'input', function (e) { state.accent = e.target.value; scheduleRender(); });
    on(el.textColor, 'input', function (e) { state.textColor = e.target.value; scheduleRender(); });

    bindDrop(el.imageDrop, el.imageInput, useUploadedImage);
    bindDrop(el.mdDrop, el.mdInput, function (file) { routeFile(file, 'brand'); });

    on(el.imageRemove, 'click', clearImage);
    on(el.brandReset, 'click', clearBrand);
    on(el.envNoticeClose, 'click', hideEnvNotice);

    on($('loadSample'), 'click', function () { setContentFromMd(SAMPLE, 'voorbeeld'); });
    on($('clearContent'), 'click', function () {
      setContent(fieldsMeta.front || '', false);
      if (state.editMode === 'fields' && fieldEls.label) fieldEls.label.focus();
    });
    on($('loadContentMd'), 'click', function () { el.contentMdInput.click(); });
    on(el.contentMdInput, 'change', function () {
      if (el.contentMdInput.files[0]) routeFile(el.contentMdInput.files[0], 'content');
      el.contentMdInput.value = '';
    });

    /* Eigen lettertypen */
    var pendingFontSlot = 'heading';
    on($('customHeadBtn'), 'click', function () { pendingFontSlot = 'heading'; el.customFontInput.click(); });
    on($('customBodyBtn'), 'click', function () { pendingFontSlot = 'body'; el.customFontInput.click(); });
    on(el.customFontInput, 'change', function () {
      if (el.customFontInput.files[0]) useCustomFont(pendingFontSlot, el.customFontInput.files[0]);
      el.customFontInput.value = '';
    });
    on(el.customHeadClear, 'click', function () { clearCustomFont('heading'); });
    on(el.customBodyClear, 'click', function () { clearCustomFont('body'); });

    on($('logoUploadBtn'), 'click', function () { el.logoInput.click(); });
    on(el.logoInput, 'change', function () {
      var file = el.logoInput.files[0];
      if (file) {
        if (!/^image\//.test(file.type) && !/\.svg$/i.test(file.name)) {
          toast('Kies een afbeelding (PNG, SVG, JPG) als logo.', 'error');
        } else {
          readFile(file, 'dataurl', function (url) {
            state.logo = url; state.logoSrc = '';
            scheduleRender();
            toast('Logo geplaatst.', 'ok');
          });
        }
      }
      el.logoInput.value = '';
    });

    /* STYLEGUIDE.md ophalen; onder file:// blokkeert de browser fetch,
       dan vallen we terug op een ingebouwde kopie van de merktokens. */
    on($('loadStyleguide'), 'click', function () {
      var btn = $('loadStyleguide');
      btn.disabled = true;
      Promise.resolve()
        .then(function () { return fetch('STYLEGUIDE.md'); })
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); })
        .then(function (text) { loadBrandText(text, 'STYLEGUIDE.md'); })
        .catch(function () {
          loadBrandText(EMBEDDED_BRAND, 'ingebouwde merktokens');
          if (IS_FILE) {
            toast('STYLEGUIDE.md kan niet worden gelezen over file:// — ingebouwde merktokens gebruikt. ' + SERVER_HINT, 'warn', 8000);
            showEnvNotice('STYLEGUIDE.md kon niet worden geladen', fileNoticeHtml());
          } else {
            toast('STYLEGUIDE.md niet gevonden naast index.html — ingebouwde merktokens gebruikt.', 'warn', 6000);
          }
        })
        .then(function () { btn.disabled = false; });
    });

    on(el.exportBtn, 'click', function () { exportImage('download'); });
    on(el.copyBtn, 'click', function () { exportImage('clipboard'); });
    on($('resetBtn'), 'click', function () {
      if (!window.confirm('Alle instellingen terugzetten naar de standaard? Eigen lettertypen blijven bewaard.')) return;
      state = Object.assign({}, DEFAULTS);
      if (!FONTS.custom && state.font === 'custom') state.font = 'brand';
      clearBrand();
      clearImage();
      setContent(state.content, true);
      toast('Terug naar de standaardinstellingen.', 'ok');
    });

    /* Slepen over het hele venster: afbeelding, markdown of font, automatisch
       herkend. Alleen bestanden - tekst slepen in een veld blijft gewoon werken. */
    var dragTimer;
    window.addEventListener('dragover', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      el.stage.classList.add('is-over');
      clearTimeout(dragTimer);
      dragTimer = setTimeout(function () { el.stage.classList.remove('is-over'); }, 220);
    });
    window.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      clearTimeout(dragTimer);
      el.stage.classList.remove('is-over');
      routeFile(e.dataTransfer.files[0]);
    });

    /* Ctrl/Cmd + S exporteert */
    window.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && typeof e.key === 'string' && e.key.toLowerCase() === 's') {
        e.preventDefault();
        exportImage('download');
      }
    });

    /* Fonts die later binnenkomen (font-display: swap, wisselen van lettertype)
       veranderen de regelval: dan opnieuw passend maken. */
    if (document.fonts && typeof document.fonts.addEventListener === 'function') {
      document.fonts.addEventListener('loadingdone', scheduleRender);
    }

    /* Wisselen tussen gestapelde en brede layout: canvasmaat opnieuw bepalen */
    if (typeof STACKED.addEventListener === 'function') STACKED.addEventListener('change', scheduleRender);
    else if (typeof STACKED.addListener === 'function') STACKED.addListener(scheduleRender);

    window.addEventListener('pagehide', persistNow);
    window.addEventListener('beforeunload', persistNow);
  }

  /* ===========================================================================
     8. EXPORT
     -----------------------------------------------------------------------
     Het canvas staat op werkelijke displaygrootte. html2canvas rendert het
     opnieuw met factor (1080 * resolutie) / displaybreedte, zodat tekst
     vectorscherp blijft en de foto op volle resolutie wordt getekend.
     Daarna wordt het resultaat op exact 1080 x N px gezet: html2canvas rondt
     zelf naar beneden af en levert anders af en toe 1079 px op.
     ========================================================================= */
  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function exportName(ext) {
    return 'post-' + state.ratio.replace(':', 'x') + '-' + stamp() + '.' + ext;
  }

  function downloadBlob(blob, ext) {
    var name = exportName(ext);
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    return name;
  }

  function clipboardSupported() {
    return !!(navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof window.ClipboardItem !== 'undefined');
  }

  /* Klembord: de ClipboardItem krijgt de belofte mee zodat de schrijfactie nog
     binnen het klikgebaar start (Safari eist dat). Oudere browsers krijgen de
     blob pas als die klaar is. */
  function copyBlob(blobPromise) {
    var write;
    try {
      write = navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blobPromise })]);
    } catch (err) {
      write = blobPromise.then(function (blob) {
        return navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
      });
    }
    return Promise.all([blobPromise, write]);
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error('Lege afbeelding'));
        }, mime, quality);
      } catch (err) { reject(err); }   // SecurityError bij een "tainted" canvas
    });
  }

  /* Redenen waarom een export zeker gaat mislukken: liever vooraf melden dan
     een lege of foutieve afbeelding opleveren. */
  function exportBlocker() {
    if (typeof html2canvas === 'undefined') {
      return 'html2canvas is niet geladen — controleer je internetverbinding en herlaad de pagina.';
    }
    if (IS_FILE && state.image && !isDataUrl(state.image)) {
      return 'Deze foto uit /assets kan over file:// niet worden geëxporteerd (de browser blokkeert het canvas). ' +
             SERVER_HINT + ' Of upload de foto via de uploadknop — dat werkt altijd.';
    }
    return null;
  }

  function renderToCanvas(mime) {
    var r = RATIOS[state.ratio];
    var mult = parseInt(state.exportScale, 10) || 1;
    var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();

    return fontsReady
      .then(function () {
        flushRender();          // laatste state + autoFit in de DOM zetten...
        return settle();        // ...en de browser de tijd geven die ook echt te tekenen
      })
      .then(function () {
        var box = el.canvas.getBoundingClientRect();
        var width = box.width || displayW;
        var scale = (r.w * mult) / width;

        return html2canvas(el.canvas, {
          scale: scale,
          useCORS: true,
          allowTaint: false,
          logging: false,
          imageTimeout: 20000,
          backgroundColor: '#141821',
          onclone: function (doc) {
            var empty = doc.getElementById('pcEmpty');
            if (empty) empty.style.display = 'none';
          }
        });
      })
      .then(function (raw) {
        if (!raw || !raw.width || !raw.height) throw new Error('Lege afbeelding');

        var out = document.createElement('canvas');
        out.width = r.w * mult;
        out.height = r.h * mult;
        var ctx = out.getContext('2d');
        if (mime === 'image/jpeg') { ctx.fillStyle = '#141821'; ctx.fillRect(0, 0, out.width, out.height); }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(raw, 0, 0, raw.width, raw.height, 0, 0, out.width, out.height);
        return out;
      });
  }

  function reportExportError(err) {
    var text = String((err && (err.name ? err.name + ': ' + err.message : err.message)) || err || 'onbekende fout');
    if (/security|taint|cross-?origin|cors/i.test(text)) {
      toast('Export geblokkeerd door de browser (beveiligd canvas): een afbeelding komt rechtstreeks van je schijf. ' +
            SERVER_HINT + ' Of upload de foto via de uploadknop.', 'error', 10000);
      showEnvNotice('De export is geblokkeerd', fileNoticeHtml(), true);
    } else if (/notallowed|permission|clipboard|gesture/i.test(text)) {
      toast('Het klembord weigerde de afbeelding. Geef de browser toestemming of gebruik Download.', 'error');
    } else if (/timeout|image/i.test(text)) {
      toast('Een afbeelding kon niet worden geladen voor de export. Probeer het opnieuw of upload de foto zelf.', 'error');
    } else {
      toast('Export mislukt: ' + text, 'error');
    }
  }

  var busyStatus = '';
  function setBusy(busy) {
    exporting = busy;
    el.exportBtn.disabled = busy;
    el.copyBtn.disabled = busy;
    document.body.classList.toggle('is-exporting', busy);
    var label = el.exportBtn.querySelector('span');
    if (busy) {
      var r = RATIOS[state.ratio], mult = parseInt(state.exportScale, 10) || 1;
      label.textContent = 'Bezig met exporteren…';
      busyStatus = el.statusLine.textContent;
      el.statusLine.textContent = 'Exporteren op ' + (r.w * mult) + ' × ' + (r.h * mult) + ' px…';
    } else {
      label.textContent = 'Download post';
      el.statusLine.textContent = busyStatus;
    }
  }

  function exportImage(mode) {
    if (exporting) return;

    var blocker = exportBlocker();
    if (blocker) {
      toast(blocker, 'error', 10000);
      if (IS_FILE) showEnvNotice('De export kan zo niet werken', fileNoticeHtml(), true);
      return;
    }

    var toClipboard = mode === 'clipboard';
    if (toClipboard && !clipboardSupported()) {
      toast('Deze browser ondersteunt kopiëren naar het klembord niet — gebruik Download.', 'error');
      return;
    }

    var mime = (toClipboard || state.format === 'png') ? 'image/png' : 'image/jpeg';
    var ext = mime === 'image/png' ? 'png' : 'jpg';
    var logoLost = IS_FILE && state.logo && !isDataUrl(state.logo);

    setBusy(true);

    var blobPromise = renderToCanvas(mime).then(function (canvas) {
      return canvasToBlob(canvas, mime, 0.94);
    });

    var done = toClipboard
      ? copyBlob(blobPromise).then(function () {
          toast('Post naar het klembord gekopieerd.' + (logoLost ? ' Let op: het logo ontbreekt (file://).' : ''), logoLost ? 'warn' : 'ok');
        })
      : blobPromise.then(function (blob) {
          var name = downloadBlob(blob, ext);
          toast('Opgeslagen als ' + name + (logoLost ? ' — let op: het logo ontbreekt (file://).' : ''), logoLost ? 'warn' : 'ok');
        });

    done
      .catch(reportExportError)
      .then(function () { setBusy(false); });
  }

  /* ===========================================================================
     9. OPSLAG & START
     ========================================================================= */
  var STORAGE_KEY = 'post-studio-v1';
  var persistTimer = 0;

  /* Alles bewaren behalve de foto zelf (die staat in IndexedDB).
     Kwam de foto of het logo uit /assets, dan onthouden we het pad. */
  function persistNow() {
    clearTimeout(persistTimer);
    persistTimer = 0;
    try {
      var copy = {};
      Object.keys(DEFAULTS).forEach(function (k) { copy[k] = state[k]; });
      copy.image = null;
      copy.imageRatio = null;
      if (copy.logoSrc) copy.logo = copy.logoSrc;
      else if (isDataUrl(copy.logo)) { copy.logo = ''; copy.logoSrc = ''; }
      copy.__meta = lastMetaSig;
      copy.__fonts = brandFonts;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
    } catch (err) { /* privémodus of vol geheugen: gewoon doorgaan */ }
  }

  /* Niet bij elke toetsaanslag of slider-tik naar localStorage schrijven */
  function persistSoon() {
    if (persistTimer) return;
    persistTimer = setTimeout(persistNow, 400);
  }

  function restore() {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (err) { return; }
    if (!saved || typeof saved !== 'object') return;

    if (saved.__fonts && typeof saved.__fonts === 'object') setBrandFonts(saved.__fonts);
    if (typeof saved.__meta === 'string') lastMetaSig = saved.__meta;

    Object.keys(DEFAULTS).forEach(function (k) {
      if (saved[k] !== undefined && saved[k] !== null && typeof saved[k] === typeof DEFAULTS[k]) state[k] = saved[k];
    });
    if (!RATIOS[state.ratio]) state.ratio = DEFAULTS.ratio;
    if (THEMES.indexOf(state.theme) === -1) state.theme = DEFAULTS.theme;
    if (!FONTS[state.font] && state.font !== 'custom') state.font = DEFAULTS.font;   // 'custom' volgt uit IndexedDB
    if (state.editMode !== 'fields' && state.editMode !== 'markdown') state.editMode = DEFAULTS.editMode;
    state.image = null;
    state.imageRatio = null;
  }

  function init() {
    buildPicks();
    restore();
    buildFontSelect();

    setVal(el.content, state.content);
    fillFields();
    showImageCard(null);
    bindEvents();
    safeRender();

    // Foto en logo terugzetten na een herlaadbeurt
    if (state.imageSrc) {
      var pick = PHOTOS.filter(function (p) { return p.src === state.imageSrc; })[0];
      if (pick) useAssetImage(pick); else { state.imageSrc = ''; state.imageName = ''; }
    } else {
      restoreUploadedImage();
    }
    if (state.logoSrc && !isDataUrl(state.logo)) embedLogo(state.logoSrc);
    restoreCustomFonts();

    // Webfonts komen later binnen: dan opnieuw passend maken
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleRender);
    checkBrandFonts();

    if (typeof html2canvas === 'undefined') {
      toast('html2canvas kon niet worden geladen (geen internet?). Exporteren werkt pas na een herlaadbeurt met verbinding.', 'warn', 8000);
    }
    if (IS_FILE) {
      showEnvNotice('Je opent de tool rechtstreeks vanaf schijf (file://)', fileNoticeHtml());
    }

    // Meeschalen met het venster, zonder onnodige rondjes
    var lastW = 0, lastH = 0;
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function (entries) {
        var box = entries[0].contentRect;
        if (Math.abs(box.width - lastW) < 1 && Math.abs(box.height - lastH) < 1) return;
        lastW = box.width; lastH = box.height;
        scheduleRender();
      }).observe(el.stage);
    } else {
      window.addEventListener('resize', scheduleRender);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
