// Studium Biblicum (思高) book abbreviations and full names -> USFM book codes.
// Full-name keys are matched by "contains", longest key first, so that
// 格林多人前書 and 格林多前書 both resolve.

export const ABBR = {
  創: "GEN", 出: "EXO", 肋: "LEV", 戶: "NUM", 申: "DEU", 蘇: "JOS", 民: "JDG", 盧: "RUT",
  撒上: "1SA", 撒下: "2SA", 列上: "1KI", 列下: "2KI", 編上: "1CH", 編下: "2CH",
  厄上: "EZR", 厄下: "NEH", 多: "TOB", 友: "JDT", 艾: "EST", 加上: "1MA", 加下: "2MA",
  約: "JOB", 詠: "PSA", 箴: "PRO", 訓: "ECC", 歌: "SNG", 智: "WIS", 德: "SIR",
  依: "ISA", 耶: "JER", 哀: "LAM", 巴: "BAR", 則: "EZK", 達: "DAN",
  歐: "HOS", 岳: "JOL", 亞: "AMO", 北: "OBA", 納: "JON", 米: "MIC", 鴻: "NAM", 哈: "HAB",
  索: "ZEP", 蓋: "HAG", 匝: "ZEC", 拉: "MAL",
  瑪: "MAT", 谷: "MRK", 路: "LUK", 若: "JHN", 宗: "ACT", 羅: "ROM",
  格前: "1CO", 格後: "2CO", 迦: "GAL", 弗: "EPH", 斐: "PHP", 哥: "COL",
  得前: "1TH", 得後: "2TH", 弟前: "1TI", 弟後: "2TI", 鐸: "TIT", 費: "PHM", 希: "HEB",
  雅: "JAS", 伯前: "1PE", 伯後: "2PE", 若一: "1JN", 若二: "2JN", 若三: "3JN", 猶: "JUD", 默: "REV",
};

export const FULL = {
  創世紀: "GEN", 出谷紀: "EXO", 肋未紀: "LEV", 戶籍紀: "NUM", 申命紀: "DEU", 若蘇厄書: "JOS",
  民長紀: "JDG", 盧德傳: "RUT", 撒慕爾紀上: "1SA", 撒慕爾紀下: "2SA", 列王紀上: "1KI", 列王紀下: "2KI",
  編年紀上: "1CH", 編年紀下: "2CH", 厄斯德拉上: "EZR", 厄斯德拉下: "NEH", 乃赫米雅: "NEH",
  多俾亞傳: "TOB", 友弟德傳: "JDT", 艾斯德爾傳: "EST", 瑪加伯上: "1MA", 瑪加伯下: "2MA",
  約伯傳: "JOB", 聖詠: "PSA", 箴言: "PRO", 訓道篇: "ECC", 雅歌: "SNG", 智慧篇: "WIS", 德訓篇: "SIR",
  依撒意亞先知書: "ISA", 耶肋米亞先知書: "JER", 耶肋米亞哀歌: "LAM", 哀歌: "LAM", 巴路克: "BAR",
  厄則克耳先知書: "EZK", 達尼爾先知書: "DAN", 歐瑟亞先知書: "HOS", 岳厄爾先知書: "JOL",
  亞毛斯先知書: "AMO", 亞北底亞先知書: "OBA", 約納先知書: "JON", 米該亞先知書: "MIC",
  納鴻先知書: "NAM", 哈巴谷先知書: "HAB", 索福尼亞先知書: "ZEP", 哈蓋先知書: "HAG",
  匝加利亞先知書: "ZEC", 瑪拉基亞先知書: "MAL",
  瑪竇福音: "MAT", 馬爾谷福音: "MRK", 路加福音: "LUK", 若望福音: "JHN", 宗徒大事錄: "ACT",
  羅馬人書: "ROM", 格林多人前書: "1CO", 格林多前書: "1CO", 格林多人後書: "2CO", 格林多後書: "2CO",
  迦拉達人書: "GAL", 厄弗所人書: "EPH", 斐理伯人書: "PHP", 哥羅森人書: "COL",
  得撒洛尼人前書: "1TH", 得撒洛尼前書: "1TH", 得撒洛尼人後書: "2TH", 得撒洛尼後書: "2TH",
  弟茂德前書: "1TI", 弟茂德後書: "2TI", 弟鐸書: "TIT", 費肋孟書: "PHM", 希伯來人書: "HEB", 希伯來書: "HEB",
  雅各伯書: "JAS", 伯多祿前書: "1PE", 伯多祿後書: "2PE", 若望一書: "1JN", 若望二書: "2JN", 若望三書: "3JN",
  猶達書: "JUD", 默示錄: "REV",
};

export const CODE_TO_ABBR = Object.fromEntries(Object.entries(ABBR).map(([k, v]) => [v, k]));
const FULL_KEYS = Object.keys(FULL).sort((a, b) => b.length - a.length);
const ABBR_KEYS = Object.keys(ABBR).sort((a, b) => b.length - a.length);
export const ABBR_RE = new RegExp(`(${ABBR_KEYS.join("|")})`);

/** Find the USFM code for a line such as 恭讀聖馬爾谷福音 6:14-29 or 谷 6:14-29. */
export function bookFromText(text) {
  for (const k of FULL_KEYS) if (text.includes(k)) return FULL[k];
  // Abbreviation must be immediately followed by a chapter:verse reference.
  const m = new RegExp(`(?:^|[^\\p{Script=Han}])?(${ABBR_KEYS.join("|")})\\s*(\\d+)\\s*[:：]`, "u").exec(text);
  return m ? ABBR[m[1]] : null;
}
