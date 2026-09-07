/* =============================================================================
   server.js — Post Studio backend
   -----------------------------------------------------------------------------
   Eén kleine Node-server (geen framework) die twee dingen doet:

     1. De tool zelf serveren (index.html, css/, js/) zodat frontend en API op
        dezelfde origin draaien — geen CORS-gedoe, geen file://-beperkingen.
     2. POST /api/suggest: de AI-assistent. Ontvangt de briefing, de huidige
        tekst, de stijlgids en de instellingen, en laat Claude een of meer
        complete postvarianten schrijven die passen bij het merk.

   De API-key staat ALLEEN hier, in de omgevingsvariabele ANTHROPIC_API_KEY.
   De browser krijgt hem nooit te zien.

   Omgevingsvariabelen:
     ANTHROPIC_API_KEY   verplicht — je Anthropic-key
     ACCESS_CODE         aanbevolen — gedeelde code die de tool moet meesturen,
                         zodat niet iedereen die je URL kent jouw key opstookt
     AI_MODEL            standaard claude-opus-5
     AI_EFFORT           low | medium | high (standaard high)
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
const { z } = require('zod');
const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.env.PORT, 10) || 3000;
const MODEL = process.env.AI_MODEL || 'claude-opus-5';
const EFFORT = ['low', 'medium', 'high'].includes(process.env.AI_EFFORT) ? process.env.AI_EFFORT : 'high';
const ACCESS_CODE = (process.env.ACCESS_CODE || '').trim();
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT, 10) || 30;
const MOCK = process.env.AI_MOCK === '1';
const MAX_BODY = 400 * 1024;          // 400 KB: briefing + stijlgids + tekst
const MAX_STYLEGUIDE_CHARS = 60000;   // ~15k tokens; ruim voor een stijlgids

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

/* ---------------------------------------------------------------------------
   Uitvoerschema — Claude vult dit exact in (structured outputs)
   ------------------------------------------------------------------------- */
const THEMES = ['minimal', 'editorial', 'panel', 'bold', 'band', 'quote'];

const VariantSchema = z.object({
  name: z.string().describe('Korte naam van de invalshoek, max 4 woorden, bijv. "Urgentie" of "Warm & persoonlijk"'),
  label: z.string().describe('Eyebrow-label bovenaan de post, 1-3 woorden, of leeg'),
  title: z.string().describe('De kop. Max ~7 woorden per regel; een \\n scheidt regels. Krachtig, geen punt aan het eind'),
  body: z.string().describe('Bodytekst, 0-2 korte zinnen (max ~140 tekens). **woord** geeft nadruk in de accentkleur. Leeg als niet nodig'),
  list: z.array(z.string()).describe('0-3 korte opsommingspunten, elk max ~6 woorden'),
  quote: z.string().describe('Optioneel citaat of afsluitende regel, of leeg'),
  badge: z.string().describe('Handle/bijschrift onderin, bijv. @merknaam, of leeg om de huidige te behouden'),
  style: z.object({
    theme: z.enum(THEMES),
    align: z.enum(['left', 'center', 'right']),
    position: z.enum(['top', 'middle', 'bottom']),
    overlay: z.number().int().min(0).max(90).describe('Donkerte van de foto in %, 35-65 is gebruikelijk'),
    textScale: z.number().int().min(70).max(145).describe('Tekstgrootte in %, 100 is normaal'),
    accent: z.string().describe('Accentkleur als #rrggbb uit het merkpalet, of leeg om de huidige te behouden'),
    textColor: z.string().describe('Tekstkleur als #rrggbb, of leeg om de huidige te behouden')
  }),
  why: z.string().describe('Eén zin, in de taal van de gebruiker: waarom deze variant past bij briefing en merk')
});

const ResponseSchema = z.object({
  variants: z.array(VariantSchema).describe('1 tot 3 varianten'),
  notes: z.string().describe('Optionele korte opmerking voor de gebruiker (bijv. ontbrekende info in de briefing), of leeg')
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

Lever uitsluitend het gevraagde JSON-object.`;

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

  if (!client) {
    throw Object.assign(new Error('De server heeft geen ANTHROPIC_API_KEY. Zet die als omgevingsvariabele (op Render: Environment → Add Environment Variable).'), { status: 503 });
  }

  // Stabiele prefix eerst (systeemprompt), daarna de stijlgids met cache-markering:
  // dezelfde stijlgids wordt bij elk verzoek hergebruikt en hoeft niet opnieuw
  // te worden verwerkt.
  const system = [{ type: 'text', text: SYSTEM_PROMPT }];
  if (styleguideText.trim()) {
    system.push({
      type: 'text',
      text: '## Merkstijlgids (markdown, door de gebruiker geüpload)\n\n' + styleguideText,
      cache_control: { type: 'ephemeral' }
    });
  }

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: EFFORT, format: zodOutputFormat(ResponseSchema) },
    system,
    messages: [{ role: 'user', content: buildUserMessage(p) }]
  });

  if (response.stop_reason === 'refusal') {
    throw Object.assign(new Error('Het model heeft dit verzoek geweigerd' + (response.stop_details && response.stop_details.explanation ? ': ' + response.stop_details.explanation : '.')), { status: 422 });
  }
  if (!response.parsed_output) {
    throw Object.assign(new Error('Het model gaf geen geldig antwoord terug. Probeer het opnieuw.'), { status: 502 });
  }

  const out = response.parsed_output;
  if (truncated) out.notes = [out.notes, 'De stijlgids is ingekort tot de eerste 60.000 tekens.'].filter(Boolean).join(' ');
  out.usage = {
    input: response.usage.input_tokens,
    cached: response.usage.cache_read_input_tokens || 0,
    output: response.usage.output_tokens,
    model: response.model
  };
  return out;
}

/* Fouten van de SDK vertalen naar iets waar de gebruiker wat mee kan */
function describeError(err) {
  if (err && typeof err.status === 'number' && err.message && !(err instanceof Anthropic.APIError)) {
    return { status: err.status, message: err.message };
  }
  if (err instanceof Anthropic.AuthenticationError) return { status: 502, message: 'De API-key op de server is ongeldig of verlopen.' };
  if (err instanceof Anthropic.PermissionDeniedError) return { status: 502, message: 'De API-key heeft geen toegang tot dit model.' };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: 'De AI is even druk (rate limit). Probeer het over een minuut opnieuw.' };
  if (err instanceof Anthropic.BadRequestError) return { status: 502, message: 'De AI-aanroep werd afgewezen: ' + err.message };
  if (err instanceof Anthropic.APIConnectionError) return { status: 502, message: 'De server kan de AI niet bereiken. Probeer het later opnieuw.' };
  if (err instanceof Anthropic.APIError) return { status: 502, message: `AI-fout (${err.status}): ${err.message}` };
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
      json(res, 200, { ok: true, model: MODEL, hasKey: !!client || MOCK, needsCode: !!ACCESS_CODE, mock: MOCK }, cors);
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
        if (d.status >= 500) console.error('[suggest]', err);
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
  console.log(`  model: ${MODEL} · effort: ${EFFORT} · key: ${client ? 'aanwezig' : 'ONTBREEKT'} · toegangscode: ${ACCESS_CODE ? 'aan' : 'uit'}${MOCK ? ' · MOCK-modus' : ''}`);
});
