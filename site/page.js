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
      <article class="mass-section${section.title === "領主後經" ? " postcommunion-section" : section.title === "禮成" ? " dismissal-section" : ""}">
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
    const languageFiles = { zh: "chinese.md", en: "english.md", la: "latin.md" };
    const sectionTitles = {
      before: "Prayer Before Mass · 彌撒前禱文 · Oratio Ante Missam",
      after: "Prayer After Mass · 彌撒後禱文 · Oratio Post Missam"
    };
    const inlineMarkdown = (value) => esc(value)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
    const renderContent = (markdown) => {
      const blocks = [];
      let paragraph = [];
      const flush = () => {
        if (!paragraph.length) return;
        const text = paragraph.join(" ");
        const placeholder = /^\*[^*]+\*$/.test(text);
        blocks.push(`<p class="${placeholder ? "about-lead " : ""}">${inlineMarkdown(placeholder ? text.slice(1, -1) : text)}</p>`);
        paragraph = [];
      };
      for (const rawLine of markdown.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) { flush(); continue; }
        paragraph.push(line);
      }
      flush();
      return blocks.join("");
    };
    const section = settings.prayerSection === "after" ? "after" : "before";
    const language = languageFiles[settings.prayersLanguage] ? settings.prayersLanguage : "zh";
    const response = await fetch(`mass/${section}-mass/${languageFiles[language]}`, { cache: "no-cache" });
    if (!response.ok) throw new Error("Prayer content unavailable");
    const content = renderContent(await response.text());
    $("prayersMain").innerHTML = `<div class="day-heading"><p class="eyebrow">PRAYERS · 禱文</p></div><article class="about-section prayer-section"><h2>${sectionTitles[section]}</h2>${content}</article>`;
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
  $("prayersLanguage")?.addEventListener("change", (event) => { settings.prayersLanguage = event.target.value; save(); renderPrayers().catch(() => {}); });
  $("prayerSection")?.addEventListener("change", (event) => { settings.prayerSection = event.target.value; save(); renderPrayers().catch(() => {}); });
  applySettings();

  const page = document.body.dataset.page;
  const load = page === "mass" ? renderMass() : page === "prayers" ? renderPrayers() : fetch("about.md").then((response) => response.text()).then(renderAbout);
  load.catch(() => {
    const target = $("massMain") || $("prayersMain") || $("aboutMain");
    target.innerHTML = `<p class="error-card">This page could not be loaded.</p>`;
  });
})();
