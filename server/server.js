/* =============================================================================
   server.js — Post Studio backend
   -----------------------------------------------------------------------------
   Eén kleine Node-server (geen framework) die twee dingen doet:

     1. De tool zelf serveren (index.html, css/, js/) zodat frontend en API op
        dezelfde origin draaien — geen CORS-gedoe, geen file://-beperkingen.
     2. POST /api/suggest: de AI-assistent. Ontvangt de briefing, de huidige
        tekst, de stijlgids en de instellingen, en laat het OpenAI-model een
        of meer complete postvarianten schrijven die passen bij het merk.

   De API-key staat ALLEEN hier, in de omgevingsvariabele OPENAI_API_KEY.
   De browser krijgt hem nooit te zien. Geen dependencies: Node's ingebouwde
   fetch praat rechtstreeks met https://api.openai.com.

   Omgevingsvariabelen:
     OPENAI_API_KEY      verplicht — je OpenAI-key (sk-...)
     ACCESS_CODE         optioneel — gedeelde code die de tool moet meesturen,
                         zodat niet iedereen die je URL kent jouw key opstookt
     AI_MODEL            standaard gpt-4.1 (elk chat-model met structured
                         outputs werkt, bijv. gpt-4o, gpt-4.1-mini)
     AI_REASONING        alleen voor redeneermodellen (o-serie, gpt-5):
                         low | medium | high
     ALLOWED_ORIGINS     komma-lijst van extra origins die de API mogen
                         aanroepen (bijv. http://127.0.0.1:5500 voor Live Server)
     RATE_LIMIT          verzoeken per IP per 10 minuten (standaard 30)
     AI_MOCK=1           geen API-aanroep; geeft een vaste testvariant terug
     PORT                door Render gezet
   ============================================================================= */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.env.PORT, 10) || 3000;
const MODEL = process.env.AI_MODEL || 'gpt-4.1';
const REASONING = ['low', 'medium', 'high'].includes(process.env.AI_REASONING) ? process.env.AI_REASONING : null;
const OPENAI_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions';
const AI_TIMEOUT_MS = 110000;
const ACCESS_CODE = (process.env.ACCESS_CODE || '').trim();
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT, 10) || 30;
const MOCK = process.env.AI_MOCK === '1';
const MAX_BODY = 400 * 1024;          // 400 KB: briefing + stijlgids + tekst
const MAX_STYLEGUIDE_CHARS = 60000;   // ~15k tokens; ruim voor een stijlgids

const API_KEY = (process.env.OPENAI_API_KEY || '').trim();

/* ---------------------------------------------------------------------------
   Uitvoerschema — het model vult dit exact in (OpenAI structured outputs,
   strict: elke eigenschap verplicht, geen extra velden)
   ------------------------------------------------------------------------- */
const THEMES = ['minimal', 'editorial', 'panel', 'bold', 'band', 'quote'];

function obj(properties) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

const RESPONSE_SCHEMA = obj({
  variants: {
    type: 'array', description: '1 tot 3 varianten',
    items: obj({
      name:  { type: 'string', description: 'Korte naam van de invalshoek, max 4 woorden, bijv. "Urgentie" of "Warm & persoonlijk"' },
      label: { type: 'string', description: 'Eyebrow-label bovenaan de post, 1-3 woorden, of leeg' },
      title: { type: 'string', description: 'De kop. Max ~7 woorden per regel; een \\n scheidt regels. Krachtig, geen punt aan het eind' },
      body:  { type: 'string', description: 'Bodytekst, 0-2 korte zinnen (max ~140 tekens). **woord** geeft nadruk in de accentkleur. Leeg als niet nodig' },
      list:  { type: 'array', items: { type: 'string' }, description: '0-3 korte opsommingspunten, elk max ~6 woorden' },
      quote: { type: 'string', description: 'Optioneel citaat of afsluitende regel, of leeg' },
      badge: { type: 'string', description: 'Handle/bijschrift onderin, bijv. @merknaam, of leeg om de huidige te behouden' },
      style: obj({
        theme:     { type: 'string', enum: THEMES },
        align:     { type: 'string', enum: ['left', 'center', 'right'] },
        position:  { type: 'string', enum: ['top', 'middle', 'bottom'] },
        overlay:   { type: 'integer', description: 'Donkerte van de foto in %, 0-90; 35-65 is gebruikelijk' },
        textScale: { type: 'integer', description: 'Tekstgrootte in %, 70-145; 100 is normaal' },
        accent:    { type: 'string', description: 'Accentkleur als #rrggbb uit het merkpalet, of leeg om de huidige te behouden' },
        textColor: { type: 'string', description: 'Tekstkleur als #rrggbb, of leeg om de huidige te behouden' }
      }),
      why: { type: 'string', description: 'Eén zin, in de taal van de gebruiker: waarom deze variant past bij briefing en merk' }
    })
  },
  notes: { type: 'string', description: 'Optionele korte opmerking voor de gebruiker (bijv. ontbrekende info in de briefing), of leeg' }
});

