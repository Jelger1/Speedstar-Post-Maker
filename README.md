# Post Studio — Instagram Post Maker

Een tool van één pagina om Instagram-posts te maken uit **een foto**, **je eigen
tekst** en optioneel **een markdown-stijlgids** die de vormgeving bepaalt. Puur
HTML, CSS en vanilla JavaScript — geen buildstap, geen framework, geen
ingebouwde voorbeelden of merkbestanden: alles komt uit je eigen uploads.

---

## Starten

```bash
# Aanbevolen: via een lokale server (VS Code -> Live Server, of:)
npx serve .
```

Openen door `index.html` te dubbelklikken werkt ook. Alles wat je zelf uploadt
(foto, logo, lettertype, stijlgids) werkt dan gewoon; alleen een logo dat je
via een pad in de frontmatter opgeeft kan de browser dan niet ophalen.

---

## Projectstructuur

```
Insta-post-maker/
├── index.html            # Dashboard: sidebar met bediening + live preview
├── css/styles.css        # Design tokens, UI, canvas-typografie, sjablonen
├── js/
│   ├── markdown.js       # Frontmatter + markdown -> HTML (marked.js of eigen fallback)
│   ├── brandkit.js       # Huisstijl uit een stijlgids destilleren
│   └── app.js            # State, velden-editor, AI-paneel, renderpijplijn, export
├── server/server.js      # Backend: serveert de tool + /api/suggest (Claude)
├── package.json          # Node-dependencies voor de backend
├── render.yaml           # Render Blueprint (één klik deployen)
└── .env.example          # Overzicht van de omgevingsvariabelen
```

---

## AI-assistent (Claude via Render)

