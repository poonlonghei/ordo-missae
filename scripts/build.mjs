#!/usr/bin/env node
// Build the static site into dist/:
//   dist/index.html, app.js, style.css, sw.js, manifest.json  (copied from site/)
//   dist/data/YYYY-MM-DD.json                                  (one per day in the window)
//   dist/data/index.json                                       (list of available dates)
//
// Usage:
//   node scripts/build.mjs                         # rolling window around today (HKT)
//   node scripts/build.mjs --dates 2026-10-16,...  # specific dates
//   node scripts/build.mjs --fixture file.htm      # parse a local file instead of fetching
//   node scripts/build.mjs --dump                  # print extracted text lines for debugging
//   node scripts/build.mjs --no-english            # skip NABRE fetching (offline tests)
//   env WINDOW_BACK=3 WINDOW_AHEAD=14
import { mkdirSync, writeFileSync, readFileSync, cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fetchDlc, parseDlcHtml, CHAPTER_KINDS } from "./lib/dlc.mjs";
import { Lectionary } from "./lib/lectionary.mjs";
import { englishDayTitle, latinDayTitle } from "./lib/daytitle.mjs";
import { latinFeastTitle, FEAST_LINE } from "./lib/sanctoral.mjs";
import { addResponses, expandRefrain, englishFrame } from "./lib/dialogue.mjs";
import { IBreviary } from "./lib/ibreviary.mjs";
import { PoliteFetcher } from "./lib/polite.mjs";
import { makeRomanizer } from "./lib/yale.mjs";
import { Nabre } from "./lib/nabre.mjs";
import { htmlToLines, decodeHtml } from "./lib/html.mjs";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const has = (name) => args.includes(name);

const OUT = "dist";
const DATA = join(OUT, "data");
mkdirSync(DATA, { recursive: true });

