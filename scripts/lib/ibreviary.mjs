// Roman Missal propers (entrance antiphon, collect, prayer over the offerings,
// communion antiphon, prayer after communion) in English and Latin from
// iBreviary's mobile site, matched to the Hong Kong formulary by antiphon
// citation. Written without access to the site: the fetcher discovers the
// Missal section links from the index page and logs them, and dumps the first
// page it parses, so the slugs and heading names can be corrected from the log.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeEntities, htmlToLines, titleOf } from "./html.mjs";
import { PoliteFetcher } from "./polite.mjs";
import { parseUsCitation } from "./lectionary.mjs";

export const BASE = "https://www.ibreviary.com/m2/";
// Candidate ways of asking for a date; the right one is found by probing with the
// Hong Kong entrance antiphon citation as the oracle and remembered in the cache.
const DATE_CANDIDATES = [
  ["date", (y, m, d) => `${y}${m}${d}`], ["date", (y, m, d) => `${y}-${m}-${d}`], ["date", (y, m, d) => `${d}/${m}/${y}`],
  ["date", (y, m, d) => `${d}-${m}-${y}`], ["date", (y, m, d) => `${m}/${d}/${y}`], ["date", (y, m, d) => `${y}/${m}/${d}`],
  ["date", (y, m, d) => `${d}.${m}.${y}`], ["data", (y, m, d) => `${y}${m}${d}`], ["data", (y, m, d) => `${d}/${m}/${y}`],
  ["giorno", (y, m, d) => `${y}-${m}-${d}`], ["d", (y, m, d) => `${y}${m}${d}`], ["day", (y, m, d) => `${y}-${m}-${d}`],
];

