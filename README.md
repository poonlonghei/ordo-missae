# Ordo Missæ · 彌撒經書

A mobile-first, trilingual daily lectionary and missal companion. It presents:

- Daily readings and prayers in Traditional Chinese.
- Matching official English readings from the US Lectionary, or NABRE text when a
  Lectionary match is unavailable.
- Mass prayers and the Ordinary in Traditional Chinese, English, and Latin.
- Date navigation, reading/prayer toggles, font controls, dark mode, installation,
  and offline caching for visited days.

The site is a static GitHub Pages application. It needs no server or API keys. The
Ordinary is bundled with the application; dated readings are generated into the
deployment artifact and are not committed to the repository.

## How it works

```text
catholic-dlc.org.hk/mtYYMMDD.htm ──► scripts/lib/dlc.mjs
                                          │
bible.usccb.org ──► scripts/lib/lectionary.mjs / scripts/lib/nabre.mjs
                                          │
                         dist/data/YYYY-MM-DD.json + site/ ──► GitHub Pages
```

- **Rolling window.** A default build processes today first, then 14 days ahead and
  3 days back in Hong Kong time. Set `WINDOW_BACK` and `WINDOW_AHEAD` to change the
  window, or pass `--dates YYYY-MM-DD,...` for an explicit list. Generated texts live
  only in the deployment artifact; the page carries `noindex` and a `robots.txt`.
- **Chinese source.** The Hong Kong Diocesan Liturgy Commission's daily page, one per date.
  Readings (讀經一, 答唱詠, 讀經二, 繼抒詠, 福音前歡呼, 福音) always show; the propers
  (進堂詠, 集禱經, 獻禮經, 領主詠, 領聖體後經) sit behind the 禱文 toggle, off by default.
  When a page offers several formularies, only the first set is built and the build log
  reports how many were omitted.
- **People's parts.** The page adds what the Diocese's text leaves out
  (`scripts/lib/dialogue.mjs`): 眾：感謝天主 after each reading, the Gospel dialogue
  (願主與你們同在 … 主，願光榮歸於你 … 基督，我們讚美你), and the psalm refrain
  after every strophe. English carries the corresponding parts from the US Missal,
  including the Lectionary's “A reading from …” line.
- **English.** Readings, psalms, and Gospels use official text only. If the USCCB daily
  readings page for the same date matches the Chinese citation (80% verse overlap or
  more), its Lectionary wording is used. Otherwise the cited verses are taken from
  USCCB NABRE chapter pages. Fetches are polite and cached; USCCB rate limits are
  treated as a temporary “not today” result rather than bypassed.
- **Propers in English and Latin.** iBreviary supplies the Roman Missal propers. A
  formulary is accepted only when its entrance antiphon, and communion antiphon when
  present, matches the Hong Kong citation. This prevents a different calendar's saint
  from supplying the wrong prayers.
- **Latin day name.** Memorials, feasts, and solemnities come from the General Roman
  Calendar table in `scripts/lib/sanctoral.mjs`, but only when the Hong Kong title names
  the same saint. Otherwise the appropriate ferial, Sunday, or octave title is shown.
- **App.** `site/` is plain HTML/CSS/JS with date navigation, Chinese text-size controls,
  separate reading and prayer views, dark mode, a service worker, and an installable web
  app. The page uses `translate="no"` and English blocks use `lang="en"`.

## Deploy to GitHub Pages

1. Push the repository to GitHub and make `main` the default branch.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. Push to `main`, or use **Actions → Deploy site to Pages → Run workflow**.
4. Open the generated Pages URL on a phone and add it to the home screen.

The workflow runs the test suite before building and deploying. It is currently
configured for pushes to `main` and manual dispatch.

## First-run checklist

The DLC parser was written against the expected layout in
`test/fixtures/mt-sample.htm`. If the first build reports `no sections recognised`,
read the dumped text in the workflow log and adjust `HEADERS` or `NOISE` in
`scripts/lib/dlc.mjs`; update the fixture and tests as well.

If English is missing, look for `! NABRE` lines at the end of the build log. A chapter
page that was fetched but not understood is dumped there; adjust `MARKER_PATTERNS`,
`contentRegion`, or `stripNotes` in `scripts/lib/nabre.mjs`, then add a regression
fixture under `test/fixtures/`.

## Local development

```sh
npm install
npm test
npm run build:fixture
python3 -m http.server --directory dist
```

`npm run build:fixture` builds `dist/` from the checked-in sample page without network
access or English lookups. To build real dates locally:

```sh
node scripts/build.mjs --dates 2026-10-16,2026-10-17 --dump
```

Useful build options:

- `--fixture path/to/page.htm` — parse a local DLC page instead of fetching one.
- `--dump` — print extracted text from the first page for parser debugging.
- `--no-english` — skip USCCB lookups.
- `WINDOW_BACK=0 WINDOW_AHEAD=2` — customize the rolling window.

Fetched pages and NABRE chapters are cached under `cache/`, which is git-ignored.

## Project layout

- `site/` — application shell, styles, About page, and Ordinary of the Mass sources.
- `scripts/` — fetchers, parsers, and the static build.
- `test/` — parser and integration-focused unit tests with HTML fixtures.

## Licences and sources

- Readings and prayers © Hong Kong Diocesan Liturgy Commission / Studium Biblicum O.F.M.
  Fetched for personal use only; nothing is redistributed beyond the rolling window.
- NABRE © Confraternity of Christian Doctrine; fetched from bible.usccb.org for personal
  use only.
