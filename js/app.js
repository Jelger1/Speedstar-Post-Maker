/* =============================================================================
   app.js — Speedstar Post Maker: state, live preview en export
   -----------------------------------------------------------------------------
   Opbouw:
     1. Constanten & standaardwaarden      6. AI-assistent
     2. DOM-referenties & hulpjes          7. Mobiel
     3. Renderpijplijn (templates A-D)     8. Events
     4. Foto                               9. Export
     5. Logo (SVG -> PNG voor de export)  10. Opslag & start

   Merkregels (maten, kleuren, posities) staan in css/styles.css; welk veld in
   welk typografisch niveau komt staat in js/typography.js. Dit bestand
   verbindt de bediening met het canvas.
   ============================================================================= */
(function () {
  'use strict';

  var TYPO = window.SPEEDSTAR.typo;

  /* ===========================================================================
     1. CONSTANTEN & STANDAARDWAARDEN
     ========================================================================= */
  var CANVAS = { w: 1080, h: 1350 };          // 4:5, vast (styleguide §1.1)

  /* Logovarianten: bestand + op welke ondergrond hij hoort */
  var LOGOS = {
    'white':      { file: 'assets/brand/speedstar-logo-white.svg',      label: 'wit' },
    'blue-white': { file: 'assets/brand/speedstar-logo-blue-white.svg', label: 'blauw / wit' },
    'color':      { file: 'assets/brand/speedstar-logo-color.svg',      label: 'kleur' }
  };
  var IS_FILE = window.location.protocol === 'file:';
  var SERVER_HINT = 'Start de tool via een lokale server (npm start, of VS Code "Live Server").';
  var SERVER_HINT_HTML = 'Start de tool via een lokale server: <code>npm start</code> of VS Code <b>Live Server</b>';
  var DEFAULT_STATUS = 'Kies een template, sleep een foto en tik je tekst — alles ververst direct.';

  var STACKED = window.matchMedia ? window.matchMedia('(max-width: 860px)') : { matches: false };

  var MAX_IMAGE_EDGE = 4096;
  var MAX_UPLOAD_BYTES = 40 * 1048576;
  var LOGO_RASTER_EDGE = 1800;               // 80% van 2160px (2x-export) blijft scherp

  var DEFAULTS = {
    template: 'a',
    image: null, imageName: '', imageRatio: null,
    overlay: 40, zoom: 100, focus: 'center',
    kicker: '', title: '', intro: '', data: '', accents: '',
    headSize: 'h2', ink: 'light', autoFit: true,
    logoVariant: 'white', plate: 'none', dataAccent: false,
    format: 'png', exportScale: '1'
  };

  var state = Object.assign({}, DEFAULTS);
  var displayW = 0;
  var fitKey = '';
  var lastFlowHtml = null;
  var renderQueued = false;
  var renderHandle = 0;
  var renderErrorShown = false;
  var exporting = false;

  /* ===========================================================================
     2. DOM-REFERENTIES & HULPJES
     ========================================================================= */
  function $(id) { return document.getElementById(id); }
  function setRadio(name, value) {
    var n = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (n && !n.checked) n.checked = true;
  }
  function setVal(node, value) { if (node && node.value !== String(value)) node.value = value; }
  function setChecked(node, value) { if (node && node.checked !== !!value) node.checked = !!value; }
  function setText(node, text) { if (node && node.textContent !== text) node.textContent = text; }
  function noop() {}
  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  var el = {
    canvas: $('postCanvas'), stage: $('stage'),
    pcImage: $('pcImage'), pcFlow: $('pcFlow'), pcBody: $('pcBody'), pcLogo: $('pcLogo'),
    imageDrop: $('imageDrop'), imageInput: $('imageInput'), imageCard: $('imageCard'),
    imageThumb: $('imageThumb'), imageName: $('imageName'), imageSize: $('imageSize'),
    imageRemove: $('imageRemove'),
    dimPill: $('dimPill'), themePill: $('themePill'), statusLine: $('statusLine'),
    fitInfo: $('fitInfo'), wordCount: $('wordCount'), toast: $('toast'),
    exportBtn: $('exportBtn'), copyBtn: $('copyBtn'),
    mobileNav: $('mobileNav'), mobileExport: $('mobileExport'), mobileCopy: $('mobileCopy'), mobileAi: $('mobileAi'),
    aiBrief: $('aiBrief'), aiGenerate: $('aiGenerate'), aiImprove: $('aiImprove'),
    aiResults: $('aiResults'), aiNotes: $('aiNotes'), aiContext: $('aiContext'),
    aiDot: $('aiDot'), aiInfo: $('aiInfo'),
    envNotice: $('envNotice'), envNoticeTitle: $('envNoticeTitle'),
    envNoticeText: $('envNoticeText'), envNoticeClose: $('envNoticeClose')
  };

  /* Tekstvelden: id in de sidebar -> sleutel in de state */
  var fieldEls = { kicker: $('fKicker'), title: $('fTitle'), intro: $('fBody'), data: $('fData'), accents: $('fAccent') };

  var toastTimer;
  function toast(message, kind, ms) {
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.className = 'toast is-visible' + (kind ? ' is-' + kind : '');
    var duration = ms || (kind === 'error' ? 7000 : kind === 'warn' ? 5500 : 3200);
    toastTimer = setTimeout(function () { el.toast.className = 'toast'; }, duration);
  }

  function showEnvNotice(title, html) {
    if (!el.envNotice) return;
    el.envNoticeTitle.textContent = title;
    el.envNoticeText.innerHTML = html;   // alleen eigen, vaste teksten
    el.envNotice.hidden = false;
  }
  function hideEnvNotice() { el.envNotice.hidden = true; }
  function fileNoticeHtml() {
    return 'Je opent de tool rechtstreeks vanaf schijf (<code>file://</code>). De browser blokkeert dan het ' +
           'inlezen van het logo en de stijlgids. ' + SERVER_HINT_HTML + '. Een geüploade foto werkt altijd.';
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

  function fetchText(src) {
    return Promise.resolve()
      .then(function () { return fetch(src, { cache: 'force-cache' }); })
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Afbeelding kon niet worden gelezen')); };
      img.src = src;
    });
  }

  function nextFrame() { return new Promise(function (resolve) { requestAnimationFrame(function () { resolve(); }); }); }
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  /* Twee frames plus een korte pauze: layout, autoFit en fonts zijn dan
     verwerkt voordat html2canvas de DOM kloont. */
  function settle() { return nextFrame().then(nextFrame).then(function () { return wait(80); }); }

  /* Kleine sleutel/waarde-opslag in IndexedDB voor de foto (te groot voor localStorage) */
  var DB = (function () {
    var opening = null;
    function open() {
      if (opening) return opening;
      opening = new Promise(function (resolve, reject) {
        if (!window.indexedDB) { reject(new Error('IndexedDB niet beschikbaar')); return; }
        var req = indexedDB.open('speedstar-post-maker', 1);
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

  /* ===========================================================================
     3. RENDERPIJPLIJN
     -----------------------------------------------------------------------
     Het canvas krijgt zijn werkelijke pixelmaat; --u is de ontwerpunit
     (displaybreedte / 1080). De preview is daardoor identiek aan de export.
     ========================================================================= */
  function fitCanvas() {
    var box = el.stage.getBoundingClientRect();
    var cs = window.getComputedStyle(el.stage);
    var padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    var padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);

    var availW = Math.max(160, box.width - padX);
    var availH = Math.max(140, box.height - padY);

    // Breedte op een veelvoud van 4: dan is de hoogte (x 5/4) een geheel getal
    var w = Math.min(availW, availH * (CANVAS.w / CANVAS.h), 760);
    w = Math.max(180, Math.floor(w / 4) * 4);

    if (w !== fitKey) {
      fitKey = w;
      displayW = w;
      el.canvas.style.width = w + 'px';
      el.canvas.style.height = Math.round(w * CANVAS.h / CANVAS.w) + 'px';
      el.canvas.style.setProperty('--u', (w / CANVAS.w).toFixed(5));
    }
  }

  /* Achtergrond: cover-formaat zelf uitrekenen zodat de zoom exact werkt en
     html2canvas dezelfde uitsnede oplevert. */
  function renderImage() {
    if (!state.image) {
      el.pcImage.style.backgroundImage = 'none';
      return;
    }
    var url = 'url("' + state.image + '")';
    if (el.pcImage.style.backgroundImage !== url) el.pcImage.style.backgroundImage = url;

    var zoom = state.zoom / 100;
    if (state.imageRatio) {
      var boxRatio = CANVAS.w / CANVAS.h;
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

  /* Template + modifiers op het canvas. De CSS regelt per data-template de
     uitlijning, overlay en logopositie (styleguide §3). */
  function renderStyle() {
    var c = el.canvas;
    if (c.getAttribute('data-template') !== state.template) c.setAttribute('data-template', state.template);

    var cls = [
      'post-canvas',
      state.image ? 'has-image' : '',
      state.ink === 'dark' ? 'ink-dark' : '',
      state.template === 'd' && state.plate !== 'none' ? 'plate-' + state.plate : '',
      state.template === 'd' && state.dataAccent ? 'data-accent' : ''
    ].filter(Boolean).join(' ');
    if (c.className !== cls) c.className = cls;

    c.style.setProperty('--ov', (state.overlay / 100).toFixed(3));

    var logo = logoSrc();
    if (el.pcLogo.getAttribute('src') !== logo) el.pcLogo.setAttribute('src', logo);
  }

  /* Tekst: typography.js bepaalt welk veld in welk niveau (65/41/26/16pt)
     komt en markeert de accentwoorden Bold Italic. */
  function renderText() {
    var html = TYPO.buildFlow(fields(), state.template, { headSize: state.headSize });
    if (html !== lastFlowHtml) {
      el.pcFlow.innerHTML = html;
      lastFlowHtml = html;
    }
  }

  function fields() {
    return { kicker: state.kicker, title: state.title, intro: state.intro, data: state.data, accents: state.accents };
  }

  /* Tekst krimpt automatisch tot ze binnen de safe-zone past (binaire zoektocht) */
  function autoFit() {
    var c = el.canvas;
    c.style.setProperty('--fit', '1');

    var avail = el.pcBody.clientHeight;
    if (!state.autoFit || !avail || !TYPO.levels(state.template).text || el.pcFlow.offsetHeight <= avail) {
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

  /* Bediening gelijktrekken met de state (na AI-voorstel, herstel of reset) */
  function syncUI() {
    setRadio('template', state.template);
    setRadio('focus', state.focus);
    setRadio('headSize', state.headSize);
    setRadio('ink', state.ink);
    setRadio('logoVariant', state.logoVariant);
    setRadio('plate', state.plate);
    setRadio('format', state.format);

    setVal($('overlay'), state.overlay);
    setVal($('zoom'), state.zoom);
    setVal($('exportScale'), state.exportScale);
    Object.keys(fieldEls).forEach(function (k) { setVal(fieldEls[k], state[k]); });

    setChecked($('autoFit'), state.autoFit);
    setChecked($('dataAccent'), state.dataAccent);

    setText($('overlayVal'), state.overlay + '%');
    setText($('zoomVal'), state.zoom + '%');

    // Velden en opties die alleen bij bepaalde templates horen (data-only="d")
    Array.prototype.forEach.call(document.querySelectorAll('[data-only]'), function (node) {
      node.hidden = node.getAttribute('data-only').split(',').indexOf(state.template) === -1;
    });

    var t = TYPO.TEMPLATES[state.template];
    setText(el.dimPill, CANVAS.w + ' × ' + CANVAS.h);
    setText(el.themePill, t.short + ' · ' + t.name);
    setText(el.wordCount, String(TYPO.wordCount(fields(), state.template)));
  }

  function render() {
    fitCanvas();
    renderImage();
    renderStyle();
    renderText();
    autoFit();
    syncUI();
    persistSoon();
  }

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

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    renderHandle = requestAnimationFrame(function () { renderQueued = false; safeRender(); });
  }

  function flushRender() {
    if (renderQueued) { cancelAnimationFrame(renderHandle); renderQueued = false; }
    render();
  }

  /* Template wisselen: alles blijft bewaard, alleen de lay-out verandert */
  function setTemplate(key) {
    var t = TYPO.normTemplate(key);
    if (!t || t === state.template) return;
    state.template = t;
    var spec = TYPO.TEMPLATES[t];
    el.statusLine.textContent = spec.short + ' — ' + spec.hint;
    scheduleRender();
  }

  /* ===========================================================================
     4. FOTO
     ========================================================================= */
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
        state.imageName = file.name;
        state.imageRatio = w / h;
        el.statusLine.textContent = DEFAULT_STATUS;
        showImageCard(file.size);
        scheduleRender();
        DB.set('image', { dataUrl: url, name: file.name, ratio: w / h, size: file.size }).catch(noop);
        if (w < CANVAS.w || h < CANVAS.h) toast('Foto geplaatst. Let op: ' + w + ' × ' + h + ' px is kleiner dan het canvas, gebruik liefst high-res.', 'warn', 6000);
        else toast('Foto geplaatst: ' + file.name, 'ok');
      };
      img.onerror = function () {
        el.statusLine.textContent = DEFAULT_STATUS;
        toast('Deze afbeelding kan de browser niet weergeven (' + file.name + '). Gebruik JPG, PNG of WebP.', 'error');
      };
      img.src = dataUrl;
    });
  }

  function restoreUploadedImage() {
    return DB.get('image').then(function (rec) {
      if (!rec || !isDataUrl(rec.dataUrl)) return;
      state.image = rec.dataUrl;
      state.imageName = rec.name || 'foto';
      state.imageRatio = rec.ratio || null;
      showImageCard(rec.size || 0);
      scheduleRender();
    }).catch(noop);
  }

  function showImageCard(bytes) {
    el.imageCard.hidden = !state.image;
    el.imageDrop.hidden = !!state.image;
    if (!state.image) return;
    el.imageThumb.style.backgroundImage = 'url("' + state.image + '")';
    el.imageName.textContent = state.imageName;
    el.imageSize.textContent = bytes ? humanSize(bytes)
      : (state.imageRatio ? state.imageRatio.toFixed(2) + ' : 1' : '');
  }

  function clearImage() {
    state.image = null; state.imageName = ''; state.imageRatio = null;
    showImageCard(0);
    scheduleRender();
    DB.del('image').catch(noop);
  }

  /* ===========================================================================
     5. LOGO
     -----------------------------------------------------------------------
     De merklogo's zijn SVG's zonder width/height-attribuut. html2canvas laat
     zo'n SVG in de export leeg, terwijl de preview hem wel toont. Daarom
     wordt elke variant één keer gerasteriseerd naar een PNG-data-URL en
     daarna in de <img> gezet: preview en export tonen dan hetzelfde.
     ========================================================================= */
  var logoCache = {};      // variant -> PNG data-URL
  var logoPending = {};

  function logoSrc() {
    var v = LOGOS[state.logoVariant] ? state.logoVariant : DEFAULTS.logoVariant;
    if (logoCache[v]) return logoCache[v];
    prepareLogo(v);
    return LOGOS[v].file;   // tot de PNG klaar is: het SVG-bestand zelf (preview)
  }

  function rasterizeSvg(svgText) {
    var doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    var root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
      return Promise.reject(new Error('Ongeldige SVG'));
    }
    var vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(parseFloat);
    var w = parseFloat(root.getAttribute('width')) || 0;
    var h = parseFloat(root.getAttribute('height')) || 0;
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { w = w || vb[2]; h = h || vb[3]; }
    if (!(w > 0 && h > 0)) { w = w || 512; h = h || 512; }
    if (!root.getAttribute('viewBox')) root.setAttribute('viewBox', '0 0 ' + w + ' ' + h);

    var f = LOGO_RASTER_EDGE / Math.max(w, h);
    var pw = Math.max(1, Math.round(w * f)), ph = Math.max(1, Math.round(h * f));
    root.setAttribute('width', pw);
    root.setAttribute('height', ph);

    var src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(root));
    return loadImage(src).then(function (img) {
      var cv = document.createElement('canvas');
      cv.width = pw; cv.height = ph;
      cv.getContext('2d').drawImage(img, 0, 0, pw, ph);
      return cv.toDataURL('image/png');
    });
  }

  var logoNoticeShown = false;
  function prepareLogo(variant) {
    if (logoPending[variant]) return logoPending[variant];
    logoPending[variant] = fetchText(LOGOS[variant].file)
      .then(rasterizeSvg)
      .then(function (png) {
        logoCache[variant] = png;
        scheduleRender();
      })
      .catch(function () {
        delete logoPending[variant];
        if (IS_FILE && !logoNoticeShown) {
          logoNoticeShown = true;
          showEnvNotice('Het logo komt niet in de export', fileNoticeHtml());
        }
      });
    return logoPending[variant];
  }

  /* ===========================================================================
     6. AI-ASSISTENT
     -----------------------------------------------------------------------
     De browser praat met onze eigen backend (server/server.js); de API-key
     en de merkregels (styleguide §4) zitten op de server. De backend geeft
     per voorstel { bovenkop, hoofdkop, body, accentWoorden,
     aanbevolenTemplate, dataElement, invalshoek, toelichting } terug.
     normalizeVariants() begrijpt daarnaast nog het oude Post Studio-formaat.
     ========================================================================= */
  var aiBusy = false;

  var DEFAULT_AI_ENDPOINT = (function () {
    var m = document.querySelector('meta[name="ai-endpoint"]');
    return m ? String(m.getAttribute('content') || '').trim().replace(/\/+$/, '') : '';
  })();

  /* De AI-server: het vaste adres uit index.html (GitHub Pages praat zo met
     Render), anders de site zelf. Op Render vallen die samen. */
  function aiBase() {
    if (DEFAULT_AI_ENDPOINT) return DEFAULT_AI_ENDPOINT;
    return IS_FILE ? '' : window.location.origin;
  }

  function aiHeaders() { return { 'Content-Type': 'application/json' }; }

  function setAiStatus(kind, text) {
    el.aiDot.className = 'ai-dot' + (kind ? ' is-' + kind : '');
    setText(el.aiInfo, 'AI: ' + text);
  }

  /* Stille controle bij het opstarten: is de AI-server wakker en ingericht? */
  var aiHealthRetries = 0;
  function aiHealth() {
    var base = aiBase();
    if (!base) {
      setAiStatus('bad', 'niet beschikbaar via file://');
      return Promise.resolve(false);
    }
    setAiStatus('busy', 'verbinden…');
    return Promise.resolve()
      .then(function () { return fetch(base + '/api/health', { method: 'GET', cache: 'no-store' }); })
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function (info) {
        aiHealthRetries = 0;
        if (!info.hasKey) {
          setAiStatus('bad', 'server mist API-key');
          toast('De AI-server draait, maar heeft geen OPENAI_API_KEY. Zet die op Render onder Environment en deploy opnieuw.', 'error', 10000);
          return false;
        }
        setAiStatus('ok', 'verbonden' + (info.mock ? ' (testmodus)' : ''));
        return true;
      })
      .catch(function () {
        // Een gratis Render-service slaapt na een kwartier; opstarten duurt tot een minuut
        if (aiHealthRetries < 6) {
          aiHealthRetries++;
          setAiStatus('busy', 'server wordt gestart…');
          setTimeout(aiHealth, 10000);
          return false;
        }
        setAiStatus('bad', 'niet bereikbaar');
        toast('De AI-server reageert niet. Probeer het over een minuut opnieuw.', 'error', 9000);
        return false;
      });
  }

  /* Wat naar de server gaat: opdracht, briefing en de huidige post in de
     structuur van styleguide §4 */
  function aiPayload(mode) {
    return {
      mode: mode,
      brief: el.aiBrief.value,
      post: {
        bovenkop: state.kicker, hoofdkop: state.title, body: state.intro,
        accentWoorden: TYPO.parseAccentWords(state.accents), data: state.data,
        template: state.template.toUpperCase()
      },
      settings: { hasImage: !!state.image }
    };
  }

  function setAiBusy(busy, label) {
    aiBusy = busy;
    el.aiGenerate.disabled = busy;
    el.aiImprove.disabled = busy;
    el.aiGenerate.querySelector('span').textContent = busy ? (label || 'Denken…') : 'Maak post';
    if (busy) setAiStatus('busy', label || 'bezig…');
  }

  function aiRequest(mode) {
    if (aiBusy) return;
    var brief = el.aiBrief.value.trim();
    var hasText = !!(state.kicker + state.title + state.intro).trim();

    if (mode === 'generate' && !brief) {
      toast('Schrijf eerst kort wat je wilt posten, bijvoorbeeld "Workers Day, bedank onze chauffeurs".', 'warn');
      el.aiBrief.focus();
      return;
    }
    if (mode === 'improve' && !hasText) {
      toast('Er staat nog geen tekst om te verbeteren. Vul de velden in of laat eerst een post maken.', 'warn');
      return;
    }
    var base = aiBase();
    if (!base) {
      toast('De AI werkt niet via file://. Open de tool via de website of een lokale server.', 'warn');
      return;
    }

    setAiBusy(true, mode === 'improve' ? 'Verbeteren…' : 'Schrijven…');
    el.aiResults.hidden = true;
    el.aiNotes.hidden = true;

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 120000) : 0;

    Promise.resolve()
      .then(function () {
        return fetch(base + '/api/suggest', {
          method: 'POST',
          headers: aiHeaders(),
          body: JSON.stringify(aiPayload(mode)),
          signal: controller ? controller.signal : undefined
        });
      })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw Object.assign(new Error(data.error || ('HTTP ' + res.status)), { status: res.status });
          return data;
        });
      })
      .then(function (data) {
        var variants = normalizeVariants(data);
        if (!variants.length) throw new Error('De AI gaf geen voorstellen terug. Probeer het opnieuw.');
        renderAiResults(variants, data.notes);
        setAiStatus('ok', 'verbonden');
        if (variants.length === 1 && mode === 'improve') {
          applyVariant(variants[0], 0);
          toast('Tekst verbeterd — bekijk het resultaat in de preview.', 'ok');
        } else {
          toast(variants.length + ' voorstellen klaar — klik op "Gebruik" om er een toe te passen.', 'ok');
        }
      })
      .catch(function (err) {
        var msg = err && err.name === 'AbortError' ? 'De AI deed er te lang over (meer dan 2 minuten). Probeer het opnieuw.' : (err && err.message) || String(err);
        if (err && err.status === 429) { setAiStatus('ok', 'verbonden'); }
        else if (!err || !err.status) { setAiStatus('bad', 'niet bereikbaar'); if (!/te lang/.test(msg)) msg = 'De AI-server is niet bereikbaar. Probeer het over een minuut opnieuw.'; }
        else setAiStatus('bad', 'fout');
        toast(msg, 'error', 9000);
      })
      .then(function () {
        clearTimeout(timer);
        setAiBusy(false);
      });
  }

  /* Elk antwoordformaat omzetten naar { name, kicker, title, intro, data, accents[], template, why } */
  function normalizeVariants(data) {
    var list = Array.isArray(data.variants) ? data.variants
             : Array.isArray(data.posts) ? data.posts
             : (data && (data.hoofdkop || data.title)) ? [data] : [];
    return list.map(function (v, i) {
      var kicker = str(v.bovenkop !== undefined ? v.bovenkop : v.label);
      var title  = str(v.hoofdkop !== undefined ? v.hoofdkop : v.title);
      var body   = str(v.body !== undefined ? v.body : v.inleiding);
      if (!body && v.quote) body = str(v.quote);

      // **markering** in de tekst -> accentwoorden, tekst schoon
      var k = TYPO.extractInlineAccents(kicker), t = TYPO.extractInlineAccents(title), b = TYPO.extractInlineAccents(body);
      var accents = TYPO.parseAccentWords([].concat(v.accentWoorden || v.accents || [], k.words, t.words, b.words));

      var tmpl = TYPO.normTemplate(v.aanbevolenTemplate || v.template || (v.style && v.style.template));
      return {
        name: str(v.name) || ('Voorstel ' + (i + 1)),
        kicker: k.text.trim(), title: t.text.trim(), intro: b.text.trim(),
        data: str(v.data || v.dataElement || v.getal),
        accents: accents,
        template: tmpl,
        why: str(v.why || v.toelichting)
      };
    }).filter(function (v) { return v.title || v.intro || v.kicker; });
  }
  function str(v) { return typeof v === 'string' ? v : (v === undefined || v === null ? '' : String(v)); }

  function renderAiResults(variants, notes) {
    el.aiResults.innerHTML = '';
    variants.forEach(function (v, i) {
      var card = document.createElement('div');
      card.className = 'ai-card';

      var head = document.createElement('div');
      head.className = 'ai-card__head';
      var name = document.createElement('span');
      name.className = 'ai-card__name';
      name.textContent = v.name;
      head.appendChild(name);
      if (v.template) {
        var th = document.createElement('span');
        th.className = 'ai-card__theme';
        th.textContent = '· ' + TYPO.TEMPLATES[v.template].short;
        head.appendChild(th);
      }
      card.appendChild(head);

      var title = document.createElement('div');
      title.className = 'ai-card__title';
      title.textContent = [v.kicker, v.title].filter(Boolean).join('\n');
      card.appendChild(title);

      if (v.intro || v.data) {
        var body = document.createElement('div');
        body.className = 'ai-card__body';
        body.textContent = [v.data, v.intro].filter(Boolean).join(' · ');
        card.appendChild(body);
      }
      if (v.accents.length) {
        var acc = document.createElement('div');
        acc.className = 'ai-card__why';
        acc.textContent = 'Accent: ' + v.accents.join(', ');
        card.appendChild(acc);
      }
      if (v.why) {
        var why = document.createElement('div');
        why.className = 'ai-card__why';
        why.textContent = v.why;
        card.appendChild(why);
      }

      var actions = document.createElement('div');
      actions.className = 'ai-card__actions';
      var use = document.createElement('button');
      use.type = 'button';
      use.className = 'btn btn--primary';
      use.textContent = 'Gebruik';
      use.addEventListener('click', function () { applyVariant(v, i); toast('Voorstel toegepast.', 'ok'); });
      var textOnly = document.createElement('button');
      textOnly.type = 'button';
      textOnly.className = 'btn btn--ghost';
      textOnly.textContent = 'Alleen tekst';
      textOnly.title = 'Neem de tekst over, houd het huidige template';
      textOnly.addEventListener('click', function () { applyVariant(v, i, true); toast('Tekst overgenomen.', 'ok'); });
      actions.appendChild(use);
      actions.appendChild(textOnly);
      card.appendChild(actions);

      el.aiResults.appendChild(card);
    });
    el.aiResults.hidden = !variants.length;
    el.aiNotes.textContent = notes ? 'AI: ' + notes : '';
    el.aiNotes.hidden = !notes;
  }

  function applyVariant(v, index, textOnly) {
    state.kicker = v.kicker;
    state.title = v.title;
    state.intro = v.intro;
    if (v.data) state.data = v.data;
    state.accents = v.accents.join(', ');
    if (!textOnly && v.template) state.template = v.template;
    scheduleRender();

    Array.prototype.forEach.call(el.aiResults.children, function (card, i) {
      card.classList.toggle('is-applied', i === index);
    });
  }

  /* ===========================================================================
     7. MOBIEL: TABS, ACTIEBALK, COMPACTE PREVIEW TIJDENS TYPEN
     ========================================================================= */
  function panelTitle(panel) {
    var t = panel.querySelector('.panel__title');
    return t ? t.textContent.trim() : '';
  }
  function allPanels() { return Array.prototype.slice.call(document.querySelectorAll('details.panel')); }

  function openPanel(panel, scroll) {
    if (!panel) return;
    if (STACKED.matches) allPanels().forEach(function (p) { if (p !== panel) p.open = false; });
    panel.open = true;
    updateMobileNav();
    if (scroll) {
      var header = document.querySelector('.workspace');
      var top = panel.getBoundingClientRect().top + window.pageYOffset - (header ? header.getBoundingClientRect().height : 0) - 4;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }

  function updateMobileNav() {
    if (!el.mobileNav) return;
    var openTitle = '';
    allPanels().some(function (p) { if (p.open) { openTitle = panelTitle(p); return true; } return false; });
    Array.prototype.forEach.call(el.mobileNav.children, function (btn) {
      var active = btn.dataset.panel === openTitle;
      btn.classList.toggle('is-active', active);
      if (active && btn.scrollIntoView) { try { btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (err) { /* oud */ } }
    });
  }

  function buildMobileNav() {
    if (!el.mobileNav) return;
    el.mobileNav.innerHTML = '';
    allPanels().forEach(function (panel) {
      var title = panelTitle(panel);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.panel = title;
      var icon = panel.querySelector('.panel__head .ico');
      if (icon) btn.appendChild(icon.cloneNode(true));
      btn.appendChild(document.createTextNode(title.replace('Logo & kleurvlak', 'Logo').replace('AI-assistent', 'AI')));
      btn.addEventListener('click', function () { openPanel(panel, true); });
      el.mobileNav.appendChild(btn);
      panel.addEventListener('toggle', updateMobileNav);
    });
    updateMobileNav();
  }

  function applyMobileLayout() {
    if (!STACKED.matches) return;
    var opened = false;
    allPanels().forEach(function (p) {
      var isText = panelTitle(p) === 'Tekst';
      p.open = isText && !opened;
      if (isText) opened = true;
    });
    updateMobileNav();
  }

  function bindMobile() {
    buildMobileNav();
    applyMobileLayout();

    var sidebar = document.querySelector('.sidebar');
    function typing(on) { document.body.classList.toggle('is-typing', on && STACKED.matches); }
    on(sidebar, 'focusin', function (e) { if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && !/^(range|checkbox|radio|file)$/.test(e.target.type)) typing(true); });
    on(sidebar, 'focusout', function () { setTimeout(function () { var a = document.activeElement; if (!a || !/^(INPUT|TEXTAREA)$/.test(a.tagName) || /^(range|checkbox|radio|file)$/.test(a.type)) typing(false); }, 60); });

    on(el.mobileExport, 'click', function () { exportImage('download'); });
    on(el.mobileCopy, 'click', function () { exportImage('clipboard'); });
    on(el.mobileAi, 'click', function () {
      openPanel($('aiPanel'), true);
      setTimeout(function () { if (el.aiBrief) el.aiBrief.focus(); }, 350);
    });

    var mq = function () { if (!STACKED.matches) document.body.classList.remove('is-typing'); applyMobileLayout(); };
    if (typeof STACKED.addEventListener === 'function') STACKED.addEventListener('change', mq);
    else if (typeof STACKED.addListener === 'function') STACKED.addListener(mq);
  }

  /* ===========================================================================
     8. EVENTS
     ========================================================================= */
  function on(node, ev, fn) { if (node) node.addEventListener(ev, fn); }

  function bindRadio(name, key, after) {
    Array.prototype.forEach.call(document.querySelectorAll('input[name="' + name + '"]'), function (input) {
      input.addEventListener('change', function () {
        if (!input.checked) return;
        if (after) { after(input.value); return; }
        state[key] = input.value;
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

  function bindEvents() {
    bindRadio('template', 'template', setTemplate);
    bindRadio('focus', 'focus');
    bindRadio('headSize', 'headSize');
    bindRadio('ink', 'ink');
    bindRadio('logoVariant', 'logoVariant');
    bindRadio('plate', 'plate');
    bindRadio('format', 'format');

    bindRange('overlay', 'overlay');
    bindRange('zoom', 'zoom');

    bindCheck('autoFit', 'autoFit');
    bindCheck('dataAccent', 'dataAccent');

    /* Tekstvelden -> state */
    Object.keys(fieldEls).forEach(function (k) {
      on(fieldEls[k], 'input', function (e) { state[k] = e.target.value; scheduleRender(); });
    });

    on($('exportScale'), 'change', function (e) { state.exportScale = e.target.value; persistSoon(); });

    bindDrop(el.imageDrop, el.imageInput, useUploadedImage);
    on(el.imageRemove, 'click', clearImage);
    on(el.envNoticeClose, 'click', hideEnvNotice);

    /* AI-assistent */
    on(el.aiGenerate, 'click', function () { aiRequest('generate'); });
    on(el.aiImprove, 'click', function () { aiRequest('improve'); });
    on(el.aiBrief, 'keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); aiRequest('generate'); }
    });

    on(el.exportBtn, 'click', function () { exportImage('download'); });
    on(el.copyBtn, 'click', function () { exportImage('clipboard'); });
    on($('resetBtn'), 'click', function () {
      if (!window.confirm('Tekst, foto en instellingen wissen?')) return;
      state = Object.assign({}, DEFAULTS);
      clearImage();
      el.statusLine.textContent = DEFAULT_STATUS;
      scheduleRender();
      toast('Alles is teruggezet naar de standaard.', 'ok');
    });

    /* Slepen over het hele venster: een afbeelding wordt de foto */
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
      var file = e.dataTransfer.files[0];
      if (/^image\//.test(file.type)) useUploadedImage(file);
      else toast('Sleep een afbeelding (JPG, PNG, WebP).', 'warn');
    });

    /* Ctrl/Cmd + S exporteert */
    window.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && typeof e.key === 'string' && e.key.toLowerCase() === 's') {
        e.preventDefault();
        exportImage('download');
      }
    });

    /* Allumi Std komt na de eerste render binnen: dan opnieuw passend maken */
    if (document.fonts && typeof document.fonts.addEventListener === 'function') {
      document.fonts.addEventListener('loadingdone', scheduleRender);
    }
    if (typeof STACKED.addEventListener === 'function') STACKED.addEventListener('change', scheduleRender);
    else if (typeof STACKED.addListener === 'function') STACKED.addListener(scheduleRender);

    window.addEventListener('pagehide', persistNow);
    window.addEventListener('beforeunload', persistNow);
  }

  /* ===========================================================================
     9. EXPORT
     -----------------------------------------------------------------------
     html2canvas rendert het canvas met factor (1080 * resolutie) / display-
     breedte en het resultaat wordt op exact 1080 x 1350 (of 2x) gezet.
     ========================================================================= */
  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function exportName(ext) {
    return 'speedstar-post-' + state.template + '-' + stamp() + '.' + ext;
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
      } catch (err) { reject(err); }
    });
  }

  function exportBlocker() {
    if (typeof html2canvas === 'undefined') {
      return 'html2canvas is niet geladen — controleer je internetverbinding en herlaad de pagina.';
    }
    if (!state.image && !TYPO.buildFlow(fields(), state.template, { headSize: state.headSize })) {
      return 'Er is nog niets om te exporteren: upload een foto of vul tekst in.';
    }
    return null;
  }

  function renderToCanvas(mime) {
    var mult = parseInt(state.exportScale, 10) || 1;
    var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    var logoReady = logoCache[state.logoVariant] ? Promise.resolve() : prepareLogo(state.logoVariant);

    return Promise.all([fontsReady, logoReady])
      .then(function () {
        flushRender();
        return settle();
      })
      .then(function () {
        var box = el.canvas.getBoundingClientRect();
        var width = box.width || displayW;
        var scale = (CANVAS.w * mult) / width;

        return html2canvas(el.canvas, {
          scale: scale,
          useCORS: true,
          allowTaint: false,
          logging: false,
          imageTimeout: 20000,
          backgroundColor: '#221f5e',
          onclone: function (doc) {
            var empty = doc.getElementById('pcEmpty');
            if (empty) empty.style.display = 'none';
          }
        });
      })
      .then(function (raw) {
        if (!raw || !raw.width || !raw.height) throw new Error('Lege afbeelding');
        var out = document.createElement('canvas');
        out.width = CANVAS.w * mult;
        out.height = CANVAS.h * mult;
        var ctx = out.getContext('2d');
        if (mime === 'image/jpeg') { ctx.fillStyle = '#221f5e'; ctx.fillRect(0, 0, out.width, out.height); }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(raw, 0, 0, raw.width, raw.height, 0, 0, out.width, out.height);
        return out;
      });
  }

  function reportExportError(err) {
    var text = String((err && (err.name ? err.name + ': ' + err.message : err.message)) || err || 'onbekende fout');
    if (/security|taint|cross-?origin|cors/i.test(text)) {
      toast('Export geblokkeerd door de browser (beveiligd canvas). ' + SERVER_HINT, 'error', 10000);
      showEnvNotice('De export is geblokkeerd', fileNoticeHtml());
    } else if (/notallowed|permission|clipboard|gesture/i.test(text)) {
      toast('Het klembord weigerde de afbeelding. Geef de browser toestemming of gebruik Download.', 'error');
    } else if (/timeout|image/i.test(text)) {
      toast('Een afbeelding kon niet worden geladen voor de export. Probeer het opnieuw.', 'error');
    } else {
      toast('Export mislukt: ' + text, 'error');
    }
  }

  var busyStatus = '';
  function setBusy(busy) {
    exporting = busy;
    el.exportBtn.disabled = busy;
    el.copyBtn.disabled = busy;
    if (el.mobileExport) { el.mobileExport.disabled = busy; el.mobileExport.querySelector('span').textContent = busy ? 'Bezig…' : 'Download'; }
    if (el.mobileCopy) el.mobileCopy.disabled = busy;
    document.body.classList.toggle('is-exporting', busy);
    var label = el.exportBtn.querySelector('span');
    if (busy) {
      var mult = parseInt(state.exportScale, 10) || 1;
      label.textContent = 'Bezig met exporteren…';
      busyStatus = el.statusLine.textContent;
      el.statusLine.textContent = 'Exporteren op ' + (CANVAS.w * mult) + ' × ' + (CANVAS.h * mult) + ' px…';
    } else {
      label.textContent = 'Download post';
      el.statusLine.textContent = busyStatus;
    }
  }

  function exportImage(mode) {
    if (exporting) return;

    var blocker = exportBlocker();
    if (blocker) { toast(blocker, 'error', 8000); return; }

    var toClipboard = mode === 'clipboard';
    if (toClipboard && !clipboardSupported()) {
      toast('Deze browser ondersteunt kopiëren naar het klembord niet — gebruik Download.', 'error');
      return;
    }

    var mime = (toClipboard || state.format === 'png') ? 'image/png' : 'image/jpeg';
    var ext = mime === 'image/png' ? 'png' : 'jpg';
    var logoLost = !logoCache[state.logoVariant] && IS_FILE;

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
     10. OPSLAG & START
     ========================================================================= */
  var STORAGE_KEY = 'speedstar-post-maker-v1';
  var persistTimer = 0;

  function persistNow() {
    clearTimeout(persistTimer);
    persistTimer = 0;
    try {
      var copy = {};
      Object.keys(DEFAULTS).forEach(function (k) { copy[k] = state[k]; });
      copy.image = null;          // de foto zelf staat in IndexedDB
      copy.imageRatio = null;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
    } catch (err) { /* privémodus of vol geheugen */ }
  }

  function persistSoon() {
    if (persistTimer) return;
    persistTimer = setTimeout(persistNow, 400);
  }

  function restore() {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (err) { return; }
    if (!saved || typeof saved !== 'object') return;

    Object.keys(DEFAULTS).forEach(function (k) {
      if (saved[k] !== undefined && saved[k] !== null && typeof saved[k] === typeof DEFAULTS[k]) state[k] = saved[k];
    });
    if (!TYPO.TEMPLATES[state.template]) state.template = DEFAULTS.template;
    if (!LOGOS[state.logoVariant]) state.logoVariant = DEFAULTS.logoVariant;
    if (['none', 'navy', 'blue'].indexOf(state.plate) === -1) state.plate = DEFAULTS.plate;
    if (['h1', 'h2'].indexOf(state.headSize) === -1) state.headSize = DEFAULTS.headSize;
    if (['light', 'dark'].indexOf(state.ink) === -1) state.ink = DEFAULTS.ink;
    if (['top', 'center', 'bottom'].indexOf(state.focus) === -1) state.focus = DEFAULTS.focus;
    state.overlay = clamp(state.overlay, 0, 90);
    state.zoom = clamp(state.zoom, 100, 180);
    state.image = null;
    state.imageRatio = null;
  }

  function init() {
    restore();
    showImageCard(0);
    bindEvents();
    bindMobile();
    safeRender();

    restoreUploadedImage();

    aiHealth();

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleRender);

    if (typeof html2canvas === 'undefined') {
      toast('html2canvas kon niet worden geladen (geen internet?). Exporteren werkt pas na een herlaadbeurt met verbinding.', 'warn', 8000);
    }

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
