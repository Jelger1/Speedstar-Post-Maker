/* =============================================================================
   server.js — Speedstar Post Maker backend
   -----------------------------------------------------------------------------
   Eén kleine Node-server (geen framework) die twee dingen doet:

     1. De tool zelf serveren (index.html, css/, js/, assets/) zodat frontend
        en API op dezelfde origin draaien.
     2. POST /api/suggest: de AI-assistent. Ontvangt de briefing en de huidige
        post, en laat het OpenAI-model on-brand Speedstar-copy schrijven in
        exact de JSON-structuur uit assets/STYLEGUIDE_Speedstar.md (§4).

   De API-key staat ALLEEN hier, in de omgevingsvariabele OPENAI_API_KEY.
   Geen dependencies: Node's ingebouwde fetch praat met api.openai.com.

   Omgevingsvariabelen:
     OPENAI_API_KEY      verplicht — je OpenAI-key (sk-...)
     AI_MODEL            standaard gpt-4.1 (elk chat-model met structured outputs)
     AI_REASONING        alleen voor redeneermodellen (o-serie, gpt-5): low | medium | high
     ALLOWED_ORIGINS     komma-lijst van extra origins die de API mogen aanroepen
                         (GitHub Pages en localhost zijn standaard toegestaan)
     RATE_LIMIT          verzoeken per IP per 10 minuten (standaard 30)
     AI_MOCK=1           geen API-aanroep; geeft vaste testvoorstellen terug
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
const DEFAULT_ALLOWED_ORIGINS = ['https://jelger1.github.io'];
const ALLOWED_ORIGINS = DEFAULT_ALLOWED_ORIGINS.concat((process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;   // lokaal testen mag altijd
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT, 10) || 30;
const MOCK = process.env.AI_MOCK === '1';
const MAX_BODY = 64 * 1024;

const API_KEY = (process.env.OPENAI_API_KEY || '').trim();

/* ---------------------------------------------------------------------------
   Uitvoerschema — styleguide §4, afgedwongen met OpenAI structured outputs
   (strict: elke eigenschap verplicht, geen extra velden, enum voor het
   template). Het model KAN geen andere structuur teruggeven.

   Per voorstel exact de structuur uit de styleguide:
     bovenkop, hoofdkop, body, accentWoorden, aanbevolenTemplate
   plus drie hulpvelden voor de tool:
     dataElement (alleen Template D), invalshoek (naam van de variant),
     toelichting (één zin voor de gebruiker)
   ------------------------------------------------------------------------- */
const TEMPLATES = ['A', 'B', 'C', 'D', 'E', 'F'];

function obj(properties) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

const POST_SCHEMA = obj({
  bovenkop: { type: 'string', description: 'IN HET NEDERLANDS. Korte introductie boven de hoofdkop (Heading 3, 26pt): max 4 woorden, bijv. een datum, thema of aanleiding. Leeg als het template geen bovenkop nodig heeft.' },
  hoofdkop: { type: 'string', description: 'IN HET NEDERLANDS. De kernboodschap (Heading 2, 42pt): max 6 woorden, geen punt aan het eind. Bij Template B leeg.' },
  body: { type: 'string', description: 'IN HET NEDERLANDS. De uitleg of wens (Inleiding, 14pt): max 2 zinnen, kort en bondig. Bij Template B leeg.' },
  accentWoorden: { type: 'array', items: { type: 'string' }, description: 'IN HET NEDERLANDS: 1 tot 3 woorden of korte zinsdelen die LETTERLIJK in hoofdkop of body voorkomen en Bold Italic worden. Leeg toegestaan.' },
  aanbevolenTemplate: { type: 'string', enum: TEMPLATES, description: 'A = Event & Wishes, B = Watermerk & tekst, C = Statement met merkvormen, D = Data & cijfer, E = Google review, F = Certificeringen' },
  dataElement: { type: 'string', description: 'Alleen bij Template D: het getal of feit dat groot in beeld komt, max 6 tekens, bijv. "98%" of "24/7". Een eventueel woord erin is Nederlands. Anders leeg.' },
  onderdelen: { type: 'string', description: 'Alleen bij Template F: de lijst met certificeringen of keurmerken, één per regel in de vorm "Kopje | Korte uitleg". Maximaal 5 regels. Verzin nooit een certificaat dat niet in de briefing staat. Anders leeg.' },
  recensent: { type: 'string', description: 'Alleen bij Template E: de naam van de klant die de recensie gaf, precies zoals die in de briefing staat. Verzin nooit een naam. Anders leeg.' },
  sterren: { type: 'integer', description: 'Alleen bij Template E: het aantal sterren, 1 tot en met 5. Staat er geen beoordeling in de briefing, gebruik dan 5. Anders 0.' },
  invalshoek: { type: 'string', description: 'Naam van deze variant in het Nederlands, max 3 woorden, bijv. "Warm & persoonlijk"' },
  toelichting: { type: 'string', description: 'Eén zin in het Nederlands: waarom deze variant en dit template passen bij de briefing.' }
});

