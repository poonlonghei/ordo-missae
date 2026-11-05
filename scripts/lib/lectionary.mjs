// USCCB daily readings page (the actual US Lectionary text, NABRE-based):
//   https://bible.usccb.org/bible/readings/MMDDYY.cfm
// When a block on that page cites the same passage as the Hong Kong page,
// its wording is used instead of the plain NABRE chapter text. Pages are
// cached per date under cache/usccb/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeEntities, htmlToLines } from "./html.mjs";
import { PoliteFetcher } from "./polite.mjs";

export function readingsUrl(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `https://bible.usccb.org/bible/readings/${m}${d}${y.slice(2)}.cfm`;
}

// USCCB / NAB abbreviations -> USFM codes
export const US_ABBR = {
  gn: "GEN", gen: "GEN", genesis: "GEN", ex: "EXO", exodus: "EXO", lv: "LEV", lev: "LEV", leviticus: "LEV",
  nm: "NUM", num: "NUM", numbers: "NUM", dt: "DEU", deut: "DEU", deuteronomy: "DEU", jos: "JOS", joshua: "JOS",
  jgs: "JDG", jdg: "JDG", judges: "JDG", ru: "RUT", ruth: "RUT", "1sm": "1SA", "1sam": "1SA", "1samuel": "1SA",
  "2sm": "2SA", "2sam": "2SA", "2samuel": "2SA", "1kgs": "1KI", "1kings": "1KI", "2kgs": "2KI", "2kings": "2KI",
  "1chr": "1CH", "1chronicles": "1CH", "2chr": "2CH", "2chronicles": "2CH", ezr: "EZR", ezra: "EZR", neh: "NEH",
  nehemiah: "NEH", tb: "TOB", tob: "TOB", tobit: "TOB", jdt: "JDT", judith: "JDT", est: "EST", esther: "EST",
  "1mc": "1MA", "1macc": "1MA", "1maccabees": "1MA", "2mc": "2MA", "2macc": "2MA", "2maccabees": "2MA",
  jb: "JOB", job: "JOB", ps: "PSA", pss: "PSA", psalm: "PSA", psalms: "PSA", prv: "PRO", prov: "PRO", proverbs: "PRO",
  eccl: "ECC", ecclesiastes: "ECC", sg: "SNG", song: "SNG", songofsongs: "SNG", wis: "WIS", wisdom: "WIS",
  sir: "SIR", sirach: "SIR", is: "ISA", isa: "ISA", isaiah: "ISA", jer: "JER", jeremiah: "JER", lam: "LAM",
  lamentations: "LAM", bar: "BAR", baruch: "BAR", ez: "EZK", ezk: "EZK", ezek: "EZK", ezekiel: "EZK", dn: "DAN",
  dan: "DAN", daniel: "DAN", hos: "HOS", hosea: "HOS", jl: "JOL", joel: "JOL", am: "AMO", amos: "AMO", ob: "OBA",
  obadiah: "OBA", jon: "JON", jonah: "JON", mi: "MIC", mic: "MIC", micah: "MIC", na: "NAM", nah: "NAM", nahum: "NAM",
  hb: "HAB", hab: "HAB", habakkuk: "HAB", zep: "ZEP", zeph: "ZEP", zephaniah: "ZEP", hg: "HAG", hag: "HAG",
  haggai: "HAG", zec: "ZEC", zech: "ZEC", zechariah: "ZEC", mal: "MAL", malachi: "MAL",
  mt: "MAT", matt: "MAT", matthew: "MAT", mk: "MRK", mark: "MRK", lk: "LUK", luke: "LUK", jn: "JHN", john: "JHN",
  acts: "ACT", rom: "ROM", romans: "ROM", "1cor": "1CO", "1corinthians": "1CO", "2cor": "2CO", "2corinthians": "2CO",
  gal: "GAL", galatians: "GAL", eph: "EPH", ephesians: "EPH", phil: "PHP", philippians: "PHP", col: "COL",
  colossians: "COL", "1thes": "1TH", "1thess": "1TH", "1thessalonians": "1TH", "2thes": "2TH", "2thess": "2TH",
  "2thessalonians": "2TH", "1tm": "1TI", "1tim": "1TI", "1timothy": "1TI", "2tm": "2TI", "2tim": "2TI",
  "2timothy": "2TI", ti: "TIT", tit: "TIT", titus: "TIT", phlm: "PHM", philemon: "PHM", heb: "HEB", hebrews: "HEB",
  jas: "JAS", james: "JAS", "1pt": "1PE", "1pet": "1PE", "1peter": "1PE", "2pt": "2PE", "2pet": "2PE", "2peter": "2PE",
  "1jn": "1JN", "1john": "1JN", "2jn": "2JN", "2john": "2JN", "3jn": "3JN", "3john": "3JN", jude: "JUD",
  rv: "REV", rev: "REV", revelation: "REV",
};

