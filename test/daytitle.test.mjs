import test from "node:test";
import assert from "node:assert/strict";
import { englishDayTitle, latinDayTitle, zhNumber } from "../scripts/lib/daytitle.mjs";
import { latinFeastTitle } from "../scripts/lib/sanctoral.mjs";
import { parseDayTitle } from "../scripts/lib/lectionary.mjs";
import { readFileSync } from "node:fs";

test("chinese numerals", () => {
  assert.equal(zhNumber("二十八"), 28); assert.equal(zhNumber("十"), 10); assert.equal(zhNumber("三十"), 30); assert.equal(zhNumber("十一"), 11); assert.equal(zhNumber("五"), 5);
});
test("ferial and sunday titles", () => {
  assert.equal(englishDayTitle("常年期第二十八周星期五"), "Friday of the Twenty-eighth Week in Ordinary Time");
  assert.equal(englishDayTitle("常年期第三十主日"), "Thirtieth Sunday in Ordinary Time");
  assert.equal(englishDayTitle("將臨期第一周星期三"), "Wednesday of the First Week of Advent");
  assert.equal(englishDayTitle("復活期第二主日"), "Second Sunday of Easter");
  assert.equal(englishDayTitle("聖依納爵主教．安提約基亞（殉道）（紀念）"), null);
  assert.equal(englishDayTitle("十月十六日"), null);
});
test("USCCB day title", () => {
  assert.equal(parseDayTitle(readFileSync("test/fixtures/usccb-readings.html", "utf8")), "Friday of the Twenty-eighth Week in Ordinary Time");
  assert.equal(parseDayTitle("<html><head><title>Daily Readings | USCCB</title></head><body><h2>Memorial of Saint Luke</h2></body></html>"), "Memorial of Saint Luke");
});

test("latin titles", () => {
  assert.equal(latinDayTitle("常年期第二十八周星期五"), "Feria VI hebdomadae XXVIII per annum");
  assert.equal(latinDayTitle("常年期第三十主日"), "Dominica XXX per annum");
  assert.equal(latinDayTitle("將臨期第一周星期六"), "Sabbato hebdomadae I Adventus");
  assert.equal(latinDayTitle("十月十六日"), null);
});

test("latin movable and octave titles", () => {
  assert.equal(latinDayTitle("聖週星期一"), "Feria II Hebdomadae Sanctae");
  assert.equal(latinDayTitle("復活八日慶期星期二"), "Feria III infra octavam Paschae");
  assert.equal(latinDayTitle("聖誕八日慶期內第五日"), "Die V infra octavam Nativitatis Domini");
  assert.equal(latinDayTitle("傳教節"), "Dominica pro Evangelizatione Populorum");
  assert.equal(latinDayTitle("耶穌聖心節"), "Sacratissimi Cordis Iesu");
});
test("latin sanctoral title only when the HK title names that saint", () => {
  const ignatius = ["十月十七日", "常年期第二十八周星期六", "聖依納爵主教．安提約基亞（殉道）（紀念）", "聖依納爵繼伯多祿宗徒之後，治理安提約基亞教會。107年圖拉真皇帝在位時，發生教難（殉道）"];
  assert.equal(latinFeastTitle("2026-10-17", ignatius), "S. Ignatii Antiocheni, episcopi et martyris");
  assert.equal(latinFeastTitle("2026-07-31", ["聖依納爵．羅耀拉（司鐸）（紀念）"]), "S. Ignatii de Loyola, presbyteri");
  assert.equal(latinFeastTitle("2026-10-15", ["十月十五日", "聖德蘭．亞維拉（大德肋撒）（貞女、聖師）（紀念）"]), "S. Teresiae a Iesu, virginis et Ecclesiae doctoris");
  assert.equal(latinFeastTitle("2026-10-28", ["十月二十八日", "聖西滿及聖猶達宗徒（慶日）"]), "Ss. Simonis et Iudae, apostolorum");
  assert.equal(latinFeastTitle("2026-11-01", ["諸聖節"]), "Omnium Sanctorum");
  assert.equal(latinFeastTitle("2026-10-16", ["十月十六日", "常年期第二十八周星期五"]), null);
  assert.equal(latinFeastTitle("2026-10-17", ["聖某某（紀念）"]), null);
  assert.equal(latinFeastTitle("2026-10-18", ["聖依納爵主教（紀念）"]), null);
});