De AI-assistent schrijft complete posts op basis van een korte briefing
("40% korting op alle plaids, alleen dit weekend" of "nog 6 dagen tot de
opening") én je geüploade stijlgids: tone of voice, USP's, doelgroep en
merkkleuren worden meegelezen. Je krijgt drie varianten met verschillende
invalshoeken; één klik zet tekst én vormgeving in de tool. **Verbeter tekst**
herschrijft wat er al staat, scherper en on-brand.

De API-key staat nooit in de browser. Een kleine Node-server
(`server/server.js`) houdt hem in een omgevingsvariabele en praat met Claude
via de officiële SDK, met structured output zodat het antwoord altijd in de
velden past.

### Deployen op Render

1. Zet dit project in een Git-repository (GitHub/GitLab) — `node_modules/` en
   `.env` staan al in `.gitignore`.
2. Render → **New → Blueprint** → kies de repo. Render leest `render.yaml` en
   maakt een Web Service `post-studio` aan.
3. Vul onder **Environment** in:
   - `ANTHROPIC_API_KEY` — je Anthropic-key
   - `ACCESS_CODE` — een zelfgekozen code; de tool stuurt die mee, zodat niet
     iedereen die de URL kent jouw key kan gebruiken
4. Deploy. Open `https://<jouw-service>.onrender.com`: de tool draait daar
   compleet, inclusief AI. Vul in het paneel **AI-assistent → AI-instellingen**
   alleen de toegangscode in (Server-URL mag leeg: het is dezelfde site).

Zonder Blueprint: New → Web Service, runtime Node, build `npm install`,
start `npm start`, health check `/api/health`, plus dezelfde variabelen.

### Lokaal draaien (met AI)

```bash
npm install
set ANTHROPIC_API_KEY=sk-ant-...     # PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
set ACCESS_CODE=test
npm start                            # -> http://localhost:3000
```

Wil je de tool via Live Server blijven openen en alleen de API op Render
gebruiken? Zet dan op Render `ALLOWED_ORIGINS=http://127.0.0.1:5500` en vul in
de tool de Render-URL in als Server-URL.

### Omgevingsvariabelen

| Variabele | Betekenis |
|---|---|
| `ANTHROPIC_API_KEY` | Verplicht. Je Anthropic-key. |
| `ACCESS_CODE` | Aanbevolen. Gedeelde code die de tool meestuurt (`X-Access-Code`). |
| `AI_MODEL` | Standaard `claude-opus-5`. |
| `AI_EFFORT` | `low`, `medium` of `high` (standaard). Lager = sneller en goedkoper. |
| `ALLOWED_ORIGINS` | Extra origins die de API mogen aanroepen, kommagescheiden. |
| `RATE_LIMIT` | Verzoeken per IP per 10 minuten (standaard 30). |
| `AI_MOCK` | `1` = geen echte AI-aanroep, vaste testvariant (voor testen). |

De stijlgids wordt met prompt caching meegestuurd: bij herhaalde aanvragen met
dezelfde stijlgids betaal je maar een fractie voor dat deel.

---

## Werkwijze

1. **Foto** — sleep een JPG, PNG of WebP op het venster of gebruik het
   uploadvak. Stel donkerte, zoom en uitsnede in.
2. **Tekst** — vul de velden in (label, kop, tekst, opsomming, citaat). Laat
   leeg wat je niet nodig hebt. Wil je meer controle, schakel dan naar
   **Markdown**: de volledige bron, met knoppen voor kop, label, vet, lijst en
   citaat. Wisselen is verliesvrij.
3. **Vormgeving** — kies een sjabloon, lettertype, kleuren, uitlijning en
   positie. Of laad een stijlgids (zie hieronder) die dit voor je invult.
4. **Logo & handle** — upload een logo (PNG of SVG) en typ een handle.
5. **Export** — PNG of JPG, 1× (1080 px) of 2× (2160 px). `Ctrl`/`Cmd`+`S`
   exporteert direct; **Kopieer** zet de post op het klembord.

Alles wordt onthouden in de browser: instellingen en tekst in `localStorage`,
foto, logo en eigen lettertypen in IndexedDB. Na een herlaadbeurt staat alles
er weer. **Reset** wist alles behalve de eigen lettertypen.

---

## Eigen lettertype

Onder **Vormgeving → Eigen lettertype** kies je een OTF-, TTF-, WOFF- of
WOFF2-bestand voor de kop en/of de tekst (één bestand is genoeg voor beide).
Een fontbestand op het venster slepen werkt ook. Het font wordt als
`@font-face` ingebed, zodat het ook in de export terechtkomt.

---

## De drie manieren waarop markdown de stijl bepaalt

### 1. Frontmatter bovenin je tekst

Zet in de **Markdown**-stand een blok tussen `---` bovenaan. De waarden worden
live toegepast en de schuifjes springen mee. Pas je daarna handmatig iets aan,
dan blijft dat staan — de frontmatter wordt pas opnieuw toegepast als je het
blok zelf wijzigt. In de **Velden**-stand blijft het blok onzichtbaar bewaard.

```markdown
---
ratio: 4:5          # 1:1 | 4:5 | 9:16 (ook: square, portret, story)
theme: editorial    # minimal | editorial | panel | bold | band | quote
align: left         # left | center | right (ook: links, midden, rechts)
position: bottom    # top | middle | bottom (ook: boven, midden, onder)
accent: "#e0483e"   # hex, rgb() of kleurnaam
color: "#ffffff"    # tekstkleur
panel: "#f4f2ee"    # vlakkleur voor het sjabloon 'panel'
overlay: 55         # 0-90, donkerte van de foto
scale: 100          # 70-145, tekstgrootte
padding: 80         # 32-160, marge in ontwerp-pixels
zoom: 100           # 100-180, beeldzoom
focus: center       # top | center | bottom, uitsnede van de foto
font: inter         # inter | playfair | grotesk | bebas | eigen | stijlgids
badge: "@jouwmerk"
radius: recht       # 'recht' of 0 voor strakke hoeken
logo: https://…/logo.svg   # of 'geen'
---
```

Sleutels mogen ook Nederlands: `formaat`, `sjabloon`, `uitlijning`, `positie`,
`donkerte`, `marge`, `tekstgrootte`, `uitsnede`, `lettertype`, `bijschrift`.

### 2. Een `style`-codeblok midden in het document

````markdown
```style
theme: bold
accent: #e0483e
```
````

### 3. Een complete stijlgids inlezen

Sleep een stijlgids (.md) op **Merkstijl uit .md** of kies hem via de knop.
`brandkit.js` speurt het document af op vier manieren:

| Bron | Voorbeeld |
|---|---|
| CSS-variabelen | `--clr-accent: #e0483e;` |
| Markdown-tabellen | `` | `--clr-accent` | `#e0483e` | Accenten | `` |
| Losse labelregels | `Accentkleur: #e0483e` |
| Vormregels | `border-radius: 0` of "strakke rechte hoeken" |

Elke gevonden kleur krijgt een **rol** op basis van trefwoorden in het label
(Nederlands én Engels): `accent`, `kop`, `tekst`, `vlak`, `achtergrond`. De
eerste treffer per rol wint. Lettertypen worden herleid tot de familienaam
(`Circular Std Book` → `Circular Std`) en verschijnen als keuze "Stijlgids".
Staat dat font niet op je computer, upload dan het fontbestand onder **Eigen
lettertype**. Een merknaam of domein in de stijlgids wordt de handle.

Wat er gevonden is, staat direct in de sidebar als chips plus een klikbaar
merkpalet: kies eerst het doel (accent / tekst / vlak) en klik dan een staal.

---

## Hoe je tekst wordt opgemaakt

| Onderdeel / markdown | Wordt |
|---|---|
| Label · `### Label` | Eyebrow: klein, hoofdletters, in de accentkleur |
| Kop · `# Kop` | Koptekst in het kopfont (Enter = nieuwe regel) |
| Tekst · alinea | Bodytekst; `**vet**` krijgt de accentkleur |
| Opsomming · `- item` | Lijst met een accentstreepje |
| Citaat · `> citaat` | Citaat met accentbalk |
| `---` | Scheidingslijn in de accentkleur |

---

## Sjablonen

| Sjabloon | Beschrijving |
|---|---|
| **Minimal** | Tekst direct op de foto, alleen een zachte schaduw |
| **Editorial** | Accentlijn langs het tekstblok |
| **Panel** | Tekst op een licht vlak, met de ink- en kopkleur uit de stijlgids |
| **Bold** | Koppen in een vol accentvlak |
| **Band** | Donkere balk van rand tot rand |
| **Quote** | Uitspraak tussen twee accentlijnen |

---

## Export

De preview is geen benadering: het canvas wordt op ware grootte gerenderd en
`html2canvas` schaalt het bij de export naar 1080 px breed (of 2160 bij 2×).
Het resultaat wordt op de exacte doelmaat gezet, zodat afronding nooit een
pixel scheelt.

| Formaat | Export 1× | Export 2× |
|---|---|---|
| 1:1 | 1080 × 1080 | 2160 × 2160 |
| 4:5 | 1080 × 1350 | 2160 × 2700 |
| 9:16 | 1080 × 1920 | 2160 × 3840 |

---

## Goed om te weten

- **Slepen werkt overal**: een afbeelding wordt de achtergrond, een fontbestand
  wordt een eigen lettertype, en een `.md` wordt automatisch als stijlgids óf
  als tekst herkend (aan de hoeveelheid kleurtokens).
- **Automatisch schalen** krimpt de tekst tot ze in het kader past; de
  statusbalk toont het percentage. Uitzetten kan met de schakelaar.
- **Zonder internet** werkt alles behalve de export en de Google-webfonts:
  `marked.js` heeft een ingebouwde fallback-parser, `html2canvas` niet.
- Effecten die `html2canvas` niet kan renderen (`text-wrap: balance`,
  `color-mix()`, `backdrop-filter`, blendmodi) zijn bewust vermeden, zodat
  preview en export niet uit elkaar lopen.
