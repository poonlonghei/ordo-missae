import test from "node:test";
import assert from "node:assert/strict";
import { parseCitation, expandVerses } from "../scripts/lib/citation.mjs";
import { bookFromText } from "../scripts/lib/books.mjs";

test("book detection from full names and abbreviations", () => {
  assert.equal(bookFromText("恭讀聖馬爾谷福音 6:14-29"), "MRK");
  assert.equal(bookFromText("恭讀聖保祿宗徒致格林多人前書 15:1-8"), "1CO");
  assert.equal(bookFromText("答唱詠 詠 18:31, 47"), "PSA");
  assert.equal(bookFromText("讀經一（德 47:2-13）"), "SIR");
  assert.equal(bookFromText("恭讀乃赫米雅 8:2-10"), "NEH");
  assert.equal(bookFromText("集禱經"), null);
});

test("citation parsing", () => {
  const c = parseCitation("詠 51:3-4, 12-13, 17, 19");
  assert.equal(c.book, "PSA");
  assert.equal(c.text, "詠 51:3-4, 12-13, 17, 19");
  assert.deepEqual(c.verses.map((x) => x.v), [3, 4, 12, 13, 17, 19]);
  const d = parseCitation("依 7:10-14; 8:10");
  assert.deepEqual(d.verses.map((x) => `${x.c}:${x.v}`), ["7:10", "7:11", "7:12", "7:13", "7:14", "8:10"]);
  const e = parseCitation("福音（谷 6:14-29）");
  assert.equal(e.verses.length, 16);
  const f = parseCitation("領：（瑪 5:10）為義而受迫害的人是有福的");
  assert.deepEqual(f.verses, [{ c: 5, v: 10 }]);
  const g = parseCitation("出 19:16-20:21");
  assert.deepEqual(g.verses[0], { c: 19, v: 16, to: { c: 20, v: 21 } });
  assert.ok(expandVerses(g).some((x) => x.c === 20 && x.v === 21));
  const h = parseCitation("詠 23:1-3a, 3b-4, 5, 6");
  assert.deepEqual(h.verses.map((x) => x.v), [1, 2, 3, 3, 4, 5, 6]);
});

