import test from "node:test";
import assert from "node:assert/strict";
import { jyutpingToYale, makeRomanizer } from "../scripts/lib/yale.mjs";

test("jyutping to yale", () => {
  const cases = {
    jyun5: "yúhn", waan4: "wàahn", sam1: "sām", taa1: "tā", mun4: "mùhn", si4: "sìh", ngo5: "ngóh",
    hoeng1: "hēung", loeng6: "leuhng", zyu2: "jyú", cyun4: "chyùhn", ng5: "ńgh", m4: "m̀h",
    geoi3: "geui", seot6: "seuht", jyu4: "yùh", je4: "yèh", zi2: "jí", sing3: "sing", hau6: "hauh",
    gwok3: "gwok", kwan4: "kwàhn", jat1: "yāt", dik1: "dīk", faat3: "faat", syut3: "syut", wui6: "wuih",
  };
  for (const [jp, yale] of Object.entries(cases)) assert.equal(jyutpingToYale(jp), yale.normalize("NFC"), jp);
});

test("romanizer keeps punctuation unromanized and honours overrides", () => {
  const r = makeRomanizer({ 亞孟: "aa3 mang4" });
  const out = r("眾：亞孟。");
  assert.equal(out.zh, "眾：亞孟。");
  assert.deepEqual(out.yale, ["jung", null, "a", "màhng", null]);
});
