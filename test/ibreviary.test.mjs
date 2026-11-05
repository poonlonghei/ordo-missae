import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { parseMissalHtml, parsePages, groupSets, antiphonMatches, IBreviary } from "../scripts/lib/ibreviary.mjs";
import { parseCitation } from "../scripts/lib/citation.mjs";
import { PoliteFetcher } from "../scripts/lib/polite.mjs";

test("parse an iBreviary Missal page", () => {
  const { title, blocks } = parseMissalHtml(readFileSync("test/fixtures/ibreviary-en.html", "utf8"));
  assert.equal(title[0], "Friday of the Twenty-eighth Week in Ordinary Time");
  assert.deepEqual(blocks.map((b) => b.kind), ["entrance", "collect", "reading1", "psalm", "gospel", "offertory", "communion", "postcommunion"]);
  assert.equal(blocks[0].citation, "Ps 130 (129):3-4");
  assert.equal(blocks[0].lines[0], "If you, O Lord, should mark iniquities,");
  assert.equal(blocks[6].citation, "Ps 34 (33):11");
  assert.match(blocks[1].lines.at(-1), /for ever and ever\.$/);
  assert.ok(!blocks.at(-1).lines.some((l) => /iBreviary/.test(l)));
  assert.equal(groupSets(blocks).length, 1);
});

test("antiphon citation matching across numbering systems", () => {
  assert.ok(antiphonMatches(parseCitation("詠130:3-4"), "Ps 130 (129):3-4"));
  assert.ok(antiphonMatches(parseCitation("詠130:3-4"), "Ps 129, 3-4"), "Vulgate numbering");
  assert.ok(antiphonMatches(parseCitation("詠34:11"), "Cf. Ps 34 (33):11"));
  assert.ok(antiphonMatches(parseCitation("若一3:2"), "1 Jn 3:2"));
  assert.ok(!antiphonMatches(parseCitation("詠130:3-4"), "Ps 34 (33):11"));
  assert.ok(!antiphonMatches(parseCitation("詠70:2"), "Mt 25:34"));
});

test("match a HK set and fetch Latin for the same formulary", async () => {
  const dir = "cache/ibreviary-test";
  rmSync(dir, { recursive: true, force: true });
  const en = readFileSync("test/fixtures/ibreviary-en.html", "utf8");
  const la = en.replace("ENTRANCE ANTIPHON", "Antiphona ad introitum").replace("Ps 130 (129):3-4", "Ps 129, 3-4").replace("COLLECT", "Collecta").replace("PRAYER OVER THE OFFERINGS", "Super oblata").replace("COMMUNION ANTIPHON", "Antiphona ad communionem").replace("PRAYER AFTER COMMUNION", "Post communionem").replace("May your grace, O Lord, we pray,", "Tua nos, quaesumus, Domine, gratia semper et praeveniat et sequatur,");
  const urls = [];
  const fetcher = new PoliteFetcher({ delayMs: 0, fetchImpl: async (url) => {
    urls.push(url);
    const menu = `<a href="/m2/letture.php">Reading</a><p>Readings</p><a href="/m2/letture.php?s=antifona_colletta">Entrance Antiphon and Collect</a><a href="/m2/letture.php?s=letture">Readings</a><a href="/m2/letture.php?s=offerte">Prayer over the Offerings</a><a href="/m2/letture.php?s=comunione">Antiphon and Prayer after Communion</a>`;
    const page = /lang=la/.test(url) ? la : en;
    // Sub-pages repeat the menu text, then their own content, whose heading may equal a menu entry.
    const body = /[?&]s=/.test(url) ? menu + (/s=offerte/.test(url) ? "<h2>Prayer over the Offerings</h2><p>Accept, O Lord, the prayers of your faithful</p>" : page) : menu;
    return { ok: true, status: 200, text: async () => body, headers: new Map() };
  } });
  const ib = new IBreviary({ cacheDir: dir, fetcher, log: { log() {}, warn() {} } });
  const m = await ib.match("2026-10-16", { entrance: parseCitation("詠130:3-4"), communion: parseCitation("詠34:11") });
  assert.ok(m.en, "matched");
  assert.equal(m.en.find((b) => b.kind === "collect").lines[0], "May your grace, O Lord, we pray,");
  assert.equal(m.la.find((b) => b.kind === "collect").lines[0], "Tua nos, quaesumus, Domine, gratia semper et praeveniat et sequatur,");
  assert.equal(m.en.find((b) => b.kind === "offertory").lines[0], "Accept, O Lord, the prayers of your faithful", "heading equal to a menu entry survives");
  assert.ok(urls[0].includes("letture.php?lang=en&date=20261016"), "Reading menu fetched first");
  assert.ok(urls[1].includes("s=antifona_colletta&lang=en&date=20261016"), "proper page discovered from the menu");
  assert.ok(urls.some((u) => /s=comunione&lang=la/.test(u)), "Latin fetched after a match");
  const none = await ib.match("2026-10-16", { entrance: parseCitation("詠70:2"), communion: null });
  assert.equal(none.en, null);
  rmSync(dir, { recursive: true, force: true });
});

test("a bare Antiphon heading takes the kind of its page", () => {
  const pages = [
    { antiphonKind: "entrance", lines: ["Antiphon", "Cf. Mt 4: 18-19", "Beside the Sea of Galilee,", "The Gloria in excelsis (Glory to God in the highest) is said.", "Collect", "We humbly implore your majesty, O Lord,"] },
    { antiphonKind: null, lines: ["Prayer over the Offerings", "Accept, O Lord, the prayers of your faithful"] },
    { antiphonKind: "communion", lines: ["Antiphona ad introitum", "Cf. Ps 34 (33):11", "The rich suffer want and go hungry,", "Prayer after Communion", "We entreat your majesty most humbly, O Lord,"] },
  ];
  const { blocks } = parsePages(pages);
  assert.deepEqual(blocks.map((b) => [b.kind, b.citation]), [["entrance", "Mt 4: 18-19"], ["collect", null], ["offertory", null], ["communion", "Ps 34 (33):11"], ["postcommunion", null]]);
  assert.ok(!blocks[0].lines.some((l) => /is said/.test(l)), "rubric dropped");
});

test("Latin-1 entities decode", async () => {
  const { decodeEntities } = await import("../scripts/lib/html.mjs");
  assert.equal(decodeEntities("D&oacute;mine, qu&aelig;sumus, &Aacute;ngelus &ndash; test"), "Dómine, quæsumus, Ángelus – test");
});
