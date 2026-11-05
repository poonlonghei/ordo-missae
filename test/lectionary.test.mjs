import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { parseUsCitation, parseReadingsHtml, overlap, readingsUrl, Lectionary } from "../scripts/lib/lectionary.mjs";
import { parseCitation } from "../scripts/lib/citation.mjs";
import { PoliteFetcher } from "../scripts/lib/polite.mjs";

test("readings url", () => {
  assert.equal(readingsUrl("2026-10-16"), "https://bible.usccb.org/bible/readings/101626.cfm");
});

test("US citations", () => {
  const c = parseUsCitation("Ps 33:1-2, 4-5, 12-13");
  assert.equal(c.book, "PSA");
  assert.deepEqual([...c.verses], ["33:1", "33:2", "33:4", "33:5", "33:12", "33:13"]);
  assert.equal(parseUsCitation("1 Cor 15:1-8, 11").book, "1CO");
  assert.equal(parseUsCitation("Lk 12:1-7").verses.size, 7);
  assert.equal(parseUsCitation("Is 7:10-14; 8:10").verses.size, 6);
  assert.equal(parseUsCitation("Sg 2:8-14").book, "SNG");
  assert.equal(parseUsCitation("Lectionary: 471"), null);
  assert.equal(parseUsCitation("See Lk 8:15").raw, "Lk 8:15");
  assert.equal(parseUsCitation("Cf. Jn 15:16").book, "JHN");
});

test("parse USCCB readings page", () => {
  const blocks = parseReadingsHtml(readFileSync("test/fixtures/usccb-readings.html", "utf8"));
  assert.deepEqual(blocks.map((b) => b.kind), ["reading1", "psalm", "alleluia", "gospel"]);
  assert.equal(blocks[0].citation.book, "EPH");
  assert.equal(blocks[0].lines[0], "Brothers and sisters:");
  assert.match(blocks[1].lines[0], /^R\. \(12b\)/);
  assert.equal(blocks[3].citation.raw, "Lk 12:1-7");
  assert.ok(!blocks.some((b) => b.lines.some((l) => /Sign up|Copyright/.test(l))));
});

test("overlap scoring between HK and US citations", () => {
  const us = parseUsCitation("Lk 12:1-7");
  assert.equal(overlap(parseCitation("路 12:1-7"), us), 1);
  assert.ok(overlap(parseCitation("路 12:1-8"), us) >= 0.8);
  assert.ok(overlap(parseCitation("路 12:49-53"), us) === 0);
  assert.equal(overlap(parseCitation("谷 12:1-7"), us), 0);
});

test("lectionary match and alleluia via gospel", async () => {
  const dir = "cache/usccb-test";
  rmSync(dir, { recursive: true, force: true });
  const html = readFileSync("test/fixtures/usccb-readings.html", "utf8");
  let calls = 0;
  const fetcher = new PoliteFetcher({ delayMs: 0, fetchImpl: async () => { calls++; return { ok: true, status: 200, text: async () => html, headers: new Map() }; } });
  const lect = new Lectionary({ cacheDir: dir, fetcher });
  const m = await lect.match("2026-10-16", parseCitation("路 12:1-7"), { kind: "gospel" });
  assert.equal(m.citation, "Lk 12:1-7");
  assert.match(m.lines[0], /^At that time/);
  assert.equal(await lect.match("2026-10-16", parseCitation("路 12:49-53"), { kind: "gospel" }), null);
  const a = await lect.blockOfKind("2026-10-16", "alleluia");
  assert.equal(a.citation, "Ps 33:22");
  assert.equal(calls, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("polite fetcher stops after a persistent 403", async () => {
  let calls = 0;
  const f = new PoliteFetcher({ delayMs: 0, retryWaitsMs: [0], sleep: async () => {}, log: { warn() {} },
    fetchImpl: async () => { calls++; return { ok: false, status: 403, headers: new Map() }; } });
  const r = await f.get("https://bible.usccb.org/bible/mark/6");
  assert.equal(r.status, 403);
  assert.equal(calls, 2, "one retry");
  assert.ok(f.blocked.has("chapter"));
  const r2 = await f.get("https://bible.usccb.org/bible/mark/7");
  assert.equal(r2.status, 0);
  assert.equal(calls, 2, "no further chapter requests once blocked");
  await f.get("https://bible.usccb.org/bible/readings/101626.cfm");
  assert.equal(calls, 4, "readings pages are a separate class and still tried");
});

test("polite fetcher returns cookies and a referer like a browser", async () => {
  const seen = [];
  const f = new PoliteFetcher({ delayMs: 0, fetchImpl: async (url, init) => {
    seen.push(init.headers);
    return { ok: true, status: 200, text: async () => "<p>ok</p>", headers: { getSetCookie: () => ["visited=1; Path=/", "ab=xyz; HttpOnly"], get: () => null } };
  } });
  await f.get("https://bible.usccb.org/bible/readings/101626.cfm");
  await f.get("https://bible.usccb.org/bible/luke/12");
  assert.equal(seen[0].cookie, undefined);
  assert.equal(seen[1].cookie, "visited=1; ab=xyz");
  assert.equal(seen[1].referer, "https://bible.usccb.org/bible/readings/101626.cfm");
});

test("a JavaScript challenge page is not retried and blocks only its class", async () => {
  let calls = 0;
  const f = new PoliteFetcher({ delayMs: 0, retryWaitsMs: [0, 0], sleep: async () => {}, log: { warn() {} },
    fetchImpl: async () => { calls++; return { ok: false, status: 403, headers: new Map(), text: async () => "<html><body>Checking connection <script>…</script></body></html>" }; } });
  const r = await f.get("https://bible.usccb.org/bible/isaiah/2");
  assert.equal(r.status, 403);
  assert.equal(calls, 1, "no retry on a challenge page");
  assert.ok(!f.blocked.has("chapter"), "one challenge does not block the class");
  assert.match(f.failed[0], /challenge/);
  for (const c of [3, 4, 5]) await f.get(`https://bible.usccb.org/bible/isaiah/${c}`);
  assert.equal(calls, 4);
  assert.ok(f.blocked.has("chapter"), "four in a row does");
  assert.ok(!f.blocked.has("readings"));
});

test("scripture lines beginning with footer words do not end a reading", () => {
  const html = `<html><body><h3>Reading 1</h3><div class="content-body"><p>Ephesians 2:1-10</p><p>You were dead in your transgressions<br>following the ruler of the power of the air,<br>Listen to him.<br>Share your bread.</p></div><h2>Responsorial Psalm</h2></body></html>`;
  const [b] = parseReadingsHtml(html);
  assert.deepEqual(b.lines, ["You were dead in your transgressions", "following the ruler of the power of the air,", "Listen to him.", "Share your bread."]);
});