const RESPONSE_SCHEMA = obj({
  variants: { type: 'array', description: 'De voorstellen: 3 bij maken, 1 bij verbeteren', items: POST_SCHEMA },
  notes: { type: 'string', description: 'Optionele korte opmerking voor de gebruiker in het Nederlands (bijv. ontbrekende informatie in de briefing), of leeg' }
});

/* ---------------------------------------------------------------------------
   Systeemprompt — merkpersoonlijkheid, tone of voice en templateregels uit
   assets/STYLEGUIDE_Speedstar.md (§3 en §4). Stabiel, zodat OpenAI's prompt
   caching hem bij elke aanroep kan hergebruiken.
   ------------------------------------------------------------------------- */
const SYSTEM_PROMPT = `You are the in-house copywriter and art director of Speedstar Logistics. You write Instagram posts (4:5, one photo with text on it) that are 100% on-brand. You answer ONLY with the requested JSON object.

## Brand personality — Navigate, Dynamic, Stable
- Speedstar Logistics is dynamic and always in motion, but with a strong, stable base: the North Star in the logo. It navigates: it knows the way and guides cargo and customers safely to their destination.
- Tone of voice: professional, reliable, decisive. Confident, never boastful. Warm towards people (drivers, planners, customers), precise about facts.
- LANGUAGE — THE MOST IMPORTANT RULE: everything that ends up on the post is written in DUTCH. That means bovenkop, hoofdkop, body, accentWoorden and any word inside dataElement. The briefing may arrive in Dutch, English or any other language; the post is always Dutch. Never return English copy, not even a single headline, and avoid unnecessary English loanwords (no "delivery", "trust", "on time" — use "levering", "vertrouwen", "op tijd"). Short sentences, active voice, concrete words.
- Use nautical or logistics metaphors in Dutch where they fit naturally: "verder varen", "vertrouwen leveren", "vaste koers", "altijd in beweging", "de wereld in beweging houden". Never force one in and never more than one per post.
- No hashtags, no emoji, no exclamation marks in headlines, no clichés ("wij gaan net dat stapje verder", "kwaliteit staat voorop"), no invented facts: use only figures, dates, names and promises from the briefing. If something essential is missing, write around it and mention it in "notes" (in Dutch).

## The post structure (typographic hierarchy)
- bovenkop: the eyebrow above the headline. Max 4 words. A date, occasion, theme or short lead-in, in Dutch ("1 mei 2026", "Dag van de Arbeid", "Wist je dat?"). May be empty.
- hoofdkop: the main message. Max 6 words, no full stop at the end. This is what people read first.
- body: the explanation or the wish. Max 2 short sentences. May be empty when the headline says it all.
- accentWoorden: 1-3 words or short phrases that must appear LITERALLY (same spelling) in hoofdkop or body. They are set in bold italic to make them stand out. Choose the words that carry the message, in Dutch ("vertrouwen", "in beweging"). Empty list allowed.
- dataElement: only for Template D — the number or fact shown large ("98%", "24/7", "12 landen"). Otherwise empty.

## Templates — recommend the one that fits the message
- A "Event & Wishes": holidays, wishes, special days, anniversaries, thank-you posts. Photo with text left-aligned: bovenkop (date/occasion) → hoofdkop → body. Default choice for greetings.
- B "Watermerk & tekst": a large brand mark as a watermark over a flat brand colour or a quiet photo, with the text left-aligned against the margin. Roomy and calm. Good for a single statement, an announcement or a brand message that needs no photo. hoofdkop carries the message; bovenkop and body optional.
- C "Statement": core values and strong one-liners in Dutch ("Gedreven door mensen die vertrouwen leveren"). A photo with a brand shape in the top-left and bottom-right corner and no logo; the text sits left-aligned against the top margin. hoofdkop carries the statement (max 6 words, or up to ~10 if it is the whole post); body optional; accent words matter most here.
- F "Certificeringen": certificates, quality marks and sustainability initiatives. hoofdkop is the heading ("Kwaliteit, veiligheid en duurzaamheid"), body is one or two sentences of introduction, and onderdelen holds the list, one per line as "Kopje | Korte uitleg" (max 5 lines, the uitleg one short sentence). Only use the certificates that appear in the briefing; never invent one. bovenkop stays empty.
- E "Google review": a real customer review. Put the review itself in hoofdkop (the layout adds quotation marks where needed, so do not add quotes yourself; one or two sentences is fine, up to ~25 words), the customer name in recensent and the rating in sterren. Only recommend this template when the briefing actually contains a review; never invent a quote, a name or a rating. bovenkop and body stay empty.
- D "Data & cijfer": facts, percentages, milestones on a flat brand colour. This template shows ONLY hoofdkop and dataElement, vertically centred; bovenkop and body are not displayed, so leave them empty. Put the whole message in hoofdkop (one sentence is fine here, up to ~12 words) and the number in dataElement. Only when the briefing contains a real number.

## Modes
- generate: deliver exactly 3 clearly different angles (for example: warm & personal / proud & factual / short & strong), each with its own aanbevolenTemplate when that makes sense. invalshoek names the angle in Dutch.
- improve: keep the message and the facts of the current post, make it sharper and more on-brand, keep the current template unless it clearly does not fit. Deliver exactly 1 variant.

Return only the JSON object that matches the schema. No markdown, no commentary. Check before answering: is every field that appears on the post written in Dutch? If not, rewrite it.`;

