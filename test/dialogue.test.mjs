import test from "node:test";
import assert from "node:assert/strict";
import { addResponses, expandRefrain, englishFrame } from "../scripts/lib/dialogue.mjs";

test("people's response after a reading", () => {
  assert.deepEqual(addResponses("reading1", ["恭讀聖保祿宗徒致厄弗所人書", "弟兄們：……", "——上主的話。", "（默想片刻）"]),
    ["恭讀聖保祿宗徒致厄弗所人書", "弟兄們：……", "——上主的話。", "眾：感謝天主。", "（默想片刻）"]);
  // already on the page: not doubled
  assert.deepEqual(addResponses("reading2", ["……", "——上主的話。", "眾：感謝天主。"]), ["……", "——上主的話。", "眾：感謝天主。"]);
});

test("Gospel dialogue", () => {
  assert.deepEqual(addResponses("gospel", ["恭讀聖路加福音", "那時候，……", "——上主的話。", "（講道後默想片刻）"]), [
    "主祭：願主與你們同在。", "眾：也與你的心靈同在。",
    "恭讀聖路加福音", "眾：主，願光榮歸於你。",
    "那時候，……",
    "——上主的話。", "眾：基督，我們讚美你。",
    "（講道後默想片刻）",
  ]);
});

test("other sections are left alone", () => {
  assert.deepEqual(addResponses("alleluia", ["領：亞肋路亞。", "眾：亞肋路亞。"]), ["領：亞肋路亞。", "眾：亞肋路亞。"]);
});

test("psalm refrain written out after each strophe", () => {
  assert.deepEqual(expandRefrain(["【答】：天主造了我們，我們非他莫屬。", "領：普世大地，請向上主歡呼！【答】", "領：你們應該明認雅威就是天主。【答】"]), [
    "【答】：天主造了我們，我們非他莫屬。",
    "領：普世大地，請向上主歡呼！", "【答】：天主造了我們，我們非他莫屬。",
    "領：你們應該明認雅威就是天主。", "【答】：天主造了我們，我們非他莫屬。",
  ]);
  assert.deepEqual(expandRefrain(["領：沒有答句。"]), ["領：沒有答句。"]);
});

test("English frame", () => {
  assert.deepEqual(englishFrame("reading2", "EPH"), { pre: ["A reading from the Letter of Saint Paul to the Ephesians"], post: ["The word of the Lord.", "R. Thanks be to God."] });
  const g = englishFrame("gospel", "LUK");
  assert.deepEqual(g.pre, ["The Lord be with you.", "R. And with your spirit.", "A reading from the holy Gospel according to Luke", "R. Glory to you, O Lord."]);
  assert.deepEqual(g.post, ["The Gospel of the Lord.", "R. Praise to you, Lord Jesus Christ."]);
  assert.equal(englishFrame("psalm", "PSA"), null);
});
