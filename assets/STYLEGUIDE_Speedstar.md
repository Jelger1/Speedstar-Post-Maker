# Design System & Blueprint: Speedstar Logistics (Instagram)

Dit document is de absolute "Source of Truth" voor het genereren van Instagram posts (4:5) voor Speedstar, gebaseerd op de officiële Merkhandleiding (Versie juni 2026). Alle frontend code (HTML/CSS), canvas-logica (JS) en AI content-generatie (OpenAI) MOET zich strikt aan deze regels houden.

## 1. Design Tokens (Global Variables)

### 1.1 Canvas Dimensions
- **Aspect Ratio:** 4:5 (Instagram Portrait)
- **Resolutie:** 1080px (breedte) x 1350px (hoogte)
- **Safe Zone / Padding:** 60px marge rondom voor alle tekst en logo-uitlijning.

### 1.2 Typografie (Allumi Std)
- `--font-primary`: 'Allumi Std', sans-serif;
- `--font-weight-regular`: 400 (Reguliere tekst)
- `--font-weight-demi`: 600 (Inleiding / Sub-heading)
- `--font-weight-bold`: 700 (Headings)

### 1.3 Kleurpalet (Brand Colors)
**Primaire kleuren:**
- `--color-brand-navy`: #221f5e (Primair donkerblauw, rgb: 34,31,94)
- `--color-brand-blue`: #305bad (Primair helderblauw, rgb: 48,91,173)

**Secundaire / Accent kleuren:**
- `--color-accent-lightblue`: #96bed6
- `--color-accent-ice`: #ccdbdb
- `--color-accent-peach`: #e5b9ae
- `--color-accent-coral`: #d97d60
- `--color-accent-orange`: #e65d2d

**UI / Overlays:**
- `--color-text-light`: #FFFFFF (Witte tekst op donkere foto's)
- `--color-text-dark`: #221f5e (Navy tekst op lichte achtergronden)
- `--overlay-dark`: rgba(34, 31, 94, 0.4) (Navy overlay voor leesbaarheid op foto's)

---

## 2. Typografische Hiërarchie & Styling Rules

De applicatie moet gebruik maken van strikte CSS-classes voor tekst elementen, afgeleid van de rekenkundige factor (1,6) uit de merkhandleiding.

| Element | Font-size | Line-height | Font-weight | Toepassing |
| :--- | :--- | :--- | :--- | :--- |
| **Heading 1 (Extra Groot)** | `65pt` | 1.1 | Bold | Maximale impact woorden |
| **Heading 2 (Hoofdkop)** | `41pt` | 1.1 | Bold | De main boodschap ("Workers Day") |
| **Heading 3 (Bovenkop)** | `26pt` | 1.1 | Bold | Datums, thema's |
| **Inleiding / Sub-heading**| `16pt` | 1.3 | Demi | Body tekst in templates |
| **Accenten** | Inherit | Inherit | **Bold Italic** | Bepaalde woorden die eruit springen. |

---

## 3. Template Layouts (UI Architectuur)

De generator moet de volgende lay-outs ondersteunen, gebaseerd op de Instagram-posts referentie:

### Template A: Event & Wishes (Links Uitgelijnd)
- **Use-case:** Feestdagen, wensen, speciale dagen.
- **Achtergrond:** High-res foto. Optionele `--overlay-dark` van onder naar boven.
- **Tekst Container:** 
  - Uitlijning: `text-align: left;`
  - Positie: `absolute`, links in de safe-zone (`left: 60px`), gecentreerd op de Y-as.
  - Volgorde: Heading 3 (26pt) -> Heading 2 (41pt) -> Inleiding (16pt, Demi).
- **Logo Container:** `absolute`, `bottom: 60px`, `right: 60px`.

### Template B: Brand Awareness (Beeld + Groot Logo)
- **Use-case:** Visuele impact.
- **Achtergrond:** High-res foto, volledig dekkend. 
- **Tekst Container:** Geen.
- **Logo Container:** Prominent aanwezig, groot gecentreerd over de afbeelding (width: 80% van canvas).

### Template C: Krachtige Statements
- **Use-case:** Kernwaarden (bijv. "Powered by hardworking people...").
- **Achtergrond:** Sfeervolle fotografie. Zware `--overlay-dark` vereist voor contrast.
- **Tekst Container:**
  - Positie: Gecentreerd op het canvas (`display: flex; align-items: center; justify-content: center;`).
  - Styling: Gebruik een grotere heading (41pt of 65pt). Witte tekst. Accenten in Bold Italic.
- **Logo Container:** `absolute`, `bottom: 60px`, `right: 60px`.

### Template D: Data & Infographics
- **Use-case:** Feiten, percentages.
- **Achtergrond:** Rustige logistieke foto met eventueel een solide merk-kleur vlak.
- **Data Element:** Gecentreerd in beeld.
- **Tekst Container:** Gecentreerd direct onder het data-element.
- **Logo Container:** *Uitzondering op de regel:* `absolute`, `top: 60px`, `left: 60px`.

---

## 4. OpenAI System Instructions (Tone of Voice & Content Structuur)

Wanneer de backend de prompt naar OpenAI stuurt, MOET de system prompt deze constraints bevatten:

**Merkpersoonlijkheid (Navigeren, Dynamisch, Stabiel):**
- **Identiteit:** Speedstar Logistics is dynamisch en altijd in beweging, maar met een sterke, stabiele basis (zoals de noorderster uit het logo). 
- **Tone:** Professioneel, betrouwbaar, daadkrachtig.
- **Taal:** Nederlands. Alle tekst die op de post komt (bovenkop, hoofdkop, body, accentwoorden) is Nederlands, ongeacht de taal van de briefing. Vermijd onnodige Engelse leenwoorden. Gebruik nautische of logistieke metaforen waar gepast ("verder varen", "vertrouwen leveren", "vaste koers").

**Output JSON Structuur voor de API:**
```json
{
  "bovenkop": "Korte introductie in het Nederlands (max 4 woorden)",
  "hoofdkop": "De kernboodschap in het Nederlands (max 6 woorden)",
  "body": "De uitleg of wens in het Nederlands (max 2 zinnen, kort en bondig)",
  "accentWoorden": ["woord1", "woord2"],
  "aanbevolenTemplate": "A, B, C of D"
}