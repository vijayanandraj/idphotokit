# Photo requirements sheets

Every photo the site can make comes from two spreadsheets in this folder:

- **`countries.csv`**: one row per country. Its code, region, whether it's featured, and the other names people search it by.
- **`documents.csv`**: one row per document (passport, visa, residence permit, ID card, licence…) with its size, head position, background, file-size limit, notes and official sources.

Edit them to add a country, add a document, or correct a figure. No code changes are needed; the site is rebuilt from these sheets.

`Data_completed.xlsx` is the research workbook the sheets were built from. Its wording matches the site, but **the CSVs are what the site reads**. Make changes there.

## How to edit

- **In Excel:** open the CSV, edit, then **File → Save As → "CSV UTF-8 (Comma delimited)"**. Plain "CSV" can garble names like *Türkiye*; the build will tell you if that happened.
- **In Google Sheets:** File → Import the CSV, edit, then File → Download → CSV.
- **On GitHub:** open the file and press the pencil icon.

Every change is checked when the site builds. If something is wrong, the build stops and says exactly where, for example:

```
specs/documents.csv row 14, head: "34,5 mmm" should be a number with its unit, like 34.5mm, 70%, 1.29in or 32-36mm
specs/documents.csv row 22, country: "Turkey" is not in specs/countries.csv — add it there first
```

Nothing broken reaches the live site.

## countries.csv

| Column | What to put | Example |
|---|---|---|
| `country` | The name as people search for it. `documents.csv` uses exactly this spelling. | `India` |
| `code` | ISO 3-letter code. Shown as the badge in the picker. | `IND` |
| `iso2` | ISO 2-letter code. Used to start visitors on their own country. | `IN` |
| `region` | `Americas`, `Asia & Pacific`, `Europe`, `Middle East`, `Africa` or `Worldwide` | `Asia & Pacific` |
| `featured` | `yes` to show the country as a shortcut at the top of the picker. | `yes` |
| `aliases` | Other names, separated by `;`. Search finds the country by any of them. | `UK; Britain; England` |

## documents.csv

| Column | What to put | Example |
|---|---|---|
| `id` | **Leave blank for new rows**: one is made for you. Never change an existing one; shared links use it. | `IDK-0317` |
| `country` | Exactly as in `countries.csv`. | `India` |
| `document` | What the photo is for, in plain words. Don't include the size. | `PAN card` |
| `variant` | Only when the country has two of the same document: `online`, `printed`, `from the USA`, `blue background`, a size. | `online` |
| `category` | `Passport`, `Visa`, `Residence & immigration`, `ID card`, `Driving licence`, `Licences & permits`, `Education & exams`, `Cards & passes`, `Standard sizes` or `Other` | `ID card` |
| `width`, `height` | The photo size, in `unit`. | `35`, `45` |
| `unit` | `mm`, `cm`, `in` or `px` (`px` only for upload-only documents). | `mm` |
| `head` | Chin to top of hair, **as the authority publishes it**: `34.5mm`, `1.29in`, `300px`, `70%`, or a range like `32-36mm`. | `34.5mm` |
| `top_gap` | Top of the photo to the top of the hair, same style. Optional. | `3mm` |
| `eye_line` | Eye line measured **up from the bottom**, same style. Optional. | `1.18in` |
| `background` | Accepted colours, the usual one first: `White`, `Off-white`, `Light grey`, `Cream`, `Light blue`, `Blue`, `Red`, or a `#rrggbb` code. | `White, Off-white` |
| `file_kb_min`, `file_kb_max` | File size the upload form accepts, in KB. Max alone is fine. | `10`, `1024` |
| `upload_only` | `yes` if the photo is only ever uploaded, never printed. | `yes` |
| `note` | Anything else worth knowing, in one or two sentences. Shown to users. | `For children under 15.` |
| `source` | The authority's own requirements page. Several are fine, separated by ` ; `. | `https://…` |

### Head size: one figure or a range

Most authorities publish one head size ("34.5 mm"). The photo is framed to that figure and checked within **3% of the photo height** either side of it, about ±1.4 mm on a 45 mm photo. If the authority publishes a range, type the range (`32-36mm`) and it's used as is. If nothing is published, leave `head` blank and a neutral ICAO proportion is used. The site says so.

## Things to know

- **Row order matters a little.** A country's rows must be together, and its *first* row is its main document: it gets the short page address (`/photo/india`). The others get `/photo/india/pan-card-online` (document + variant).
- Renaming a `country`, `document` or `variant` changes that page's web address. Prefer adding a new row to renaming one that has been live for a while.
- `yes` may be typed as `Yes`, `y` or `x`.
- Documents with identical photo rules (size, head, background, file limit) are linked automatically: "The same photo works for…".
