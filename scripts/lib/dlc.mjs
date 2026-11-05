// Fetch and parse one day's Mass page from the Hong Kong Diocesan Liturgy
// Commission site: http://catholic-dlc.org.hk/mtYYMMDD.htm
//
// The parser is heuristic: it flattens the page to text lines and splits them
// at the standard section headings of the Missal. It was written without
// access to the live site, so run `npm run build -- --dump` once and adjust
// HEADERS / NOISE if sections come back empty.
import { decodeHtml, htmlToLines, titleOf } from "./html.mjs";
import { parseCitation } from "./citation.mjs";
import { ABBR_RE } from "./books.mjs";

export const BASE = "http://catholic-dlc.org.hk/";

export function dlcUrl(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${BASE}mt${y.slice(2)}${m}${d}.htm`;
}

// kind, regex on the start of a line, whether scripture (gets English)
const HEADERS = [
  ["entrance", /^進堂詠/, false],
  ["collect", /^集禱經/, false],
  ["reading1", /^讀經一/, true],
  ["psalm", /^答唱詠/, true],
  ["reading2", /^讀經二/, true],
  ["sequence", /^繼抒詠/, false],
  ["alleluia", /^福音前歡呼/, true],
  ["gospel", /^福音(?!前)/, true],
  ["intercessions", /^信友禱文/, false],
  ["offertory", /^獻禮經/, false],
  ["preface", /^頌謝詞/, false],
  ["communion", /^領主詠/, false],
  ["postcommunion", /^領聖體後經/, false],
  ["blessing", /^(隆重)?降福/, false],
];
export const SCRIPTURE_KINDS = new Set(HEADERS.filter((h) => h[2]).map((h) => h[0]));
// Kinds whose English is looked up from the NABRE chapter text when no lectionary block matches.
export const CHAPTER_KINDS = new Set(["reading1", "reading2", "psalm", "gospel"]);
export const KIND_LABEL = Object.fromEntries([
  ["entrance", "進堂詠"], ["collect", "集禱經"], ["reading1", "讀經一"], ["psalm", "答唱詠"],
  ["reading2", "讀經二"], ["sequence", "繼抒詠"], ["alleluia", "福音前歡呼"], ["gospel", "福音"],
  ["intercessions", "信友禱文"], ["offertory", "獻禮經"], ["preface", "頌謝詞"], ["communion", "領主詠"],
  ["postcommunion", "領聖體後經"], ["blessing", "降福"], ["divider", ""], ["note", "簡介"],
]);

const NOISE = /首頁|返回|回上頁|每日彌撒讀經|禮儀委員會|版權|copyright|©|http|www\.|\.htm|下一[天日]|上一[天日]|翻譯|所有/i;
const CITE_RE = new RegExp(`(?:恭讀|${ABBR_RE.source}\\s*\\d+\\s*[:：]\\s*\\d+)`);

function headerFor(line) {
  if (line.length > 48) return null;
  for (const [kind, re] of HEADERS) if (re.test(line)) return kind;
  return null;
}

const TITLE_MAX = 36;
const TRAILING_CITE = new RegExp(`\\s*[（(]\\s*(?:參閱|參|cf\\.?)?\\s*${ABBR_RE.source}\\s*\\d+\\s*[:：][\\d\\s,，、;；\\-–a-z]*[)）]\\s*$`, "u");
const INTRO_CITE = /^(恭讀.+?)\s*\d+\s*[:：]\s*[\d\s,，、;；\-–a-z]+$/u;

/** Break a page line into display lines: the "——上主的話。" acclamation on its own, citations shown in the heading dropped from the text. */
function splitLine(line) {
  let l = line.replace(TRAILING_CITE, "");            // 「…一無所缺。（詠34:11）」 -> drop the reference
  const im = INTRO_CITE.exec(l);
  if (im) l = im[1];                                   // 「恭讀聖路加福音 12:1-7」 -> 「恭讀聖路加福音」
  const parts = [];
  // Only the closing acclamation goes on a line of its own; a dash inside the text stays.
  for (const piece of l.split(/(?=——(?:上主的話|基督的福音))/)) {
    const t = piece.trim();
    if (t) parts.push(t);
  }
  return parts.length ? parts : [l];
}
const looksLikeTitle = (l) => l.length <= TITLE_MAX && !/[。；！？]/.test(l) && !/^[「【]/.test(l);
const isBiography = (l) => l.length > 120 && /。/.test(l);

/**
 * @returns {{title:string[], notes:string[], pageTitle:string, sections:object[], charset:string, lineCount:number}}
 * sections may include kind "divider" (start of an alternative formulary / set
 * of prayers, e.g. 第二式 or an optional memorial) and are otherwise in page order.
 */
export function parseDlcHtml(bytes) {
  const { text: html, charset } = decodeHtml(bytes);
  const lines = htmlToLines(html);
  const pageTitle = titleOf(html);
  const sections = [];
  const title = [];
  const notes = [];
  let cur = null;
  let seenInSet = new Set();
  for (const line of lines) {
    const kind = headerFor(line);
    if (kind) {
      if (seenInSet.has(kind)) {
        // A repeated heading means a second formulary. Lines that trail the
        // previous section and look like a title become the divider's title.
        const divTitle = [];
        const prev = sections[sections.length - 1];
        const bio = [];
        while (prev && prev.lines.length > 1 && isBiography(prev.lines[prev.lines.length - 1])) bio.unshift(prev.lines.pop());
        while (prev && prev.lines.length && looksLikeTitle(prev.lines[prev.lines.length - 1]) && divTitle.length < 4) divTitle.unshift(prev.lines.pop());
        notes.push(...bio);
        sections.push({ kind: "divider", label: divTitle[0] ?? "另一式", heading: divTitle[0] ?? "", citation: null, lines: divTitle.slice(1) });
        seenInSet = new Set();
      }
      seenInSet.add(kind);
      cur = { kind, label: KIND_LABEL[kind], heading: line, citation: null, lines: [] };
      sections.push(cur);
      const c = parseCitation(line);
      if (c) cur.citation = c;
      continue;
    }
    if (!cur) {
      if (NOISE.test(line)) continue;
      if (looksLikeTitle(line)) title.push(line); else notes.push(line);
      continue;
    }
    if (!cur.citation && cur.lines.length < 3 && CITE_RE.test(line)) {
      const c = parseCitation(line);
      if (c) cur.citation = c;
    }
    if (NOISE.test(line) && line.length < 30) continue;
    for (const part of splitLine(line)) cur.lines.push(part);
  }
  for (const s of sections) {
    while (s.lines.length && NOISE.test(s.lines[s.lines.length - 1])) s.lines.pop();
  }
  // Long paragraphs that trail the last section are usually a saint's biography.
  const last = sections[sections.length - 1];
  if (last && last.kind !== "divider") {
    while (last.lines.length > 1 && isBiography(last.lines[last.lines.length - 1])) notes.push(last.lines.pop());
  }
  return { title: title.slice(0, 6), notes, pageTitle, sections, charset, lineCount: lines.length };
}

export async function fetchDlc(isoDate, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const url = dlcUrl(isoDate);
  const tries = [url, url.replace(/^http:/, "https:")];
  let lastErr = null;
  for (const u of tries) {
    try {
      const res = await fetchImpl(u, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": "CantoDailyReadings/0.1 (personal use; github)" },
      });
      if (res.status === 404) return { status: 404, url: u, bytes: null };
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status} for ${u}`); continue; }
      return { status: res.status, url: u, bytes: new Uint8Array(await res.arrayBuffer()) };
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error(`fetch failed for ${url}`);
}