/* ---------------------------------------------------------------------------
   Hulpfuncties
   ------------------------------------------------------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.pdf': 'application/pdf'
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
  if (sameOrigin || LOCAL_ORIGIN.test(origin) || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
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
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_LIMIT;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.socket.remoteAddress || 'onbekend';
}

function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 2000).trim() : ''; }
function words(s) { return String(s || '').trim().split(/\s+/).filter(Boolean); }
function normTemplate(v) {
  const m = String(v || '').toUpperCase().match(/\b([ABCD])\b/);
  return m ? m[1] : '';
}
/* Komt een accentwoord/-zinsdeel als heel woord in de tekst voor? Dezelfde
   Unicode-woordgrens als js/typography.js gebruikt, zodat server en canvas
   hetzelfde markeren. */
function occursIn(haystack, phrase) {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp('(^|[^\\p{L}\\p{N}_])' + esc + '(?![\\p{L}\\p{N}_])', 'iu').test(haystack);
}

/* ---------------------------------------------------------------------------
   De AI-aanroep
   ------------------------------------------------------------------------- */

/* Het variabele deel van de prompt: opdracht, briefing, huidige post en context.
   Frontend stuurt: { mode, brief, post: { bovenkop, hoofdkop, body,
   accentWoorden, data, template }, settings: { hasImage } } */