/** Parse "Mk 6:14-29", "Ps 18:31, 47, 50, 51", "1 Cor 15:1-8, 11", "Is 7:10-14; 8:10" into {book, verses:Set<"c:v">}. */
export function parseUsCitation(text) {
  if (!text) return null;
  const t = text.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().replace(/^(?:see|cf\.?|or)\s+/i, "");
  const m = /^((?:[1-3] ?)?[A-Za-z]+)\.? ?(\d+[:,\d\s\-;ab]*)$/.exec(t) || /^((?:[1-3] ?)?[A-Za-z]+)\.? (\d.*)$/.exec(t);
  if (!m) return null;
  const book = US_ABBR[m[1].toLowerCase().replace(/\s+/g, "")];
  if (!book) return null;
  const verses = new Set();
  let chapter = null;
  for (const chunk of m[2].split(";")) {
    for (let piece of chunk.split(",")) {
      piece = piece.replace(/\s+/g, "").replace(/[a-z]/g, "");
      if (!piece) continue;
      let r = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(piece);
      if (r) { const [, c1, v1, c2, v2] = r.map(Number); for (let v = v1; v <= v1 + 200; v++) verses.add(`${c1}:${v}`); for (let v = 1; v <= v2; v++) verses.add(`${c2}:${v}`); chapter = c2; continue; }
      r = /^(\d+):(\d+)(?:-(\d+))?$/.exec(piece);
      if (r) { chapter = Number(r[1]); const a = Number(r[2]), b = r[3] ? Number(r[3]) : a; for (let v = a; v <= Math.min(b, a + 200); v++) verses.add(`${chapter}:${v}`); continue; }
      r = /^(\d+)(?:-(\d+))?$/.exec(piece);
      if (r && chapter != null) { const a = Number(r[1]), b = r[2] ? Number(r[2]) : a; for (let v = a; v <= Math.min(b, a + 200); v++) verses.add(`${chapter}:${v}`); }
      else if (r && chapter == null && book === "PSA") { /* "Ps 23" whole psalm */ chapter = Number(r[1]); for (let v = 1; v <= 60; v++) verses.add(`${chapter}:${v}`); }
    }
  }
  return verses.size ? { book, verses, raw: t } : null;
}

// Anything from here on is page furniture, not the reading.
// Footer and sidebar lines that end a reading block. Each phrase is anchored to a
// whole line or a site phrase: a scripture line may begin with "Follow", "Listen"
// or "Share" and must not end the reading.
const STOP_RE = /^(?:Get Daily Readings|Sign up|Lectionary for Mass for Use|Copyright|©|Share(?: this)?$|Listen(?: podcast)?$|Audio$|Video$|View reflection|Reflection$|Daily Readings(?: Calendar)?$|Readings for the|Donate|Back to top|Print$|Email$|USCCB|Terms of Use|Privacy Policy|Follow us|Subscribe)/i;

const KIND_OF_HEADING = [
  ["reading1", /reading\s*(?:1|i)\b|first reading/i],
  ["reading2", /reading\s*(?:2|ii)\b|second reading/i],
  ["psalm", /responsorial psalm|psalm/i],
  ["sequence", /sequence/i],
  ["alleluia", /alleluia|gospel acclamation|verse before the gospel/i],
  ["gospel", /^gospel\b/i],
];

/**
 * Parse the readings page into blocks: {kind, heading, citation:{book,verses}, lines:string[]}.
 * Blocks are found by <h3> headings; each block's citation is the first link or
 * line that parses as a US citation; the text is everything after it.
 */
