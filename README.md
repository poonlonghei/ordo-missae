# Ordo Missæ · 彌撒經書

This repository contains the Hong Kong daily Mass readings pipeline and a mobile-first
trilingual missal interface. The site includes:

- Daily readings with Chinese text, Yale Cantonese ruby, and English when available.
- The full Ordinary of the Mass in Traditional Chinese, Latin, and English.
- Date navigation, reading/proper toggles, type controls, dark mode, and offline-ready
  static deployment support.

The readings build remains static and deployable to GitHub Pages; the Mass Ordinary is
bundled in `site/mass-data.js` so it is available without a network request.

Personal, mobile-first web page showing the Hong Kong Diocese daily Mass readings and,
behind a toggle, the Mass propers, in Chinese with **Yale Cantonese romanization as ruby
text** over every character, the official English (US Lectionary, else **NABRE**) of the
same passages, and the Roman Missal propers in English and Latin from iBreviary.

Everything is static and hosted on GitHub Pages. A scheduled GitHub Action rebuilds the
site every night, so no server and no API keys are involved.

## How it works

```
catholic-dlc.org.hk/mtYYMMDD.htm ──► scripts/lib/dlc.mjs   (fetch + parse sections)
                                          │
overrides.json ──► to-jyutping ──► scripts/lib/yale.mjs   (Jyutping → Yale per character)
                                          │
bible.usccb.org/bible/<book>/<ch> ──► scripts/lib/nabre.mjs (NABRE verses by 思高 citation, cached)
                                          │
                                   dist/data/YYYY-MM-DD.json  +  site/  ──► GitHub Pages
```

- **Rolling window.** Each build fetches 3 days back and 14 days ahead (Hong Kong time)
  and deploys them as a Pages artifact. The texts are never committed to git; they live
  only in the current deployment. The page carries `noindex` and a `robots.txt`.
- **Chinese source.** The Diocesan Liturgy Commission's daily page, one per date.
  Readings (讀經一, 答唱詠, 讀經二, 繼抒詠, 福音前歡呼, 福音) always show; the propers
  (進堂詠, 集禱經, 獻禮經, 領主詠, 領聖體後經) sit behind the 禱文 toggle, off by default.
  When a page offers several formularies (Mission Sunday, a solemnity with a vigil
  Mass), only the first set is built; the log says how many were omitted.
- **People's parts.** The page adds what the Diocese's text leaves out
  (`scripts/lib/dialogue.mjs`): 眾：感謝天主 after each reading, the Gospel dialogue
  (願主與你們同在 … 主，願光榮歸於你 … 基督，我們讚美你), and the psalm refrain written
  out after every strophe. The English carries the same parts from the US Missal,
  including the Lectionary's "A reading from …" line.
- **Romanization.** `to-jyutping` (BSD-2, built on the CC-BY rime-cantonese lexicon) gives
  word-aware Jyutping; a small converter turns it into Yale with diacritics (tone 1 = macron).
  Fix a mispronunciation by adding the word to `overrides.json`.
- **English.** Only for the readings, psalm and Gospel, and only official text. Driven by
  the citation on the Chinese page, so it always matches the Hong Kong day:
  1. If the USCCB daily readings page for the same date reads the same passage (verse
     overlap of 80% or more), its Lectionary wording is used; the Gospel acclamation comes
     along when the Gospel matches.
  2. Otherwise the cited verses are taken from the NABRE chapter pages on the USCCB site.
  Pages are fetched politely and kept in the Actions cache, so each page is fetched once.
  The USCCB site serves about three pages per run before answering with a JavaScript
  challenge, which the build treats as "not today" rather than trying to defeat; the
  workflow therefore runs every three hours and fills the window over a day.
  NABRE and 思高 share the Hebrew chapter/verse numbering, so no re-versification is needed.
- **Propers in English and Latin.** From iBreviary's mobile Missal pages
  (`scripts/lib/ibreviary.mjs`). A formulary is accepted only when its entrance antiphon
  (and, if present, communion antiphon) cites the same passage as the Hong Kong page,
  allowing for Vulgate psalm numbering, so a saint's day that differs between calendars
  gets no English rather than the wrong prayers. Latin is taken from the same formulary.
- **Latin day name.** Always shown under the Chinese title. Memorials, feasts and
  solemnities come from a table of the General Roman Calendar (`scripts/lib/sanctoral.mjs`),
  used only when the Hong Kong title of that date names the same saint; otherwise the
  ferial, Sunday or octave title is rendered in the Ordo's style
  (`scripts/lib/daytitle.mjs`). A saint missing from the table, or named differently
  by the Diocese, simply shows the ferial title: add the Chinese keyword to the table.
- **App.** `site/` is plain HTML/CSS/JS: date arrows and swipe; a 粵 toggle for Yale and
  讀 / 禱 drop-downs for the readings and the propers, each with 中文 (the group itself)
  plus English, and Latine for the propers; separate sliders for the Yale and the Chinese
  text size; dark mode; offline cache of visited days via a service worker; installable
  to the home screen. The page is marked `translate="no"` so browsers do not offer to translate
  the Chinese; the English blocks are marked `lang="en"`.

## Setup (once)

1. Push this repository to GitHub and make `main` the default branch.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Actions → Build and deploy → Run workflow.** The log prints the first fetched page's
   extracted text (`--dump`) and one line per day with the sections it found.
4. Open the Pages URL on your phone and add it to the home screen.

The workflow also runs nightly at 01:40 HKT and on every push to `main`.

## First-run checklist

The DLC page parser was written without access to the live site, against the expected
layout (see `test/fixtures/mt-sample.htm`). If the first Action run reports
`no sections recognised`, read the dumped text lines in the log and adjust `HEADERS` and
`NOISE` in `scripts/lib/dlc.mjs`; the fixtures and tests show the intended output.

If English is missing, look for `! NABRE` lines at the end of the build log. A chapter page
that was fetched but not understood is dumped there; adjust `MARKER_PATTERNS`,
`contentRegion` or `stripNotes` in `scripts/lib/nabre.mjs` and add the page to
`test/fixtures/` as a test. HTTP 403 would mean the site is blocking the runner.

## Local development

```sh
npm install
npm test                 # unit tests (DLC parser, citations, NABRE parser, Yale)
npm run build:fixture    # build dist/ from the sample page, no network, no English
npx http-server dist     # or: python3 -m http.server --directory dist
```

To build real dates locally: `node scripts/build.mjs --dates 2026-10-16,2026-10-17 --dump`.
Fetched NABRE chapters accumulate in `cache/nabre/` (git-ignored).

## Licences and sources

- Readings and prayers © Hong Kong Diocesan Liturgy Commission / Studium Biblicum O.F.M.
  Fetched for personal use only; nothing is redistributed beyond the rolling window.
- NABRE © Confraternity of Christian Doctrine; fetched from bible.usccb.org for personal use only.
- to-jyutping: BSD-2-Clause; rime-cantonese lexicon: CC BY 4.0.