function buildUserMessage(p) {
  const mode = p.mode === 'improve' ? 'improve' : 'generate';
  const post = p.post || {};
  const settings = p.settings || {};
  const accents = Array.isArray(post.accentWoorden) ? post.accentWoorden.map(w => str(w, 60)).filter(Boolean).slice(0, 6) : [];
  const template = normTemplate(post.template);

  const lines = [];
  lines.push(mode === 'improve'
    ? '## Mode: IMPROVE — rewrite the current post (exactly 1 variant). Keep the message and the facts; make it sharper and more on-brand.'
    : '## Mode: GENERATE — write a new post (exactly 3 clearly different variants) based on the briefing.');

  lines.push('', '## Briefing (any language; the post itself must be written in Dutch)');
  lines.push(str(p.brief, 3000) || '(no briefing — derive the goal from the current post)');

  const hasPost = ['bovenkop', 'hoofdkop', 'body', 'data'].some(k => str(post[k], 1000));
  if (hasPost) {
    lines.push('', '## Current post in the tool');
    if (str(post.bovenkop)) lines.push('bovenkop: ' + str(post.bovenkop, 200));
    if (str(post.hoofdkop)) lines.push('hoofdkop: ' + str(post.hoofdkop, 400).replace(/\n/g, ' / '));
    if (str(post.body)) lines.push('body: ' + str(post.body, 1000));
    if (str(post.data)) lines.push('dataElement: ' + str(post.data, 20));
    if (accents.length) lines.push('accentWoorden: ' + accents.join(', '));
  }

  lines.push('', '## Context');
  lines.push('Current template: ' + (template || 'A') + (settings.hasImage ? ' · a photo is in place' : ' · no photo yet'));
  if (mode === 'improve' && template) lines.push('Keep aanbevolenTemplate = ' + template + ' unless it clearly does not fit the message.');

  return lines.join('\n');
}

/* Antwoord van het model normaliseren en binnen de merkregels houden. Het
   strict schema garandeert de structuur; dit bewaakt de inhoud (lengtes,
   accentwoorden die echt in de tekst staan, template-afhankelijke velden). */