/** The day's title as the USCCB page gives it, e.g. "Friday of the Twenty-eighth Week in Ordinary Time". */
export function parseDayTitle(html) {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  let title = t ? decodeEntities(t[1]).replace(/\s+/g, " ").replace(/\s*\|\s*USCCB.*$/i, "").trim() : "";
  if (!title || /daily readings/i.test(title)) {
    const h = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(html);
    if (h) title = decodeEntities(h[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  }
  return title || null;
}

export function parseReadingsHtml(html) {
  const body = html.replace(/<(script|style|noscript|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, "");
  const pieces = body.split(/<h3\b[^>]*>/i).slice(1);
  const blocks = [];
  for (const piece of pieces) {
    const end = piece.indexOf("</h3>");
    if (end < 0) continue;
    const heading = decodeEntities(piece.slice(0, end).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    const kindEntry = KIND_OF_HEADING.find(([, re]) => re.test(heading));
    if (!kindEntry) continue;
    const rest = piece.slice(end + 5).split(/<h2\b/i)[0];
    const cb = /<div[^>]*class="[^"]*\bcontent-body\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(rest);
    const head = cb ? rest.slice(0, cb.index) : rest;
    let lines = htmlToLines(cb ? head + "\n" + cb[1] : rest);
    const stop = lines.findIndex((l) => STOP_RE.test(l));
    if (stop > 0) lines = lines.slice(0, stop);
    let citation = null, start = 0;
    for (let i = 0; i < Math.min(lines.length, 4); i++) {
      const c = parseUsCitation(lines[i].replace(/^(?:Lectionary.*)$/i, ""));
      if (c) { citation = c; start = i + 1; break; }
    }
    if (!citation) continue;
    const text = lines.slice(start).filter((l) => !/^(?:Lectionary:|Or\b|OR\b|Read the|Get the)/.test(l));
    blocks.push({ kind: kindEntry[0], heading, citation, lines: text });
  }
  return blocks;
}

/** Jaccard overlap between a HK citation (parsed by citation.mjs) and a US citation. */
export function overlap(hk, us) {
  if (!hk || !us || hk.book !== us.book) return 0;
  const a = new Set(hk.verses.filter((x) => !x.to).map((x) => `${x.c}:${x.v}`));
  for (const x of hk.verses) if (x.to) { for (let v = x.v; v <= x.v + 200; v++) a.add(`${x.c}:${v}`); for (let v = 1; v <= x.to.v; v++) a.add(`${x.to.c}:${v}`); }
  let inter = 0;
  for (const k of a) if (us.verses.has(k)) inter++;
  const union = a.size + us.verses.size - inter;
  return union ? inter / union : 0;
}

export class Lectionary {
  constructor({ cacheDir = "cache/usccb", fetcher, log = console, minOverlap = 0.8 } = {}) {
    this.cacheDir = cacheDir; this.fetcher = fetcher ?? new PoliteFetcher({ log }); this.log = log; this.minOverlap = minOverlap;
    this.mem = new Map(); this.titles = new Map(); this.fetched = 0; this.failed = [];
  }

  /** English day title from the cached page, or null. */
  async title(isoDate) { await this.day(isoDate); return this.titles.get(isoDate) ?? null; }

  async day(isoDate) {
    if (this.mem.has(isoDate)) return this.mem.get(isoDate);
    const path = join(this.cacheDir, `${isoDate}.json`);
    const url = readingsUrl(isoDate);
    let html = null;
    if (existsSync(path)) {
      const obj = JSON.parse(readFileSync(path, "utf8"));
      html = obj.html ?? null; // older cache entries stored parsed blocks only; refetch those
    }
    if (html == null) {
      const r = await this.fetcher.get(url);
      if (r.html) {
        html = r.html;
        this.fetched++;
        mkdirSync(this.cacheDir, { recursive: true });
        writeFileSync(path, JSON.stringify({ date: isoDate, url, fetched: new Date().toISOString(), html }));
      } else if (r.status === 404) this.failed.push(`${url}: 404`);
    }
    let blocks = [];
    if (html != null) {
      this.titles.set(isoDate, parseDayTitle(html));
      blocks = parseReadingsHtml(html).map((b) => ({ ...b, citation: { book: b.citation.book, verses: [...b.citation.verses], raw: b.citation.raw } }));
      if (!blocks.length) {
        this.failed.push(`${url}: fetched but no reading blocks recognised`);
        this.log.warn(`! Lectionary parse failed for ${url}; first lines of page text:`);
        for (const l of htmlToLines(html).slice(0, 80)) this.log.warn("  | " + l);
      }
    }
    this.mem.set(isoDate, blocks);
    return blocks;
  }

  /** Find the lectionary block matching a HK section's citation, or null. */
  async match(isoDate, hkCitation, { kind } = {}) {
    const blocks = await this.day(isoDate);
    let best = null, bestScore = 0;
    for (const b of blocks) {
      if (kind && b.kind !== kind) continue;
      if (!hkCitation) continue;
      const s = overlap(hkCitation, { book: b.citation.book, verses: new Set(b.citation.verses) });
      if (s > bestScore) { best = b; bestScore = s; }
    }
    return best && bestScore >= this.minOverlap ? toResult(best, bestScore) : null;
  }

  /** The day's block of a given kind (used for the acclamation once the Gospel is known to match). */
  async blockOfKind(isoDate, kind) {
    const b = (await this.day(isoDate)).find((x) => x.kind === kind);
    return b ? toResult(b, 1) : null;
  }
}

function toResult(b, score) {
  return { heading: b.heading, citation: b.citation.raw, lines: b.lines, score };
}
