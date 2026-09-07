# Dekentje — Stijlgids & Projectdocumentatie

Dit document beschrijft alle visuele richtlijnen, code-conventies en projectstructuur van de Dekentje landingspagina. Gebruik dit als referentie bij het uitbreiden of aanpassen van de website.

---

## Inhoudsopgave

1. [Projectstructuur](#1-projectstructuur)
2. [Merkidentiteit](#2-merkidentiteit)
3. [Kleuren](#3-kleuren)
4. [Typografie](#4-typografie)
5. [Knoppen](#5-knoppen)
6. [CSS-variabelen](#6-css-variabelen)
7. [Pagina-opbouw (secties)](#7-pagina-opbouw-secties)
8. [Componenten](#8-componenten)
9. [Responsiveness](#9-responsiveness)
10. [Animaties](#10-animaties)
11. [Best Practices](#11-best-practices)

---

## 1. Projectstructuur

```
Dekentje/
├── index.html                        # Hoofdpagina
├── STYLEGUIDE.md                     # Dit document
├── assets/
│   ├── Dekentje.txt                  # Originele merkrichtlijnen
│   ├── Hero-section-foto.jpg         # Hero achtergrondafbeelding
│   ├── Duurzame-kwaliteit-foto-bedsprei.jpg
│   ├── logo-dekentje-met-tekst.svg   # Volledig logo (nav, footer, about)
│   ├── logo-dekentje-zonder-tekst.svg
│   ├── Logo-plaids.svg               # Categorie-icoon
│   ├── Logo-sierkussens.svg          # Categorie-icoon
│   ├── Logo-bedsprei.svg             # Categorie-icoon
│   ├── Logo-Picknickkleden.svg       # Categorie-icoon
│   └── fonts/
│       ├── built titling rg.otf      # Koppen — normaal
│       ├── built titling bd.otf      # Koppen — bold
│       ├── CircularStd-Book.otf      # Bodytekst
│       ├── CircularStd-BookItalic.otf
│       ├── CircularStd-Medium.otf
│       └── CircularStd-Bold.otf      # Bodytekst — benadrukt
├── css/
│   └── style.css                     # Alle stijlen
└── js/
    └── main.js                       # Interactie & animaties
```

---

## 2. Merkidentiteit

**Naam:** Dekentje / Dekentje.nl  
**KvK:** 63427036  
**BTW:** NL855231142B01  
**E-mail:** info@dekentje.nl  
**Copyright:** © 2022–2026 Dekentje.nl

**Merkbelofte:** Warmte en comfort voor elk huis — van Europese merken, met natuurlijke materialen en tijdloze ontwerpen.

**Productcategorieën:**
- Plaids & Dekens
- Sierkussens
- Bedspreien
- Picknickkleden

**USP's (gebruik in communicatie):**
- Gratis verzending in NL & BE
- Voor 22:00 besteld = vandaag verzonden
- Uniek duurzaam assortiment
- Europese merken & natuurlijke materialen

---

## 3. Kleuren

| Naam | Hex | Gebruik |
|---|---|---|
| `--clr-heading` | `#606556` | Alle koppen (h1–h5) |
| `--clr-accent` | `#af1c23` | Accenten, eyebrows, links, highlights |
| `--clr-text` | `#2c2c30` | Bodytekst, footer achtergrond |
| `--clr-bg` | `#fdfdfd` | Pagina-achtergrond |
| `--clr-panel` | `#f3f3f3` | Kaarten, vlakken, USP-sectie, nieuwsbrief |
| `--clr-sale` | `#ab552b` | Sale-banner, sale-labels |

> **Regel:** gebruik `--clr-accent` spaarzaam — alleen voor écht belangrijke elementen (eyebrow-labels, kaart-CTAs, grens-accenten).

---

## 4. Typografie

### Lettertypes

| Lettertype | Bestand | Gebruik |
|---|---|---|
| `Built Titling Regular` | `built titling rg.otf` | Alle koppen (h1–h4) |
| `Built Titling Bold` | `built titling bd.otf` | Zware koppen indien nodig |
| `Circular Std Book` | `CircularStd-Book.otf` | Bodytekst, navigatie, labels |
| `Circular Std Medium` | `CircularStd-Medium.otf` | Lichte nadruk in bodytekst |
| `Circular Std Bold` | `CircularStd-Bold.otf` | Knoppen, eyebrows, USP-titels |

### Groottes (fluid met `clamp`)

```css
h1 { font-size: clamp(2.8rem, 6vw, 5.25rem); }
h2 { font-size: clamp(2rem, 4vw, 3.25rem); }
h3 { font-size: clamp(1.2rem, 2vw, 1.6rem); }
```

### Eyebrow-labels

Kleine tekst boven koppen. Altijd in `--clr-accent`, uppercase, ruime letter-spacing.

```html
<span class="eyebrow">Ons verhaal</span>
<h2>Koptekst hieronder</h2>
```

---

## 5. Knoppen

**Kernregel uit de merkrichtlijnen:** strakke, rechte hoeken — géén border-radius.

### Varianten

```html
<!-- Primair: donker vlak, witte tekst -->
<a class="btn btn-primary" href="#">Tekst</a>

<!-- Ghost: transparant met rand -->
<a class="btn btn-ghost" href="#">Tekst</a>

<!-- Sale: wit vlak, sale-kleur tekst (op donkere banner) -->
<a class="btn btn-sale" href="#">Bekijk sale</a>
```

### Regels
- Altijd `font-weight: 700` en `letter-spacing: 0.05em`
- Minimale padding: `0.9rem 2rem`
- Geen afgeronde hoeken (`border-radius: 0`)
- Hover-state altijd aanwezig

---

## 6. CSS-variabelen

Alle globale waarden staan in `:root` in `css/style.css`. Gebruik altijd de variabelen — nooit hardcoded hex-waarden in nieuwe stijlen.

```css
:root {
  --clr-heading:  #606556;
  --clr-accent:   #af1c23;
  --clr-text:     #2c2c30;
  --clr-bg:       #fdfdfd;
  --clr-panel:    #f3f3f3;
  --clr-sale:     #ab552b;

  --ff-heading:   'Built Titling', Georgia, serif;
  --ff-body:      'Circular Std', system-ui, sans-serif;

  --max-w:        1200px;   /* container max-breedte */
  --pad-x:        clamp(1.25rem, 5vw, 2.5rem);  /* horizontale padding */
  --nav-h:        72px;     /* hoogte van de navigatiebalk */
  --ease:         0.25s ease;
}
```

---

## 7. Pagina-opbouw (secties)

De pagina bestaat uit de volgende secties, van boven naar beneden:

### 7.1 Header (nav)
- Sticky, vast bovenaan
- Krijgt class `.scrolled` via JavaScript bij scrollen (voegt schaduw toe)
- Bevat: logo links, navigatielinks, CTA-knop rechts, hamburger op mobiel

### 7.2 Hero
- Volledige viewport hoogte (`100svh`)
- **Layout:** CSS Grid met twee gelijke kolommen op sectieniveau
- Links: tekst met fluid padding uitgelijnd op de container
- Rechts: `Hero-section-foto.jpg` vult de kolom volledig (`object-fit: cover`)
- De tag onderaan de foto zweeft absoluut (`position: absolute; bottom: 0; right: 0`)

### 7.3 Marquee (ticker)
- Scrollende tekstregel met echte USP's
- Achtergrond: `--clr-heading`
- Animatie: CSS `@keyframes marquee` met 3 herhalingen voor naadloze loop

### 7.4 Categorieën
- Grid van 4 kaarten: Plaids & Dekens, Sierkussens, Bedspreien, Picknickkleden
- Elke kaart gebruikt het bijbehorende SVG-categorielogo
- Hover: kaart beweegt omhoog, logo schaalt licht op

### 7.5 Sale-banner
- Volle breedte, achtergrond `--clr-sale`
- Tekst links, CTA-knop rechts
- Op mobiel: gestapeld

### 7.6 USP's
- 4 voordelen op panelachtergrond (`--clr-panel`)
- Echte Dekentje USP's: verzending, bestelmoment, sortiment, betalen

### 7.7 Ons verhaal (About)
- Tweekoloms: foto links (`Duurzame-kwaliteit-foto-bedsprei.jpg`), tekst rechts
- Foto: `aspect-ratio: 4/3`, `object-fit: cover`
- Stat-tag absoluut gepositioneerd (`100% Kwaliteitsgarantie`)

### 7.8 Nieuwsbrief
- Tweekoloms: tekst links, formulier rechts
- Formulier heeft client-side validatie (zie `js/main.js`)
- Op mobiel: enkelekolom

### 7.9 Footer
- Donkere achtergrond (`--clr-text`)
- 4 kolommen: merkinfo + socials, Ons aanbod, Klantenservice, Over ons
- Bevat: KvK, BTW, copyright, juridische links
- Logo gefilterd naar wit met `filter: brightness(0) invert(1)`

---

## 8. Componenten

### Container
```html
<div class="container">
  <!-- max-width: 1200px, gecentreerd, met fluid padding -->
</div>
```

### Sectie
```html
<section class="section">
  <!-- padding-block: clamp(4.5rem, 9vw, 8rem) -->
</section>
```

### Sectie-header (gecentreerd)
```html
<div class="section-header">
  <span class="eyebrow">Label</span>
  <h2>Koptekst</h2>
  <p>Ondertitel of introductiezin.</p>
</div>
```

### Categorie-kaart
```html
<a class="category-card fade-in" href="#">
  <div class="category-img">
    <img src="assets/Logo-xxx.svg" alt="Beschrijving">
  </div>
  <div class="category-body">
    <h3>Naam</h3>
    <p>Omschrijving van de categorie.</p>
    <span class="card-cta" aria-hidden="true">Bekijk → </span>
  </div>
</a>
```

---

## 9. Responsiveness

| Breakpoint | Breedte | Aanpassingen |
|---|---|---|
| Desktop | > 1024px | Volledig ontwerp, alle kolommen zichtbaar |
| Tablet | ≤ 1024px | Categorieëngrid 2 kolommen, footer 2 kolommen, nieuwsbrief 1 kolom |
| Mobiel | ≤ 768px | Hero gestapeld, hamburger nav, about gestapeld, sale gestapeld |
| Klein mobiel | ≤ 520px | Alles 1 kolom, formulier gestapeld |

### Mobiele navigatie
- Hamburger toont/verbergt `.nav-links` met class `.open`
- Sluit bij klik buiten nav of op een link
- `aria-expanded` en `aria-label` worden dynamisch bijgewerkt

---

## 10. Animaties

### Scroll-in animatie
Voeg class `.fade-in` toe aan elk element dat zichtbaar moet worden bij scrollen.

```html
<div class="fade-in">
  <!-- Verschijnt met fade + slide omhoog bij scrollen -->
</div>
```

Werkt via `IntersectionObserver` in `js/main.js`. De class `.visible` wordt toegevoegd zodra het element in beeld komt.

### Stagger (vertraging bij grids)
Elementen in categorieën- en USP-grids hebben automatisch een `transition-delay` van 0.1s per volgend kind.

### Marquee
```css
@keyframes marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-33.333%); }
}
```
De HTML bevat 3 identieke herhalingen zodat de animatie naadloos loopt.

---

## 11. Best Practices

### Kleuren
- ✅ Gebruik altijd `var(--clr-...)` — nooit hardcoded hex
- ✅ `--clr-accent` alleen voor accenten, niet als achtergrond voor grote vlakken
- ❌ Nooit een nieuwe kleur introduceren buiten de merkpalet

### Lettertypes
- ✅ Koppen: altijd `var(--ff-heading)` (Built Titling)
- ✅ Bodytekst: altijd `var(--ff-body)` (Circular Std)
- ❌ Geen Google Fonts of andere externe lettertypes toevoegen

### Knoppen
- ✅ Altijd `border-radius: 0` (recht, per merkgids)
- ✅ Altijd een zichtbare hover-state
- ❌ Nooit afgeronde hoeken

### Afbeeldingen
- ✅ Gebruik `object-fit: cover` met een vaste `aspect-ratio`
- ✅ Voeg altijd een betekenisvolle `alt`-tekst toe
- ✅ Decoratieve SVG's: `alt=""` en `aria-hidden="true"`

### Toegankelijkheid
- ✅ Elk interactief element heeft een `aria-label` of zichtbaar label
- ✅ Formulieren gebruiken `<label>` (mag `.sr-only` zijn)
- ✅ Navigatierollen: `role="list"`, `aria-expanded`, `aria-controls`

### Nieuwe secties toevoegen
1. Voeg de HTML-sectie toe in `index.html` tussen `<main>` en `</main>`
2. Gebruik `.section` class voor consistente padding
3. Voeg `.fade-in` toe aan elementen die moeten animeren
4. Stijlen komen in `css/style.css`, gegroepeerd met een commentaarheader
5. Voeg eventueel een responsive aanpassing toe onderaan in de `@media` blokken

---

## Voorbeeld van een goede nieuwe sectie

```html
<!-- ===== NIEUWE SECTIE ===== -->
<section id="nieuw" class="section nieuwe-sectie">
  <div class="container">
    <div class="section-header">
      <span class="eyebrow">Label</span>
      <h2>Sectietitel</h2>
      <p>Korte introductiezin van maximaal twee regels.</p>
    </div>
    <div class="nieuw-grid">
      <div class="nieuw-item fade-in">
        <h3>Item titel</h3>
        <p>Beschrijving van het item.</p>
        <a href="#" class="btn btn-primary">CTA knop</a>
      </div>
    </div>
  </div>
</section>
```

```css
/* ============================================================
   NIEUWE SECTIE
   ============================================================ */
.nieuwe-sectie { background-color: var(--clr-bg); }

.nieuw-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
}

@media (max-width: 768px) {
  .nieuw-grid { grid-template-columns: 1fr; }
}
```

---

*Laatste update: september 2026*
