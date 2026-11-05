(() => {
  const $ = (id) => document.getElementById(id);
  const HK_OFFSET = 8 * 3600e3;
  const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
  const SETTINGS_KEY = "ordo.settings";
  const VISIBLE_PROPERS = new Set(["entrance", "offertory", "communion", "postcommunion"]);
  let settings = { read: true, prop: false, massLanguage: "zh", theme: "light", view: "readings" };

  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); } catch {}
  const save = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const hkToday = () => new Date(Date.now() + HK_OFFSET).toISOString().slice(0, 10);
  const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const fmtDate = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 星期${WEEKDAY[d.getUTCDay()]}`; };
  const validDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date);

  function applySettings() {
    document.body.classList.remove("noread");
    document.body.classList.add("noprop");
    $("massLanguage").value = settings.massLanguage;
    $("massMain").dataset.language = settings.massLanguage;
    document.documentElement.dataset.theme = settings.theme;
    $("datePicker").value = current || hkToday();
  }

  const SPEAKER = /^(領|眾|答|主祭|司鐸|讀經員|全體|信友|執事)[：:]\s*/;
  function lineHtml(line) {
    let text = line.zh;
    const match = SPEAKER.exec(text);
    const label = match ? `<span class="who">${esc(match[1])}</span>` : "";
    if (match) text = text.slice(match[0].length);
    return label + esc(text);
  }
  function enHtml(section) {
    if (!section.en) return "";
    const lines = section.en.lines || section.en.verses?.map((v) => v.text) || [];
    return `<p class="en" lang="en">${lines.map(esc).join(section.kind === "psalm" ? "<br>" : " ")}</p>`;
  }
  function laHtml(section) {
    if (!section.la?.lines?.length) return "";
    return `<p class="la" lang="la">${section.la.lines.map(esc).join(section.kind === "psalm" ? "<br>" : " ")}</p>`;
  }
  function renderReadings(day) {
    let html = `<div class="day-heading"><p class="eyebrow">DAILY LECTIONARY · 每日禮儀</p><h2>${esc(day.title?.[0]?.zh || "")}</h2>`;
    for (const title of (day.title || []).slice(1)) html += `<p class="title-sub">${esc(title.zh)}</p>`;
    if (day.titleLa) html += `<p class="title-la">${esc(day.titleLa)}</p>`;
    html += "</div>";
    for (const section of day.sections || []) {
      if (section.kind === "divider") { html += `<h3 class="divider">${esc(section.label)}</h3>`; continue; }
      if (section.kind === "note") { html += `<p class="note">${esc(section.label)}</p>`; continue; }
      const properClass = section.proper ? `proper${VISIBLE_PROPERS.has(section.kind) ? " featured-proper" : ""}` : "reading";
      html += `<article class="${properClass}"><div class="section-head"><h3>${esc(section.label)}</h3>${section.citation ? `<small>${esc(section.citation)}</small>` : ""}</div>`;
      for (const line of section.lines || []) {
        const rubric = /^（[^）]*）$|^或$|^\(.*\)$/.test(line.zh);
        html += `<p class="zh ${rubric ? "rubric" : ""}">${rubric ? esc(line.zh) : lineHtml(line)}</p>`;
      }
      html += laHtml(section) + enHtml(section) + "</article>";
    }
    $("main").innerHTML = html;
    $("src").textContent = day.source?.startsWith("http") ? `來源 ${day.source.replace(/^https?:\/\//, "")} · ${day.generated?.slice(0, 10) || ""}` : "";
  }

  let current = null;
  let requestId = 0;
  async function show(date) {
    if (!validDate(date)) return;
    current = date;
    const request = ++requestId;
    history.replaceState(null, "", `#${date}`);
    $("dateText").textContent = fmtDate(date);
    $("datePicker").value = date;
    $("main").classList.add("loading");
    $("main").innerHTML = `<p class="muted">載入中…</p>`;
    try {
      const response = await fetch(`data/${date}.json`, { cache: "no-cache" });
      if (!response.ok) throw new Error(response.status);
      const day = await response.json();
      if (request === requestId) {
        renderReadings(day);
        $("main").classList.remove("loading");
      }
    } catch {
      if (request !== requestId) return;
      $("main").innerHTML = `<div class="error-card"><strong>${fmtDate(date)}</strong><br>這一天的讀經尚未發佈，請試試其他日期。</div>`;
      $("src").textContent = "";
      $("main").classList.remove("loading");
    }
  }

  function parseMassMarkdown(markdown) {
    const sections = [];
    let section = null;
    let part = null;
    const flush = () => {
      if (section && part?.text.trim()) section.parts.push({ ...part, text: part.text.trim() });
      part = null;
    };
    const finishSection = () => {
      flush();
      if (section && section.parts.length === 0) sections.pop();
    };
    for (const rawLine of markdown.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.startsWith("### ")) {
        finishSection();
        section = { title: line.slice(4).trim(), parts: [] };
        sections.push(section);
      } else if (line.startsWith("#### ")) {
        flush();
        part = { subtitle: line.slice(5).trim(), text: "" };
      } else if (line) {
        if (!section) continue;
        if (!part) part = { subtitle: "", text: "" };
        part.text += `${line} `;
      } else {
        flush();
      }
    }
    finishSection();
    return sections;
  }
  const cleanMassText = (text) => text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/`/g, "").trim();
  function renderMarkdown(markdown) {
    const lines = markdown.split(/\r?\n/);
    const blocks = [];
    let paragraph = [];
    let list = [];
    const flush = () => {
      if (paragraph.length) {
        blocks.push(`<p>${paragraph.map(esc).join(" ")}</p>`);
        paragraph = [];
      }
      if (list.length) {
        blocks.push(`<ul>${list.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`);
        list = [];
      }
    };
    for (const rawLine of lines) {
      const line = rawLine.trim();
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      const item = /^[-*]\s+(.+)$/.exec(line);
      if (!line) { flush(); continue; }
      if (heading) { flush(); blocks.push(`<h${heading[1].length}>${esc(heading[2])}</h${heading[1].length}>`); }
      else if (item) { if (paragraph.length) flush(); list.push(item[1]); }
      else if (/^\*[^*]+\*$/.test(line)) { flush(); blocks.push(`<p class="about-lead">${esc(line.slice(1, -1))}</p>`); }
      else paragraph.push(line);
    }
    flush();
    $("aboutMain").innerHTML = `<div class="day-heading"><p class="eyebrow">ABOUT · 關於</p></div><article class="about-section">${blocks.join("")}</article>`;
  }
  async function renderAbout() {
    const response = await fetch("about.md", { cache: "no-cache" });
    if (!response.ok) throw new Error("About content unavailable");
    renderMarkdown(await response.text());
  }
  async function renderMass() {
    const [zhResponse, enResponse, laResponse] = await Promise.all([
      fetch("mass/ordinary-form-chinese.md"),
      fetch("mass/ordinary-form.md"),
      fetch("mass/ordinary-form-latin.md")
    ]);
    if (!zhResponse.ok || !enResponse.ok || !laResponse.ok) throw new Error("Mass texts unavailable");
    const [zh, en, la] = await Promise.all([zhResponse.text(), enResponse.text(), laResponse.text()]);
    const sources = [parseMassMarkdown(zh), parseMassMarkdown(en), parseMassMarkdown(la)];
    $("massMain").innerHTML = sources[0].map((section, index) => `
      <article class="mass-section">
        <div class="mass-section-heading"><span class="section-number">${String(index + 1).padStart(2, "0")}</span><div><h3>${esc(section.title)}</h3><p>${esc(sources[2][index]?.title || "")} · ${esc(sources[1][index]?.title || "")}</p></div></div>
        <div class="mass-parts">${Array.from({ length: Math.max(section.parts.length, sources[1][index]?.parts.length || 0, sources[2][index]?.parts.length || 0) }, (_, partIndex) => {
          const part = section.parts[partIndex] || { subtitle: "", text: "" };
          const english = sources[1][index]?.parts[partIndex];
          const latin = sources[2][index]?.parts[partIndex];
          return `<div class="mass-part">${part.subtitle ? `<h4 class="language-zh">${esc(part.subtitle)}</h4>` : ""}${latin?.subtitle ? `<h4 class="language-la" lang="la">${esc(latin.subtitle)}</h4>` : ""}${english?.subtitle ? `<h4 class="language-en" lang="en">${esc(english.subtitle)}</h4>` : ""}<p class="mass-language-text language-zh">${esc(cleanMassText(part.text))}</p>${latin ? `<p class="mass-language-text language-la" lang="la">${esc(cleanMassText(latin.text))}</p>` : ""}${english ? `<p class="mass-language-text language-en" lang="en">${esc(cleanMassText(english.text))}</p>` : ""}</div>`;
        }).join("")}</div>
      </article>`).join("");
  }

  $("prev").onclick = () => show(addDays(current, -1));
  $("next").onclick = () => show(addDays(current, 1));
  $("datePicker").onchange = (event) => show(event.target.value);
  $("massLanguage").onchange = (e) => { settings.massLanguage = e.target.value; save(); applySettings(); };
  $("themeToggle").onclick = () => { settings.theme = settings.theme === "dark" ? "light" : "dark"; save(); applySettings(); };

  document.querySelectorAll(".nav-tab").forEach((tab) => tab.onclick = () => {
    document.querySelectorAll(".nav-tab").forEach((item) => {
      const active = item === tab;
      item.classList.toggle("active", active);
      item.toggleAttribute("aria-current", active);
    });
    const mass = tab.dataset.view === "mass";
    settings.view = mass ? "mass" : "readings";
    if (tab.dataset.view === "about") settings.view = "about";
    save();
    $("readingsView").hidden = mass || tab.dataset.view === "about";
    $("massView").hidden = !mass;
    $("aboutView").hidden = tab.dataset.view !== "about";
    if (mass && !$("massMain").children.length) renderMass().catch(() => { $("massMain").innerHTML = `<p class="error-card">Mass texts could not be loaded.</p>`; });
    if (tab.dataset.view === "about" && !$("aboutMain").querySelector("h1")) renderAbout().catch(() => { $("aboutMain").innerHTML = `<p class="error-card">About content could not be loaded.</p>`; });
  });

  const hash = location.hash.slice(1);
  const hashDate = validDate(hash) ? hash : hkToday();
  const initialView = hash === "mass" || settings.view === "mass" ? "mass" : hash === "about" || settings.view === "about" ? "about" : "readings";
  applySettings();
  show(hashDate);
  if (initialView !== "readings") document.querySelector(`[data-view="${initialView}"]`).click();
  addEventListener("popstate", () => show(validDate(location.hash.slice(1)) ? location.hash.slice(1) : hkToday()));
})();
