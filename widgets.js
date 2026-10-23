"use strict";

/* =========================================================
   Oasis — widget dashboard
   Depends on globals from newtab.js:
   storageGet, storageSet, state, pad, openAddDialog,
   toggleClockFormat, cycleWallpaper
   ========================================================= */

(() => {
  const WIDGET_DEFS = {
    clock: { title: "Clock", desc: "Time and date at a glance", size: "2x1" },
    countdown: { title: "Countdown", desc: "Days until a date you choose", size: "1x1" },
    weather: { title: "Weather", desc: "Current temperature for your city", size: "1x1" },
    calendar: { title: "Calendar", desc: "Today's date", size: "1x1" },
    github: { title: "GitHub", desc: "iOS-style contribution activity graph", size: "2x1" },
    quickcopy: { title: "Quick copy", desc: "Snippets you copy with one click", size: "2x2" },
    notes: { title: "Notes", desc: "A scratchpad that saves as you type", size: "2x2" },
    folder: { title: "Folder", desc: "A group of shortcuts in one tile", size: "1x1" },
    spotify: { title: "Spotify", desc: "Live now-playing card — album art, controls, seek & volume", size: "2x2" },
  };

  const DEFAULT_WIDGETS = ["github", "quickcopy", "notes", "countdown", "weather", "calendar", "folder"];

  const DEFAULT_FOLDER = {
    name: "Tools",
    links: [
      { id: "f-maps", name: "Maps", url: "https://maps.google.com" },
      { id: "f-drive", name: "Drive", url: "https://drive.google.com" },
      { id: "f-wiki", name: "Wikipedia", url: "https://www.wikipedia.org" },
      { id: "f-translate", name: "Translate", url: "https://translate.google.com" },
    ],
  };

  const WEATHER_TTL = 15 * 60 * 1000;
  const GITHUB_TTL = 30 * 60 * 1000;

  const ws = {
    widgets: DEFAULT_WIDGETS.slice(),
    countdown: null,
    weather: { city: "", lat: null, lon: null, cache: null },
    github: { username: "", theme: "light", cache: null },
    snippets: [],
    notes: "",
    folder: JSON.parse(JSON.stringify(DEFAULT_FOLDER)),
  };

  const container = document.getElementById("widgets");
  let lastDayKey = "";
  let toastTimer = null;
  let fieldCounter = 0;

  /* ---------- Helpers ---------- */

  const save = (key) => storageSet({ [key]: ws[key] });
  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  function node(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function dayKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function showToast(message) {
    let toast = document.getElementById("toast");
    if (!toast) {
      toast = node("div", "toast");
      toast.id = "toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1600);
  }

  function favicon(url, name) {
    const wrap = node("span", "fav");
    const letter = () => node("span", "letter", (name.trim()[0] || "?").toUpperCase());
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch (_) {
      /* ignore */
    }
    if (!host) {
      wrap.appendChild(letter());
      return wrap;
    }
    const img = document.createElement("img");
    img.alt = "";
    img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
    img.addEventListener("error", () => img.replaceWith(letter()), { once: true });
    wrap.appendChild(img);
    return wrap;
  }

  function normalizeUrl(raw) {
    const value = raw.trim();
    if (!value || /\s/.test(value)) return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const parsed = new URL(withScheme);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") return null;
      return parsed.href.replace(/\/$/, "");
    } catch (_) {
      return null;
    }
  }

  /* ---------- Generic form dialog ---------- */

  function openForm({ title, fields, submitLabel, onSubmit }) {
    const dialog = node("dialog", "modal glass");
    const form = node("form", "modal-form");
    form.autocomplete = "off";
    form.appendChild(node("h2", "", title));

    const inputs = fields.map((field) => {
      const id = `wf-${++fieldCounter}`;
      const label = node("label", "", field.label);
      label.htmlFor = id;
      let input;
      if (field.multiline) {
        input = node("textarea");
        input.value = field.value || "";
      } else if (field.type === "select") {
        input = node("select");
        (field.options || []).forEach((opt) => {
          const optVal = typeof opt === "object" ? opt.value : opt;
          const optLabel = typeof opt === "object" ? opt.label : opt;
          const optEl = node("option", "", optLabel);
          optEl.value = optVal;
          if (optVal === (field.value || "")) optEl.selected = true;
          input.appendChild(optEl);
        });
      } else {
        input = node("input");
        input.type = field.type || "text";
        input.value = field.value || "";
      }
      input.id = id;
      if (field.placeholder) input.placeholder = field.placeholder;
      if (field.maxLength) input.maxLength = field.maxLength;
      if (field.required !== false) input.required = true;
      form.append(label, input);
      return input;
    });

    const error = node("p", "form-error");
    error.setAttribute("role", "alert");
    error.hidden = true;

    const actions = node("div", "modal-actions");
    const cancel = node("button", "btn ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => dialog.close());
    const submit = node("button", "btn solid", submitLabel || "Save");
    submit.type = "submit";
    actions.append(cancel, submit);
    form.append(error, actions);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      const message = await onSubmit(inputs.map((input) => input.value.trim()));
      submit.disabled = false;
      if (message) {
        error.textContent = message;
        error.hidden = false;
      } else {
        dialog.close();
      }
    });

    dialog.addEventListener("close", () => dialog.remove());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });

    dialog.appendChild(form);
    document.body.appendChild(dialog);
    dialog.showModal();
    inputs[0].focus();
  }

  /* ---------- Widget shell ---------- */

  function widgetShell(id, extraClass) {
    const def = WIDGET_DEFS[id];
    const el = node("article", `widget glass w-${def.size} ${extraClass || ""}`.trim());
    el.dataset.id = id;

    const remove = node("button", "widget-remove");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${def.title} widget`);
    remove.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      setWidgetEnabled(id, false);
    });
    el.appendChild(remove);
    return el;
  }

  /* ---------- Clock ---------- */

  function buildClock() {
    const el = widgetShell("clock", "widget-clock");
    el.append(node("div", "wc-time"), node("div", "wc-date"));
    updateClockWidget();
    return el;
  }

  function updateClockWidget() {
    const el = container.querySelector(".widget-clock");
    if (!el) return;
    const now = new Date();
    let hours = now.getHours();
    let suffix = "";
    if (state.hour12) {
      suffix = hours >= 12 ? " PM" : " AM";
      hours = hours % 12 || 12;
    } else {
      hours = pad(hours);
    }
    const time = el.querySelector(".wc-time");
    time.replaceChildren(
      document.createTextNode(String(hours)),
      node("span", "colon", ":"),
      document.createTextNode(pad(now.getMinutes())),
      node("small", "", suffix)
    );
    const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
    const date = now.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    const dateEl = el.querySelector(".wc-date");
    dateEl.replaceChildren(document.createTextNode(`${date} `), node("strong", "", weekday));
  }

  /* ---------- Calendar ---------- */

  function buildCalendar() {
    const el = widgetShell("calendar", "widget-calendar");
    const now = new Date();
    el.append(
      node("div", "cal-month", now.toLocaleDateString(undefined, { month: "short" })),
      node("div", "cal-day", String(now.getDate())),
      node("div", "cal-week", now.toLocaleDateString(undefined, { weekday: "long" }))
    );
    return el;
  }

  /* ---------- Countdown ---------- */

  function getCountdown() {
    if (ws.countdown && ws.countdown.date) return ws.countdown;
    const now = new Date();
    return { name: "New Year", date: `${now.getFullYear() + 1}-01-01` };
  }

  function buildCountdown() {
    const el = widgetShell("countdown", "widget-countdown widget-action");
    const target = getCountdown();
    const [y, m, d] = target.date.split("-").map(Number);
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const days = Math.round((new Date(y, m - 1, d) - startToday) / 86400000);

    el.setAttribute("role", "button");
    el.tabIndex = 0;
    el.setAttribute("aria-label", `${target.name}: ${Math.abs(days)} days ${days < 0 ? "ago" : "to go"}. Edit countdown.`);

    el.append(
      node("div", "cd-name", target.name),
      node("div", "cd-count", String(Math.abs(days))),
      node("div", "cd-unit", days < 0 ? "days ago" : days === 0 ? "today" : "days left")
    );

    const edit = () =>
      openForm({
        title: "Countdown",
        submitLabel: "Save countdown",
        fields: [
          { label: "Event name", value: target.name, maxLength: 20, placeholder: "Trip to Munnar" },
          { label: "Date", type: "date", value: target.date },
        ],
        onSubmit: async ([name, date]) => {
          if (!name || !date) return "Enter a name and a date.";
          ws.countdown = { name, date };
          await save("countdown");
          renderWidgets();
        },
      });
    el.addEventListener("click", edit);
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        edit();
      }
    });
    return el;
  }

  /* ---------- Weather ---------- */

  function weatherEmoji(code) {
    if (code === 0) return "☀️";
    if (code <= 2) return "🌤️";
    if (code === 3) return "☁️";
    if (code === 45 || code === 48) return "🌫️";
    if (code >= 51 && code <= 57) return "🌦️";
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "🌨️";
    if (code >= 95) return "⛈️";
    return "🌡️";
  }

  async function fetchWeather() {
    const { lat, lon } = ws.weather;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Weather request failed");
    const data = await response.json();
    ws.weather.cache = {
      temp: Math.round(data.current.temperature_2m),
      code: data.current.weather_code,
      at: Date.now(),
    };
    await save("weather");
  }

  function fillWeather(el, message) {
    const { city, cache } = ws.weather;
    el.querySelectorAll(".wx-body").forEach((n) => n.remove());
    const body = node("div", "wx-body");
    if (!city) {
      body.append(node("div", "wx-icon", "🌍"), node("div", "wx-city", "Set your city"));
    } else if (cache) {
      body.append(
        node("div", "wx-row"),
        node("div", "wx-city", message || city)
      );
      const row = body.firstChild;
      row.append(node("span", "wx-temp", `${cache.temp}°`), node("span", "wx-icon", weatherEmoji(cache.code)));
    } else {
      body.append(node("div", "wx-icon", "⏳"), node("div", "wx-city", message || "Loading…"));
    }
    el.appendChild(body);
  }

  function buildWeather() {
    const el = widgetShell("weather", "widget-weather widget-action");
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    el.setAttribute("aria-label", "Weather. Change city.");
    fillWeather(el);

    const { city, cache } = ws.weather;
    if (city && (!cache || Date.now() - cache.at > WEATHER_TTL)) {
      fetchWeather()
        .then(() => fillWeather(el))
        .catch(() => fillWeather(el, cache ? city : "Offline"));
    }

    const edit = () =>
      openForm({
        title: "Weather city",
        submitLabel: "Save city",
        fields: [{ label: "City", value: ws.weather.city, placeholder: "Kochi", maxLength: 60 }],
        onSubmit: async ([name]) => {
          if (!name) return "Enter a city name.";
          try {
            const response = await fetch(
              `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`
            );
            const data = await response.json();
            const hit = data.results && data.results[0];
            if (!hit) return "No city found with that name. Check the spelling or try a nearby city.";
            ws.weather = { city: hit.name, lat: hit.latitude, lon: hit.longitude, cache: null };
            await fetchWeather();
            await save("weather");
            renderWidgets();
          } catch (_) {
            return "Couldn't reach the weather service. Check your connection and try again.";
          }
        },
      });
    el.addEventListener("click", edit);
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        edit();
      }
    });
    return el;
  }

  /* ---------- GitHub Widget ---------- */

  function formatContributionDate(dateStr) {
    if (!dateStr) return "";
    try {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch (_) {
      return dateStr;
    }
  }

  async function fetchGitHubContributions(username) {
    const cleanUser = username.trim().replace(/^@/, "");
    if (!cleanUser) throw new Error("Please enter a GitHub username.");

    // 1. Primary: JSON API
    try {
      const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(cleanUser)}?y=last`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.contributions) && data.contributions.length > 0) {
          return {
            username: cleanUser,
            total: data.total && typeof data.total.lastYear === "number" ? data.total.lastYear : null,
            contributions: data.contributions,
            at: Date.now(),
          };
        }
      }
      if (res.status === 400 || res.status === 404) {
        throw new Error(`GitHub user "${cleanUser}" not found.`);
      }
    } catch (apiErr) {
      if (apiErr.message && apiErr.message.includes("not found")) throw apiErr;
    }

    // 2. Fallback: Direct GitHub HTML scrape
    try {
      const res = await fetch(`https://github.com/users/${encodeURIComponent(cleanUser)}/contributions`);
      if (!res.ok) {
        if (res.status === 404) throw new Error(`GitHub user "${cleanUser}" not found.`);
        throw new Error("Could not reach GitHub.");
      }
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const dayCells = doc.querySelectorAll("td[data-date]");
      if (dayCells.length === 0) throw new Error(`No contribution data found for "${cleanUser}".`);

      const contributions = [];
      dayCells.forEach((td) => {
        const date = td.getAttribute("data-date");
        const level = parseInt(td.getAttribute("data-level") || "0", 10);
        const id = td.id;
        let count = level > 0 ? 1 : 0;
        if (id) {
          const tooltip = doc.querySelector(`tool-tip[for="${id}"]`);
          if (tooltip) {
            const m = tooltip.textContent.match(/(\d+)\s+contribution/);
            if (m) count = parseInt(m[1], 10);
          }
        }
        contributions.push({ date, level, count });
      });

      let total = null;
      const totalEl = doc.querySelector(".js-yearly-contributions h2");
      if (totalEl) {
        const m = totalEl.textContent.replace(/,/g, "").match(/(\d+)/);
        if (m) total = parseInt(m[1], 10);
      }

      return {
        username: cleanUser,
        total,
        contributions,
        at: Date.now(),
      };
    } catch (fallbackErr) {
      throw fallbackErr;
    }
  }

  function get16WeekSlice(contributions) {
    if (!contributions || contributions.length === 0) return [];
    const lastItem = contributions[contributions.length - 1];
    const [y, m, d] = (lastItem.date || "").split("-").map(Number);
    const lastDate = !isNaN(y) ? new Date(y, m - 1, d) : new Date();
    const dayOfWeek = lastDate.getDay(); // 0 = Sun ... 6 = Sat

    // 15 full weeks (105 days) + (dayOfWeek + 1) days of current week
    const neededPastDays = 15 * 7 + (dayOfWeek + 1);
    const slice = contributions.slice(-neededPastDays);

    const futureDaysCount = 6 - dayOfWeek;
    const result = slice.slice();
    for (let i = 0; i < futureDaysCount; i++) {
      result.push({ empty: true });
    }

    while (result.length < 112) {
      result.unshift({ date: "", count: 0, level: 0 });
    }
    return result.slice(-112);
  }

  function renderGitHubGrid(contributions) {
    const wrap = node("div", "gh-grid-wrap");
    const grid = node("div", "gh-grid");
    const slice = get16WeekSlice(contributions);

    slice.forEach((item) => {
      const cell = node("div", "gh-cell");
      if (item.empty) {
        cell.classList.add("gh-empty");
      } else {
        const lvl = typeof item.level === "number" ? Math.min(Math.max(item.level, 0), 4) : 0;
        cell.dataset.level = String(lvl);
        const count = item.count || 0;
        const countStr = count === 0 ? "No contributions" : `${count} contribution${count > 1 ? "s" : ""}`;
        cell.title = `${countStr} on ${formatContributionDate(item.date)}`;
      }
      grid.appendChild(cell);
    });

    wrap.appendChild(grid);
    return wrap;
  }

  function renderGitHubLoading() {
    const wrap = node("div", "gh-grid-wrap gh-loading");
    const grid = node("div", "gh-grid");
    for (let i = 0; i < 112; i++) {
      const cell = node("div", "gh-cell");
      cell.dataset.level = "0";
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function renderGitHubPreview() {
    const wrap = node("div", "gh-grid-wrap gh-preview");
    const grid = node("div", "gh-grid");
    const demoLevels = [
      0, 1, 0, 0, 0, 0, 1,
      0, 2, 4, 3, 1, 2, 4,
      4, 3, 2, 2, 1, 3, 3,
      2, 2, 1, 1, 2, 3, 2,
      3, 1, 0, 1, 0, 1, 2,
      0, 0, 0, 0, 1, 1, 2,
      1, 2, 0, 0, 3, 2, 1,
      2, 1, 0, 0, 2, 1, 3,
      2, 0, 3, 3, 1, 2, 0,
      3, 1, 2, 2, 2, 3, 4,
      1, 2, 1, 1, 0, 2, 2,
      0, 0, 1, 0, 1, 1, 1,
      2, 1, 0, 3, 2, 4, 2,
      1, 2, 1, 2, 1, 0, 3,
      3, 2, 2, 1, 0, 2, 3,
      1, 2, 1, 0, 2, 1
    ];
    for (let i = 0; i < 112; i++) {
      const cell = node("div", "gh-cell");
      if (i >= 111) {
        cell.classList.add("gh-empty");
      } else {
        cell.dataset.level = String(demoLevels[i % demoLevels.length]);
      }
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);

    const overlay = node("div", "gh-overlay");
    const btn = node("div", "gh-prompt-btn");
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg><span>Set GitHub username</span>`;
    overlay.appendChild(btn);
    wrap.appendChild(overlay);

    return wrap;
  }

  function editGitHubUser() {
    openForm({
      title: "GitHub widget",
      submitLabel: "Save & Show Contributions",
      fields: [
        {
          label: "GitHub username",
          value: ws.github.username || "",
          placeholder: "e.g. torvalds",
          maxLength: 39,
        },
        {
          label: "Card style",
          type: "select",
          value: ws.github.theme || "light",
          options: [
            { value: "light", label: "iOS White (Default)" },
            { value: "dark", label: "GitHub Dark" },
            { value: "glass", label: "Oasis Glass" },
          ],
        },
      ],
      onSubmit: async ([username, theme]) => {
        if (!username) return "Please enter a GitHub username.";
        try {
          const data = await fetchGitHubContributions(username);
          ws.github = {
            username: data.username,
            theme: theme || "light",
            cache: data,
          };
          await save("github");
          renderWidgets();
          showToast(`Connected to @${data.username}`);
        } catch (err) {
          return err.message || "Could not fetch GitHub contributions. Check username.";
        }
      },
    });
  }

  function buildGitHub() {
    const themeClass = ws.github.theme === "dark" ? "gh-theme-dark" : ws.github.theme === "glass" ? "gh-theme-glass" : "gh-theme-light";
    const el = widgetShell("github", `widget-github ${themeClass}`);
    el.setAttribute("role", "button");
    el.tabIndex = 0;

    const username = ws.github.username;

    // Edit button in top-right next to remove button
    const editBtn = node("button", "gh-edit-btn");
    editBtn.type = "button";
    editBtn.setAttribute("aria-label", "Configure GitHub widget");
    editBtn.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      editGitHubUser();
    });
    el.appendChild(editBtn);

    if (!username) {
      el.setAttribute("aria-label", "GitHub widget: Click to connect your GitHub profile");
      el.appendChild(renderGitHubPreview());
      el.addEventListener("click", editGitHubUser);
      return el;
    }

    el.setAttribute("aria-label", `GitHub contributions for @${username}. Click to open profile.`);
    el.addEventListener("click", (e) => {
      if (e.target.closest(".widget-remove") || e.target.closest(".gh-edit-btn")) return;
      window.open(`https://github.com/${encodeURIComponent(username)}`, "_blank", "noopener,noreferrer");
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        if (e.target === el) {
          e.preventDefault();
          window.open(`https://github.com/${encodeURIComponent(username)}`, "_blank", "noopener,noreferrer");
        }
      }
    });

    // Top-left discreet badge on hover
    const badge = node("div", "gh-badge");
    badge.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg><span>${username}</span>`;
    el.appendChild(badge);

    const cache = ws.github.cache;
    if (cache && Array.isArray(cache.contributions) && cache.username && cache.username.toLowerCase() === username.toLowerCase()) {
      el.appendChild(renderGitHubGrid(cache.contributions));
    } else {
      el.appendChild(renderGitHubLoading());
    }

    if (!cache || !cache.username || cache.username.toLowerCase() !== username.toLowerCase() || Date.now() - (cache.at || 0) > GITHUB_TTL) {
      fetchGitHubContributions(username)
        .then((data) => {
          ws.github.cache = data;
          save("github");
          const current = container.querySelector(`.widget-github[data-id="github"]`);
          if (current) {
            const grid = current.querySelector(".gh-grid-wrap");
            if (grid) grid.replaceWith(renderGitHubGrid(data.contributions));
          }
        })
        .catch((err) => {
          const current = container.querySelector(`.widget-github[data-id="github"]`);
          if (current) {
            const hasGrid = current.querySelector(".gh-grid:not(.gh-loading .gh-grid)");
            if (!hasGrid) {
              const grid = current.querySelector(".gh-grid-wrap");
              const errEl = node("div", "gh-error");
              errEl.append(
                node("span", "gh-err-text", err.message || "Failed to load contributions"),
                node("button", "btn ghost gh-err-btn", "Retry")
              );
              errEl.querySelector("button").addEventListener("click", (e) => {
                e.stopPropagation();
                renderWidgets();
              });
              if (grid) grid.replaceWith(errEl);
            }
          }
        });
    }

    return el;
  }

  /* ---------- Quick copy ---------- */

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard");
    } catch (_) {
      showToast("Couldn't copy. Allow clipboard access and try again.");
    }
  }

  function buildQuickCopy() {
    const el = widgetShell("quickcopy", "widget-quickcopy");

    const head = node("header", "qc-head");
    head.appendChild(node("h3", "", "Quick copy"));
    const add = node("button", "qc-add", "+");
    add.type = "button";
    add.setAttribute("aria-label", "Add snippet");
    add.addEventListener("click", () =>
      openForm({
        title: "Add snippet",
        submitLabel: "Add snippet",
        fields: [{ label: "Text to copy", multiline: true, maxLength: 500, placeholder: "Email, address, canned reply…" }],
        onSubmit: async ([text]) => {
          if (!text) return "Enter the text you want to copy.";
          ws.snippets = [...ws.snippets, { id: uid("sn"), text }];
          await save("snippets");
          renderWidgets();
        },
      })
    );
    head.appendChild(add);
    el.appendChild(head);

    if (!ws.snippets.length) {
      el.appendChild(node("p", "empty", "Nothing saved yet. Press + to add text you paste often."));
      return el;
    }

    const list = node("ul", "qc-list");
    ws.snippets.forEach((snippet) => {
      const item = node("li", "qc-item");
      const copy = node("button", "qc-copy", snippet.text);
      copy.type = "button";
      copy.title = "Copy";
      copy.addEventListener("click", () => copyText(snippet.text));
      const remove = node("button", "qc-remove");
      remove.type = "button";
      remove.setAttribute("aria-label", "Delete snippet");
      remove.innerHTML = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      remove.addEventListener("click", async () => {
        ws.snippets = ws.snippets.filter((s) => s.id !== snippet.id);
        await save("snippets");
        renderWidgets();
      });
      item.append(copy, remove);
      list.appendChild(item);
    });
    el.appendChild(list);
    return el;
  }

  /* ---------- Notes ---------- */

  function buildNotes() {
    const el = widgetShell("notes", "widget-notes");
    el.appendChild(node("h3", "", "Notes"));
    const area = node("textarea", "notes-area");
    area.placeholder = "Write something down…";
    area.setAttribute("aria-label", "Notes");
    area.value = ws.notes;
    let timer = null;
    area.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        ws.notes = area.value;
        save("notes");
      }, 400);
    });
    area.addEventListener("blur", () => {
      clearTimeout(timer);
      ws.notes = area.value;
      save("notes");
    });
    el.appendChild(area);
    return el;
  }

  /* ---------- Folder ---------- */

  function buildFolder() {
    const el = widgetShell("folder", "widget-folder widget-action");
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    el.setAttribute("aria-label", `${ws.folder.name} folder. Open.`);

    const mini = node("div", "folder-mini");
    ws.folder.links.slice(0, 4).forEach((link) => mini.appendChild(favicon(link.url, link.name)));
    el.append(mini, node("div", "folder-name", ws.folder.name));

    el.addEventListener("click", openFolder);
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openFolder();
      }
    });
    return el;
  }

  function openFolder() {
    const dialog = node("dialog", "modal glass folder-dialog");
    const body = node("div", "modal-form");

    const title = node("h2", "", ws.folder.name);
    const grid = node("ul", "folder-grid");
    const form = node("form", "folder-add");
    form.autocomplete = "off";
    const nameInput = node("input");
    nameInput.placeholder = "Name";
    nameInput.maxLength = 24;
    nameInput.required = true;
    nameInput.setAttribute("aria-label", "Shortcut name");
    const urlInput = node("input");
    urlInput.placeholder = "Address";
    urlInput.required = true;
    urlInput.setAttribute("aria-label", "Shortcut address");
    const addBtn = node("button", "btn solid", "Add");
    addBtn.type = "submit";
    form.append(nameInput, urlInput, addBtn);

    const error = node("p", "form-error");
    error.setAttribute("role", "alert");
    error.hidden = true;

    const actions = node("div", "modal-actions");
    const rename = node("button", "btn ghost", "Rename folder");
    rename.type = "button";
    const close = node("button", "btn ghost", "Close");
    close.type = "button";
    close.addEventListener("click", () => dialog.close());
    actions.append(rename, close);

    function renderGrid() {
      grid.replaceChildren();
      if (!ws.folder.links.length) {
        grid.appendChild(node("li", "empty", "This folder is empty. Add a shortcut below."));
        return;
      }
      ws.folder.links.forEach((link) => {
        const item = node("li", "folder-item");
        const anchor = node("a", "folder-link");
        anchor.href = link.url;
        anchor.rel = "noopener";
        anchor.append(favicon(link.url, link.name), node("span", "link-label", link.name));
        const remove = node("button", "link-remove");
        remove.type = "button";
        remove.setAttribute("aria-label", `Remove ${link.name}`);
        remove.innerHTML = `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        remove.addEventListener("click", async () => {
          ws.folder.links = ws.folder.links.filter((l) => l.id !== link.id);
          await save("folder");
          renderGrid();
          renderWidgets();
        });
        item.append(anchor, remove);
        grid.appendChild(item);
      });
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const url = normalizeUrl(urlInput.value);
      if (!url) {
        error.textContent = "Enter a valid web address, like notion.so or https://example.com.";
        error.hidden = false;
        return;
      }
      error.hidden = true;
      ws.folder.links = [...ws.folder.links, { id: uid("fl"), name: nameInput.value.trim(), url }];
      form.reset();
      await save("folder");
      renderGrid();
      renderWidgets();
      nameInput.focus();
    });

    rename.addEventListener("click", () => {
      dialog.close();
      openForm({
        title: "Rename folder",
        submitLabel: "Rename",
        fields: [{ label: "Folder name", value: ws.folder.name, maxLength: 20 }],
        onSubmit: async ([name]) => {
          if (!name) return "Enter a folder name.";
          ws.folder.name = name;
          await save("folder");
          renderWidgets();
        },
      });
    });

    dialog.addEventListener("close", () => dialog.remove());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });

    renderGrid();
    body.append(title, grid, form, error, actions);
    dialog.appendChild(body);
    document.body.appendChild(dialog);
    dialog.showModal();
  }

  /* ---------- Spotify Widget ---------- */

  /* --- PKCE helpers --- */
  function spRandBytes(n) {
    return crypto.getRandomValues(new Uint8Array(n));
  }
  function spB64url(buf) {
    return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }
  async function spCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return spB64url(new Uint8Array(digest));
  }

  /* --- Token storage (localStorage, no server needed) --- */
  const SP_KEY = "sp_";
  const spStore = {
    get: (k) => localStorage.getItem(SP_KEY + k),
    set: (k, v) => localStorage.setItem(SP_KEY + k, v),
    del: (k) => localStorage.removeItem(SP_KEY + k),
  };

  function spToken() { return spStore.get("access_token"); }
  function spExpiry() { return Number(spStore.get("expires_at") || 0); }
  function spRefresh() { return spStore.get("refresh_token"); }
  function spClientId() { return spStore.get("client_id"); }
  function spRedirectUri() {
    if (typeof chrome !== "undefined" && chrome.identity && typeof chrome.identity.getRedirectURL === "function") {
      return chrome.identity.getRedirectURL();
    }
    const extId = (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) ? chrome.runtime.id : "YOUR_EXTENSION_ID";
    return `https://${extId}.chromiumapp.org/`;
  }

  function spIsExpired() { return Date.now() > spExpiry() - 30_000; }

  async function spRefreshToken() {
    const clientId = spClientId();
    const refreshToken = spRefresh();
    if (!clientId || !refreshToken) return false;
    try {
      const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
        }),
      });
      if (!res.ok) {
        if (res.status === 400 || res.status === 401) {
          spLogout();
        }
        return false;
      }
      const data = await res.json();
      if (data.access_token) {
        spStore.set("access_token", data.access_token);
        spStore.set("expires_at", Date.now() + (data.expires_in || 3600) * 1000);
        if (data.refresh_token) spStore.set("refresh_token", data.refresh_token);
        return true;
      }
    } catch (_) { /* network issue */ }
    return false;
  }

  async function spEnsureToken() {
    if (!spToken()) return false;
    if (spIsExpired()) return await spRefreshToken();
    return true;
  }

  async function spAPI(method, path, body) {
    if (!await spEnsureToken()) return null;
    const opts = {
      method,
      headers: { Authorization: `Bearer ${spToken()}` },
    };
    if (body) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(`https://api.spotify.com/v1${path}`, opts);
    } catch (_) {
      return null;
    }
    if (res.status === 204 || res.status === 202) return {};
    if (res.status === 401) {
      // Access token may have expired prematurely; try refresh once
      const ok = await spRefreshToken();
      if (ok) {
        opts.headers.Authorization = `Bearer ${spToken()}`;
        try {
          res = await fetch(`https://api.spotify.com/v1${path}`, opts);
          if (res.status === 204 || res.status === 202) return {};
          if (!res.ok) return null;
          return res.json().catch(() => null);
        } catch (_) {
          return null;
        }
      }
      return null;
    }
    if (res.status === 403) {
      if (typeof showToast === "function") {
        showToast("Spotify Premium required for playback controls");
      }
      return null;
    }
    if (res.status === 404) {
      if (typeof showToast === "function") {
        showToast("No active Spotify playback device found");
      }
      return null;
    }
    if (!res.ok) return null;
    return res.json().catch(() => null);
  }

  /* --- Auth flow using chrome.identity --- */
  function spConnect(clientId, statusEl) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.identity || !chrome.identity.launchWebAuthFlow) {
        if (statusEl) statusEl.textContent = "chrome.identity API unavailable. Load extension in Chrome.";
        resolve(false);
        return;
      }

      spStore.set("client_id", clientId);
      const verifier = spB64url(spRandBytes(48));
      spCodeChallenge(verifier).then(async (challenge) => {
        spStore.set("verifier", verifier);
        const redirectUri = spRedirectUri();
        const scopes = [
          "user-read-playback-state",
          "user-modify-playback-state",
          "user-read-currently-playing",
        ].join(" ");
        const params = new URLSearchParams({
          client_id: clientId,
          response_type: "code",
          redirect_uri: redirectUri,
          code_challenge_method: "S256",
          code_challenge: challenge,
          scope: scopes,
        });

        const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
        if (statusEl) statusEl.textContent = "Waiting for Spotify authorization…";

        chrome.identity.launchWebAuthFlow(
          { url: authUrl, interactive: true },
          async (responseUrl) => {
            if (chrome.runtime.lastError || !responseUrl) {
              const err = chrome.runtime.lastError ? chrome.runtime.lastError.message : "Sign-in cancelled.";
              if (statusEl) {
                statusEl.textContent = (err.includes("cancel") || err.includes("closed"))
                  ? "Sign-in was cancelled."
                  : `Sign-in error: ${err}`;
              }
              resolve(false);
              return;
            }

            try {
              const urlObj = new URL(responseUrl);
              const authError = urlObj.searchParams.get("error");
              if (authError) {
                if (statusEl) {
                  statusEl.textContent = authError === "access_denied"
                    ? "Permission was denied in Spotify."
                    : `Spotify error: ${authError}`;
                }
                resolve(false);
                return;
              }

              const code = urlObj.searchParams.get("code");
              if (!code) {
                if (statusEl) statusEl.textContent = "No authorization code received.";
                resolve(false);
                return;
              }

              if (statusEl) statusEl.textContent = "Connecting to Spotify…";
              const storedVerifier = spStore.get("verifier");
              const res = await fetch("https://accounts.spotify.com/api/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                  grant_type: "authorization_code",
                  code,
                  redirect_uri: redirectUri,
                  client_id: clientId,
                  code_verifier: storedVerifier,
                }),
              });

              const data = await res.json();
              if (data.access_token) {
                spStore.set("access_token", data.access_token);
                spStore.set("refresh_token", data.refresh_token || "");
                spStore.set("expires_at", Date.now() + (data.expires_in || 3600) * 1000);
                spStore.del("verifier");
                spRenderAll();
                spFetch();
                resolve(true);
              } else {
                const desc = data.error_description || data.error || "Token exchange failed";
                if (statusEl) statusEl.textContent = desc;
                resolve(false);
              }
            } catch (_) {
              if (statusEl) statusEl.textContent = "Network error during authentication.";
              resolve(false);
            }
          }
        );
      }).catch(() => {
        if (statusEl) statusEl.textContent = "PKCE challenge generation failed.";
        resolve(false);
      });
    });
  }

  function spLogout() {
    clearTimeout(spPollTimer);
    ["access_token", "refresh_token", "expires_at", "verifier"].forEach(k => spStore.del(k));
    spState = null;
    spRenderAll();
  }

  /* --- Playback state --- */
  let spState = null;  // cached /me/player response
  let spPollTimer = null;

  async function spFetch() {
    if (!spToken() || !ws.widgets.includes("spotify")) return;
    const data = await spAPI("GET", "/me/player?additional_types=track");
    spState = data;
    spRenderAll();
    spSchedulePoll();
  }

  function spSchedulePoll() {
    clearTimeout(spPollTimer);
    if (!spToken() || !ws.widgets.includes("spotify")) return;
    const interval = (spState && spState.is_playing) ? 3000 : 10000;
    spPollTimer = setTimeout(spFetch, interval);
  }

  function spFmtTime(ms) {
    if (!ms && ms !== 0) return "0:00";
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  /* --- Playback controls --- */
  async function spTogglePlay() {
    if (!spState) return;
    const playing = spState.is_playing;
    await spAPI("PUT", playing ? "/me/player/pause" : "/me/player/play");
    if (spState) spState.is_playing = !playing;
    spRenderAll();
    setTimeout(spFetch, 800);
  }

  async function spSkipNext() {
    await spAPI("POST", "/me/player/next");
    setTimeout(spFetch, 800);
  }

  async function spSkipPrev() {
    await spAPI("POST", "/me/player/previous");
    setTimeout(spFetch, 800);
  }

  async function spToggleShuffle() {
    if (!spState) return;
    const next = !spState.shuffle_state;
    await spAPI("PUT", `/me/player/shuffle?state=${next}`);
    if (spState) spState.shuffle_state = next;
    spRenderAll();
  }

  async function spCycleRepeat() {
    if (!spState) return;
    const modes = ["off", "context", "track"];
    const cur = modes.indexOf(spState.repeat_state);
    const next = modes[(cur + 1) % modes.length];
    await spAPI("PUT", `/me/player/repeat?state=${next}`);
    if (spState) spState.repeat_state = next;
    spRenderAll();
  }

  async function spSeek(ms) {
    await spAPI("PUT", `/me/player/seek?position_ms=${Math.round(ms)}`);
  }

  async function spSetVolume(pct) {
    await spAPI("PUT", `/me/player/volume?volume_percent=${Math.round(pct)}`);
  }

  /* --- SVG icons (reused across states) --- */
  function spIcoPlay() { return `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M6 4l14 8-14 8V4z" fill="currentColor"/></svg>`; }
  function spIcoPause() { return `<svg viewBox="0 0 24 24" width="22" height="22"><rect x="5" y="3" width="4" height="18" rx="1" fill="currentColor"/><rect x="15" y="3" width="4" height="18" rx="1" fill="currentColor"/></svg>`; }
  function spIcoShuffle() { return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20l16-16M16 20h5v-5M4 4l7 7"/></svg>`; }
  function spIcoPrev() { return `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M6 6h2v12H6V6zm3.5 6 9-6v12l-9-6z"/></svg>`; }
  function spIcoNext() { return `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M18 6h-2v12h2V6zm-3.5 6-9-6v12l9-6z"/></svg>`; }
  function spIcoRepeat() { return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`; }
  function spIcoRepeat1() { return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="10.5" y="14.5" font-size="6.5" fill="currentColor" stroke="none" font-weight="700">1</text></svg>`; }
  function spIcoVol() { return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 5 6 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>`; }
  function spIcoSpotify() { return `<svg viewBox="0 0 24 24" width="14" height="14" fill="#1db954"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 1 1-.277-1.215c3.809-.87 7.076-.496 9.712 1.115a.623.623 0 0 1 .207.857zm1.223-2.722a.779.779 0 0 1-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 0 1-.973-.519.781.781 0 0 1 .52-.972c3.632-1.102 8.147-.568 11.233 1.328a.78.78 0 0 1 .257 1.072zm.105-2.835c-3.223-1.914-8.54-2.09-11.618-1.156a.935.935 0 1 1-.543-1.79c3.532-1.072 9.404-.865 13.115 1.338a.936.936 0 0 1-.954 1.608z"/></svg>`; }

  /* --- Build widget DOM --- */
  function buildSpotify() {
    const el = widgetShell("spotify", "widget-spotify");

    if (!spToken()) {
      // ---- Not connected — show connect screen ----
      const screen = node("div", "sp-connect-screen");

      // Header row
      const header = node("div", "sp-connect-header");
      const logo = node("span", "sp-logo-mini");
      logo.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="#1db954"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 1 1-.277-1.215c3.809-.87 7.076-.496 9.712 1.115a.623.623 0 0 1 .207.857zm1.223-2.722a.779.779 0 0 1-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 0 1-.973-.519.781.781 0 0 1 .52-.972c3.632-1.102 8.147-.568 11.233 1.328a.78.78 0 0 1 .257 1.072zm.105-2.835c-3.223-1.914-8.54-2.09-11.618-1.156a.935.935 0 1 1-.543-1.79c3.532-1.072 9.404-.865 13.115 1.338a.936.936 0 0 1-.954 1.608z"/></svg>`;
      const title = node("span", "sp-connect-title", "Connect Spotify");
      header.append(logo, title);

      // Redirect URI copy row
      const redirectUri = spRedirectUri();
      const redirectRow = node("div", "sp-redirect-row");
      const copyBtn = node("button", "sp-copy-uri-btn", "📋 Copy Redirect URI");
      copyBtn.type = "button";
      copyBtn.title = redirectUri;
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(redirectUri);
        copyBtn.textContent = "✓ Copied URI!";
        setTimeout(() => { copyBtn.textContent = "📋 Copy Redirect URI"; }, 1500);
      });

      const dashLink = node("a", "sp-dash-link", "Dashboard ↗");
      dashLink.href = "https://developer.spotify.com/dashboard";
      dashLink.target = "_blank";
      dashLink.rel = "noopener";
      redirectRow.append(copyBtn, dashLink);

      // Input wrap
      const inputWrap = node("div", "sp-input-wrap");
      const clientInput = node("input", "sp-client-input");
      clientInput.type = "text";
      clientInput.placeholder = "Paste Client ID here…";
      clientInput.spellcheck = false;
      clientInput.value = spClientId() || "";
      inputWrap.appendChild(clientInput);

      // Connect button and status
      const connectBtn = node("button", "sp-connect-btn", "Connect with Spotify");
      const statusEl = node("div", "sp-status-msg");

      connectBtn.addEventListener("click", async () => {
        const id = clientInput.value.trim();
        if (!id) {
          clientInput.focus();
          statusEl.textContent = "Please enter your Client ID.";
          return;
        }
        connectBtn.disabled = true;
        connectBtn.textContent = "Connecting…";
        statusEl.textContent = "";
        await spConnect(id, statusEl);
        connectBtn.disabled = false;
        connectBtn.textContent = "Connect with Spotify";
      });

      clientInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") connectBtn.click();
      });

      screen.append(header, redirectRow, inputWrap, connectBtn, statusEl);
      el.appendChild(screen);
      return el;
    }

    // ---- Connected — show player ----
    const player = node("div", "sp-player");

    // Album art
    const artWrap = node("div", "sp-art-wrap");
    const artImg = document.createElement("img");
    artImg.className = "sp-art-img";
    artImg.alt = "Album art";
    artImg.src = "";
    const artPlaceholder = node("div", "sp-art-placeholder");
    artPlaceholder.innerHTML = spIcoSpotify().replace('width="14" height="14"', 'width="36" height="36"');
    artWrap.append(artPlaceholder, artImg);

    // Track info
    const info = node("div", "sp-info");
    const titleWrap = node("div", "sp-title-wrap");
    const titleInner = node("div", "sp-title-inner");
    const title = node("span", "sp-title", "Nothing playing");
    titleInner.appendChild(title);
    titleWrap.appendChild(titleInner);
    const artist = node("div", "sp-artist", "Open Spotify to start listening");
    const album = node("div", "sp-album", "");
    info.append(titleWrap, artist, album);

    // Top row
    const topRow = node("div", "sp-top");
    topRow.append(artWrap, info);

    // Progress bar
    const progWrap = node("div", "sp-prog-wrap");
    const progBar = node("div", "sp-prog-bar");
    const progFill = node("div", "sp-prog-fill");
    progBar.appendChild(progFill);
    const times = node("div", "sp-times");
    const tCur = node("span", "sp-cur", "0:00");
    const tDur = node("span", "sp-dur", "0:00");
    times.append(tCur, tDur);
    progWrap.append(progBar, times);

    progBar.addEventListener("click", async (e) => {
      if (!spState || !spState.item) return;
      const rect = progBar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      await spSeek(pct * spState.item.duration_ms);
      setTimeout(spFetch, 500);
    });

    // Controls row
    const controls = node("div", "sp-controls");

    const shufBtn = node("button", "sp-btn sp-shuffle");
    shufBtn.setAttribute("aria-label", "Shuffle");
    shufBtn.innerHTML = spIcoShuffle();
    shufBtn.addEventListener("click", spToggleShuffle);

    const prevBtn = node("button", "sp-btn");
    prevBtn.setAttribute("aria-label", "Previous");
    prevBtn.innerHTML = spIcoPrev();
    prevBtn.addEventListener("click", spSkipPrev);

    const playBtn = node("button", "sp-btn sp-play-btn");
    playBtn.setAttribute("aria-label", "Play / Pause");
    playBtn.innerHTML = spIcoPlay();
    playBtn.addEventListener("click", spTogglePlay);

    const nextBtn = node("button", "sp-btn");
    nextBtn.setAttribute("aria-label", "Next");
    nextBtn.innerHTML = spIcoNext();
    nextBtn.addEventListener("click", spSkipNext);

    const repBtn = node("button", "sp-btn sp-repeat");
    repBtn.setAttribute("aria-label", "Repeat");
    repBtn.innerHTML = spIcoRepeat();
    repBtn.addEventListener("click", spCycleRepeat);

    controls.append(shufBtn, prevBtn, playBtn, nextBtn, repBtn);

    // Volume row
    const volRow = node("div", "sp-vol-row");
    const volIcon = node("span", "sp-vol-icon");
    volIcon.innerHTML = spIcoVol();
    const volSlider = document.createElement("input");
    volSlider.type = "range";
    volSlider.min = "0";
    volSlider.max = "100";
    volSlider.step = "1";
    volSlider.value = spState?.device?.volume_percent ?? "50";
    volSlider.className = "sp-vol-slider";
    volSlider.setAttribute("aria-label", "Volume");
    let volDebounce = null;
    volSlider.addEventListener("input", () => {
      clearTimeout(volDebounce);
      volDebounce = setTimeout(() => spSetVolume(Number(volSlider.value)), 300);
    });
    volRow.append(volIcon, volSlider);

    // Footer: Spotify branding + logout
    const footer = node("div", "sp-footer");
    const brand = node("span", "sp-brand");
    brand.innerHTML = spIcoSpotify() + " Spotify";
    const logoutBtn = node("button", "sp-logout", "Disconnect");
    logoutBtn.addEventListener("click", () => {
      clearTimeout(spPollTimer);
      spLogout();
    });
    footer.append(brand, logoutBtn);

    player.append(topRow, progWrap, controls, volRow, footer);
    el.appendChild(player);

    // Store refs for spRenderAll updates
    el._spRefs = {
      artImg, artPlaceholder, title, titleInner, artist, album,
      progFill, tCur, tDur, playBtn, shufBtn, repBtn, volSlider
    };

    spRenderState(el);
    return el;
  }

  /* --- Update the player UI from spState --- */
  function spRenderState(el) {
    if (!el || !el._spRefs) return;
    const r = el._spRefs;
    const s = spState;
    const item = s && s.item;

    // Album art
    if (item && item.album && item.album.images && item.album.images.length) {
      const imgUrl = item.album.images[1]?.url || item.album.images[0].url;
      if (r.artImg.src !== imgUrl) {
        r.artImg.src = imgUrl;
        r.artImg.onload = () => { r.artImg.style.opacity = "1"; r.artPlaceholder.style.opacity = "0"; };
        r.artImg.onerror = () => { r.artImg.style.opacity = "0"; r.artPlaceholder.style.opacity = "1"; };
      }
    } else {
      r.artImg.style.opacity = "0";
      r.artPlaceholder.style.opacity = "1";
    }

    // Track / artist / album
    r.title.textContent = item ? item.name : "Nothing playing";
    r.artist.textContent = item ? item.artists.map(a => a.name).join(", ") : "Open Spotify to start listening";
    r.album.textContent = item ? item.album.name : "";

    // Scroll long titles
    const overflowing = r.titleInner.scrollWidth > r.titleInner.offsetWidth + 2;
    r.titleInner.classList.toggle("sp-scroll", overflowing);

    // Progress
    const dur = item ? item.duration_ms : 0;
    const pos = s ? s.progress_ms : 0;
    const pct = dur ? (pos / dur) * 100 : 0;
    r.progFill.style.width = pct + "%";
    r.tCur.textContent = spFmtTime(pos);
    r.tDur.textContent = spFmtTime(dur);

    // Play/Pause icon
    r.playBtn.innerHTML = (s && s.is_playing) ? spIcoPause() : spIcoPlay();
    el.classList.toggle("sp-playing", !!(s && s.is_playing));

    // Shuffle
    r.shufBtn.classList.toggle("sp-active", !!(s && s.shuffle_state));

    // Repeat
    const rep = s ? s.repeat_state : "off";
    r.repBtn.classList.toggle("sp-active", rep !== "off");
    r.repBtn.innerHTML = rep === "track" ? spIcoRepeat1() : spIcoRepeat();

    // Volume
    if (s && s.device && !r.volSlider.matches(":active"))
      r.volSlider.value = String(s.device.volume_percent ?? 50);
  }

  /* Re-render all spotify widgets on the page */
  function spRenderAll() {
    const el = container.querySelector(".widget-spotify");
    if (!el) return;
    // If login state changed, full rebuild
    const hasPlayer = !!el.querySelector(".sp-player");
    const hasConnect = !!el.querySelector(".sp-connect-screen");
    if ((spToken() && hasConnect) || (!spToken() && hasPlayer)) {
      renderWidgets();
      return;
    }
    spRenderState(el);
  }

  /* ---------- Render ---------- */

  const BUILDERS = {
    clock: buildClock,
    countdown: buildCountdown,
    weather: buildWeather,
    calendar: buildCalendar,
    github: buildGitHub,
    quickcopy: buildQuickCopy,
    notes: buildNotes,
    folder: buildFolder,
    spotify: buildSpotify,
  };

  function renderWidgets() {
    const fragment = document.createDocumentFragment();
    ws.widgets.forEach((id) => {
      if (BUILDERS[id]) fragment.appendChild(BUILDERS[id]());
    });
    container.replaceChildren(fragment);
    container.hidden = ws.widgets.length === 0;
    lastDayKey = dayKey(new Date());
  }

  async function setWidgetEnabled(id, enabled) {
    const has = ws.widgets.includes(id);
    if (enabled && !has) ws.widgets = [...ws.widgets, id];
    if (!enabled && has) {
      ws.widgets = ws.widgets.filter((w) => w !== id);
      if (id === "github") await storageSet({ github_dismissed: true });
    }
    renderWidgets();
    await save("widgets");
  }

  /* ---------- Widget gallery ---------- */

  function openGallery() {
    const dialog = node("dialog", "modal glass gallery");
    const body = node("div", "modal-form");
    body.appendChild(node("h2", "", "Widgets"));
    const list = node("ul", "gallery-list");

    function renderList() {
      list.replaceChildren();
      Object.entries(WIDGET_DEFS).forEach(([id, def]) => {
        const enabled = ws.widgets.includes(id);
        const item = node("li", "gallery-item");
        const text = node("div", "gallery-text");
        text.append(node("strong", "", def.title), node("span", "", def.desc));
        const toggle = node("button", enabled ? "btn ghost" : "btn solid", enabled ? "Remove" : "Add");
        toggle.type = "button";
        toggle.addEventListener("click", async () => {
          await setWidgetEnabled(id, !enabled);
          renderList();
        });
        item.append(text, toggle);
        list.appendChild(item);
      });
    }

    const actions = node("div", "modal-actions");
    const done = node("button", "btn solid", "Done");
    done.type = "button";
    done.addEventListener("click", () => dialog.close());
    actions.appendChild(done);

    dialog.addEventListener("close", () => dialog.remove());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });

    renderList();
    body.append(list, actions);
    dialog.appendChild(body);
    document.body.appendChild(dialog);
    dialog.showModal();
  }

  /* ---------- Init ---------- */

  async function init() {
    try {
      const stored = await storageGet(["widgets", "countdown", "weather", "github", "snippets", "notes", "folder", "github_dismissed"]);
      if (Array.isArray(stored.widgets)) ws.widgets = stored.widgets.filter((id) => WIDGET_DEFS[id]);
      if (stored.countdown && typeof stored.countdown.date === "string") ws.countdown = stored.countdown;
      if (stored.weather && typeof stored.weather === "object") ws.weather = { ...ws.weather, ...stored.weather };
      if (stored.github && typeof stored.github === "object") ws.github = { ...ws.github, ...stored.github };
      if (Array.isArray(stored.snippets)) ws.snippets = stored.snippets;
      if (typeof stored.notes === "string") ws.notes = stored.notes;
      if (stored.folder && Array.isArray(stored.folder.links)) ws.folder = stored.folder;

      // Auto-include github widget for existing users who haven't dismissed it
      if (Array.isArray(stored.widgets) && !stored.widgets.includes("github") && !stored.github_dismissed) {
        ws.widgets.splice(0, 0, "github");
        save("widgets");
      }
    } catch (error) {
      console.error("Oasis: could not read widget settings.", error);
    }

    renderWidgets();

    // Start polling Spotify if already connected
    if (spToken() && ws.widgets.includes("spotify")) {
      spFetch();
    }

    document.getElementById("railWidgets").addEventListener("click", openGallery);
    document.getElementById("fabWidgets").addEventListener("click", openGallery);
    document.getElementById("railShortcut").addEventListener("click", openAddDialog);
    document.getElementById("railTime").addEventListener("click", async () => {
      await toggleClockFormat();
      updateClockWidget();
    });

    setInterval(() => {
      updateClockWidget();
      if (dayKey(new Date()) !== lastDayKey) renderWidgets();
    }, 1000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
