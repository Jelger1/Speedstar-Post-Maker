# Speedstar Post Maker

Genereert 100% on-brand Instagram-posts (4:5, 1080 × 1350) voor Speedstar
Logistics: een foto, tekst in de vaste typografische hiërarchie, één van vier
templates en een AI-assistent die in de Speedstar tone of voice schrijft.
Puur HTML, CSS en vanilla JavaScript met een kleine Node-backend; geen
framework, geen buildstap, geen dependencies.

- Live: https://speedstar-post-maker.onrender.com
- Bron van alle merkregels: [assets/STYLEGUIDE_Speedstar.md](assets/STYLEGUIDE_Speedstar.md)

---

## Starten

```bash
npm start            # http://localhost:3000 (zet OPENAI_API_KEY in je omgeving)
npm run dev          # zelfde, maar met vaste AI-testvoorstellen (AI_MOCK=1)
```

Zonder key werkt alles behalve de AI-assistent. Open de tool via de server,
niet via `file://`: de browser blokkeert dan het inlezen van het logo.

---

## Projectstructuur

```
├── index.html                  # Sidebar met bediening + live preview (het canvas)
├── css/styles.css              # Merk-tokens, Allumi Std, canvas, templates A-D, interface
├── js/
│   ├── typography.js           # Typografische niveaus en accentwoorden per template (pure module)
│   └── app.js                  # State, render, foto, logo, AI-koppeling, export, opslag
├── server/server.js            # Serveert de tool + POST /api/suggest (OpenAI, structured outputs)
├── assets/
│   ├── STYLEGUIDE_Speedstar.md # Design tokens, hiërarchie, templates, AI-instructies
│   ├── brand/                  # Logo-varianten (SVG): wit, blauw/wit, kleur, beeldmerk
│   └── fonts/                  # Allumi Std (Regular, Italic, Demi, Demi Italic, Bold, Bold Italic)
├── render.yaml                 # Render Blueprint
└── .env.example                # Omgevingsvariabelen
```

---

## Templates

| | Naam | Gebruik | Tekst | Logo |
|---|---|---|---|---|
| A | Event & Wishes | Feestdagen, wensen, speciale dagen | Links, verticaal gecentreerd: bovenkop 26pt, hoofdkop 41pt, inleiding 16pt | Rechtsonder |
| B | Brand Awareness | Visuele impact | Geen | Gecentreerd, 80% breed |
| C | Statement | Kernwaarden | Gecentreerd, hoofdkop 41pt of 65pt, zware navy overlay | Rechtsonder |
| D | Data & Infographic | Feiten, percentages | Data-element 104pt, daaronder bovenkop, hoofdkop, inleiding; optioneel kleurvlak | Linksboven |

Vaste regels: safe-zone 60px, Allumi Std, merkkleuren uit de styleguide,
accentwoorden in Bold Italic. Tekst die niet past wordt automatisch
geschaald binnen de safe-zone.

---

## AI-assistent

De browser praat met `POST /api/suggest` op de eigen server; de OpenAI-key
staat alleen daar. De server stuurt een vaste systeemprompt (merkpersoonlijk-
heid, tone of voice, templateregels uit styleguide §4) en dwingt met OpenAI
structured outputs exact deze structuur af:

```json
{
  "variants": [{
    "bovenkop": "1 May 2026",
    "hoofdkop": "Happy Workers Day",
    "body": "To everyone who keeps the world moving: thank you.",
    "accentWoorden": ["keeps the world moving"],
    "aanbevolenTemplate": "A",
    "dataElement": "",
    "invalshoek": "Warm & persoonlijk",
    "toelichting": "Een wens past bij Template A."
  }],
  "notes": ""
}
```

"Maak post" levert drie invalshoeken, "Verbeter tekst" één herschreven
variant. Eén klik zet tekst, accentwoorden en template in de tool.

---

## Deployen op Render

1. Render → **New → Blueprint** → kies deze repo. `render.yaml` maakt de Web
   Service `speedstar-post-maker` aan.
2. Vul `OPENAI_API_KEY` in onder **Environment**.
3. Elke push naar `main` deployt automatisch.

| Variabele | Betekenis |
|---|---|
| `OPENAI_API_KEY` | Verplicht. Staat alleen op de server. |
| `AI_MODEL` | Standaard `gpt-4.1`; elk chat-model met structured outputs. |
| `AI_REASONING` | Alleen voor redeneermodellen: `low`, `medium`, `high`. |
| `ALLOWED_ORIGINS` | Extra origins voor de API. GitHub Pages en localhost mogen altijd. |
| `RATE_LIMIT` | Verzoeken per IP per 10 minuten (standaard 30). |
| `AI_MOCK` | `1` = vaste testvoorstellen zonder OpenAI-aanroep. |

---

## Export

Download als PNG of JPG op 1080 × 1350 of 2160 × 2700, of kopieer naar het
klembord. `Ctrl`+`S` exporteert direct. De preview wordt op werkelijke
pixelmaat gerenderd en 1-op-1 geëxporteerd, dus wat je ziet is wat je krijgt.