export const KIND_OF_HEADING = [
  ["entrance", /^(entrance antiphon|antiphona ad introitum|ad introitum|introit|antifona d'ingresso)/i],
  ["reading1", /^(first reading|reading i\b|reading 1\b|lectio prima|prima lectio|lectio i\b)/i],
  ["psalm", /^(responsorial psalm|psalmus responsorius|psalm)/i],
  ["reading2", /^(second reading|reading ii\b|reading 2\b|lectio secunda|altera lectio|lectio ii\b)/i],
  ["sequence", /^(sequence|sequentia)/i],
  ["alleluia", /^(gospel acclamation|alleluia|versus ante evangelium|acclamation)/i],
  ["gospel", /^(gospel|evangelium)/i],
  ["collect", /^(collect|collecta|oratio collecta|opening prayer)/i],
  ["offertory", /^(prayer over the (offerings|gifts)|super oblata|oratio super oblata)/i],
  ["preface", /^(preface|praefatio)/i],
  ["communion", /^(communion antiphon|antiphona ad communionem|ad communionem|antifona alla comunione)/i],
  ["postcommunion", /^(prayer after communion|post communionem|oratio post communionem|dopo la comunione)/i],
  ["over_people", /^(prayer over the people|super populum|oratio super populum|solemn blessing)/i],
];
const PROPER = new Set(["entrance", "collect", "offertory", "preface", "communion", "postcommunion", "over_people"]);
const CACHE_V = 2; // bump when the stored line extraction changes
const REQUIRED = new Set(["entrance", "collect", "communion", "postcommunion"]);
const KIND_RE = new RegExp(KIND_OF_HEADING.map(([, re]) => `(?:${re.source})`).join("|"), "i");
const NOISE = /^(today|oggi|home|-?\s*menu\s*-?$|back|indietro|options|opzioni|calendar|calendario|share|condividi|www\.|©|copyright|ibreviary|font|print|stampa|settings)/i;
const CITE_LINE = /^(?:cf\.?\s*)?(?:[1-3]\s?)?[A-Z][a-z]{0,4}\.?\s*\d+\s*(?:\(\d+\))?\s*[:,]\s*\d/i;

function ymd(iso) { const [y, m, d] = iso.split("-"); return [y, m, d]; }

/** Group a flat list of heading/text lines into Missal blocks. */
export function parseMissalHtml(html) { return parseMissalLines(htmlToLines(html).filter((l) => !NOISE.test(l))); }

/** Parse the proper sub-pages in order; a bare "Antiphon" heading takes the page's kind. */
export function parsePages(pages) {
  const title = [];
  const blocks = [];
  for (const p of pages) {
    const r = parseMissalLines(p.lines, p.antiphonKind);
    title.push(...r.title);
    blocks.push(...r.blocks);
  }
  return { title, blocks };
}

const RUBRIC_LINE = /\bis (said|sung|omitted)\.?$|^(or|or:|vel|oppure)$/i;

export function parseMissalLines(lines, antiphonKind = null) {
  const blocks = [];
  const title = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (RUBRIC_LINE.test(line)) continue;
    let km = KIND_OF_HEADING.find(([, re]) => re.test(line) && line.length < 60);
    if (!km && /^(antiphon|antiphona|antifona)$/i.test(line)) km = [antiphonKind ?? "entrance"];
    // A sub-page carries only its own antiphon, whatever the label says (the Latin
    // communion page labels it like an entrance antiphon).
    if (km && antiphonKind && (km[0] === "entrance" || km[0] === "communion")) km = [antiphonKind];
    if (km) { cur = { kind: km[0], heading: line, citation: null, lines: [] }; blocks.push(cur); continue; }
    if (!cur) { if (line.length <= 90) title.push(line); continue; }
    // Citation: on its own line ("Ps 130 (129):3-4", "Cf. Mt 25:34") or trailing in parentheses.
    if (!cur.citation && CITE_LINE.test(line) && line.length < 40) { cur.citation = cleanCite(line); continue; }
    const tail = /^(.*?)\s*[（(]\s*((?:cf\.?\s*)?(?:[1-3]\s?)?[A-Z][a-z]{0,4}\.?\s*\d+\s*(?:\(\d+\))?\s*[:,]\s*[\d\s,.\-–ab;]+)[)）]\s*$/i.exec(line);
    if (tail && !cur.citation) { cur.citation = cleanCite(tail[2]); if (tail[1]) cur.lines.push(tail[1]); continue; }
    cur.lines.push(line);
  }
  return { title: title.slice(0, 6), blocks };
}
function cleanCite(s) { return s.replace(/\s+/g, " ").replace(/^cf\.?\s*/i, "").trim(); }

/** Group blocks into formularies: a repeated kind starts a new set. */
export function groupSets(blocks) {
  const sets = [];
  let cur = null;
  for (const b of blocks.filter((x) => x.lines.length)) {
    if (!cur || cur.some((x) => x.kind === b.kind)) { cur = []; sets.push(cur); }
    cur.push(b);
  }
  return sets;
}

/**
 * Compare a HK antiphon citation (parsed by citation.mjs, Hebrew psalm numbering)
 * with an iBreviary one such as "Ps 130 (129):3-4" / "Ps 129, 3-4" / "Mt 25:34".
 */
export function antiphonMatches(hk, ibCite) {
  if (!hk || !ibCite) return false;
  const norm = ibCite.replace(/\((\d+)\)/, "").replace(/,\s*(?=\d)/, ":").replace(/\s+/g, " ").trim();
  const us = parseUsCitation(norm) || parseUsCitation(norm.replace(/^(\w+)\.?\s/, "$1 "));
  if (!us || us.book !== hk.book) return false;
  const hkKeys = new Set(hk.verses.filter((x) => !x.to).map((x) => `${x.c}:${x.v}`));
  let inter = 0;
  for (const k of hkKeys) if (us.verses.has(k)) inter++;
  if (inter) return true;
  if (hk.book === "PSA") {
    // Latin/Vulgate numbering is one lower for most psalms.
    const shifted = new Set([...us.verses].map((k) => { const [c, v] = k.split(":").map(Number); return `${c + 1}:${v}`; }));
    for (const k of hkKeys) if (shifted.has(k)) return true;
  }
  return false;
}

export class IBreviary {
  constructor({ cacheDir = "cache/ibreviary", fetcher, log = console } = {}) {
    this.cacheDir = cacheDir; this.log = log;
    this.fetcher = fetcher ?? new PoliteFetcher({ delayMs: 2500, log });
    this.mem = new Map(); this.fetched = 0; this.failed = []; this.dumped = false;
    this.dateCandidate = null;
    this.loadFormat();
  }

  dateQuery(iso, candidate = this.dateCandidate) {
    const [y, m, d] = ymd(iso);
    const [p, f] = candidate ?? DATE_CANDIDATES[0];
    return `${p}=${encodeURIComponent(f(y, m, d))}`;
  }

  loadFormat() {
    try { const i = JSON.parse(readFileSync(join(this.cacheDir, "format.json"), "utf8")).index; if (Number.isInteger(i) && DATE_CANDIDATES[i]) this.dateCandidate = DATE_CANDIDATES[i]; } catch {}
    if (process.env.IB_DATE_INDEX) this.dateCandidate = DATE_CANDIDATES[Number(process.env.IB_DATE_INDEX)];
  }

  /**
   * Find which date parameter the site honours: fetch the entrance page of one
   * day in each candidate format and keep the first whose antiphon citation
   * matches the Hong Kong one. Logged so the format can be fixed by hand too.
   */
  async probeDate(iso, lang, href, hkEntrance) {
    if (this.dateCandidate || !hkEntrance) return;
    this.log.log(`iBreviary: probing date formats on ${href} for ${iso} (expecting ${hkEntrance.text})`);
    for (let i = 0; i < DATE_CANDIDATES.length; i++) {
      const sep = href.includes("?") ? "&" : "?";
      const url = `${BASE}${href}${sep}lang=${lang}&${this.dateQuery(iso, DATE_CANDIDATES[i])}`;
      const r = await this.fetcher.get(url);
      if (!r.html) { this.log.log(`  ${url}: not fetched`); continue; }
      const lines = htmlToLines(r.html).filter((l) => !NOISE.test(l));
      const cite = lines.find((l) => CITE_LINE.test(l) && l.length < 40) ?? "";
      const ok = antiphonMatches(hkEntrance, cleanCite(cite));
      this.log.log(`  ${url}: first citation "${cite}" -> ${ok ? "MATCH" : "no"}`);
      if (ok) {
        this.dateCandidate = DATE_CANDIDATES[i];
        mkdirSync(this.cacheDir, { recursive: true });
        writeFileSync(join(this.cacheDir, "format.json"), JSON.stringify({ index: i, param: DATE_CANDIDATES[i][0], example: this.dateQuery(iso) }));
        return;
      }
    }
    this.failed.push("no date format produced the expected antiphon; the site may need a session cookie for dates");
    this.dateCandidate = DATE_CANDIDATES[0];
  }

  /** Links on a page: [{href, text}] with the site prefix removed. */
  static links(html) {
    return [...html.matchAll(/<a[^>]*href="([^"#]*)"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((m) => ({ href: decodeEntities(m[1]).replace(/^https?:\/\/[^/]+/, "").replace(/^\/m2\//, "").replace(/^\//, ""), text: decodeEntities(m[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim() }))
      .filter((l) => l.href && !/^(javascript|mailto)/i.test(l.href));
  }

  /**
   * The Reading tab (letture.php) is a menu whose sub-pages hold the propers:
   * "Entrance Antiphon and Collect", "Prayer over the Offerings",
   * "Antiphon and Prayer after Communion". Discover their hrefs once per
   * language and remember every menu text so it can be stripped from pages.
   */
  async sections(iso, lang) {
    this.sectionsCache ??= {};
    if (this.sectionsCache[lang]) return this.sectionsCache[lang];
    const diskPath = join(this.cacheDir, `sections-${lang}.json`);
    try {
      const saved = JSON.parse(readFileSync(diskPath, "utf8"));
      if (saved.v === CACHE_V && saved.picks?.length) { this.sectionsCache[lang] = saved; return saved; }
    } catch {}
    const menuUrl = `${BASE}letture.php?lang=${lang}&${this.dateQuery(iso)}`;
    const { html } = await this.fetcher.get(menuUrl);
    if (!html) return null;
    const links = IBreviary.links(html);
    this.log.log(`iBreviary Reading menu links (${menuUrl}):`);
    for (const l of links) this.log.log(`  ${l.text}  ->  ${l.href}`);
    const find = (re) => links.find((l) => re.test(l.text));
    const picks = [
      find(/entrance|introitum|ingresso|entrada|entrée|colle(c|t)/i),
      find(/offerings|oblata|offerte|ofrendas|offrandes|gifts/i),
      find(/after communion|post communionem|dopo la comunione|comuni[oó]n|communion/i),
    ].filter(Boolean);
    const menuLines = htmlToLines(html).filter((l) => !NOISE.test(l));
    const out = { v: CACHE_V, picks, menuLines };
    this.sectionsCache[lang] = out;
    if (picks.length) { mkdirSync(this.cacheDir, { recursive: true }); writeFileSync(diskPath, JSON.stringify(out)); }
    this.log.log(`iBreviary proper pages: ${picks.map((p) => p.href).join(" | ") || "none found"}`);
    return out;
  }

  /** Every page starts with the same lines as the menu page; drop that common prefix only. */
  static stripMenu(lines, menuLines) {
    let i = 0;
    while (i < lines.length && i < menuLines.length && lines[i] === menuLines[i]) i++;
    return lines.slice(i);
  }

  dumpOnce(url, lines, why) {
    if (this.dumped) return;
    this.dumped = true;
    this.log.log(`iBreviary ${why}: ${url}`);
    for (const l of lines.slice(0, 60)) this.log.log("  | " + l);
  }

  async page(iso, lang, oracle = null) {
    const key = `${iso}/${lang}`;
    if (this.mem.has(key)) return this.mem.get(key);
    const sec = await this.sections(iso, lang);
    if (!sec || !sec.picks.length) { this.failed.push(`${key}: proper pages not found in Reading menu`); this.mem.set(key, null); return null; }
    if (lang === "en") await this.probeDate(iso, lang, sec.picks[0].href, oracle);
    const q = this.dateQuery(iso);
    const path = join(this.cacheDir, lang, `${iso}.json`);
    let pages = null;
    if (existsSync(path)) {
      const obj = JSON.parse(readFileSync(path, "utf8"));
      if (obj.pages && obj.dateQuery === q && obj.v === CACHE_V) pages = obj.pages; // other formats / older strippers are stale
    }
    if (pages == null) {
      pages = [];
      for (const pick of sec.picks) {
        const sep = pick.href.includes("?") ? "&" : "?";
        const url = `${BASE}${pick.href}${sep}lang=${lang}&${this.dateQuery(iso)}`;
        const r = await this.fetcher.get(url);
        if (!r.html) { this.failed.push(`${key}: ${pick.text} not fetched`); continue; }
        const lines = IBreviary.stripMenu(htmlToLines(r.html).filter((l) => !NOISE.test(l)), sec.menuLines);
        if (lang === "la" && !this.laDumped) { this.laDumped = true; this.log.log(`iBreviary Latin sample (${url}):`); for (const l of lines.slice(0, 12)) this.log.log("  | " + l); }
        this.dumpOnce(url, lines, "first proper page");
        const antiphonKind = /offer|oblat/i.test(pick.text + pick.href) ? null : /commun|comuni/i.test(pick.text + pick.href) ? "communion" : "entrance";
        pages.push({ url, text: pick.text, lines, antiphonKind });
      }
      if (!pages.length) { this.mem.set(key, null); return null; }
      const parsed = parsePages(pages);
      if (!IBreviary.usable(parsed)) {
        this.failed.push(`${key}: no antiphon/collect recognised in ${pages.map((p) => p.url).join(", ")}`);
        this.mem.set(key, null);
        return null;
      }
      this.fetched += pages.length;
      mkdirSync(join(this.cacheDir, lang), { recursive: true });
      writeFileSync(path, JSON.stringify({ v: CACHE_V, date: iso, lang, dateQuery: q, fetched: new Date().toISOString(), pages }));
    }
    const parsed = parsePages(pages);
    const out = { url: pages[0]?.url, title: parsed.title, sets: groupSets(parsed.blocks.filter((b) => PROPER.has(b.kind) && b.lines.length)) };
    if (!this.kindsLogged?.[lang]) { (this.kindsLogged ??= {})[lang] = true; this.log.log(`iBreviary ${lang} ${iso}: blocks ${parsed.blocks.map((b) => `${b.kind}(${b.lines.length})`).join(" ")}`); }
    this.mem.set(key, out);
    return out;
  }

  static usable(parsed) { return parsed.blocks.some((b) => REQUIRED.has(b.kind) && b.lines.length); }

  /**
   * Find the iBreviary formulary matching a HK set by its antiphon citations.
   * @returns {Promise<{en: object[]|null, la: object[]|null, title: string|null}>}
   */
  async match(iso, { entrance, communion }) {
    const en = await this.page(iso, "en", entrance ?? communion);
    if (!en) return { en: null, la: null, title: null };
    const score = (set) => {
      const e = set.find((b) => b.kind === "entrance"), c = set.find((b) => b.kind === "communion");
      let s = 0;
      if (entrance && e && antiphonMatches(entrance, e.citation)) s += 2;
      if (communion && c && antiphonMatches(communion, c.citation)) s += 1;
      return s;
    };
    let best = null, bestScore = 0;
    en.sets.forEach((set, i) => { const s = score(set); if (s > bestScore) { best = i; bestScore = s; } });
    if (best == null) return { en: null, la: null, title: en.title[0] ?? null };
    const la = await this.page(iso, "la");
    let laSet = la?.sets[best] ?? la?.sets[0] ?? null;
    if (laSet && en.sets[best] && JSON.stringify(laSet) === JSON.stringify(en.sets[best])) {
      if (!this.laWarned) { this.laWarned = true; this.failed.push("lang=la returned the English page; Latin language code needs changing"); }
      laSet = null;
    }
    return { en: en.sets[best], la: laSet, title: en.title[0] ?? null };
  }
}
