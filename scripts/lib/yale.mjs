// Jyutping -> Yale (diacritic style). Tone 1 uses the macron (high level),
// which is how modern Hong Kong Yale materials write it.
//   1 ā   2 á   3 a   4 àh   5 áh   6 ah
import ToJyutping from "to-jyutping";

const MARK = { 1: "̄", 2: "́", 3: "", 4: "̀", 5: "́", 6: "" };
const INITIALS = /^(ng|gw|kw|[bpmfdtnlgkhwjzcs])/;
const INIT_MAP = { z: "j", c: "ch", j: "y" };

export function jyutpingToYale(syl) {
  const m = /^([a-z]+)([1-6])$/.exec(syl);
  if (!m) return syl;
  const body = m[1];
  const t = Number(m[2]);
  // Syllabic nasals 唔 m4 / 五 ng5 -> m̀h / ńgh
  if (body === "m" || body === "ng") {
    return (body[0] + MARK[t] + body.slice(1) + (t >= 4 ? "h" : "")).normalize("NFC");
  }
  let init = "";
  let rime = body;
  const im = INITIALS.exec(body);
  if (im && im[1].length < body.length) {
    init = im[1];
    rime = body.slice(init.length);
  }
  init = INIT_MAP[init] ?? init;
  if (init === "y" && rime.startsWith("yu")) init = ""; // jyun -> yun, not yyun
  rime = rime.replace(/^oe/, "eu").replace(/^eo/, "eu");
  if (rime === "aa") rime = "a"; // open long a: 他 taa1 -> tā


  const first = rime.search(/[aeiou]/);
  let last = -1;
  for (const x of rime.matchAll(/[aeiou]/g)) last = x.index;
  let out = rime;
  if (t >= 4) out = out.slice(0, last + 1) + "h" + out.slice(last + 1);
  out = out.slice(0, first + 1) + MARK[t] + out.slice(first + 1);
  return (init + out).normalize("NFC");
}

/** Build a converter with user overrides ({word: "jyut6 ping3" | null}). */
export function makeRomanizer(overrides = {}) {
  const conv = Object.keys(overrides).length ? ToJyutping.customize(overrides) : ToJyutping;
  /**
   * @param {string} text
   * @returns {{zh: string, yale: (string|null)[]}} yale[i] is the romanization of
   *   the i-th code point of zh, null for punctuation/latin.
   */
  return function romanize(text) {
    const list = conv.getJyutpingList(text);
    const yale = list.map(([, jp]) => (jp ? jp.split(" ").map(jyutpingToYale).join(" ") : null));
    const zh = list.map(([ch]) => ch).join("");
    return { zh, yale };
  };
}
