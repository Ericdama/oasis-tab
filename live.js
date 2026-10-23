"use strict";

/* =========================================================
   Oasis — live (video) wallpaper
   Depends on globals from newtab.js: storageGet, storageSet
   The video file you choose is stored in IndexedDB on your own
   device; nothing is uploaded anywhere.
   ========================================================= */

(() => {
  const DB_NAME = "oasis-live";
  const STORE = "files";
  const FILE_KEY = "wallpaper";
  const MAX_FILE_MB = 300;
  const BUNDLED_SRC = "media/fightclub.mp4";

  const video = document.getElementById("liveVideo");
  const grain = document.getElementById("grain");
  const muteBtn = document.getElementById("railMute");

  const live = { mode: "off", url: "", name: "", grain: false, muted: true };
  let objectUrl = null;

  /* ---------- IndexedDB ---------- */

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function dbRun(mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(request && request.result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }

  const dbPut = (blob) => dbRun("readwrite", (store) => store.put(blob, FILE_KEY));
  const dbGet = () => dbRun("readonly", (store) => store.get(FILE_KEY));
  const dbDelete = () => dbRun("readwrite", (store) => store.delete(FILE_KEY));

  /* ---------- Applying state ---------- */

  function releaseObjectUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  /* ---------- Mute toggle ---------- */

  function applyMuteState() {
    video.muted = live.muted;
    video.volume = 1;
    muteBtn.setAttribute("aria-label", live.muted ? "Unmute video" : "Mute video");
    muteBtn.setAttribute("data-tip", live.muted ? "Unmute" : "Mute");
    muteBtn.classList.toggle("is-muted", live.muted);
  }

  // Returns true if the video element has at least one audio track.
  function hasAudio() {
    // audioTracks API (not available in all browsers, but works in Chrome)
    if (video.audioTracks && video.audioTracks.length > 0) return true;
    // Fallback: webkitAudioDecodedByteCount > 0 means audio has been decoded
    if (typeof video.webkitAudioDecodedByteCount === "number") {
      return video.webkitAudioDecodedByteCount > 0;
    }
    return true; // optimistically assume audio exists
  }

  function stopVideo() {
    video.classList.remove("visible");
    document.documentElement.classList.remove("live-on");
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.hidden = true;
    muteBtn.hidden = true;
    releaseObjectUrl();
  }

  // Always try to play. If the browser blocks it, retry on the first click or key press.
  function startPlayback() {
    // Apply muted state right before play() so browsers respect it.
    // Starting unmuted can be blocked by autoplay policy; if so, fall back to muted.
    video.muted = live.muted;
    const attempt = video.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        // Autoplay blocked — mute and retry (browser policy requires muted for silent autoplay)
        video.muted = true;
        live.muted = true;
        applyMuteState();
        const retry = () => video.play().catch(() => {});
        document.addEventListener("pointerdown", retry, { once: true });
        document.addEventListener("keydown", retry, { once: true });
      });
    }
  }

  function playVideo(src) {
    // Inline layout so the video always fills the screen, even if live.css is missing.
    Object.assign(video.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      zIndex: "-2",
      pointerEvents: "none",
    });
    video.hidden = false;
    video.muted = live.muted;
    video.loop = true;
    video.playsInline = true;
    video.src = src;
    video.addEventListener(
      "error",
      async () => {
        if (live.mode !== "bundled") return;
        // The bundled clip is missing: fall back to the photo wallpaper.
        live.mode = "off";
        stopVideo();
        await saveLive();
      },
      { once: true }
    );
    video.addEventListener(
      "loadeddata",
      () => {
        video.classList.add("visible");
        document.documentElement.classList.add("live-on");
        muteBtn.hidden = false;
        applyMuteState();
        startPlayback();
      },
      { once: true }
    );
  }

  async function applyLive() {
    grain.hidden = !live.grain;

    if (live.mode === "off") {
      stopVideo();
      return;
    }

    if (live.mode === "bundled") {
      releaseObjectUrl();
      playVideo(BUNDLED_SRC);
      return;
    }

    if (live.mode === "url" && live.url) {
      releaseObjectUrl();
      playVideo(live.url);
      return;
    }

    if (live.mode === "file") {
      try {
        const blob = await dbGet();
        if (!blob) throw new Error("Saved video not found");
        releaseObjectUrl();
        objectUrl = URL.createObjectURL(blob);
        playVideo(objectUrl);
      } catch (error) {
        console.error("Oasis: could not load live wallpaper.", error);
        live.mode = "off";
        stopVideo();
        await saveLive();
      }
    }
  }

  const saveLive = () => storageSet({ live: { ...live } });

  /* ---------- Validation: can the browser actually play this source? ---------- */

  function canPlay(src) {
    return new Promise((resolve) => {
      const probe = document.createElement("video");
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        probe.removeAttribute("src");
        probe.load();
        resolve(ok);
      };
      probe.preload = "metadata";
      probe.muted = true;
      probe.onloadedmetadata = () => done(true);
      probe.onerror = () => done(false);
      setTimeout(() => done(false), 10000);
      probe.src = src;
    });
  }

  /* ---------- Dialog ---------- */

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function openDialog() {
    const dialog = el("dialog", "modal glass live-dialog");
    const form = el("form", "modal-form");
    form.autocomplete = "off";
    form.appendChild(el("h2", "", "Live wallpaper"));

    const fileLabel = el("label", "", "Video file (MP4 or WebM)");
    fileLabel.htmlFor = "liveFile";
    const fileInput = el("input");
    fileInput.id = "liveFile";
    fileInput.type = "file";
    fileInput.accept = "video/mp4,video/webm";

    const current = el("p", "live-status");
    if (live.mode === "file" && live.name) {
      current.textContent = `Playing: ${live.name}`;
    } else if (live.mode === "bundled") {
      current.textContent = "Playing: the Fight Club theme clip (media/fightclub.mp4).";
    } else if (live.mode === "url") {
      current.textContent = "Playing from a web address.";
    } else {
      current.hidden = true;
    }

    const or = el("p", "or", "or");

    const urlLabel = el("label", "", "Direct video address");
    urlLabel.htmlFor = "liveUrl";
    const urlInput = el("input");
    urlInput.id = "liveUrl";
    urlInput.type = "text";
    urlInput.placeholder = "https://example.com/clip.mp4";
    urlInput.value = live.mode === "url" ? live.url : "";

    const hint = el(
      "p",
      "hint",
      "Use a video you own or have permission to use. The video plays muted and loops. Files stay on this device."
    );

    const grainLabel = el("label", "live-check");
    const grainInput = el("input");
    grainInput.type = "checkbox";
    grainInput.checked = live.grain;
    grainLabel.append(grainInput, document.createTextNode("Add film grain to any wallpaper"));

    const error = el("p", "form-error");
    error.setAttribute("role", "alert");
    error.hidden = true;

    const actions = el("div", "modal-actions");
    if (live.mode !== "off") {
      const remove = el("button", "btn ghost", "Turn off");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        live.mode = "off";
        live.url = "";
        live.name = "";
        live.grain = grainInput.checked;
        await dbDelete().catch(() => {});
        await saveLive();
        await applyLive();
        dialog.close();
      });
      actions.appendChild(remove);
    }
    const cancel = el("button", "btn ghost", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => dialog.close());
    const apply = el("button", "btn solid", "Apply");
    apply.type = "submit";
    actions.append(cancel, apply);

    form.append(fileLabel, fileInput, current, or, urlLabel, urlInput, hint, grainLabel, error, actions);

    const fail = (message) => {
      error.textContent = message;
      error.hidden = false;
      apply.disabled = false;
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.hidden = true;
      apply.disabled = true;

      const file = fileInput.files && fileInput.files[0];
      const rawUrl = urlInput.value.trim();

      if (file) {
        if (!file.type.startsWith("video/")) return fail("Choose a video file (MP4 or WebM).");
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          return fail(`That file is larger than ${MAX_FILE_MB} MB. Choose a shorter or smaller clip.`);
        }
        const testUrl = URL.createObjectURL(file);
        const ok = await canPlay(testUrl);
        URL.revokeObjectURL(testUrl);
        if (!ok) return fail("Chrome can't play this video. Try an MP4 (H.264) or WebM file.");
        try {
          await dbPut(file);
        } catch (_) {
          return fail("Couldn't save the video on this device. Free up disk space and try again.");
        }
        live.mode = "file";
        live.name = file.name;
        live.url = "";
      } else if (rawUrl) {
        let parsed;
        try {
          parsed = new URL(rawUrl);
        } catch (_) {
          return fail("Enter a full web address that starts with https://");
        }
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          return fail("Enter a full web address that starts with https://");
        }
        const ok = await canPlay(parsed.href);
        if (!ok) return fail("That address didn't load as a video. Use a direct link to an MP4 or WebM file.");
        live.mode = "url";
        live.url = parsed.href;
        live.name = "";
      } else if (live.mode === "off") {
        if (!grainInput.checked && !live.grain) return fail("Choose a video file or enter a video address.");
      }

      live.grain = grainInput.checked;
      await saveLive();
      await applyLive();
      dialog.close();
    });

    dialog.addEventListener("close", () => dialog.remove());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });

    dialog.appendChild(form);
    document.body.appendChild(dialog);
    dialog.showModal();
  }

  /* ---------- Init ---------- */

  async function init() {
    try {
      const stored = await storageGet(["live"]);
      if (!stored.live) {
        // First run: start with the bundled theme clip and film grain.
        live.mode = "bundled";
        live.grain = true;
        await saveLive();
      } else if (typeof stored.live === "object") {
        live.mode = ["file", "url", "bundled"].includes(stored.live.mode) ? stored.live.mode : "off";
        live.url = typeof stored.live.url === "string" ? stored.live.url : "";
        live.name = typeof stored.live.name === "string" ? stored.live.name : "";
        live.grain = Boolean(stored.live.grain);
        live.muted = stored.live.muted !== false; // default to muted for safety
      }
    } catch (error) {
      console.error("Oasis: could not read live wallpaper settings.", error);
    }

    await applyLive();

    document.getElementById("railLive").addEventListener("click", openDialog);

    muteBtn.addEventListener("click", () => {
      const wasMuted = live.muted;
      live.muted = !wasMuted;

      if (!live.muted) {
        // Check if this video even has an audio track
        if (!hasAudio()) {
          // No audio track — show the user a tip and stay muted
          live.muted = true;
          muteBtn.setAttribute("data-tip", "No audio track");
          setTimeout(() => {
            muteBtn.setAttribute("data-tip", "Unmute");
          }, 2500);
          applyMuteState();
          return;
        }

        // Chrome requires pause → unmute → play to actually unlock audio.
        // This must happen synchronously inside the click (user-gesture) handler.
        const t = video.currentTime;
        video.pause();
        video.muted = false;
        video.volume = 1;
        video.currentTime = t;
        video.play().catch(() => {
          // If play() still fails, give up and stay muted
          video.muted = true;
          live.muted = true;
        });
      } else {
        video.muted = true;
      }

      applyMuteState();
      saveLive();
    });

    // Choosing the next photo wallpaper switches the live wallpaper off.
    document.getElementById("nextWallpaper").addEventListener("click", async () => {
      if (live.mode === "off") return;
      live.mode = "off";
      await saveLive();
      stopVideo();
    });

    // Save battery while the tab is in the background.
    document.addEventListener("visibilitychange", () => {
      if (live.mode === "off" || video.hidden) return;
      if (document.hidden) {
        video.pause();
      } else {
        video.play().catch(() => {});
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
