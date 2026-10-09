/* =============================================================================
   typography.js — Speedstar typografie & template-regels (styleguide §2 en §3)
   -----------------------------------------------------------------------------
   Pure functies, geen DOM: dit bestand bepaalt WELKE tekst in WELK niveau
   terechtkomt en hoe accentwoorden worden gemarkeerd. app.js zet het resultaat
   in het canvas; css/styles.css bepaalt de maten (65/41/26/16pt) per class.

   Niveaus (class -> pt op het 1080-canvas):
     ss-h1     65pt  Heading 1, maximale impact           <h1 class="ss-h1">
     ss-h2     41pt  Heading 2, de hoofdkop               <h2 class="ss-h2">
     ss-h3     26pt  Heading 3, de bovenkop               <h3 class="ss-h3">
     ss-intro  16pt  Inleiding / sub-heading, Demi        <p  class="ss-intro">
     pc-data  104pt  Data-element (alleen Template D)     <div class="pc-data">
     ss-accent       Accentwoorden: Allumi Std Bold Italic <em class="ss-accent">

   Publieke API: window.SPEEDSTAR.typo
     TEMPLATES                       specificatie per template (a, b, c, d)
     LEVELS                          puntmaten per niveau (informatief)
     levels(template, opts)          welk niveau elk veld krijgt in dit template
     parseAccentWords(text)          "trust, hard work" -> ['trust', 'hard work']
     extractInlineAccents(text)      **woord** / *woord* -> { text, words }
     applyAccents(text, words)       veilige HTML met <em class="ss-accent">
     buildFlow(fields, template, o)  complete HTML voor .pc-flow
   ============================================================================= */
window.SPEEDSTAR = window.SPEEDSTAR || {};