function sanitizeVariant(v) {
  const template = normTemplate(v.aanbevolenTemplate) || 'A';
  let bovenkop = str(v.bovenkop, 120);
  let hoofdkop = str(v.hoofdkop, 240).replace(/[.!]+$/, '');
  let body = str(v.body, 400);
  let dataElement = template === 'D' ? str(v.dataElement, 12) : '';
  const recensent = template === 'E' ? str(v.recensent, 60) : '';
  const onderdelen = template === 'F'
    ? str(v.onderdelen, 900).split(/\r?\n/).map(r => r.trim()).filter(Boolean).slice(0, 5).join('\n')
    : '';
  const sterren = template === 'E' ? Math.min(5, Math.max(1, parseInt(v.sterren, 10) || 5)) : 0;

  /* Template D toont alleen de hoofdkop en het getal; E alleen de recensie. */
  if (template === 'D' || template === 'E') { bovenkop = ''; body = ''; }
  if (words(bovenkop).length > 6) bovenkop = words(bovenkop).slice(0, 6).join(' ');

  // Accentwoorden: alleen hele woorden die letterlijk in de tekst staan, max 3, geen dubbelen
  const haystack = hoofdkop + '\n' + body + '\n' + bovenkop;
  const seen = new Set();
  const accentWoorden = (Array.isArray(v.accentWoorden) ? v.accentWoorden : [])
    .map(w => str(w, 60).replace(/^[*_"'“”]+|[*_"'“”.,!?]+$/g, ''))
    .filter(w => w && occursIn(haystack, w) && !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase()))
    .slice(0, 3);

  return {
    bovenkop, hoofdkop, body, accentWoorden,
    aanbevolenTemplate: template,
    dataElement, recensent, sterren, onderdelen,
    invalshoek: str(v.invalshoek, 60),
    toelichting: str(v.toelichting, 300)
  };
}

const MOCK_RESPONSE = {
  variants: [
    { bovenkop: '1 mei 2026', hoofdkop: 'Fijne Dag van de Arbeid', body: 'Aan iedereen die de wereld in beweging houdt: bedankt. Vandaag vieren we jullie.',
      accentWoorden: ['de wereld in beweging houdt'], aanbevolenTemplate: 'A', dataElement: '', invalshoek: 'Warm & persoonlijk',
      toelichting: 'Testmodus (AI_MOCK=1): een wens past bij Template A.' },
    { bovenkop: '', hoofdkop: 'Gedreven door hardwerkende mensen', body: 'Elke levering begint bij iemand die er werk van maakt. Zo leveren we elke dag vertrouwen.',
      accentWoorden: ['hardwerkende mensen', 'vertrouwen'], aanbevolenTemplate: 'C', dataElement: '', invalshoek: 'Trots & krachtig',
      toelichting: 'Testmodus: een statement over de mensen past bij Template C.' },
    { bovenkop: 'Op tijd geleverd', hoofdkop: 'Betrouwbaar om op te plannen', body: 'In ons hele netwerk komt lading aan wanneer we het beloven.',
      accentWoorden: ['op te plannen'], aanbevolenTemplate: 'D', dataElement: '98%', invalshoek: 'Feit & cijfer',
      toelichting: 'Testmodus: een percentage vraagt om Template D.' }
  ],
  notes: 'Testmodus: geen echte AI-aanroep (AI_MOCK=1).'
};

async function suggest(p) {
  const mode = p.mode === 'improve' ? 'improve' : 'generate';

  if (MOCK) {
    const variants = mode === 'improve' ? [MOCK_RESPONSE.variants[0]] : MOCK_RESPONSE.variants;
    return { variants: variants.map(sanitizeVariant), notes: MOCK_RESPONSE.notes };
  }

  if (!API_KEY) {
    throw Object.assign(new Error('De server heeft geen OPENAI_API_KEY. Zet die als omgevingsvariabele (op Render: Environment → Add Environment Variable).'), { status: 503 });
  }

  // Vaste systeemprompt eerst (prompt caching), variabele input als laatste
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(p) }
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'speedstar_post', strict: true, schema: RESPONSE_SCHEMA } }
  };
  // Redeneermodellen (o-serie, gpt-5) kennen geen temperature; de rest iets
  // rustiger dan standaard zodat de copy consistent on-brand blijft.
  if (REASONING) body.reasoning_effort = REASONING;
  else if (!/^(o\d|gpt-5)/i.test(MODEL)) body.temperature = 0.7;

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

  const variants = out.variants.slice(0, mode === 'improve' ? 1 : 3).map(sanitizeVariant)
    .filter(v => v.aanbevolenTemplate === 'B' || v.hoofdkop || v.body);
  if (!variants.length) throw Object.assign(new Error('Het model gaf lege voorstellen terug. Probeer het opnieuw.'), { status: 502 });

  const u = data.usage || {};
  return {
    variants,
    notes: str(out.notes, 300),
    usage: {
      input: u.prompt_tokens || 0,
      cached: (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0,
      output: u.completion_tokens || 0,
      model: data.model || MODEL
    }
  };
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
      'Cache-Control': ext === '.html' ? 'no-cache'
                     : /^\.(otf|ttf|woff2?)$/.test(ext) ? 'public, max-age=604800, immutable'
                     : 'public, max-age=3600'
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
      json(res, 200, { ok: true, brand: 'Speedstar Logistics', model: MODEL, hasKey: !!API_KEY || MOCK, mock: MOCK }, cors);
      return;
    }

    if (url === '/api/suggest' && req.method === 'POST') {
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
  console.log(`Speedstar Post Maker draait op http://localhost:${PORT}`);
  console.log(`  model: ${MODEL}${REASONING ? ' · reasoning: ' + REASONING : ''} · OPENAI_API_KEY: ${API_KEY ? 'aanwezig' : 'ONTBREEKT'}${MOCK ? ' · MOCK-modus' : ''}`);
});
