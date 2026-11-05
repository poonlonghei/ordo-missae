import { bookFromText, CODE_TO_ABBR } from "./books.mjs";

/**
 * Parse a Studium Biblicum style citation into verse coordinates.
 *   "谷 6:14-29"            -> [{c:6, v:14}, ..., {c:6, v:29}]
 *   "詠 51:3-4, 12-13, 17"  -> ...
 *   "依 7:10-14; 8:10"      -> chapters separated by ;
 *   "出 19:16-20:21"        -> cross-chapter range
 * Half-verse letters (3a, 6b) are dropped. Returns null if nothing parses.
 */
export function parseCitation(text) {
  if (!text) return null;
  const book = bookFromText(text);
  if (!book) return null;
  const norm = text
    .replace(/[：]/g, ":").replace(/[，、]/g, ",").replace(/[；]/g, ";")
    .replace(/[–—－﹣]/g, "-").replace(/[（）()]/g, " ");
  const start = norm.search(/\d+\s*:\s*\d+/);
  if (start < 0) return null;
  // Take the reference part up to the first thing that is clearly not a reference.
  const refPart = norm.slice(start).replace(/[^\d:;,\-a-z\s].*$/i, "");
  const verses = [];
  for (const chunk of refPart.split(";")) {
    let chapter = null;
    for (let piece of chunk.split(",")) {
      piece = piece.replace(/\s+/g, "").replace(/[a-z]/g, "");
      if (!piece) continue;
      const cross = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(piece);
      if (cross) {
        const [, c1, v1, c2, v2] = cross.map(Number);
        verses.push({ c: c1, v: v1, to: { c: c2, v: v2 } });
        chapter = c2;
        continue;
      }
      let m = /^(\d+):(\d+)(?:-(\d+))?$/.exec(piece);
      if (m) {
        chapter = Number(m[1]);
        pushRange(verses, chapter, Number(m[2]), m[3] ? Number(m[3]) : Number(m[2]));
        continue;
      }
      m = /^(\d+)(?:-(\d+))?$/.exec(piece);
      if (m && chapter != null) {
        pushRange(verses, chapter, Number(m[1]), m[2] ? Number(m[2]) : Number(m[1]));
      }
    }
  }
  const ref = refPart.replace(/\s+/g, "").replace(/,/g, ", ").replace(/;/g, "; ").trim();
  return verses.length ? { book, verses, raw: text.trim(), text: `${CODE_TO_ABBR[book]} ${ref}` } : null;
}

function pushRange(out, c, a, b) {
  if (b < a) b = a;
  if (b - a > 200) b = a + 200;
  for (let v = a; v <= b; v++) out.push({ c, v });
}

// Versification note: NABRE (the English source) numbers chapters and verses
// the Hebrew way, as 思高 does (psalm superscriptions count as verse 1,
// Malachi has 3 chapters, Daniel's Greek additions sit inline at 3:24-90,
// Susanna and Bel are chapters 13-14), so citations are looked up at the
// same coordinates. A different source would need a mapping table here.

/** Expand a parsed citation into an ordered list of 思高 coordinates. */
export function expandVerses(cit, maxVerses = 400) {
  const out = [];
  for (const x of cit.verses) {
    if (x.to) {
      // Cross-chapter range: take the rest of the start chapter (up to 200)
      // and the beginning of the end chapter; the Bible loader trims to real verses.
      for (let v = x.v; v <= x.v + 200; v++) out.push({ c: x.c, v, openEnd: true });
      for (let v = 1; v <= x.to.v; v++) out.push({ c: x.to.c, v });
    } else out.push({ c: x.c, v: x.v });
    if (out.length > maxVerses) break;
  }
  return out;
}
