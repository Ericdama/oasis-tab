"use strict";

/* =========================================================
   Oasis — new tab logic
   ========================================================= */

/* ---------- Static data ---------- */

const SEARCH_ENGINES = {
  google: { name: "Google", url: "https://www.google.com/search?q=" },
  bing: { name: "Bing", url: "https://www.bing.com/search?q=" },
  duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
};

const DEFAULT_LINKS = [
  { id: "default-youtube", name: "YouTube", url: "https://www.youtube.com" },
  { id: "default-github", name: "GitHub", url: "https://github.com" },
  { id: "default-gmail", name: "Gmail", url: "https://mail.google.com" },
  { id: "default-reddit", name: "Reddit", url: "https://www.reddit.com" },
];

const unsplash = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=2400&q=80`;

const WALLPAPERS = [
  { name: "Tropical shore", src: unsplash("photo-1507525428034-b723cf961d3e") },
  { name: "Mountain sunrise", src: unsplash("photo-1469474968028-56623f02e42e") },
  { name: "Alpine lake", src: unsplash("photo-1506905925346-21bda4d32df4") },
  { name: "Quiet forest", src: unsplash("photo-1441974231531-c6227db76b6e") },
  { name: "Desert dunes", src: unsplash("photo-1473496169904-658ba7c44d8a") },
  { name: "Open ocean", src: unsplash("photo-1505118380757-91f5f5632de0") },
  { name: "Rolling mist", src: unsplash("photo-1470071459604-3b5ec3a7fe05") },
  { name: "Ocean wave", src: unsplash("photo-1518837695005-2083093ee35b") },
  { name: "Distant peaks", src: unsplash("photo-1477346611705-65d1883cee1e") },
];

const QUOTES = [
  "Breathe in calm, breathe out noise.",
  "Do one thing at a time, and do it gently.",
  "Nothing is as important as this moment.",
  "Slow progress is still progress.",
  "You don't have to see the whole staircase, just take the first step.",
  "Quiet the mind, and the soul will speak.",
  "Be where your feet are.",
  "Rest is productive too.",
  "Let go of what you can't control.",
  "Small steps, taken daily, move mountains.",
  "The present moment is the only one you can change.",
  "Clarity comes from stillness.",
  "Begin where you are, with what you have.",
  "Peace begins with a single deep breath.",
  "Simplicity is the ultimate sophistication.",
  "Choose calm over urgency.",
  "You are allowed to take your time.",
  "Notice the small things; they hold the day together.",
  "Focus on the next right thing.",
  "Energy flows where attention goes.",
  "Let the day unfold, not unravel.",
  "Gratitude turns what we have into enough.",
  "Stillness is where creativity rests.",
  "Today is a fresh page. Write it kindly.",
  "Keep your heart light and your mind clear.",
  "Patience is a quiet form of strength.",
  "Make space for what matters.",
  "Every sunrise is an invitation to begin again.",
  "Move with intention, not hurry.",
  "What you water grows.",
  "Silence is a source of great strength.",
];

/* Themes can swap in their own wallpapers and quotes (see theme.js). */
const wallpaperList = () => (window.oasisWallpapers && window.oasisWallpapers()) || WALLPAPERS;
const quoteList = () => (window.oasisQuotes && window.oasisQuotes()) || QUOTES;

const DEFAULT_STATE = {
  links: DEFAULT_LINKS,
  wallpaperIndex: 0,
  engine: "google",
  hour12: false,
};

/* ---------- Storage (chrome.storage.local, localStorage fallback for previewing the page outside Chrome) ---------- */

const hasChromeStorage =
  typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

async function storageGet(keys) {
  if (hasChromeStorage) {
    return chrome.storage.local.get(keys);
  }
  const result = {};
  keys.forEach((key) => {
    try {
      const raw = localStorage.getItem(`oasis:${key}`);
      if (raw !== null) result[key] = JSON.parse(raw);
    } catch (_) {
      /* ignore */
    }
  });
  return result;
}

async function storageSet(values) {
  if (hasChromeStorage) {
    return chrome.storage.local.set(values);
  }
  Object.entries(values).forEach(([key, value]) => {
    try {
      localStorage.setItem(`oasis:${key}`, JSON.stringify(value));
    } catch (_) {
      /* ignore */
    }
  });
}

/* ---------- State & elements ---------- */

const state = { ...DEFAULT_STATE };

const $ = (id) => document.getElementById(id);

const el = {
  clockButton: $("clock"),
  clockText: $("clockText"),
  clockSuffix: $("clockSuffix"),
  greeting: $("greeting"),
  quote: $("quote"),
  searchForm: $("searchForm"),
  searchInput: $("searchInput"),
  engine: $("engine"),
  engineBtn: $("engineBtn"),
  engineName: $("engineName"),
  engineMenu: $("engineMenu"),
  linksGrid: $("linksGrid"),
  addDialog: $("addDialog"),
  addForm: $("addForm"),
  linkName: $("linkName"),
  linkUrl: $("linkUrl"),
  formError: $("formError"),
  cancelAdd: $("cancelAdd"),
  nextWallpaper: $("nextWallpaper"),
  wallpaperName: $("wallpaperName"),
  wallpaperBack: $("wallpaperBack"),
  wallpaperFront: $("wallpaperFront"),
};

/* =========================================================
   Clock, greeting and quote
   ========================================================= */

const pad = (n) => String(n).padStart(2, "0");

function renderClock() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = pad(now.getMinutes());

  if (state.hour12) {
    const suffix = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    el.clockText.textContent = `${hours}:${minutes}`;
    el.clockSuffix.textContent = suffix;
  } else {
    el.clockText.textContent = `${pad(hours)}:${minutes}`;
    el.clockSuffix.textContent = "";
  }

  document.title = `${el.clockText.textContent}${el.clockSuffix.textContent ? " " + el.clockSuffix.textContent : ""}`;
  renderGreeting(now);
}

function getGreeting(date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Good night";
}

function renderGreeting(date) {
  const text = getGreeting(date);
  if (el.greeting.textContent !== text) el.greeting.textContent = text;
}

function getDailyQuote(date) {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - startOfYear) / 86400000);
  const pool = quoteList();
  return pool[dayOfYear % pool.length];
}

function refreshQuote() {
  el.quote.textContent = getDailyQuote(new Date());
}

function startClock() {
  renderClock();
  el.quote.textContent = getDailyQuote(new Date());

  const tick = () => {
    renderClock();
    setTimeout(tick, 1000 - (Date.now() % 1000));
  };
  setTimeout(tick, 1000 - (Date.now() % 1000));
}

async function toggleClockFormat() {
  state.hour12 = !state.hour12;
  renderClock();
  await storageSet({ hour12: state.hour12 });
}

/* =========================================================
   Search
   ========================================================= */

const DOMAIN_PATTERN =
  /^(?:localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}|\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?(?:[/?#]\S*)?$/i;

function looksLikeUrl(input) {
  if (/\s/.test(input)) return false;
  if (/^https?:\/\//i.test(input)) return true;
  return DOMAIN_PATTERN.test(input);
}

function resolveDestination(rawInput) {
  const input = rawInput.trim();
  if (!input) return null;

  if (looksLikeUrl(input)) {
    return /^https?:\/\//i.test(input) ? input : `https://${input}`;
  }
  return SEARCH_ENGINES[state.engine].url + encodeURIComponent(input);
}

