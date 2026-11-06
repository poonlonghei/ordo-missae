(() => {
  const $ = (id) => document.getElementById(id);
  const SETTINGS_KEY = "ordo.settings";
  const settings = { massLanguage: "zh", prayersLanguage: "zh", prayerSection: "before", theme: "light" };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); } catch {}
  const save = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} };
  const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clean = (value) => value.replace(/\*\*/g, "").replace(/\*/g, "").replace(/`/g, "").trim();

  $("themeToggle").onclick = () => {
    settings.theme = settings.theme === "dark" ? "light" : "dark";
    save();
    applySettings();
  };

  function applySettings() {
    document.documentElement.dataset.theme = settings.theme;
    if ($("massLanguage")) {
      $("massLanguage").value = settings.massLanguage;
      $("massMain").dataset.language = settings.massLanguage;
    }
    if ($("prayersLanguage")) {
      $("prayersLanguage").value = settings.prayersLanguage;
      $("prayersMain").dataset.language = settings.prayersLanguage;
      $("prayerSection").value = settings.prayerSection;
      $("prayersMain").dataset.section = settings.prayerSection;
    }
  }

  function parseMass(markdown) {
    const sections = [];
    let section;
    let part;
    const flush = () => {
      if (section && part?.text.trim()) section.parts.push({ ...part, text: part.text.trim() });
      part = null;
    };
    for (const rawLine of markdown.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.startsWith("### ")) {
        flush();
        section = { title: line.slice(4), parts: [] };
        sections.push(section);
      } else if (line.startsWith("#### ")) {
        flush();
        part = { subtitle: line.slice(5), text: "" };
      } else if (line && section) {
        if (!part) part = { subtitle: "", text: "" };
        part.text += `${line} `;
      } else {
        flush();
      }
    }
    flush();
    return sections;
  }

  async function renderMass() {
    const responses = await Promise.all(["ordinary-form-chinese.md", "ordinary-form.md", "ordinary-form-latin.md"].map((file) => fetch(`mass/${file}`)));
    if (responses.some((response) => !response.ok)) throw new Error("Mass texts unavailable");
    const sources = await Promise.all(responses.map((response) => response.text()));
    const parsed = sources.map(parseMass);
    $("massMain").innerHTML = parsed[0].map((section, index) => `
      <article class="mass-section">
        <div class="mass-section-heading"><span class="section-number">${String(index + 1).padStart(2, "0")}</span><div><h3>${esc(section.title)}</h3><p>${esc(parsed[2][index]?.title || "")} · ${esc(parsed[1][index]?.title || "")}</p></div></div>
        <div class="mass-parts">${Array.from({ length: Math.max(section.parts.length, parsed[1][index]?.parts.length || 0, parsed[2][index]?.parts.length || 0) }, (_, partIndex) => {
          const zh = section.parts[partIndex] || { subtitle: "", text: "" };
          const en = parsed[1][index]?.parts[partIndex];
          const la = parsed[2][index]?.parts[partIndex];
          return `<div class="mass-part">${zh.subtitle ? `<h4 class="language-zh">${esc(zh.subtitle)}</h4>` : ""}${la?.subtitle ? `<h4 class="language-la" lang="la">${esc(la.subtitle)}</h4>` : ""}${en?.subtitle ? `<h4 class="language-en" lang="en">${esc(en.subtitle)}</h4>` : ""}<p class="mass-language-text language-zh">${esc(clean(zh.text))}</p>${la ? `<p class="mass-language-text language-la" lang="la">${esc(clean(la.text))}</p>` : ""}${en ? `<p class="mass-language-text language-en" lang="en">${esc(clean(en.text))}</p>` : ""}</div>`;
        }).join("")}</div>
      </article>`).join("");
    applySettings();
  }

  async function renderPrayers() {
    const response = await fetch("mass/prayers.md");
    if (!response.ok) throw new Error("Prayer content unavailable");
    const sections = [];
    let section;
    let language = "";
    for (const rawLine of (await response.text()).split(/\r?\n/)) {
      const line = rawLine.trim();
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading?.[1] === "##") {
        section = { id: sections.length ? "after" : "before", title: heading[2], content: [] };
        sections.push(section);
        language = "";
      } else if (section && heading?.[1] === "###") {
        language = heading[2] === "中文" ? "zh" : heading[2] === "Latine" ? "la" : "en";
        section.content.push(`<h3 class="language-${language}">${esc(heading[2])}</h3>`);
      } else if (section && line) {
        const italic = /^\*([^*]+)\*$/.exec(line);
        section.content.push(`<p class="${italic ? "about-lead " : ""}language-${language}">${esc(italic ? italic[1] : line)}</p>`);
      }
    }
    $("prayersMain").innerHTML = `<div class="day-heading"><p class="eyebrow">PRAYERS · 禱文</p></div>${sections.map((item) => `<article class="about-section prayer-section" data-section="${item.id}"><h2>${esc(item.title)}</h2>${item.content.join("")}</article>`).join("")}`;
    applySettings();
  }

  function renderAbout(markdown) {
    const blocks = [];
    let paragraph = [];
    const flush = () => {
      if (paragraph.length) {
        blocks.push(`<p>${paragraph.map(esc).join(" ")}</p>`);
        paragraph = [];
      }
    };
    for (const rawLine of markdown.split(/\r?\n/)) {
      const line = rawLine.trim();
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      const item = /^[-*]\s+(.+)$/.exec(line);
      if (!line) { flush(); continue; }
      if (heading) { flush(); blocks.push(`<h${heading[1].length}>${esc(heading[2])}</h${heading[1].length}>`); }
      else if (item) { flush(); blocks.push(`<ul><li>${esc(item[1])}</li></ul>`); }
      else if (/^\*[^*]+\*$/.test(line)) { flush(); blocks.push(`<p class="about-lead">${esc(line.slice(1, -1))}</p>`); }
      else paragraph.push(line);
    }
    flush();
    $("aboutMain").innerHTML = `<div class="day-heading"><p class="eyebrow">ABOUT · 關於</p></div><article class="about-section">${blocks.join("")}</article>`;
  }

  $("massLanguage")?.addEventListener("change", (event) => { settings.massLanguage = event.target.value; save(); applySettings(); });
  $("prayersLanguage")?.addEventListener("change", (event) => { settings.prayersLanguage = event.target.value; save(); applySettings(); });
  $("prayerSection")?.addEventListener("change", (event) => { settings.prayerSection = event.target.value; save(); applySettings(); });
  applySettings();

  const page = document.body.dataset.page;
  const load = page === "mass" ? renderMass() : page === "prayers" ? renderPrayers() : fetch("about.md").then((response) => response.text()).then(renderAbout);
  load.catch(() => {
    const target = $("massMain") || $("prayersMain") || $("aboutMain");
    target.innerHTML = `<p class="error-card">This page could not be loaded.</p>`;
  });
})();
