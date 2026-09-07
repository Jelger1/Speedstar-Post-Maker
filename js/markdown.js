/* =============================================================================
   markdown.js — markdown naar HTML voor het postcanvas
   -----------------------------------------------------------------------------
   Verantwoordelijk voor:
     • frontmatter (--- ... ---) en ```style-blokken afsplitsen van de inhoud
     • markdown renderen via marked.js, met een eigen fallback als de CDN
       niet beschikbaar is (bijv. offline of bij openen via file://)
     • de uitvoer saneren: alleen opmaak-tags overleven, geen scripts of
       attributen die de preview kunnen kapen

   Publieke API:  window.IPM.md.parse(raw) -> { meta, body, html }
   ============================================================================= */
window.IPM = window.IPM || {};

window.IPM.md = (function () {
  'use strict';

  /* Frontmatter bovenaan het bestand: --- key: value --- */
  var RE_FRONTMATTER = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
  /* Alternatief: een codeblok met stijlvariabelen midden in het document */
  var RE_STYLEBLOCK  = /```(?:style|ipm|post)[ \t]*\r?\n([\s\S]*?)```/i;

  /* Tags die in het canvas mogen bestaan; al het andere wordt uitgepakt. */
  var ALLOWED = ['H1','H2','H3','H4','H5','H6','P','UL','OL','LI','BLOCKQUOTE',
                 'STRONG','B','EM','I','S','DEL','CODE','PRE','BR','HR','A',
                 'SPAN','SMALL','MARK','IMG'];

  /* ---------------------------------------------------------------------------
     Hulpfuncties
     ------------------------------------------------------------------------- */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* "key: value"-regels omzetten naar een object. Ondersteunt #-commentaar,
     aanhalingstekens en markdown-opsommingen ("- key: value"). */
  function parseKeyValues(text) {
    var out = {};
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var raw = line.replace(/^\s*[-*]\s+/, '').trim();
      if (!raw || raw.charAt(0) === '#') return;

      var i = raw.indexOf(':');
      if (i < 1) return;

      var key = raw.slice(0, i).trim().replace(/^["'`]|["'`]$/g, '');
      var val = raw.slice(i + 1).trim();

      val = val.replace(/\s+#.*$/, '');                  // commentaar achter de waarde
      val = val.replace(/^["'`]|["'`;,]+$/g, '').trim(); // quotes en afsluittekens
      if (!key || !val) return;

      out[key.toLowerCase().replace(/[\s_-]+/g, '')] = val;
      out['__raw__' + key.toLowerCase()] = val;
    });
    return out;
  }

  /* ---------------------------------------------------------------------------
     Fallback-renderer — compacte markdown-subset voor als marked.js ontbreekt
     ------------------------------------------------------------------------- */
  function inline(text) {
    return text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<s>$1</s>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<a href="$2">$1</a>');
  }

  function fallbackRender(src) {
    var lines = escapeHtml(src).split(/\r?\n/);
    var html = [];
    var list = null;      // 'ul' | 'ol' | null
    var para = [];        // buffer voor lopende alinea
    var quote = [];       // buffer voor lopend citaat

    function flushPara() {
      if (!para.length) return;
      html.push('<p>' + inline(para.join('<br>')) + '</p>');
      para = [];
    }
    function flushQuote() {
      if (!quote.length) return;
      html.push('<blockquote>' + inline(quote.join('<br>')) + '</blockquote>');
      quote = [];
    }
    function flushList() {
      if (!list) return;
      html.push('</' + list + '>');
      list = null;
    }
    function flushAll() { flushPara(); flushQuote(); flushList(); }

    lines.forEach(function (line) {
      var t = line.trim();

      if (!t) { flushAll(); return; }

      var m;
      if ((m = t.match(/^(#{1,6})\s+(.*)$/))) {           // kop
        flushAll();
        var lvl = m[1].length;
        html.push('<h' + lvl + '>' + inline(m[2]) + '</h' + lvl + '>');
        return;
      }
      if (/^([-*_])\1{2,}$/.test(t.replace(/\s/g, ''))) {  // horizontale lijn
        flushAll();
        html.push('<hr>');
        return;
      }
      if ((m = t.match(/^&gt;\s?(.*)$/))) {                // citaat (> is al ge-escaped)
        flushPara(); flushList();
        quote.push(m[1]);
        return;
      }
      if ((m = t.match(/^[-*+]\s+(.*)$/))) {               // opsomming
        flushPara(); flushQuote();
        if (list !== 'ul') { flushList(); html.push('<ul>'); list = 'ul'; }
        html.push('<li>' + inline(m[1]) + '</li>');
        return;
      }
      if ((m = t.match(/^\d+[.)]\s+(.*)$/))) {             // genummerde lijst
        flushPara(); flushQuote();
        if (list !== 'ol') { flushList(); html.push('<ol>'); list = 'ol'; }
        html.push('<li>' + inline(m[1]) + '</li>');
        return;
      }
      flushQuote(); flushList();
      para.push(t);
    });

    flushAll();
    return html.join('\n');
  }

  /* ---------------------------------------------------------------------------
     Sanitizer — houdt alleen opmaak over, gooit scripts/attributen weg
     ------------------------------------------------------------------------- */
  function sanitize(html) {
    var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');

    Array.prototype.slice.call(doc.body.querySelectorAll('*')).forEach(function (node) {
      if (ALLOWED.indexOf(node.tagName) === -1) {
        // Niet-toegestane tag: inhoud behouden, element zelf verwijderen
        var parent = node.parentNode;
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        parent.removeChild(node);
        return;
      }
      Array.prototype.slice.call(node.attributes).forEach(function (attr) {
        var name = attr.name.toLowerCase();
        var val = attr.value.trim();
        var safeLink = /^(https?:|mailto:|#|\/|\.)/i.test(val);

        if (node.tagName === 'A' && name === 'href' && safeLink) return;
        if (node.tagName === 'IMG' && name === 'alt') return;
        if (node.tagName === 'IMG' && name === 'src' && /^(https?:|data:image\/|\/|\.)/i.test(val)) return;
        node.removeAttribute(attr.name);
      });
    });

    return doc.body.innerHTML;
  }

  /* ---------------------------------------------------------------------------
     Renderen: marked.js indien geladen, anders de eigen fallback
     ------------------------------------------------------------------------- */
  function render(src) {
    var html;
    try {
      if (typeof marked !== 'undefined') {
        var fn = typeof marked.parse === 'function' ? marked.parse
               : typeof marked === 'function' ? marked : null;
        if (fn) html = fn(src, { gfm: true, breaks: true, async: false });
      }
    } catch (err) {
      html = null; // valt hieronder terug op de eigen parser
    }
    if (typeof html !== 'string') html = fallbackRender(src);
    return sanitize(html);
  }

  /* Platte tekst: regels blijven regels, geen markdown-interpretatie */
  function renderPlain(src) {
    return String(src)
      .split(/\r?\n\s*\r?\n/)
      .filter(function (block) { return block.trim(); })
      .map(function (block) {
        return '<p>' + escapeHtml(block.trim()).replace(/\r?\n/g, '<br>') + '</p>';
      })
      .join('\n');
  }

  /* ---------------------------------------------------------------------------
     Publieke entree: splitst stijlvariabelen af en rendert de rest
     ------------------------------------------------------------------------- */
  function parse(raw, opts) {
    opts = opts || {};
    var src = String(raw || '').replace(/\r\n/g, '\n');
    var meta = {};

    var fm = src.match(RE_FRONTMATTER);
    if (fm) {
      meta = parseKeyValues(fm[1]);
      src = src.slice(fm[0].length);
    }

    var sb = src.match(RE_STYLEBLOCK);
    if (sb) {
      var extra = parseKeyValues(sb[1]);
      Object.keys(extra).forEach(function (k) { if (!(k in meta)) meta[k] = extra[k]; });
      src = src.replace(sb[0], '');
    }

    var body = src.replace(/^\n+/, '').replace(/\n+$/, '');

    return {
      meta: meta,
      body: body,
      html: opts.markdown === false ? renderPlain(body) : render(body)
    };
  }

  return {
    parse: parse,
    render: render,
    renderPlain: renderPlain,
    sanitize: sanitize,
    escapeHtml: escapeHtml,
    parseKeyValues: parseKeyValues,
    splitFrontmatter: function (raw) {
      var src = String(raw || '').replace(/\r\n/g, '\n');
      var m = src.match(RE_FRONTMATTER);
      return m ? { meta: parseKeyValues(m[1]), body: src.slice(m[0].length) }
               : { meta: {}, body: src };
    }
  };
})();
