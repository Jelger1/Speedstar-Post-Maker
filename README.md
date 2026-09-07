# Post Studio — Instagram Post Maker

Een tool van één pagina om Instagram-posts te maken uit **een foto**, **je eigen
tekst** en **een markdown-bestand dat de vormgeving bepaalt**. Puur HTML, CSS en
vanilla JavaScript — geen buildstap, geen framework.

---

## Starten

```bash
# Aanbevolen: via een lokale server (VS Code -> Live Server, of:)
npx serve .
```

Openen kan ook door `index.html` te dubbelklikken, maar met een server werkt
alles: browsers blokkeren over `file://` de merklettertypen uit `assets/fonts`,
het ophalen van `STYLEGUIDE.md` en soms de export van meegeleverde afbeeldingen.
**Zelf geüploade foto's werken altijd**, ook zonder server.

---

## Projectstructuur

```
Insta-post-maker/
├── index.html            # Dashboard: sidebar met bediening + live preview
├── css/styles.css        # Design tokens, UI, canvas-typografie, sjablonen
├── js/
│   ├── markdown.js       # Frontmatter + markdown -> HTML (marked.js of eigen fallback)
│   ├── brandkit.js       # Huisstijl uit een stijlgids destilleren
│   └── app.js            # State, renderpijplijn, events, export
├── samples/              # Voorbeeld-markdown om mee te testen
├── assets/               # Foto's, logo's en merklettertypen
└── STYLEGUIDE.md         # Bestaande Dekentje-stijlgids (bruikbaar als invoer)
```

---

## De drie manieren waarop markdown de stijl bepaalt

### 1. Frontmatter bovenin je tekst

Zet een blok tussen `---` bovenaan het tekstveld of het `.md`-bestand. De
waarden worden **live** toegepast en de schuifjes in de sidebar springen mee.
Pas je daarna handmatig iets aan, dan blijft dat staan — de frontmatter wordt
pas opnieuw toegepast als je het blok zelf wijzigt.

```markdown
---
ratio: 4:5          # 1:1 | 4:5 | 9:16 (ook: square, portret, story)
theme: editorial    # minimal | editorial | panel | bold | band | quote
align: left         # left | center | right (ook: links, midden, rechts)
position: bottom    # top | middle | bottom (ook: boven, midden, onder)
accent: "#af1c23"   # hex, rgb() of kleurnaam
color: "#ffffff"    # tekstkleur
panel: "#f3f3f3"    # vlakkleur voor het thema 'panel'
overlay: 55         # 0-90, donkerte van de foto
scale: 100          # 70-145, tekstgrootte
padding: 80         # 32-160, marge in ontwerp-pixels
zoom: 100           # 100-180, beeldzoom
focus: center       # top | center | bottom, uitsnede van de foto
font: merk          # merk | playfair | inter | grotesk | bebas
badge: "@dekentje.nl"
radius: recht       # 'recht' of 0 voor strakke hoeken
---
```

Sleutels mogen ook Nederlands: `formaat`, `sjabloon`, `uitlijning`, `positie`,
`donkerte`, `marge`, `tekstgrootte`, `uitsnede`, `lettertype`, `bijschrift`.

### 2. Een `style`-codeblok midden in het document

Handig als je de frontmatter liever vrijhoudt:

````markdown
```style
theme: bold
accent: #af1c23
```
````

### 3. Een complete stijlgids inlezen

Sleep een stijlgids op **Merkstijl uit .md** (of gebruik de knop
`STYLEGUIDE.md`). `brandkit.js` speurt het document af op vier manieren:

| Bron | Voorbeeld |
|---|---|
| CSS-variabelen | `--clr-accent: #af1c23;` |
| Markdown-tabellen | `` | `--clr-accent` | `#af1c23` | Accenten | `` |
| Losse labelregels | `Sale kleur: #ab552b` |
| Vormregels | `border-radius: 0` of "strakke rechte hoeken" |