window.SPEEDSTAR.typo = (function () {
  'use strict';

  /* Puntmaten uit de styleguide (§2); de CSS is leidend, dit is documentatie
     en wordt gebruikt voor labels in de interface. */
  var LEVELS = {
    h1:    { pt: 65,  tag: 'h1',  cls: 'ss-h1',    label: 'Heading 1' },
    h2:    { pt: 41,  tag: 'h2',  cls: 'ss-h2',    label: 'Heading 2' },
    h3:    { pt: 26,  tag: 'h3',  cls: 'ss-h3',    label: 'Heading 3' },
    intro: { pt: 16,  tag: 'p',   cls: 'ss-intro', label: 'Inleiding' },
    data:  { pt: 104, tag: 'div', cls: 'pc-data',  label: 'Data-element' }
  };

  /* Template-specificatie (§3). 'kicker' = bovenkop, 'title' = hoofdkop,
     'intro' = inleiding, 'data' = data-element. null = dit veld wordt in dit
     template niet getoond. */
  var TEMPLATES = {
    a: {
      key: 'a', name: 'Event & Wishes', short: 'Template A',
      text: true, kicker: 'h3', title: 'h2', intro: 'intro', data: null,
      logo: 'rechtsonder', overlay: 'verloop van onder naar boven',
      hint: 'Feestdagen, wensen en speciale dagen. Links uitgelijnd.'
    },
    b: {
      key: 'b', name: 'Watermerk & tekst', short: 'Template B',
      text: true, kicker: 'h3', title: 'h2', titleXl: 'h1', intro: 'intro', data: null,
      logo: 'rechtsonder, vervalt zodra het watermerk aanstaat', overlay: 'egaal',
      hint: 'Groot beeldmerk als watermerk, tekst links binnen de marge. Kop 34pt of 48pt.'
    },
    c: {
      key: 'c', name: 'Statement', short: 'Template C',
      text: true, kicker: 'h3', title: 'h2', titleXl: 'h1', intro: 'intro', data: null,
      logo: 'geen logo; merkvormen in de hoeken', overlay: 'egaal',
      hint: 'Eén krachtige uitspraak, met merkvorm 1 linksboven en merkvorm 2 rechtsonder. Geen logo.'
    },
    d: {
      key: 'd', name: 'Data & cijfer', short: 'Template D',
      /* Alleen de hoofdkop en het grote getal; bovenkop en inleiding vallen
         weg (pagina 10 van het ontwerp). */
      text: true, kicker: null, title: 'h2', intro: null, data: 'data',
      logo: 'rechtsonder', overlay: 'egaal',
      hint: 'Eén kopregel met daaronder een groot getal, verticaal gecentreerd op een merkkleur.'
    },
    e: {
      key: 'e', name: 'Google review', short: 'Template E',
      /* De recensie staat in het hoofdkop-veld en wordt tussen aanhalings-
         tekens gezet; daarboven de sterren, daaronder de naam. */
      text: true, kicker: null, title: 'h2', intro: null, data: null, review: true,
      logo: 'rechtsonder', overlay: 'egaal',
      hint: 'Een klantrecensie als herkenbare reviewkaart: naam, datum, sterren en de tekst.'
    },
    f: {
      key: 'f', name: 'Certificeringen', short: 'Template F',
      /* Kop, inleiding en daaronder een lijst met een icoon, een kopje en een
         korte uitleg per regel. */
      text: true, kicker: null, title: 'h2', intro: 'intro', data: null, items: true,
      logo: 'rechtsonder', overlay: 'egaal',
      hint: 'Kop en inleiding met daaronder een lijst certificeringen, elk met een icoon.'
    }
  };

  /* De iconen die bij de lijst horen, in de volgorde waarin ze standaard
     worden toegekend. De bestanden staan in assets/brand/icons. */
  var ITEM_ICONS = ['gevaar', 'vliegtuig', 'pas', 'vrachtwagen', 'locatie'];

  var DEFAULT_TEMPLATE = 'a';

  function normTemplate(value) {
    var v = String(value || '').trim().toLowerCase();
    if (TEMPLATES[v]) return v;
    // "Template A", "A", "template-c", "D: Data" -> letter
    var m = v.match(/\b([abcdef])\b/);
    return m && TEMPLATES[m[1]] ? m[1] : null;
  }

  /* Welk niveau krijgt elk veld in dit template? opts.headSize = 'h1' | 'h2'
     (alleen Template C mag naar 65pt; §3 "41pt of 65pt"). */
  function levels(template, opts) {
    var t = TEMPLATES[normTemplate(template) || DEFAULT_TEMPLATE];
    var o = opts || {};
    var title = t.title;
    if (t.titleXl && o.headSize === 'h1') title = t.titleXl;
    return { kicker: t.kicker, title: title, intro: t.intro, data: t.data, text: t.text,
             review: !!t.review, items: !!t.items };
  }

  /* ---------------------------------------------------------------------------
     Tekst-hulpjes
     ------------------------------------------------------------------------- */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* "trust, hard work; sail further" -> ['trust', 'hard work', 'sail further']
     Accepteert ook een array. Dubbele en lege waarden vallen weg. */
  function parseAccentWords(input) {
    var list = Array.isArray(input) ? input : String(input || '').split(/[,;\n]+/);
    var seen = {};
    var out = [];
    list.forEach(function (w) {
      var s = String(w || '').replace(/^[\s*_"'“”]+|[\s*_"'“”]+$/g, '').replace(/\s+/g, ' ');
      if (!s) return;
      var k = s.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(s);
    });
    return out;
  }

  /* Inline markering in vrije tekst: **woord** of *woord* (zoals de AI die
     teruggeeft) wordt uit de tekst gehaald en als accentwoord teruggegeven. */
  function extractInlineAccents(text) {
    var words = [];
    var clean = String(text || '').replace(/\*{1,2}([^*\n]+?)\*{1,2}/g, function (m, w) {
      words.push(w.trim());
      return w;
    });
    return { text: clean, words: parseAccentWords(words) };
  }

  /* Woordgrenzen die ook met accenten en Unicode-letters werken ("délivér").
     Browsers zonder de u-vlag krijgen \b als terugvaloptie. */
  function boundaryRegExp(alternatives) {
    var alt = alternatives.join('|');
    try {
      return new RegExp('(^|[^\\p{L}\\p{N}_])(' + alt + ')(?![\\p{L}\\p{N}_])', 'giu');
    } catch (err) {
      return new RegExp('(^|\\W)(' + alt + ')(?!\\w)', 'gi');
    }
  }

  /* De kern: platte tekst -> veilige HTML waarin elke accentwoord/-zin
     als <em class="ss-accent"> (Allumi Std Bold Italic via CSS) staat.

       applyAccents('Powered by hardworking people', ['hardworking'])
       -> 'Powered by <em class="ss-accent">hardworking</em> people'

     - hoofdletterongevoelig, hele woorden (geen "trust" in "trustworthy")
     - langere zinsdelen winnen van kortere ("deliver trust" boven "trust")
     - de tekst wordt eerst ge-escaped: invoer kan nooit HTML injecteren
     - regeleinden worden <br> */
  function applyAccents(text, words) {
    var safe = escapeHtml(String(text || ''));
    var list = parseAccentWords(words)
      .sort(function (a, b) { return b.length - a.length; })
      .map(function (w) { return escapeRegExp(escapeHtml(w)).replace(/\s+/g, '\\s+'); });

    if (list.length && safe.trim()) {
      safe = safe.replace(boundaryRegExp(list), function (m, before, hit) {
        return before + '<em class="ss-accent">' + hit + '</em>';
      });
    }
    return safe.replace(/\r?\n/g, '<br>');
  }

  /* ---------------------------------------------------------------------------
     HTML voor het canvas
     ------------------------------------------------------------------------- */

  /* Sterrenrij voor Template E. Vijf sterren, de eerste `aantal` gevuld, de
     rest doorzichtig. Het pad staat hier inline zodat de export hem meeneemt
     zonder extra bestand; de kleur komt via currentColor uit de CSS. */
  var STAR_PATH = 'M12 1.9l3.09 6.26 6.91 1-5 4.87 1.18 6.88L12 17.66l-6.18 3.25L7 14.03l-5-4.87 6.91-1z';

  /* Eén regel per onderdeel: "Kopje | Uitleg | icoon". De uitleg en het icoon
     zijn optioneel; zonder icoonnaam krijgt elk onderdeel het volgende icoon
     uit ITEM_ICONS. */
  function parseItems(text) {
    var uit = [];
    String(text || '').split(/\r?\n/).forEach(function (regel, i) {
      var deel = regel.split('|');
      var kop = String(deel[0] || '').trim();
      if (!kop) return;
      var naam = String(deel[2] || '').trim().toLowerCase();
      if (ITEM_ICONS.indexOf(naam) === -1) naam = ITEM_ICONS[uit.length % ITEM_ICONS.length];
      uit.push({ title: kop, text: String(deel[1] || '').trim(), icon: naam });
    });
    return uit;
  }

  function itemsHtml(items) {
    if (!items.length) return '';
    var uit = '<div class="pc-items">';
    items.forEach(function (it) {
      uit += '<div class="pc-item">' +
             '<span class="pc-item__icon" data-icon="' + escapeHtml(it.icon) + '" aria-hidden="true"></span>' +
             '<span class="pc-item__txt">' +
             '<b class="pc-item__title">' + escapeHtml(it.title) + '</b>' +
             (it.text ? '<i class="pc-item__text">' + escapeHtml(it.text) + '</i>' : '') +
             '</span></div>';
    });
    return uit + '</div>';
  }

  /* Eerste letter van de naam voor het rondje in de reviewkaart. */
  function initiaal(naam) {
    var m = String(naam || '').replace(/^[\s\u2013\u2014-]+/, '').trim();
    return m ? m.charAt(0).toUpperCase() : '';
  }

  function starsHtml(count) {
    var n = Math.max(0, Math.min(5, Math.round(Number(count) || 0)));
    var out = '<div class="pc-stars" aria-hidden="true">';
    for (var i = 1; i <= 5; i++) {
      out += '<svg class="pc-star' + (i <= n ? '' : ' is-off') + '" viewBox="0 0 24 24" ' +
             'width="24" height="24" xmlns="http://www.w3.org/2000/svg">' +
             '<path d="' + STAR_PATH + '" fill="currentColor"/></svg>';
    }
    return out + '</div>';
  }

  function element(level, html) {
    var L = LEVELS[level];
    if (!L || !html) return '';
    return '<' + L.tag + ' class="' + L.cls + '">' + html + '</' + L.tag + '>';
  }

  /* fields: { kicker, title, intro, data, accents } (platte strings; accents
     mag string of array zijn). Geeft de innerHTML van .pc-flow terug, in de
     vaste volgorde bovenkop -> hoofdkop -> inleiding -> data. Lege velden
     worden overgeslagen zodat de CSS-ritmiek (h3 + h2, h2 + p) klopt. */
  function buildFlow(fields, template, opts) {
    var f = fields || {};
    var lv = levels(template, opts);
    if (!lv.text) return '';

    // Inline **markering** in de velden telt ook mee als accent
    var kicker = extractInlineAccents(f.kicker);
    var title  = extractInlineAccents(f.title);
    var intro  = extractInlineAccents(f.intro);
    var accents = parseAccentWords([].concat(parseAccentWords(f.accents), kicker.words, title.words, intro.words));

    var data = String(f.data || '').trim();

    /* Template F: kop, inleiding en daaronder de lijst met certificeringen. */
    if (lv.items) {
      return [
        lv.title ? element(lv.title, applyAccents(title.text.trim(), accents)) : '',
        lv.intro ? element(lv.intro, applyAccents(intro.text.trim(), accents)) : '',
        itemsHtml(parseItems(f.items))
      ].join('');
    }

    /* Template E. Twee weergaven: 'kaart' lijkt op een Google-review met een
       wit blok, rondje met initiaal, naam, datum en gouden sterren; 'open'
       zet de sterren, de recensie tussen aanhalingstekens en de naam los op
       de achtergrond. */
    if (lv.review) {
      var sterren = starsHtml(opts && opts.stars !== undefined ? opts.stars : 5);
      var quote = applyAccents(title.text.trim(), accents);
      var naam = String(f.reviewer || '').replace(/^[\s\u2013\u2014-]+/, '').replace(/\s+/g, ' ').trim();
      var datum = String(f.date || '').replace(/\s+/g, ' ').trim();

      if (!opts || opts.reviewStyle !== 'open') {
        var letter = initiaal(naam);
        return '<div class="pc-card">' +
          (naam || datum
            ? '<div class="pc-card__head">' +
              (letter ? '<span class="pc-card__avatar" aria-hidden="true">' + escapeHtml(letter) + '</span>' : '') +
              '<span class="pc-card__who">' +
              (naam ? '<b class="pc-card__name">' + escapeHtml(naam) + '</b>' : '') +
              (datum ? '<i class="pc-card__date">' + escapeHtml(datum) + '</i>' : '') +
              '</span></div>'
            : '') +
          sterren +
          (quote ? '<p class="pc-card__text">' + quote + '</p>' : '') +
          '</div>';
      }

      return [
        sterren,
        quote ? element(lv.title, '\u201c' + quote + '\u201d') : '',
        naam ? '<p class="pc-reviewer">\u2014 ' + escapeHtml(naam) + '</p>' : ''
      ].join('');
    }

    /* Volgorde volgens het Canva-ontwerp (pagina 10): eerst de tekst, dan het
       data-element eronder. De styleguide zet het cijfer eerst; het ontwerp is
       leidend. */
    return [
      lv.kicker ? element(lv.kicker, applyAccents(kicker.text.trim(), accents)) : '',
      lv.title  ? element(lv.title,  applyAccents(title.text.trim(),  accents)) : '',
      lv.intro  ? element(lv.intro,  applyAccents(intro.text.trim(),  accents)) : '',
      lv.data   ? element(lv.data, escapeHtml(data)) : ''
    ].join('');
  }

  /* Aantal woorden dat daadwerkelijk op het canvas komt */
  function wordCount(fields, template) {
    var lv = levels(template);
    if (!lv.text) return 0;
    var f = fields || {};
    return [lv.data ? f.data : '', lv.kicker ? f.kicker : '', lv.title ? f.title : '',
            lv.intro ? f.intro : '', lv.review ? f.reviewer : '', lv.review ? f.date : '',
            lv.items ? String(f.items || '').split('|').join(' ') : '']
      .join(' ').replace(/\*/g, '').split(/\s+/).filter(Boolean).length;
  }

  return {
    LEVELS: LEVELS,
    TEMPLATES: TEMPLATES,
    DEFAULT_TEMPLATE: DEFAULT_TEMPLATE,
    normTemplate: normTemplate,
    levels: levels,
    escapeHtml: escapeHtml,
    parseAccentWords: parseAccentWords,
    extractInlineAccents: extractInlineAccents,
    applyAccents: applyAccents,
    buildFlow: buildFlow,
    wordCount: wordCount,
    ITEM_ICONS: ITEM_ICONS,
    parseItems: parseItems
  };
})();
