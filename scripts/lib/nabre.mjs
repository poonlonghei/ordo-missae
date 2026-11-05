// New American Bible, Revised Edition, fetched chapter by chapter from the
// USCCB website (bible.usccb.org/bible/<book>/<chapter>) for personal use.
// Chapters are cached on disk (cache/nabre/) and persisted between builds by
// the Actions cache, so each chapter is downloaded once.
//
// NABRE numbers chapters and verses the Hebrew way, like 思高, so citations
// are looked up at the same coordinates with no re-versification.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeEntities, htmlToLines } from "./html.mjs";
import { expandVerses } from "./citation.mjs";
import { PoliteFetcher } from "./polite.mjs";

export const BASE = "https://bible.usccb.org/bible/";
export const SLUG = {
  GEN: "genesis", EXO: "exodus", LEV: "leviticus", NUM: "numbers", DEU: "deuteronomy", JOS: "joshua",
  JDG: "judges", RUT: "ruth", "1SA": "1samuel", "2SA": "2samuel", "1KI": "1kings", "2KI": "2kings",
  "1CH": "1chronicles", "2CH": "2chronicles", EZR: "ezra", NEH: "nehemiah", TOB: "tobit", JDT: "judith",
  EST: "esther", "1MA": "1maccabees", "2MA": "2maccabees", JOB: "job", PSA: "psalms", PRO: "proverbs",
  ECC: "ecclesiastes", SNG: "songofsongs", WIS: "wisdom", SIR: "sirach", ISA: "isaiah", JER: "jeremiah",
  LAM: "lamentations", BAR: "baruch", EZK: "ezekiel", DAN: "daniel", HOS: "hosea", JOL: "joel", AMO: "amos",
  OBA: "obadiah", JON: "jonah", MIC: "micah", NAM: "nahum", HAB: "habakkuk", ZEP: "zephaniah", HAG: "haggai",
  ZEC: "zechariah", MAL: "malachi", MAT: "matthew", MRK: "mark", LUK: "luke", JHN: "john", ACT: "acts",
  ROM: "romans", "1CO": "1corinthians", "2CO": "2corinthians", GAL: "galatians", EPH: "ephesians",
  PHP: "philippians", COL: "colossians", "1TH": "1thessalonians", "2TH": "2thessalonians", "1TI": "1timothy",
  "2TI": "2timothy", TIT: "titus", PHM: "philemon", HEB: "hebrews", JAS: "james", "1PE": "1peter",
  "2PE": "2peter", "1JN": "1john", "2JN": "2john", "3JN": "3john", JUD: "jude", REV: "revelation",
};
const ALT_SLUGS = { SNG: ["songofsolomon", "canticleofcanticles"], REV: ["apocalypse"] };
/** Bump when the parser changes so cached chapters are fetched and parsed again. */
export const CACHE_V = 2;
const ONE_CHAPTER = new Set(["OBA", "PHM", "2JN", "3JN", "JUD"]);

/** Candidate URLs for a chapter, most likely first. */
export function chapterUrls(book, chapter) {
  const slugs = [SLUG[book], ...(ALT_SLUGS[book] ?? [])].filter(Boolean);
  const urls = [];
  for (const s of slugs) {
    urls.push(`${BASE}${s}/${chapter}`);
    if (ONE_CHAPTER.has(book) && chapter === 1) urls.push(`${BASE}${s}/0`, `${BASE}${s}`);
  }
  return urls;
}

// ---------------------------------------------------------------------------
// Chapter page -> Map<verseNumber, text>
// ---------------------------------------------------------------------------
const SENT_OPEN = "\u0001", SENT_CLOSE = "\u0002";
const MARKER_PATTERNS = [
  /<span[^>]*class="[^"]*\bbcv\b[^"]*"[^>]*>\s*(\d+)\s*<\/span>/gi,
  /<span[^>]*class="[^"]*\b(?:verse|versenum|verse-number|vn)\b[^"]*"[^>]*>\s*(\d+)\s*<\/span>/gi,
  /<sup[^>]*class="[^"]*\b(?:verse|versenum|vn)\b[^"]*"[^>]*>\s*(\d+)\s*<\/sup>/gi,
  /<sup[^>]*>\s*(\d+)\s*<\/sup>/gi,
  /<(?:b|strong)[^>]*>\s*(\d+)\s*<\/(?:b|strong)>/gi,
];

function contentRegion(html) {
  // Prefer the main content container; fall back to <body>, then the whole page.
  const candidates = [
    /<div[^>]*class="[^"]*\b(?:content-body|contentarea|cb-content|field--name-body|node__content|bible-text|chapter-content)\b[^"]*"[^>]*>([\s\S]*)/i,
    /<main\b[^>]*>([\s\S]*?)<\/main>/i,
    /<article\b[^>]*>([\s\S]*?)<\/article>/i,
    /<body\b[^>]*>([\s\S]*?)<\/body>/i,
  ];
  for (const re of candidates) { const m = re.exec(html); if (m) return m[1]; }
  return html;
}

function stripNotes(html) {
  return html
    .replace(/<(script|style|noscript|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, "")
    // section headings ("The Death of John the Baptist.") and chapter headings
    .replace(/<p\b[^>]*class="[^"]*\bs\d\b[^"]*"[^>]*>[\s\S]*?<\/p>/gi, "")
    .replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, "")
    // psalm strophe numerals in an element of their own
    .replace(/<(p|div|span|strong|b|em|i)\b[^>]*>\s*[IVX]{1,5}\s*<\/\1>/gi, "")
    // footnote / cross-reference markers: links or superscripts whose content is a letter or symbol
    .replace(/<a\b[^>]*>\s*(?:[a-z]|\*|†|‡|\[[^\]]{1,6}\])\s*<\/a>/gi, "")
    .replace(/<sup\b[^>]*>\s*(?:[a-z]{1,2}|\*|†|‡)\s*<\/sup>/gi, "")
    .replace(/<sup\b[^>]*class="[^"]*\b(?:fn|footnote|note|xref)\b[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, "")
    .replace(/<a\b[^>]*class="[^"]*\b(?:fn|footnote|note|xref)\b[^"]*"[^>]*>[\s\S]*?<\/a>/gi, "")
    .replace(/<(?:div|section|ol|ul)\b[^>]*(?:id|class)="[^"]*\b(?:footnotes?|notes|cross-?refs?|references)\b[^"]*"[^>]*>[\s\S]*$/i, "");
}