function hkToday() {
  return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Dates are built today-first, then forward, then back, so that when the
// English source rate-limits us the day you are about to read gets its text.
const dates = opt("--dates")
  ? opt("--dates").split(",").map((s) => s.trim()).filter(Boolean)
  : (() => {
      const back = Number(process.env.WINDOW_BACK ?? 3);
      const ahead = Number(process.env.WINDOW_AHEAD ?? 14);
      const today = hkToday();
      const out = [];
      for (let i = 0; i <= ahead; i++) out.push(addDays(today, i));
      for (let i = 1; i <= back; i++) out.push(addDays(today, -i));
      return out;
    })();

const overrides = Object.fromEntries(Object.entries(existsSync("overrides.json") ? JSON.parse(readFileSync("overrides.json", "utf8")) : {}).filter(([k]) => !k.startsWith("_")));
const romanize = makeRomanizer(overrides);
const english = !has("--no-english");
const DUMP_DAYS = new Set((opt("--dump-days") ?? process.env.DUMP_DAYS ?? "").split(",").map((x) => x.trim()).filter(Boolean));
const fetcher = new PoliteFetcher({ maxFetches: Number(process.env.MAX_FETCHES ?? 60) });
const nabre = english ? new Nabre({ fetcher }) : null;
if (nabre) nabre.dumpRaw = DUMP_DAYS.size > 0;
const lect = english ? new Lectionary({ fetcher }) : null;
const ib = english ? new IBreviary({ fetcher: new PoliteFetcher({ delayMs: 2500, maxFetches: Number(process.env.IB_MAX_FETCHES ?? 130) }) }) : null;
const PROPER_KINDS = new Set(["entrance", "collect", "offertory", "preface", "communion", "postcommunion", "blessing"]);

const fixture = opt("--fixture");

// Fetch the USCCB daily readings pages for every date before any chapter lookup:
// they carry the official wording and are served from the site's cache, whereas
// chapter pages often hit a bot challenge that then blocks further chapter fetches.
if (english && !fixture) for (const d of dates) await lect.day(d);

// Raw Hong Kong pages are cached for a few days so frequent runs do not refetch them.
const DLC_CACHE = "cache/dlc";
const DLC_MAX_AGE_MS = 5 * 24 * 3600e3;
function readDlcCache(date) {
  const p = join(DLC_CACHE, `${date}.html`);
  if (!existsSync(p)) return null;
  const meta = JSON.parse(readFileSync(p + ".json", "utf8"));
  if (Date.now() - Date.parse(meta.fetched) > DLC_MAX_AGE_MS) return null;
  return { bytes: new Uint8Array(readFileSync(p)), url: meta.url };
}
function writeDlcCache(date, url, bytes) {
  mkdirSync(DLC_CACHE, { recursive: true });
  writeFileSync(join(DLC_CACHE, `${date}.html`), bytes);
  writeFileSync(join(DLC_CACHE, `${date}.html.json`), JSON.stringify({ url, fetched: new Date().toISOString() }));
}
const built = [];
const problems = [];

for (const date of dates) {
  let bytes, url;
  try {
    if (fixture) { bytes = new Uint8Array(readFileSync(fixture)); url = fixture; }
    else {
      const cached = readDlcCache(date);
      if (cached) { bytes = cached.bytes; url = cached.url; }
      else {
        const r = await fetchDlc(date);
        url = r.url;
        if (r.status === 404) { console.log(`${date}: not published yet (404)`); continue; }
        bytes = r.bytes;
        writeDlcCache(date, url, bytes);
      }
    }
  } catch (e) {
    problems.push(`${date}: fetch failed: ${e.message}`);
    continue;
  }

  const page = parseDlcHtml(bytes);
  if ((has("--dump") && built.length === 0 && !problems.length) || !page.sections.length) {
    // Dump the first page's extracted text (and any page we failed to parse) for debugging.
    console.log(`\n===== ${date} ${url} [${page.charset}] =====`);
    for (const l of htmlToLines(decodeHtml(bytes).text).slice(0, 120)) console.log("  | " + l);
  }
  if (!page.sections.length) {
    problems.push(`${date}: no sections recognised (${page.lineCount} text lines, charset ${page.charset}). Re-run with --dump.`);
    continue;
  }

  const sections = [];
  let gospelMatched = false;
  let firstGospelMatched = false;
  let setStart = 0;
  // Pages with several formularies (Mission Sunday, solemnities with a vigil Mass)
  // would triple the text: keep the first set the Diocese gives and note the rest.
  const firstDivider = page.sections.findIndex((s) => s.kind === "divider");
  const kept = firstDivider > 0 ? page.sections.slice(0, firstDivider) : page.sections;
  if (firstDivider > 0) console.log(`${date}: ${page.sections.filter((s) => s.kind === "divider").length} alternative formulary set(s) omitted`);
  for (const s of kept) {
    let raw = s.kind === "divider" && s.heading ? [s.heading, ...s.lines] : s.lines;
    if (s.kind === "psalm") raw = expandRefrain(raw);
    raw = addResponses(s.kind, raw);
    const lines = raw.map((l) => romanize(l));
    const out = { kind: s.kind, label: s.label, heading: s.heading, citation: s.citation?.text ?? null, lines };
    if (PROPER_KINDS.has(s.kind)) out.proper = true;
    if (english && CHAPTER_KINDS.has(s.kind) && s.citation) {
      // 1. Exact lectionary wording from the USCCB daily readings page when the same passage is read there.
      const m = await lect.match(date, s.citation, { kind: s.kind });
      if (m) {
        out.en = { source: "Lectionary", citation: m.citation, lines: m.lines };
        if (s.kind === "gospel") { gospelMatched = true; if (setStart === 0) firstGospelMatched = true; }
      } else {
        // 2. Otherwise the NABRE chapter text for the cited verses.
        const { verses, missing } = await nabre.lookup(s.citation);
        // A passage starting mid-sentence ("for, if you confess...") reads as a reading.
        if (verses.length && /^[a-z]/.test(verses[0].text)) verses[0] = { ...verses[0], text: verses[0].text[0].toUpperCase() + verses[0].text.slice(1) };
        if (verses.length) out.en = { source: "NABRE", book: s.citation.book, verses };
        if (missing.length) out.enMissing = missing;
      }
    }
    // The acclamation is matched by its own citation too, so it does not depend on the Gospel.
    if (english && s.kind === "alleluia" && s.citation) {
      const m = await lect.match(date, s.citation, { kind: "alleluia" });
      if (m) out.en = { source: "Lectionary", citation: m.citation, lines: m.lines };
    }
    if (out.en) {
      const frame = englishFrame(s.kind, s.citation?.book);
      if (frame) Object.assign(out.en, frame);
    }
    if (s.kind === "divider") { await attachAlleluia(); await attachPropers(); gospelMatched = false; setStart = sections.length + 1; }
    sections.push(out);
  }
  await attachAlleluia();
  await attachPropers();
  // Drop dividers that nothing follows.
  for (let i = sections.length - 1; i >= 0; i--) {
    if (sections[i].kind === "divider" && (i === sections.length - 1 || sections[i + 1].kind === "divider")) sections.splice(i, 1);
  }
  // Missal propers in English and Latin from iBreviary, matched by the antiphon citations of this set.
  async function attachPropers() {
    if (!english) return;
    const set = sections.slice(setStart);
    const srcOf = (kind) => kept.slice(setStart).find((x) => x.kind === kind);
    const entrance = srcOf("entrance")?.citation, communion = srcOf("communion")?.citation;
    if (!entrance && !communion) return;
    const m = await ib.match(date, { entrance, communion });
    if (!m.en) return;
    for (const sec of set) {
      if (!sec.proper) continue;
      const enB = m.en.find((b) => b.kind === sec.kind);
      const laB = m.la?.find((b) => b.kind === sec.kind);
      if (enB) sec.en = { source: "iBreviary", citation: enB.citation, lines: enB.lines };
      if (laB) sec.la = { source: "iBreviary", citation: laB.citation, lines: laB.lines };
    }
  }
  // English day title: the USCCB page's when it is the same day, else a translation of the HK ferial title.
  // The US title is used only when it is the same kind of day: a US-only memorial must
  // not label a Hong Kong ferial day, and vice versa.
  let ferialEn = null;
  for (const t of page.title) { ferialEn = englishDayTitle(t); if (ferialEn) break; }
  const hkFeast = page.title.some((t) => FEAST_LINE.test(t));
  let usTitle = english && firstGospelMatched ? await lect.title(date) : null;
  const usFeast = usTitle ? /memorial|feast|solemnity|saint|blessed/i.test(usTitle) : false;
  let titleEn = null;
  if (hkFeast) titleEn = usFeast ? usTitle : ferialEn;
  else titleEn = ferialEn ?? (usFeast ? null : usTitle);
  // Latin day title: the celebration of the General Roman Calendar when the HK
  // title names it (scripts/lib/sanctoral.mjs), else the ferial or Sunday title.
  let titleLa = latinFeastTitle(date, page.title);
  for (const t of page.title) { if (titleLa) break; titleLa = latinDayTitle(t); }
  // The acclamation has no citation on the HK page; when the Gospel of the same
  // day matches the US lectionary, its acclamation is used too.
  async function attachAlleluia() {
    if (!english || !gospelMatched) return;
    const a = sections.slice(setStart).find((x) => x.kind === "alleluia" && !x.en);
    const b = a && await lect.blockOfKind(date, "alleluia");
    if (b) a.en = { source: "Lectionary", citation: b.citation, lines: b.lines };
  }

  const day = {
    date,
    source: fixture ? "fixture" : url,
    generated: new Date().toISOString(),
    title: page.title.map((t) => romanize(t)),
    titleEn,
    titleLa,
    sections,
  };
  writeFileSync(join(DATA, `${date}.json`), JSON.stringify(day));
  if (has("--dump") && built.length === 0) {
    console.log(`\n===== parsed ${date} =====`);
    for (const s of sections) {
      console.log(`--- ${s.kind} ${s.citation ?? ""}`);
      for (const l of s.lines.slice(0, 6)) console.log("  zh| " + l.zh.slice(0, 90));
      if (s.en?.lines) for (const l of s.en.lines.slice(0, 40)) console.log("  en| " + l.slice(0, 110));
      if (s.en?.verses) for (const v of s.en.verses.slice(0, 3)) console.log("  en| " + v.ref + " " + v.text.slice(0, 100));
      if (s.la?.lines) for (const l of s.la.lines.slice(0, 6)) console.log("  la| " + l.slice(0, 110));
    }
  }
  if (DUMP_DAYS.has(date)) {
    // Full diagnostic dump of one day: raw DLC text, every parsed line, the raw US page text.
    console.log(`\n===== raw ${date} ${url} [${page.charset}] =====`);
    for (const l of htmlToLines(decodeHtml(bytes).text)) console.log("  | " + l);
    console.log(`\n===== full ${date} titleLa="${titleLa}" =====`);
    for (const s of sections) {
      console.log(`--- ${s.kind} ${s.citation ?? ""}${s.en ? ` [en ${s.en.source} ${s.en.citation ?? ""}]` : ""}`);
      for (const l of s.lines) console.log("  zh| " + (l.rubric ? "(rubric) " : "") + l.zh);
      if (s.en?.lines) for (const l of s.en.lines) console.log("  en| " + l);
      if (s.en?.verses) for (const v of s.en.verses) console.log("  en| " + v.ref + " " + v.text);
      if (s.la?.lines) for (const l of s.la.lines) console.log("  la| " + l);
    }
    const usPath = join("cache/usccb", `${date}.json`);
    if (existsSync(usPath)) {
      console.log(`\n===== raw USCCB ${date} =====`);
      for (const l of htmlToLines(JSON.parse(readFileSync(usPath, "utf8")).html ?? "")) console.log("  | " + l);
    }
  }
  built.push(date);
  const kinds = sections.map((s) => s.kind + (s.en ? (s.en.source === "Lectionary" ? "+lect" : s.en.source === "iBreviary" ? "+ib" : "+nabre") : "") + (s.la ? "+la" : "")).join(" ");
  console.log(`${date}: ${sections.length} sections [${kinds}] title="${page.title.join(" / ")}"${titleEn ? ` en="${titleEn}"` : ""}`);
}

// Keep dates from a previous deployment that are still inside the window? No:
// Pages deployments replace the whole site, so the index is just what we built.
writeFileSync(join(DATA, "index.json"), JSON.stringify({ generated: new Date().toISOString(), dates: built.sort() }));
cpSync("site", OUT, { recursive: true });
writeFileSync(join(OUT, "robots.txt"), "User-agent: *\nDisallow: /\n");

console.log(`\nBuilt ${built.length}/${dates.length} days into ${OUT}/`);
if (english) {
  console.log(`USCCB: ${fetcher.count} requests this run; ${lect.fetched} readings pages and ${nabre.fetched} chapter pages fetched; ${nabre.mem.size} chapters used`);
  for (const f of fetcher.failed) console.warn("! fetch " + f);
  for (const f of lect.failed) console.warn("! Lectionary " + f);
  for (const f of nabre.failed) console.warn("! NABRE " + f);
  console.log(`iBreviary: ${ib.fetcher.count} requests, ${ib.fetched} Missal pages fetched`);
  for (const f of ib.fetcher.failed) console.warn("! iBreviary fetch " + f);
  for (const f of ib.failed) console.warn("! iBreviary " + f);
}
for (const p of problems) console.warn("! " + p);
if (!built.length && !fixture) {
  console.error("Nothing was built; failing so the previous deployment stays up.");
  process.exit(1);
}