/* ---------------------------------------------------------------------------
   Systeemprompt — stabiel, zodat prompt caching hem kan hergebruiken
   ------------------------------------------------------------------------- */
const SYSTEM_PROMPT = `Je bent een senior social-media copywriter en art director. Je schrijft Instagram-posts voor een tool genaamd Post Studio: één foto met daarop tekst in vaste onderdelen (label, kop, tekst, opsomming, citaat, handle) en een vormgevingssjabloon.

## Wat je krijgt
- Een briefing van de gebruiker: wat er gepost moet worden (actie, korting, aankondiging, aftellen, sfeer, ...). Dit is de opdracht.
- Eventueel de huidige tekst in de tool (bij "verbeteren" is dit je uitgangspunt).
- Eventueel een merkstijlgids in markdown, plus de kleuren/fonts die daaruit zijn gehaald.
- De huidige instellingen (formaat, sjabloon, kleuren, handle).

## Zo denk je
1. Lees de stijlgids als een merkstrateeg: wie is het merk, wie is de doelgroep, wat is de tone of voice (formeel/informeel, je/u, speels/zakelijk), welke woorden en USP's gebruikt het merk, wat vermijdt het? Neem die stem exact over. Zonder stijlgids: kies een stem die past bij de briefing en blijf neutraal-professioneel.
2. Begrijp wat de gebruiker écht wil bereiken (verkopen, informeren, aftellen, warmte overbrengen) en schrijf daarvoor. Een korting vraagt om helderheid en urgentie; een aftelling om spanning en een concrete datum; een sfeerpost om beeldend taalgebruik.
3. Gebruik uitsluitend feiten uit de briefing en de stijlgids. Verzin nooit percentages, prijzen, data, voorwaarden of productnamen. Ontbreekt iets essentieels, schrijf dan eromheen en meld het in "notes".
4. Instagram wordt op een telefoon gelezen: weinig woorden, veel kracht. Kop max ~7 woorden per regel (gebruik \\n voor een bewuste tweede regel), body max ~140 tekens, opsomming max 3 punten van max ~6 woorden. Liever minder onderdelen dan een volle post. Geen hashtags, geen emoji tenzij het merk dat duidelijk doet.
5. Kies het sjabloon bewust:
   - minimal: rustig, sfeer, tekst direct op de foto
   - editorial: verzorgd, redactioneel, accentlijn langs de tekst
   - panel: veel tekst of drukke foto, tekst op een licht vlak
   - bold: aanbiedingen en kortingen, kop in een vol accentvlak
   - band: donkere balk van rand tot rand, zakelijk en leesbaar
   - quote: één uitspraak centraal, gecentreerd
   Kies uitlijning en positie zodat de tekst logisch op een foto valt (onder is veilig). Verhoog overlay bij veel tekst op een foto.
6. Kleuren: gebruik alleen hexwaarden uit het meegegeven merkpalet. Geen palet? Laat accent en textColor leeg zodat de huidige instelling blijft staan.
7. Schrijf in de taal van de briefing (meestal Nederlands). Bij "verbeteren": behoud de boodschap en de feiten, maak het scherper en meer on-brand, lever precies 1 variant. Bij "genereren": lever 3 duidelijk verschillende invalshoeken (bijv. urgentie / voordeel / gevoel).

Lever uitsluitend het gevraagde JSON-object, zonder tekst eromheen.`;