function handleSearchSubmit(event) {
  event.preventDefault();
  const destination = resolveDestination(el.searchInput.value);
  if (destination) window.location.href = destination;
}

/* ---------- Engine selector ---------- */

function renderEngine() {
  el.engineName.textContent = SEARCH_ENGINES[state.engine].name;
  el.engineMenu.querySelectorAll("li").forEach((item) => {
    item.setAttribute("aria-selected", String(item.dataset.engine === state.engine));
  });
}

function setMenuOpen(open) {
  el.engineMenu.hidden = !open;
  el.engineBtn.setAttribute("aria-expanded", String(open));
}

async function selectEngine(key) {
  if (!SEARCH_ENGINES[key]) return;
  state.engine = key;
  renderEngine();
  setMenuOpen(false);
  el.searchInput.focus();
  await storageSet({ engine: key });
}

function initEngineMenu() {
  el.engineMenu.querySelectorAll("li").forEach((item) => {
    item.tabIndex = 0;
    item.addEventListener("click", () => selectEngine(item.dataset.engine));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectEngine(item.dataset.engine);
      }
    });
  });

  el.engineBtn.addEventListener("click", () => setMenuOpen(el.engineMenu.hidden));

  document.addEventListener("click", (event) => {
    if (!el.engine.contains(event.target)) setMenuOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el.engineMenu.hidden) {
      setMenuOpen(false);
      el.engineBtn.focus();
    }
  });
}

/* =========================================================
   Quick links
   ========================================================= */

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return "";
  }
}

function buildIcon(link) {
  const icon = document.createElement("span");
  icon.className = "link-icon";

  const letter = () => {
    const span = document.createElement("span");
    span.className = "letter";
    span.textContent = (link.name.trim()[0] || "?").toUpperCase();
    return span;
  };

  const host = getHostname(link.url);
  if (!host) {
    icon.appendChild(letter());
    return icon;
  }

  const img = document.createElement("img");
  img.alt = "";
  img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  img.addEventListener("error", () => img.replaceWith(letter()), { once: true });
  icon.appendChild(img);
  return icon;
}

function buildLinkItem(link) {
  const item = document.createElement("li");
  item.className = "link-item";

  const anchor = document.createElement("a");
  anchor.className = "link-anchor";
  anchor.href = link.url;
  anchor.rel = "noopener";

  const label = document.createElement("span");
  label.className = "link-label";
  label.textContent = link.name;

  anchor.append(buildIcon(link), label);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "link-remove";
  remove.setAttribute("aria-label", `Remove ${link.name}`);
  remove.innerHTML = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  remove.addEventListener("click", () => removeLink(link.id));

  item.append(anchor, remove);
  return item;
}

