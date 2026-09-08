# Merkstijl in één bestand

Sleep dit bestand op **Merkstijl uit .md** in de sidebar. De tool leest zowel
de CSS-variabelen hieronder als de tabel - je hoeft maar één van beide te
gebruiken.

```css
:root {
  --clr-heading: #606556;
  --clr-accent:  #af1c23;
  --clr-text:    #2c2c30;
  --clr-bg:      #fdfdfd;
  --clr-panel:   #f3f3f3;

  --ff-heading:  'Built Titling', Georgia, serif;
  --ff-body:     'Circular Std', system-ui, sans-serif;
}
```

| Token | Hex | Gebruik |
|---|---|---|
| `--clr-heading` | `#606556` | Alle koppen |
| `--clr-accent` | `#af1c23` | Accenten, eyebrows, links |
| `--clr-text` | `#2c2c30` | Bodytekst |
| `--clr-panel` | `#f3f3f3` | Vlakken en kaarten |

Knoppen en vlakken gebruiken strakke rechte hoeken (`border-radius: 0`).

**Naam:** Dekentje / Dekentje.nl