/* ---------------------------------------------------------------------------
   Hulpfuncties
   ------------------------------------------------------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2'
};

function json(res, status, body, extraHeaders) {
  const headers = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extraHeaders || {});
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin) return {};
  const host = req.headers.host;
  const sameOrigin = origin === `http://${host}` || origin === `https://${host}`;
  if (sameOrigin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code',
      'Access-Control-Max-Age': '600',
      'Vary': 'Origin'
    };
  }
  return null;   // origin niet toegestaan
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Verzoek te groot'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (err) { reject(Object.assign(new Error('Ongeldige JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

/* Eenvoudige rate limiter per IP: RATE_LIMIT verzoeken per 10 minuten */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const window = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter(t => now - t < window);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();   // geheugen begrensd houden
  return list.length > RATE_LIMIT;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.socket.remoteAddress || 'onbekend';
}

function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 4000) : ''; }

/* ---------------------------------------------------------------------------
   De AI-aanroep
   ------------------------------------------------------------------------- */
function buildUserMessage(p) {
  const mode = p.mode === 'improve' ? 'improve' : 'generate';
  const content = p.content || {};
  const settings = p.settings || {};
  const brand = (p.styleguide && p.styleguide.brand) || {};
  const palette = Array.isArray(brand.colors) ? brand.colors.slice(0, 24) : [];

  const lines = [];
  lines.push(mode === 'improve'
    ? '## Opdracht: VERBETER de huidige tekst (1 variant). Behoud boodschap en feiten; maak het scherper en on-brand.'
    : '## Opdracht: MAAK een nieuwe post (3 verschillende varianten) op basis van de briefing.');

  lines.push('', '## Briefing van de gebruiker', str(p.brief, 3000).trim() || '(geen briefing — leid het doel af uit de huidige tekst)');

  const hasContent = ['label', 'title', 'body', 'list', 'quote'].some(k => str(content[k], 2000).trim());
  if (hasContent) {
    lines.push('', '## Huidige tekst in de tool');
    if (str(content.label).trim()) lines.push('Label: ' + str(content.label, 200));
    if (str(content.title).trim()) lines.push('Kop: ' + str(content.title, 400).replace(/\n/g, ' / '));
    if (str(content.body).trim()) lines.push('Tekst: ' + str(content.body, 1200));
    if (str(content.list).trim()) lines.push('Opsomming: ' + str(content.list, 600).split('\n').filter(Boolean).join(' | '));
    if (str(content.quote).trim()) lines.push('Citaat: ' + str(content.quote, 400));
  }

  lines.push('', '## Huidige instellingen');
  lines.push(`Formaat: ${str(settings.ratio, 10) || '4:5'} · Sjabloon: ${str(settings.theme, 20) || 'editorial'} · Uitlijning: ${str(settings.align, 10) || 'left'} · Positie: ${str(settings.valign, 10) || 'bottom'}`);
  lines.push(`Accentkleur: ${str(settings.accent, 10) || '-'} · Tekstkleur: ${str(settings.textColor, 10) || '-'} · Handle: ${str(settings.badge, 50) || '-'}`);
  lines.push(`Er is ${settings.hasImage ? 'wel' : 'nog geen'} foto geplaatst.`);

  if (palette.length || brand.name || brand.handle || (brand.fonts && (brand.fonts.heading || brand.fonts.body))) {
    lines.push('', '## Uit de stijlgids gehaald');
    if (brand.name) lines.push('Merknaam: ' + str(brand.name, 80));
    if (brand.handle) lines.push('Handle: ' + str(brand.handle, 60));
    if (brand.fonts && (brand.fonts.heading || brand.fonts.body)) lines.push(`Fonts: kop ${str(brand.fonts.heading, 60) || '-'} / tekst ${str(brand.fonts.body, 60) || '-'}`);
    if (palette.length) lines.push('Merkpalet (gebruik alleen deze hexwaarden): ' + palette.map(c => `${str(c.hex, 9)}${c.role ? ' (' + str(c.role, 12) + ')' : ''}${c.name ? ' ' + str(c.name, 30) : ''}`).join(', '));
  }

  return lines.join('\n');
}