function buildAddItem() {
  const item = document.createElement("li");
  item.className = "link-item link-add";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "link-anchor";
  button.setAttribute("aria-label", "Add shortcut");

  const icon = document.createElement("span");
  icon.className = "link-icon";
  const plus = document.createElement("span");
  plus.className = "plus";
  plus.textContent = "+";
  icon.appendChild(plus);

  const label = document.createElement("span");
  label.className = "link-label";
  label.textContent = "Add";

  button.append(icon, label);
  button.addEventListener("click", openAddDialog);
  item.appendChild(button);
  return item;
}

function renderLinks() {
  const fragment = document.createDocumentFragment();
  state.links.forEach((link) => fragment.appendChild(buildLinkItem(link)));
  fragment.appendChild(buildAddItem());
  el.linksGrid.replaceChildren(fragment);
}

async function removeLink(id) {
  state.links = state.links.filter((link) => link.id !== id);
  renderLinks();
  await storageSet({ links: state.links });
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

function showFormError(message) {
  el.formError.textContent = message;
  el.formError.hidden = !message;
}

function openAddDialog() {
  el.addForm.reset();
  showFormError("");
  el.addDialog.showModal();
  el.linkName.focus();
}

function closeAddDialog() {
  el.addDialog.close();
}

async function handleAddSubmit(event) {
  event.preventDefault();

  const name = el.linkName.value.trim();
  const url = normalizeUrl(el.linkUrl.value);

  if (!name) {
    showFormError("Enter a name for the shortcut.");
    return;
  }
  if (!url) {
    showFormError("Enter a valid web address, like notion.so or https://example.com.");
    return;
  }

  const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  state.links = [...state.links, { id, name, url }];
  renderLinks();
  closeAddDialog();
  await storageSet({ links: state.links });
}

function initLinks() {
  renderLinks();
  el.addForm.addEventListener("submit", handleAddSubmit);
  el.cancelAdd.addEventListener("click", closeAddDialog);
  el.addDialog.addEventListener("click", (event) => {
    if (event.target === el.addDialog) closeAddDialog();
  });
}

/* =========================================================
   Wallpaper
   ========================================================= */

let wallpaperRequest = 0;
let wallpaperTimer = null;

function setLayerImage(layer, src) {
  layer.style.backgroundImage = `url("${src}")`;
}

function applyWallpaper(index, { animate }) {
  const list = wallpaperList();
  const wallpaper = list[index % list.length];
  const requestId = ++wallpaperRequest;

  const loader = new Image();
  loader.onload = () => {
    if (requestId !== wallpaperRequest) return;

    clearTimeout(wallpaperTimer);
    el.wallpaperName.textContent = wallpaper.name;

    if (!animate) {
      setLayerImage(el.wallpaperBack, wallpaper.src);
      return;
    }

    setLayerImage(el.wallpaperFront, wallpaper.src);
    el.wallpaperFront.classList.add("visible");

    wallpaperTimer = setTimeout(() => {
      setLayerImage(el.wallpaperBack, wallpaper.src);
      el.wallpaperFront.classList.remove("visible");
    }, 1150);
  };
  loader.onerror = () => {
    if (requestId !== wallpaperRequest) return;
    el.wallpaperName.textContent = "";
  };
  loader.src = wallpaper.src;
}

async function cycleWallpaper() {
  state.wallpaperIndex = (state.wallpaperIndex + 1) % wallpaperList().length;
  applyWallpaper(state.wallpaperIndex, { animate: true });
  await storageSet({ wallpaperIndex: state.wallpaperIndex });
}

/* =========================================================
   Init
   ========================================================= */

async function loadState() {
  try {
    const stored = await storageGet(["links", "wallpaperIndex", "engine", "hour12"]);

    if (Array.isArray(stored.links)) {
      state.links = stored.links.filter(
        (link) => link && typeof link.name === "string" && typeof link.url === "string" && typeof link.id === "string"
      );
    } else {
      await storageSet({ links: state.links });
    }

    if (Number.isInteger(stored.wallpaperIndex) && stored.wallpaperIndex >= 0) {
      state.wallpaperIndex = stored.wallpaperIndex;
    }
    if (SEARCH_ENGINES[stored.engine]) state.engine = stored.engine;
    if (typeof stored.hour12 === "boolean") state.hour12 = stored.hour12;
  } catch (error) {
    console.error("Oasis: could not read saved settings.", error);
  }
}

async function init() {
  await loadState();

  startClock();
  renderEngine();
  initEngineMenu();
  initLinks();
  applyWallpaper(state.wallpaperIndex, { animate: false });

  el.clockButton.addEventListener("click", toggleClockFormat);
  el.searchForm.addEventListener("submit", handleSearchSubmit);
  el.nextWallpaper.addEventListener("click", cycleWallpaper);
}

document.addEventListener("DOMContentLoaded", init);
