"use strict";

/* =========================================================
   Oasis — themes
   "fightclub" (default): gritty, desaturated, typewriter type
   "oasis": the original calm glass look
   Depends on globals from newtab.js: storageGet, storageSet,
   unsplash, state, applyWallpaper, refreshQuote
   ========================================================= */

(() => {
  const FC_QUOTES = [
    "Own less. Do more. Notice everything.",
    "Comfort is a quiet way of losing.",
    "Do the hard thing before the easy one.",
    "Nobody is coming to do it for you. Good.",
    "Your schedule is your character. Edit it.",
    "Skip the noise. Keep the work.",
    "Pain is information. Learn from it, then move.",
    "You are not your inbox.",
    "Build something that outlasts the mood.",
    "Delete one distraction before lunch.",
    "Discipline is the only shortcut that works.",
    "Let the small comforts go. Keep the big goals.",
    "Today's rule: finish what you start.",
    "Waste less of it. This is the whole game.",
    "Train the part of you that quits.",
    "Be harder to distract than yesterday.",
    "Sleep, move, work. Repeat without applause.",
    "What you buy tells a story. Write a better one.",
    "Every day, one thing you'd be proud to show.",
    "Stop collecting plans. Start collecting reps.",
    "You get one shot at today. Spend it on purpose.",
    "Say less, do more, keep it quiet.",
    "Strip it down to what matters.",
    "Clear the clutter, then clear your head.",
    "Be the one who shows up.",
    "Quiet effort beats loud intentions.",
    "Learn to be comfortable being uncomfortable.",
    "The work doesn't care how you feel. Do it anyway.",
    "Take the first swing.",
    "Fewer things, sharper focus.",
    "Start before you're ready.",
  ];

  const FC_WALLPAPERS = [
    { name: "Night city", src: unsplash("photo-1480714378408-67cf0d13bc1b") },
    { name: "Downtown street", src: unsplash("photo-1449824913935-59a10b8d2000") },
    { name: "Overcast skyline", src: unsplash("photo-1514565131-fce0801e5785") },
    { name: "Glass tower", src: unsplash("photo-1486406146926-c627a92ad1ab") },
    { name: "Concrete city", src: unsplash("photo-1477959858617-67f85cf4f1df") },
  ];

  const PLACEHOLDERS = {
    fightclub: "Type what you're after, or paste a URL",
    oasis: "Search the web or type a URL",
  };

  const root = document.documentElement;
  let theme = "fightclub";

  function setHooks(next) {
    if (next === "fightclub") {
      window.oasisQuotes = () => FC_QUOTES;
      window.oasisWallpapers = () => FC_WALLPAPERS;
    } else {
      delete window.oasisQuotes;
      delete window.oasisWallpapers;
    }
  }

  function applyTheme(next, { animate, persist }) {
    theme = next;
    root.dataset.theme = next;
    setHooks(next);

    const input = document.getElementById("searchInput");
    if (input) input.placeholder = PLACEHOLDERS[next];

    if (typeof refreshQuote === "function") refreshQuote();
    if (typeof applyWallpaper === "function" && typeof state !== "undefined") {
      applyWallpaper(state.wallpaperIndex, { animate });
    }
    if (persist) storageSet({ theme: next });
  }

  // Apply the default right away so quotes and wallpapers are themed on first paint.
  setHooks("fightclub");

  async function init() {
    try {
      const stored = await storageGet(["theme"]);
      if (stored.theme === "oasis") {
        applyTheme("oasis", { animate: false, persist: false });
      } else {
        applyTheme("fightclub", { animate: false, persist: false });
      }
    } catch (error) {
      console.error("Oasis: could not read theme.", error);
    }

    document.getElementById("railTheme").addEventListener("click", () => {
      applyTheme(theme === "fightclub" ? "oasis" : "fightclub", { animate: true, persist: true });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
