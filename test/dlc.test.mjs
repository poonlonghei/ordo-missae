import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDlcHtml, dlcUrl } from "../scripts/lib/dlc.mjs";

test("dlc url", () => {
  assert.equal(dlcUrl("2026-02-06"), "http://catholic-dlc.org.hk/mt260206.htm");
});

for (const f of ["mt-sample.htm", "mt-sample-big5.htm"]) {
  test(`parse fixture ${f}`, () => {
    const page = parseDlcHtml(new Uint8Array(readFileSync(`test/fixtures/${f}`)));
    assert.deepEqual(page.title, ["2026年2月6日（星期五）", "聖保祿三木及同伴（殉道）（紀念）"]);
    assert.deepEqual(page.sections.map((s) => s.kind),
      ["entrance", "collect", "reading1", "psalm", "alleluia", "gospel", "offertory", "communion", "postcommunion"]);
    const gospel = page.sections.find((s) => s.kind === "gospel");
    assert.equal(gospel.citation.text, "谷 6:14-29");
    assert.equal(gospel.lines[0], "恭讀聖馬爾谷福音");
    assert.match(gospel.lines[1], /^那時候/);
    assert.equal(page.sections.find((s) => s.kind === "psalm").citation.text, "詠 18:31, 47, 50, 51");
    assert.equal(page.sections.find((s) => s.kind === "alleluia").citation.text, "瑪 5:10");
    const last = page.sections.at(-1);
    assert.ok(!last.lines.some((l) => /上一天|返回/.test(l)), "nav stripped");
  });
}


test("second formulary becomes a divider; biography goes to notes", () => {
  const page = parseDlcHtml(new Uint8Array(readFileSync("test/fixtures/mt-sample-sets.htm")));
  assert.deepEqual(page.title, ["十月二十二日", "常年期第二十九周星期四"]);
  const kinds = page.sections.map((s) => s.kind);
  assert.deepEqual(kinds, ["entrance", "collect", "reading1", "psalm", "alleluia", "gospel", "offertory", "communion", "postcommunion",
    "divider", "entrance", "collect", "offertory", "communion", "postcommunion"]);
  const div = page.sections[9];
  assert.equal(div.heading, "聖若望保祿二世（教宗）（自由紀念）");
  assert.equal(page.notes.length, 1);
  assert.match(page.notes[0], /^教宗若望保祿二世原名/);
  assert.equal(page.sections.find((s) => s.kind === "reading1").citation.text, "弗 3:14-21");
  assert.equal(page.sections.find((s) => s.kind === "gospel").citation.text, "路 12:49-53");
  assert.equal(page.sections[8].lines.at(-1), "上主，求你恩賜我們。亞孟。", "biography not left in postcommunion");
});

test("display lines: acclamation split off, citations dropped from antiphon and intro lines", () => {
  const page = parseDlcHtml(new Uint8Array(readFileSync("test/fixtures/mt-sample-sets.htm")));
  const entrance = page.sections.find((s) => s.kind === "entrance");
  assert.deepEqual(entrance.lines, ["上主，我呼求你，求你快來幫助我。"]);
  assert.equal(entrance.citation.text, "詠 70:2");
  const r1 = page.sections.find((s) => s.kind === "reading1");
  assert.deepEqual(r1.lines, ["恭讀聖保祿宗徒致厄弗所人書", "弟兄們：我在天父面前屈膝。", "——上主的話。", "（默想片刻）"]);
  assert.equal(r1.citation.text, "弗 3:14-21");
});

test("a dash inside the text does not start a new line", async () => {
  const { parseDlcHtml } = await import("../scripts/lib/dlc.mjs");
  const html = `<html><body><p>十一月九日</p><p>讀經一（水從聖殿流出。）</p><p>恭讀厄則克耳先知書 47:1-2</p><p>看，有水湧出，流向東方——因為聖殿正面朝東。——上主的話。</p></body></html>`;
  const page = parseDlcHtml(new TextEncoder().encode(html));
  const r = page.sections.find((s) => s.kind === "reading1");
  assert.deepEqual(r.lines, ["恭讀厄則克耳先知書", "看，有水湧出，流向東方——因為聖殿正面朝東。", "——上主的話。"]);
});
