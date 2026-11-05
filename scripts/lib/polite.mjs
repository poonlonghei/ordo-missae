// Shared, polite HTML fetching for bible.usccb.org: browser-like headers, a
// minimum gap between requests, retry with backoff on 403/429/5xx, a per-run
// cap, and a circuit breaker so one blocked run does not hammer the site.
const HEADERS = {
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "accept-encoding": "gzip, deflate, br",
  "cache-control": "no-cache",
  "upgrade-insecure-requests": "1",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
};

export class PoliteFetcher {
  constructor({ fetchImpl = fetch, delayMs = 4000, maxFetches = 60, retryWaitsMs = [20000, 60000], log = console, sleep } = {}) {
    this.fetchImpl = fetchImpl; this.delayMs = delayMs; this.maxFetches = maxFetches;
    this.retryWaitsMs = retryWaitsMs; this.log = log;
    this.sleep = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.lastAt = 0; this.count = 0; this.blocked = new Set(); this.failed = [];
    this.consecutiveChallenges = 0; this.maxConsecutiveChallenges = 4;
    this.cookies = new Map(); // name -> value, sent back like a browser would
    this.lastUrl = null; this.diagnosed = false;
  }

  headersFor(url) {
    const h = { ...HEADERS };
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    if (this.lastUrl) { h.referer = this.lastUrl; h["sec-fetch-site"] = "same-origin"; }
    return h;
  }

  rememberCookies(res) {
    const list = res.headers?.getSetCookie?.() ?? (res.headers?.get?.("set-cookie") ? [res.headers.get("set-cookie")] : []);
    for (const c of list) {
      const m = /^([^=;]+)=([^;]*)/.exec(c);
      if (m) this.cookies.set(m[1].trim(), m[2].trim());
    }
  }

  async isChallenge(res) {
    try {
      if (res.bodyText === undefined) res.bodyText = await res.text();
      return /checking (your )?connection|enable javascript|challenge/i.test(res.bodyText);
    } catch { return false; }
  }

  async diagnose(url, res) {
    if (this.diagnosed) return;
    this.diagnosed = true;
    const keep = ["server", "via", "x-cache", "x-varnish", "retry-after", "content-type", "set-cookie", "x-robots-tag", "cf-ray", "x-served-by"];
    const hdr = keep.map((k) => [k, res.headers?.get?.(k)]).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" | ");
    let body = "";
    try { if (res.bodyText === undefined) res.bodyText = await res.text(); body = res.bodyText.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200); } catch {}
    this.log.warn(`! diagnostics for HTTP ${res.status} at ${url}\n  headers: ${hdr}\n  body: ${body}`);
  }

  /** Pages are blocked per class: a challenge on chapter pages must not stop the readings pages. */
  static classOf(url) {
    if (url.includes("ibreviary")) return "ibreviary";
    return url.includes("/bible/readings/") ? "readings" : "chapter";
  }

  /** @returns {Promise<{status:number, html:string|null}>} status 0 = not attempted */
  async get(url) {
    const cls = PoliteFetcher.classOf(url);
    if (this.blocked.has(cls)) return { status: 0, html: null };
    if (this.count >= this.maxFetches) {
      if (!this.capNoted) { this.failed.push(`per-run fetch cap (${this.maxFetches}) reached; remaining pages next run`); this.capNoted = true; }
      return { status: 0, html: null };
    }
    const waits = [0, ...this.retryWaitsMs];
    let last = null;
    for (let attempt = 0; attempt < waits.length; attempt++) {
      if (waits[attempt]) await this.sleep(waits[attempt]);
      const gap = this.lastAt + this.delayMs - Date.now();
      if (gap > 0) await this.sleep(gap);
      this.lastAt = Date.now();
      this.count++;
      let res;
      try {
        res = await this.fetchImpl(url, { signal: AbortSignal.timeout(30000), headers: this.headersFor(url), redirect: "follow" });
      } catch (e) { last = { status: -1, err: e.message }; continue; }
      this.rememberCookies(res);
      if (res.ok) { this.lastUrl = url; this.consecutiveChallenges = 0; return { status: res.status, html: await res.text() }; }
      if (res.status === 403 || res.status === 429) await this.diagnose(url, res);
      last = { status: res.status, server: res.headers?.get?.("server"), mitigated: res.headers?.get?.("cf-mitigated") };
      if (res.status === 404) return { status: 404, html: null };
      if (![403, 429, 500, 502, 503, 504].includes(res.status)) break;
      if (res.status === 403 && await this.isChallenge(res)) {
        // A JavaScript "Checking connection" interstitial: deterministic for uncached pages, so retrying is pointless.
        last.challenge = true;
        break;
      }
      this.log.warn(`! ${url}: HTTP ${res.status}${last.server ? ` (server: ${last.server})` : ""}${last.mitigated ? ` cf-mitigated=${last.mitigated}` : ""}; retry ${attempt + 1}/${this.retryWaitsMs.length}`);
    }
    this.failed.push(`${url}: ${last?.err ? last.err : "HTTP " + last?.status}${last?.challenge ? " (JavaScript challenge page)" : ""}`);
    if (last?.challenge) {
      // The challenge is served per uncached page, so the next page may well be fine;
      // only a long run of them suggests the runner itself is being refused.
      if (++this.consecutiveChallenges >= this.maxConsecutiveChallenges) {
        this.blocked.add(cls);
        this.failed.push(`${this.consecutiveChallenges} ${cls} pages challenged in a row; no more ${cls} fetches this run (cached pages still used)`);
      }
    } else if (last && (last.status === 403 || last.status === 429)) {
      this.blocked.add(cls);
      this.failed.push(`${cls} pages are being refused for this runner; no more ${cls} fetches this run (cached pages still used)`);
    }
    return { status: last?.status ?? -1, html: null };
  }
}
