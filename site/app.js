(() => {
  const $ = (id) => document.getElementById(id);
  const HK_OFFSET = 8 * 3600e3;
  const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
  const SETTINGS_KEY = "ordo.settings";
  let settings = { read: true, prop: false, massLanguage: "zh" };

  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); } catch {}
  const save = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const hkToday = () => new Date(Date.now() + HK_OFFSET).toISOString().slice(0, 10);
  const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const fmtDate = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 星期${WEEKDAY[d.getUTCDay()]}`; };

  function applySettings() {
    document.body.classList.toggle("noread", !settings.read);
    document.body.classList.toggle("noprop", !settings.prop);
    $("tRead").setAttribute("aria-pressed", settings.read);
    $("tProp").setAttribute("aria-pressed", settings.prop);
    $("massLanguage").value = settings.massLanguage;
    $("massMain").dataset.language = settings.massLanguage;
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
    if (!section.en || !settings.read) return "";
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
      html += `<article class="${section.proper ? "proper" : "reading"}"><div class="section-head"><h3>${esc(section.label)}</h3>${section.citation ? `<small>${esc(section.citation)}</small>` : ""}</div>`;
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
  async function show(date) {
    current = date; location.hash = date; $("dateText").textContent = fmtDate(date);
    $("main").innerHTML = `<p class="muted">載入中…</p>`;
    try {
      const response = await fetch(`data/${date}.json`, { cache: "no-cache" });
      if (!response.ok) throw new Error(response.status);
      const day = await response.json();
      if (current === date) renderReadings(day);
    } catch {
      $("main").innerHTML = `<div class="error-card"><strong>${fmtDate(date)}</strong><br>這一天的讀經尚未發佈，請試試其他日期。</div>`;
      $("src").textContent = "";
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
    for (const rawLine of markdown.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.startsWith("### ")) {
        flush();
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
    flush();
    return sections;
  }
  const cleanMassText = (text) => text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/`/g, "").trim();
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
        <div class="mass-parts">${section.parts.map((part, partIndex) => {
          const english = sources[1][index]?.parts[partIndex];
          const latin = sources[2][index]?.parts[partIndex];
          return `<div class="mass-part">${part.subtitle ? `<h4 class="language-zh">${esc(part.subtitle)}</h4>` : ""}${latin?.subtitle ? `<h4 class="language-la" lang="la">${esc(latin.subtitle)}</h4>` : ""}${english?.subtitle ? `<h4 class="language-en" lang="en">${esc(english.subtitle)}</h4>` : ""}<p class="mass-language-text language-zh">${esc(cleanMassText(part.text))}</p>${latin ? `<p class="mass-language-text language-la" lang="la">${esc(cleanMassText(latin.text))}</p>` : ""}${english ? `<p class="mass-language-text language-en" lang="en">${esc(cleanMassText(english.text))}</p>` : ""}</div>`;
        }).join("")}</div>
      </article>`).join("");
  }

  $("prev").onclick = () => show(addDays(current, -1));
  $("next").onclick = () => show(addDays(current, 1));
  $("today").onclick = () => show(hkToday());
  $("tRead").onclick = () => { settings.read = !settings.read; save(); applySettings(); if (current) show(current); };
  $("tProp").onclick = () => { settings.prop = !settings.prop; save(); applySettings(); };
  $("massLanguage").onchange = (e) => { settings.massLanguage = e.target.value; save(); applySettings(); };
  $("themeToggle").onclick = () => { const dark = document.documentElement.dataset.theme !== "dark"; document.documentElement.dataset.theme = dark ? "dark" : "light"; };

  document.querySelectorAll(".nav-tab").forEach((tab) => tab.onclick = () => {
    document.querySelectorAll(".nav-tab").forEach((item) => item.classList.toggle("active", item === tab));
    const mass = tab.dataset.view === "mass";
    $("readingsView").hidden = mass; $("massView").hidden = !mass;
    if (mass && !$("massMain").children.length) renderMass().catch(() => { $("massMain").innerHTML = `<p class="error-card">Mass texts could not be loaded.</p>`; });
  });

  applySettings();
  const hashDate = /^#(\d{4}-\d{2}-\d{2})$/.exec(location.hash)?.[1];
  show(hashDate || hkToday());
})();
