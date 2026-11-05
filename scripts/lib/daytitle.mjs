// English for the Hong Kong ferial/Sunday titles, e.g.
//   常年期第二十八周星期五 -> Friday of the Twenty-eighth Week in Ordinary Time
//   常年期第三十主日       -> Thirtieth Sunday in Ordinary Time
//   將臨期第一周星期三     -> Wednesday of the First Week of Advent
// Memorials and feasts are not translated here (names vary); the USCCB page
// title is used for those when the day matches.
const DIGITS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
export function zhNumber(s) {
  if (/^\d+$/.test(s)) return Number(s);
  let n = 0, cur = 0;
  for (const ch of s) {
    if (ch === "十") { n += (cur || 1) * 10; cur = 0; }
    else if (DIGITS[ch]) cur = DIGITS[ch];
    else return null;
  }
  return n + cur;
}
const ORD = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth", "Thirteenth", "Fourteenth", "Fifteenth", "Sixteenth", "Seventeenth", "Eighteenth", "Nineteenth", "Twentieth", "Twenty-first", "Twenty-second", "Twenty-third", "Twenty-fourth", "Twenty-fifth", "Twenty-sixth", "Twenty-seventh", "Twenty-eighth", "Twenty-ninth", "Thirtieth", "Thirty-first", "Thirty-second", "Thirty-third", "Thirty-fourth"];
const SEASON = { 常年期: ["in Ordinary Time", "in Ordinary Time"], 將臨期: ["of Advent", "of Advent"], 四旬期: ["of Lent", "of Lent"], 復活期: ["of Easter", "of Easter"], 聖誕期: ["of Christmas", "of Christmas"] };
const WEEKDAY = { 一: "Monday", 二: "Tuesday", 三: "Wednesday", 四: "Thursday", 五: "Friday", 六: "Saturday" };

export function englishDayTitle(zh) {
  if (!zh) return null;
  const t = zh.replace(/\s+/g, "");
  let m = /^(常年期|將臨期|四旬期|復活期|聖誕期)第([一二三四五六七八九十\d]+)[周週]星期([一二三四五六])$/.exec(t);
  if (m) { const n = zhNumber(m[2]); if (n && ORD[n]) return `${WEEKDAY[m[3]]} of the ${ORD[n]} Week ${SEASON[m[1]][0]}`; }
  m = /^(常年期|將臨期|四旬期|復活期|聖誕期)第([一二三四五六七八九十\d]+)主日$/.exec(t);
  if (m) { const n = zhNumber(m[2]); if (n && ORD[n]) return `${ORD[n]} Sunday ${SEASON[m[1]][1]}`; }
  const fixed = { 聖灰禮儀: "Ash Wednesday", 聖枝主日: "Palm Sunday of the Passion of the Lord", 主受難日: "Friday of the Passion of the Lord", 聖週四: "Thursday of Holy Week", 聖週五: "Friday of the Passion of the Lord", 聖週六: "Holy Saturday", 復活主日: "Easter Sunday", 耶穌升天節: "The Ascension of the Lord", 五旬節主日: "Pentecost Sunday", 聖三主日: "The Most Holy Trinity", 基督聖體聖血節: "The Most Holy Body and Blood of Christ", 基督普世君王節: "Our Lord Jesus Christ, King of the Universe", 耶穌聖誕節: "The Nativity of the Lord", 聖家節: "The Holy Family of Jesus, Mary and Joseph", 主顯節: "The Epiphany of the Lord", 主受洗節: "The Baptism of the Lord" };
  for (const [k, v] of Object.entries(fixed)) if (t.startsWith(k)) return v;
  return null;
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI", "XXII", "XXIII", "XXIV", "XXV", "XXVI", "XXVII", "XXVIII", "XXIX", "XXX", "XXXI", "XXXII", "XXXIII", "XXXIV"];
const SEASON_LA = { 常年期: "per annum", 將臨期: "Adventus", 四旬期: "Quadragesimae", 復活期: "Paschae", 聖誕期: "Nativitatis" };
const FERIA_LA = { 一: "Feria II", 二: "Feria III", 三: "Feria IV", 四: "Feria V", 五: "Feria VI", 六: "Sabbato" };

/** Latin for the same ferial and Sunday titles, in the Ordo's style: Feria VI hebdomadae XXVIII per annum. */
export function latinDayTitle(zh) {
  if (!zh) return null;
  const t = zh.replace(/\s+/g, "");
  let m = /^(常年期|將臨期|四旬期|復活期|聖誕期)第([一二三四五六七八九十\d]+)[周週]星期([一二三四五六])$/.exec(t);
  if (m) { const n = zhNumber(m[2]); if (n && ROMAN[n]) return `${FERIA_LA[m[3]]} hebdomadae ${ROMAN[n]} ${SEASON_LA[m[1]]}`; }
  m = /^(常年期|將臨期|四旬期|復活期|聖誕期)第([一二三四五六七八九十\d]+)主日$/.exec(t);
  if (m) { const n = zhNumber(m[2]); if (n && ROMAN[n]) return `Dominica ${ROMAN[n]} ${SEASON_LA[m[1]]}`; }
  m = /^聖週星期([一二三四五六])$/.exec(t);
  if (m) return `${FERIA_LA[m[1]]} Hebdomadae Sanctae`;
  m = /^(復活|聖誕)八日慶期(?:內)?(?:星期([一二三四五六])|第([一二三四五六七八])日)$/.exec(t);
  if (m) { const oct = m[1] === "復活" ? "Paschae" : "Nativitatis Domini"; return m[2] ? `${FERIA_LA[m[2]]} infra octavam ${oct}` : `Die ${ROMAN[zhNumber(m[3])]} infra octavam ${oct}`; }
  const fixed = { 聖灰禮儀: "Feria IV Cinerum", 傳教節: "Dominica pro Evangelizatione Populorum", 耶穌聖心: "Sacratissimi Cordis Iesu", 聖母無玷聖心: "Immaculati Cordis Beatae Mariae Virginis", 教會之母: "Beatae Mariae Virginis Ecclesiae Matris", 天主慈悲主日: "Dominica II Paschae seu de divina Misericordia", 聖神降臨: "Dominica Pentecostes", 聖枝主日: "Dominica in Palmis de Passione Domini", 主受難日: "Feria VI in Passione Domini", 聖週四: "Feria V Hebdomadae Sanctae", 聖週五: "Feria VI in Passione Domini", 聖週六: "Sabbato Sancto", 復活主日: "Dominica Paschae in Resurrectione Domini", 耶穌升天節: "In Ascensione Domini", 五旬節主日: "Dominica Pentecostes", 聖三主日: "Sanctissimae Trinitatis", 基督聖體聖血節: "Sanctissimi Corporis et Sanguinis Christi", 基督普世君王節: "Domini Nostri Iesu Christi Universorum Regis", 耶穌聖誕節: "In Nativitate Domini", 聖家節: "Sanctae Familiae Iesu, Mariae et Ioseph", 主顯節: "In Epiphania Domini", 主受洗節: "In Baptismate Domini" };
  for (const [k, v] of Object.entries(fixed)) if (t.startsWith(k)) return v;
  return null;
}
