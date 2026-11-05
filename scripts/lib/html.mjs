// Minimal HTML -> text helpers. The DLC pages are simple hand-made HTML, so a
// full parser is unnecessary; we only need line structure and decoded entities.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", middot: "·", shy: "", copy: "©" };
// ISO-8859-1 letters (Latin liturgical texts arrive with these)
const LATIN1 = "Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml".split(" ");
LATIN1.forEach((name, i) => { ENTITIES[name] = String.fromCodePoint(0xC0 + i); });
Object.assign(ENTITIES, { OElig: "Œ", oelig: "œ", Scaron: "Š", scaron: "š", Yuml: "Ÿ" });

export function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? ENTITIES[n.toLowerCase()] ?? m);
}

/** Detect the charset declared in the document head, if any. */
export function sniffCharset(bytes) {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const m = /charset\s*=\s*["']?\s*([a-z0-9_-]+)/i.exec(head);
  return m ? m[1].toLowerCase() : null;
}

/** Decode bytes as the declared charset, else UTF-8, falling back to Big5 (HKSCS). */
export function decodeHtml(bytes) {
  const declared = sniffCharset(bytes);
  if (declared) {
    try {
      return { text: new TextDecoder(declared, { fatal: true }).decode(bytes), charset: declared };
    } catch { /* fall through */ }
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), charset: "utf-8" };
  } catch {
    return { text: new TextDecoder("big5").decode(bytes), charset: "big5" };
  }
}

/** Convert HTML to an array of trimmed, non-empty text lines. */
export function htmlToLines(html) {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<head\b[\s\S]*?<\/head>/i, "")
    .replace(/<title\b[\s\S]*?<\/title>/gi, "")
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|tr|li|h[1-6]|table|blockquote|pre|dd|dt|section|article|center|font)\s*>/gi, "\n")
    .replace(/<\s*(p|div|tr|li|h[1-6]|table|blockquote|pre|dd|dt|section|article|center|hr)\b[^>]*>/gi, "\n")
    .replace(/<\s*td\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return s
    .split(/\r?\n/)
    .map((l) => l.replace(/[　\t ]+/g, " ").trim())
    .filter(Boolean);
}

export function titleOf(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
}