/** @returns {{verses: Map<number,string>, markerPattern: number}} */
export function parseChapterHtml(html) {
  let region = stripNotes(contentRegion(html));
  let best = null;
  for (let i = 0; i < MARKER_PATTERNS.length; i++) {
    const re = new RegExp(MARKER_PATTERNS[i].source, "gi");
    const nums = [...region.matchAll(re)].map((m) => Number(m[1]));
    const ascending = nums.length >= 2 && nums.every((n, k) => k === 0 || n > nums[k - 1]);
    if ((nums.length >= 2 && ascending) || (nums.length === 1 && !best)) {
      best = { i, re, count: nums.length };
      if (ascending) break;
    }
  }
  const verses = new Map();
  if (!best) return { verses, markerPattern: -1 };
  const marked = region.replace(new RegExp(best.re.source, "gi"), (_, n) => `${SENT_OPEN}${n}${SENT_CLOSE}`);
  const text = htmlToLines(marked).join("\n");
  const parts = text.split(SENT_OPEN).slice(1);
  for (const p of parts) {
    const k = p.indexOf(SENT_CLOSE);
    const n = Number(p.slice(0, k));
    let body = p.slice(k + 1);
    // Cut trailing footnote blocks that may follow the last verse.
    body = body.split(/\n(?=\*\s*\[|\[\d+:\d+|Footnotes|Cross-?references|Chapter \d+|Next Chapter|Previous Chapter)/i)[0];
    // Psalm strophe numerals and headings stand on their own line.
    body = body.split("\n").filter((l) => !/^\s*[IVX]{1,5}\s*$/.test(l)).join("\n");
    body = decodeEntities(body).replace(/\s+/g, " ").replace(/\s+([,.;:!?”’)])/g, "$1").trim();
    if (!Number.isNaN(n) && body && !verses.has(n)) verses.set(n, body);
  }
  return { verses, markerPattern: best.i };
}

// ---------------------------------------------------------------------------
// Fetching with disk cache
// ---------------------------------------------------------------------------
export class Nabre {
  constructor({ cacheDir = "cache/nabre", fetcher, log = console } = {}) {
    this.cacheDir = cacheDir; this.fetcher = fetcher ?? new PoliteFetcher({ log }); this.log = log;
    this.mem = new Map(); this.fetched = 0; this.failed = [];
  }

  cachePath(book, chapter) { return join(this.cacheDir, book, `${chapter}.json`); }

  /** @returns {Promise<Map<number,string>|null>} */
  async chapter(book, chapter) {
    const key = `${book} ${chapter}`;
    if (this.mem.has(key)) return this.mem.get(key);
    const path = this.cachePath(book, chapter);
    if (existsSync(path)) {
      const obj = JSON.parse(readFileSync(path, "utf8"));
      if (obj.v === CACHE_V) {
        const map = new Map(Object.entries(obj.verses).map(([k, v]) => [Number(k), v]));
        this.mem.set(key, map);
        return map;
      }
    }
    const map = await this.download(book, chapter);
    this.mem.set(key, map);
    if (map && map.size) {
      mkdirSync(join(this.cacheDir, book), { recursive: true });
      writeFileSync(path, JSON.stringify({ v: CACHE_V, book, chapter, fetched: new Date().toISOString(), verses: Object.fromEntries(map) }));
    }
    return map;
  }

  async download(book, chapter) {
    for (const url of chapterUrls(book, chapter)) {
      const { status, html } = await this.fetcher.get(url);
      if (status === 404) continue;
      if (!html) return null; // blocked, capped or failed: already recorded by the fetcher
      this.fetched++;
      if (this.dumpRaw) { this.log.log(`NABRE page text (${url}):`); for (const l of htmlToLines(html).slice(0, 160)) this.log.log("  | " + l); }
      const { verses, markerPattern } = parseChapterHtml(html);
      if (!verses.size) {
        this.failed.push(`${url}: page fetched but no verses recognised (marker pattern ${markerPattern})`);
        this.log.warn(`! NABRE parse failed for ${url}; first lines of page text:`);
        for (const l of htmlToLines(html).slice(0, 60)) this.log.warn("  | " + l);
        return null;
      }
      return verses;
    }
    this.failed.push(`${book} ${chapter}: no URL worked`);
    return null;
  }

  /**
   * Resolve a parsed 思高 citation.
   * @returns {Promise<{verses:{ref:string,text:string}[], missing:string[]}>}
   */
  async lookup(cit) {
    const verses = [];
    const missing = [];
    const seen = new Set();
    let stopped = false;
    for (const { c, v, openEnd } of expandVerses(cit)) {
      if (openEnd && stopped) continue;
      if (seen.has(`${c}:${v}`)) continue; // "2-3, 3-4" cites verse 3 twice
      seen.add(`${c}:${v}`);
      const ch = await this.chapter(cit.book, c);
      const t = ch?.get(v);
      if (t) verses.push({ ref: `${c}:${v}`, text: t });
      else if (openEnd) stopped = true;
      else missing.push(`${c}:${v}`);
    }
    return { verses, missing };
  }
}
