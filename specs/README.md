# Photo requirements sheet

`documents.csv` is the list of every photo the site can make: one row per document. Edit it
to add a country, add a document (a visa, an ID card, a licence…), or correct a figure. No
code changes are needed — the site is rebuilt from this sheet.

## How to edit

- **In Excel:** open `documents.csv`, edit, then **File → Save As → "CSV UTF-8 (Comma
  delimited)"**. Plain "CSV" can garble names like *Türkiye*; the build will tell you if
  that happened.
- **In Google Sheets:** File → Import the CSV, edit, then File → Download → CSV.
- **On GitHub:** open the file and press the pencil icon. GitHub shows the sheet as a table
  and lets you edit it in the browser.

Every change is checked when the site builds. If something is wrong, the build stops and
says exactly where, for example:

```
row 14, head_max_%: 80 is larger than … / row 22, background: "Purple" is not a known colour
```

Nothing broken reaches the live site.

## The columns

| Column | What to put | Example |
|---|---|---|
| `id` | **Leave blank for new rows** — one is made for you. Never change an existing one: old shared links use it. | `IND-PAN` |
| `country` | Country name as people search for it. All rows for a country use the same spelling. | `India` |
| `region` | One of: `Americas`, `Asia & Pacific`, `Europe`, `Middle East`, `Africa` | `Asia & Pacific` |
| `featured` | `yes` to show the country as a shortcut button at the top of the picker. | `yes` |
| `document` | What the photo is for. Add `(upload)` for online-only versions. | `PAN card (upload)` |
| `badge` | Optional three-letter tag in the list. Defaults to the start of the id. | `OCI` |
| `width`, `height` | The photo size, in `unit`. | `35`, `45` |
| `unit` | `mm`, `cm`, `in` or `px` (`px` only for upload-only documents). | `mm` |
| `head_min_%`, `head_max_%` | Chin to top of hair, as a % of the photo height. Leave both blank if not published. | `70`, `80` |
| `top_gap_%` | Space from the top of the photo to the top of the hair, % of the height. Optional. | `7` |
| `eye_min_%`, `eye_max_%` | Eye line measured **up from the bottom**, % of the height. Optional. | `56`, `69` |
| `background` | Accepted colours, the usual one first: `White`, `Off-white`, `Light grey`, `Cream`, `Light blue`, `Blue`, `Red`, or a `#rrggbb` code. | `White, Light grey` |
| `file_kb_min`, `file_kb_max` | File size the upload form accepts, in KB. Max alone is fine. | `10`, `1024` |
| `upload_only` | `yes` if the photo is only ever uploaded, never printed. | `yes` |
| `note` | Anything else worth knowing, in one or two sentences. Shown to users. | `Glasses are not allowed.` |
| `source` | Link to the authority's own requirements page. Shown on the document's page. | `https://…` |

### Turning a published rule into numbers

Authorities usually publish millimetres; the sheet wants percentages of the photo height.

- **Head 32–36 mm on a 45 mm photo:** 32 ÷ 45 = 71%, 36 ÷ 45 = 80% → `71`, `80`
- **Head 1 to 1⅜ inch on a 2 inch photo:** 1 ÷ 2 = 50%, 1.375 ÷ 2 = 69% → `50`, `69`
- **Eyes 1⅛–1⅜ inch from the bottom of a 2 inch photo:** → `56`, `69`

## Things to know

- **Row order matters a little.** A country's *first* row is its main document: it gets the
  short page address (`/photo/india`), and the others get `/photo/india/pan-card`.
- Renaming a `country` or `document` changes that page's web address. Prefer adding a new
  row to renaming one that has been live for a while.
- Percentages may be typed as `70` or `70%`, and `yes` as `Yes`, `y` or `x`.
- Use the official source, not another photo website. Requirements change; when they do,
  this is the only file to update.
