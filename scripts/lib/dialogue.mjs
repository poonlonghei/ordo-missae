// The people's parts that the Diocese's page leaves out, added around the
// readings as they are said at Mass in Hong Kong, with the US Missal's English:
//   readings: "——上主的話。" / 眾：感謝天主。      The word of the Lord. / Thanks be to God.
//   Gospel:   主祭：願主與你們同在。 / 眾：也與你的心靈同在。   The Lord be with you. / And with your spirit.
//             恭讀聖○○福音 / 眾：主，願光榮歸於你。          A reading from the holy Gospel according to N. / Glory to you, O Lord.
//             "——上主的話。" / 眾：基督，我們讚美你。        The Gospel of the Lord. / Praise to you, Lord Jesus Christ.
//   psalm:    the refrain written out after every strophe that ends in 【答】.

const WORD = /^——(?:上主的話|基督的福音)/;

/** Chinese lines (plain strings, before romanization) with the people's responses added. */
export function addResponses(kind, lines) {
  const out = [];
  const has = (re) => lines.some((l) => re.test(l));
  if (kind === "gospel" && !has(/願主與你們同在/)) out.push("主祭：願主與你們同在。", "眾：也與你的心靈同在。");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], next = lines[i + 1] ?? "";
    out.push(l);
    if (kind === "gospel" && /^恭讀.*福音/.test(l) && !/光榮歸於你/.test(next)) out.push("眾：主，願光榮歸於你。");
    if (WORD.test(l)) {
      if (kind === "gospel" && !/讚美你/.test(next)) out.push("眾：基督，我們讚美你。");
      if ((kind === "reading1" || kind === "reading2") && !/感謝天主/.test(next)) out.push("眾：感謝天主。");
    }
  }
  return out;
}

/** Psalm lines with the refrain written out in full after each strophe marked 【答】. */
export function expandRefrain(lines) {
  const first = lines.find((l) => /^【答】/.test(l));
  if (!first) return lines;
  const refrain = first.replace(/^【答】\s*[：:]?\s*/, "").trim();
  if (!refrain) return lines;
  const out = [];
  for (const l of lines) {
    if (l !== first && /【答】\s*$/.test(l)) {
      const body = l.replace(/\s*【答】\s*$/, "");
      if (body) out.push(body);
      out.push(`【答】：${refrain}`);
    } else out.push(l);
  }
  return out;
}

// "A reading from ..." as in the Lectionary for Mass, by USFM book code.
const BOOK = {
  GEN: "the Book of Genesis", EXO: "the Book of Exodus", LEV: "the Book of Leviticus", NUM: "the Book of Numbers",
  DEU: "the Book of Deuteronomy", JOS: "the Book of Joshua", JDG: "the Book of Judges", RUT: "the Book of Ruth",
  "1SA": "the first Book of Samuel", "2SA": "the second Book of Samuel", "1KI": "the first Book of Kings",
  "2KI": "the second Book of Kings", "1CH": "the first Book of Chronicles", "2CH": "the second Book of Chronicles",
  EZR: "the Book of Ezra", NEH: "the Book of Nehemiah", TOB: "the Book of Tobit", JDT: "the Book of Judith",
  EST: "the Book of Esther", "1MA": "the first Book of Maccabees", "2MA": "the second Book of Maccabees",
  JOB: "the Book of Job", PRO: "the Book of Proverbs", ECC: "the Book of Ecclesiastes", SNG: "the Song of Songs",
  WIS: "the Book of Wisdom", SIR: "the Book of Sirach", ISA: "the Book of the Prophet Isaiah",
  JER: "the Book of the Prophet Jeremiah", LAM: "the Book of Lamentations", BAR: "the Book of the Prophet Baruch",
  EZK: "the Book of the Prophet Ezekiel", DAN: "the Book of the Prophet Daniel", HOS: "the Book of the Prophet Hosea",
  JOL: "the Book of the Prophet Joel", AMO: "the Book of the Prophet Amos", OBA: "the Book of the Prophet Obadiah",
  JON: "the Book of the Prophet Jonah", MIC: "the Book of the Prophet Micah", NAM: "the Book of the Prophet Nahum",
  HAB: "the Book of the Prophet Habakkuk", ZEP: "the Book of the Prophet Zephaniah", HAG: "the Book of the Prophet Haggai",
  ZEC: "the Book of the Prophet Zechariah", MAL: "the Book of the Prophet Malachi", ACT: "the Acts of the Apostles",
  ROM: "the Letter of Saint Paul to the Romans", "1CO": "the first Letter of Saint Paul to the Corinthians",
  "2CO": "the second Letter of Saint Paul to the Corinthians", GAL: "the Letter of Saint Paul to the Galatians",
  EPH: "the Letter of Saint Paul to the Ephesians", PHP: "the Letter of Saint Paul to the Philippians",
  COL: "the Letter of Saint Paul to the Colossians", "1TH": "the first Letter of Saint Paul to the Thessalonians",
  "2TH": "the second Letter of Saint Paul to the Thessalonians", "1TI": "the first Letter of Saint Paul to Timothy",
  "2TI": "the second Letter of Saint Paul to Timothy", TIT: "the Letter of Saint Paul to Titus",
  PHM: "the Letter of Saint Paul to Philemon", HEB: "the Letter to the Hebrews", JAS: "the Letter of Saint James",
  "1PE": "the first Letter of Saint Peter", "2PE": "the second Letter of Saint Peter", "1JN": "the first Letter of Saint John",
  "2JN": "the second Letter of Saint John", "3JN": "the third Letter of Saint John", JUD: "the Letter of Saint Jude",
  REV: "the Book of Revelation",
};
const EVANGELIST = { MAT: "Matthew", MRK: "Mark", LUK: "Luke", JHN: "John" };

/**
 * English lines said before and after a reading. Responses start with "R. ".
 * @returns {{pre: string[], post: string[]} | null}
 */
export function englishFrame(kind, book) {
  if (kind === "gospel") {
    const ev = EVANGELIST[book];
    return {
      pre: ["The Lord be with you.", "R. And with your spirit.", ...(ev ? [`A reading from the holy Gospel according to ${ev}`, "R. Glory to you, O Lord."] : [])],
      post: ["The Gospel of the Lord.", "R. Praise to you, Lord Jesus Christ."],
    };
  }
  if (kind === "reading1" || kind === "reading2") {
    return { pre: BOOK[book] ? [`A reading from ${BOOK[book]}`] : [], post: ["The word of the Lord.", "R. Thanks be to God."] };
  }
  return null;
}