async function suggest(p) {
  const styleguideText = str(p.styleguide && p.styleguide.text, MAX_STYLEGUIDE_CHARS);
  const truncated = (p.styleguide && typeof p.styleguide.text === 'string' && p.styleguide.text.length > MAX_STYLEGUIDE_CHARS);

  if (MOCK) {
    return {
      variants: [{
        name: 'Testvariant', label: 'Alleen deze week', title: '40% korting op\nalle plaids',
        body: 'Warm de winter in met **40% korting**. Geldig tot en met zondag.',
        list: ['Gratis verzending', 'Voor 22:00 besteld, vandaag verzonden'], quote: '', badge: '',
        style: { theme: 'bold', align: 'left', position: 'bottom', overlay: 55, textScale: 100, accent: '', textColor: '' },
        why: 'Testmodus: geen echte AI-aanroep (AI_MOCK=1).'
      }],
      notes: truncated ? 'De stijlgids is ingekort tot de eerste 60.000 tekens.' : ''
    };
  }

  if (!API_KEY) {
    throw Object.assign(new Error('De server heeft geen OPENAI_API_KEY. Zet die als omgevingsvariabele (op Render: Environment → Add Environment Variable).'), { status: 503 });
  }

  // Vaste blokken eerst (systeemprompt, stijlgids), variabele input als laatste:
  // zo kan OpenAI's automatische prompt caching het begin hergebruiken.
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (styleguideText.trim()) {
    messages.push({ role: 'system', content: '## Merkstijlgids (markdown, door de gebruiker geüpload)\n\n' + styleguideText });
  }
  messages.push({ role: 'user', content: buildUserMessage(p) });

  const body = {
    model: MODEL,
    messages,
    response_format: { type: 'json_schema', json_schema: { name: 'post_suggestions', strict: true, schema: RESPONSE_SCHEMA } }
  };
  if (REASONING) body.reasoning_effort = REASONING;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  let res, data;
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    data = await res.json().catch(() => ({}));
  } catch (err) {
    if (err && err.name === 'AbortError') throw Object.assign(new Error('De AI deed er te lang over. Probeer het opnieuw.'), { status: 504 });
    throw Object.assign(new Error('De server kan OpenAI niet bereiken. Probeer het later opnieuw.'), { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw Object.assign(new Error(describeOpenAiError(res.status, data)), { status: res.status === 429 ? 429 : 502, upstream: true });
  }

  const choice = data.choices && data.choices[0];
  if (!choice || !choice.message) throw Object.assign(new Error('Het model gaf geen antwoord terug. Probeer het opnieuw.'), { status: 502 });
  if (choice.message.refusal) {
    throw Object.assign(new Error('Het model heeft dit verzoek geweigerd: ' + choice.message.refusal), { status: 422 });
  }
  if (choice.finish_reason === 'length') {
    throw Object.assign(new Error('Het antwoord was te lang en is afgebroken. Probeer een kortere briefing.'), { status: 502 });
  }

  let out;
  try { out = JSON.parse(choice.message.content); }
  catch (err) { throw Object.assign(new Error('Het model gaf geen geldige JSON terug. Probeer het opnieuw.'), { status: 502 }); }
  if (!out || !Array.isArray(out.variants) || !out.variants.length) {
    throw Object.assign(new Error('Het model gaf geen voorstellen terug. Probeer het opnieuw.'), { status: 502 });
  }

  // Getallen binnen de grenzen houden (strict schema kent geen min/max)
  out.variants = out.variants.slice(0, 3);
  out.variants.forEach(v => {
    v.style = v.style || {};
    v.style.overlay = Math.min(90, Math.max(0, Math.round(Number(v.style.overlay) || 45)));
    v.style.textScale = Math.min(145, Math.max(70, Math.round(Number(v.style.textScale) || 100)));
    v.list = Array.isArray(v.list) ? v.list.slice(0, 3) : [];
  });

  if (truncated) out.notes = [out.notes, 'De stijlgids is ingekort tot de eerste 60.000 tekens.'].filter(Boolean).join(' ');
  const u = data.usage || {};
  out.usage = {
    input: u.prompt_tokens || 0,
    cached: (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0,
    output: u.completion_tokens || 0,
    model: data.model || MODEL
  };
  return out;
}

/* Foutmeldingen van OpenAI vertalen naar iets waar de gebruiker wat mee kan */
function describeOpenAiError(status, data) {
  const msg = (data && data.error && data.error.message) || '';
  const code = (data && data.error && data.error.code) || '';
  if (status === 401) return 'De OPENAI_API_KEY op de server is ongeldig of verlopen.';
  if (status === 403) return 'De API-key heeft geen toegang tot dit model of deze organisatie.';
  if (status === 404 || code === 'model_not_found') return `Het model "${MODEL}" bestaat niet of is niet beschikbaar voor deze key. Pas AI_MODEL aan op Render.`;
  if (status === 429 && /quota|billing/i.test(msg + code)) return 'Het OpenAI-tegoed is op of er is geen betaalmethode ingesteld. Controleer Billing op platform.openai.com.';
  if (status === 429) return 'De AI is even druk (rate limit). Probeer het over een minuut opnieuw.';
  if (status >= 500) return 'OpenAI heeft een storing. Probeer het later opnieuw.';
  return 'De AI-aanroep werd afgewezen: ' + (msg || ('HTTP ' + status));
}

/* Alles wat nog geen nette status heeft, wordt een 500 */
function describeError(err) {
  if (err && typeof err.status === 'number' && err.message) return { status: err.status, message: err.message };
  return { status: 500, message: 'Onverwachte serverfout: ' + (err && err.message ? err.message : String(err)) };
}

/* ---------------------------------------------------------------------------
   Statische bestanden (de tool zelf)
   ------------------------------------------------------------------------- */
function serveStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (err) { urlPath = '/'; }
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.normalize(path.join(ROOT, urlPath));
  const rel = path.relative(ROOT, filePath);
  const blocked = rel.startsWith('..') || rel.split(path.sep).some(seg => seg.startsWith('.') || seg === 'node_modules' || seg === 'server');
  if (blocked) { res.writeHead(404); res.end('Not found'); return; }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------------------------------------------------------------------------
   Router
   ------------------------------------------------------------------------- */
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (url.startsWith('/api/')) {
    const cors = corsHeaders(req);
    if (cors === null) { json(res, 403, { error: 'Deze origin mag de API niet gebruiken. Voeg hem toe aan ALLOWED_ORIGINS.' }); return; }
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

    if (url === '/api/health' && req.method === 'GET') {
      json(res, 200, { ok: true, model: MODEL, hasKey: !!API_KEY || MOCK, needsCode: !!ACCESS_CODE, mock: MOCK }, cors);
      return;
    }

    if (url === '/api/suggest' && req.method === 'POST') {
      if (ACCESS_CODE && (req.headers['x-access-code'] || '') !== ACCESS_CODE) {
        json(res, 401, { error: 'Toegangscode ontbreekt of klopt niet. Vul hem in bij AI-instellingen.' }, cors);
        return;
      }
      if (rateLimited(clientIp(req))) {
        json(res, 429, { error: 'Te veel verzoeken. Wacht een paar minuten en probeer het opnieuw.' }, cors);
        return;
      }
      try {
        const payload = await readBody(req);
        const result = await suggest(payload);
        json(res, 200, result, cors);
      } catch (err) {
        const d = describeError(err);
        if (d.status >= 500 || err.upstream) console.error('[suggest]', d.status, d.message);
        json(res, d.status, { error: d.message }, cors);
      }
      return;
    }

    json(res, 404, { error: 'Onbekend API-pad' }, cors);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Post Studio draait op http://localhost:${PORT}`);
  console.log(`  model: ${MODEL}${REASONING ? ' · reasoning: ' + REASONING : ''} · OPENAI_API_KEY: ${API_KEY ? 'aanwezig' : 'ONTBREEKT'} · toegangscode: ${ACCESS_CODE ? 'aan' : 'uit'}${MOCK ? ' · MOCK-modus' : ''}`);
});