Elke gevonden kleur krijgt een **rol** op basis van trefwoorden in het label
(Nederlands én Engels): `accent`, `kop`, `tekst`, `vlak`, `achtergrond`. De
eerste treffer per rol wint. Lettertypen worden herleid tot de familienaam
(`Circular Std Book` → `Circular Std`), en een merknaam of domein wordt de
handle onderin de post.

Wat er gevonden is, staat direct in de sidebar als chips plus een klikbaar
merkpalet: kies eerst het doel (accent / tekst / vlak) en klik dan een staal.

---

## Hoe je tekst invult

Het paneel **Tekst** heeft twee standen:

- **Velden** (standaard): losse vakjes voor label, kop, tekst, opsomming en
  citaat. Laat leeg wat je niet nodig hebt; Enter in de kop maakt een nieuwe
  regel. De tool zet dit onder water om naar markdown.
- **Markdown**: de volledige bron, met knoppen voor kop, label, vet, lijst en
  citaat. Handig voor frontmatter of een afwijkende volgorde.

Wisselen kan altijd: de velden worden uit de markdown gelezen en andersom.
Frontmatter en `style`-blokken blijven daarbij bewaard.

## Eigen lettertype

Onder **Vormgeving → Eigen lettertype** kies je een OTF-, TTF-, WOFF- of
WOFF2-bestand voor de kop en/of de tekst (één bestand is genoeg voor beide).
Een fontbestand op het venster slepen werkt ook. Het font wordt als `@font-face`
ingebed, zodat het ook in de export terechtkomt, en wordt in de browser
onthouden (IndexedDB). Verwijderen kan met het prullenbakje.

## Hoe je tekst wordt opgemaakt

De markdown-bron bepaalt de rol van elk onderdeel in de post:

| Markdown | Wordt |
|---|---|
| `# Kop` | Koptekst in het kopfont |
| `## Subkop` | Kleinere kop |
| `### Label` | Eyebrow: klein, hoofdletters, in de accentkleur |
| `**vet**` | Nadruk in de accentkleur |
| `- item` | Opsomming met een accentstreepje |
| `> citaat` | Citaat met accentbalk |
| `---` | Scheidingslijn in de accentkleur |

Zet **Markdown-opmaak** uit als je platte tekst met eigen regelafbrekingen wilt.

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
Wat je ziet is exact wat je krijgt.

| Formaat | Export 1× | Export 2× |
|---|---|---|
| 1:1 | 1080 × 1080 | 2160 × 2160 |
| 4:5 | 1080 × 1350 | 2160 × 2700 |
| 9:16 | 1080 × 1920 | 2160 × 3840 |

`Ctrl`/`Cmd` + `S` exporteert direct. **Kopieer** zet de post als PNG op je
klembord.

---

## Goed om te weten

- **Slepen werkt overal**: een afbeelding wordt de achtergrond, een `.md` wordt
  automatisch als stijlgids óf als tekst herkend (aan de hoeveelheid tokens).
- **Automatisch schalen** krimpt de tekst tot ze in het kader past; de
  statusbalk toont het percentage. Uitzetten kan met de schakelaar.
- **Instellingen worden onthouden** in `localStorage`; de geüploade foto en
  eigen lettertypen in IndexedDB. Na een herlaadbeurt staat alles er weer.
- **Zonder internet** werkt alles behalve de export: `marked.js` heeft een
  ingebouwde fallback-parser, `html2canvas` niet.
- **Open je de tool via `file://`**, dan verschijnt een gele melding boven de
  preview: de merklettertypen, `STYLEGUIDE.md` en de export van meegeleverde
  foto's/logo's zijn dan geblokkeerd door de browser. De export weigert in dat
  geval vooraf met een duidelijke uitleg in plaats van een lege afbeelding op
  te leveren. Via een lokale server werkt alles.
- **De export is altijd exact** 1080 × N px (of 2160 × N bij 2×): het
  resultaat van `html2canvas` wordt op de doelmaat gezet, zodat afronding nooit
  een pixel scheelt.
- Effecten die `html2canvas` niet kan renderen (`backdrop-filter`, blendmodi)
  zijn bewust vermeden, zodat preview en export niet uit elkaar lopen.
