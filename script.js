// NASA: replace DEMO_KEY with your key — https://api.nasa.gov/
const NASA_API_KEY = "mUy0EAPoWx0tcfGiMzMpgu7QOwg6njMVg6gKp8Zj";
const APOD_URL = `https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`;
const PLAYLIST_URL = "./music_files/playlist.json";

const dateEl = document.getElementById("date");
const timeEl = document.getElementById("time");
const apodTitleEl = document.getElementById("apodTitle");
const apodDescriptionEl = document.getElementById("apodDescription");
const apodDetailsEl = document.getElementById("apodDetails");
const pingEl = document.getElementById("ping");
const batteryEl = document.getElementById("battery");

function updateDateTime() {
  const now = new Date();
  dateEl.textContent = now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  timeEl.textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

async function setApodBackground() {
  try {
    const response = await fetch(APOD_URL);
    if (!response.ok) {
      throw new Error(`NASA API error: ${response.status}`);
    }

    const data = await response.json();
    const title = data.title || "Astronomy Picture of the Day";
    const description = data.explanation || "No description available.";

    apodTitleEl.textContent = title;
    apodDescriptionEl.textContent = description;
    if (apodDetailsEl) apodDetailsEl.open = false;

    if (data.media_type === "image" && data.url) {
      document.body.style.backgroundImage = `url("${data.url}")`;
      return;
    }

    document.body.style.backgroundImage = "linear-gradient(135deg, #161834, #2f2143, #493162)";
  } catch (error) {
    document.body.style.backgroundImage = "linear-gradient(135deg, #161834, #2f2143, #493162)";
    apodTitleEl.textContent = "Could not load APOD image";
    apodDescriptionEl.textContent =
      "The NASA API request failed. Check your key or network connection.";
    if (apodDetailsEl) apodDetailsEl.open = false;
  }
}

async function measurePing() {
  const testUrl = "https://api.nasa.gov/";
  const started = performance.now();

  try {
    await fetch(testUrl, { mode: "no-cors", cache: "no-store" });
    const elapsed = Math.round(performance.now() - started);
    pingEl.textContent = `${elapsed} ms`;
  } catch (_error) {
    pingEl.textContent = "Unavailable";
  }
}

async function initBattery() {
  if (!("getBattery" in navigator)) {
    batteryEl.textContent = "Not supported";
    return;
  }

  try {
    const battery = await navigator.getBattery();
    const updateBatteryText = () => {
      const percent = Math.round(battery.level * 100);
      const chargeState = battery.charging ? " (charging)" : "";
      batteryEl.textContent = `${percent}%${chargeState}`;
    };

    updateBatteryText();
    battery.addEventListener("chargingchange", updateBatteryText);
    battery.addEventListener("levelchange", updateBatteryText);
  } catch (_error) {
    batteryEl.textContent = "Unavailable";
  }
}

updateDateTime();
setInterval(updateDateTime, 1000);

setApodBackground();
measurePing();
setInterval(measurePing, 10000);

initBattery();

const audioEl = document.getElementById("audioEl");
const playerTrackTitleEl = document.getElementById("playerTrackTitle");
const playerPlayBtn = document.getElementById("playerPlay");
const playerPrevBtn = document.getElementById("playerPrev");
const playerNextBtn = document.getElementById("playerNext");
const playerScrub = document.getElementById("playerScrub");
const playerCurrentEl = document.getElementById("playerCurrent");
const playerDurationEl = document.getElementById("playerDuration");
const playerVolume = document.getElementById("playerVolume");
const lofiPlayerEl = document.getElementById("lofiPlayer");
const vizBars = Array.from(document.querySelectorAll(".lofi-player__viz span"));
const titleWrapEl = document.getElementById("titleWrap");
const clockWrapEl = document.getElementById("clockWrap");
const metricsPanelEl = document.getElementById("metricsPanel");
const layoutEditToggleBtn = document.getElementById("layoutEditToggle");
const layoutResetBtn = document.getElementById("layoutReset");
const pomodoroEl = document.getElementById("pomodoro");
const pomodoroTimeEl = document.getElementById("pomodoroTime");
const pomodoroStartPauseBtn = document.getElementById("pomodoroStartPause");
const pomodoroResetBtn = document.getElementById("pomodoroReset");
const pomodoroSkipBtn = document.getElementById("pomodoroSkip");
const pomodoroModeBtns = Array.from(document.querySelectorAll(".pomodoro__mode"));

let playlist = [];
let trackIndex = 0;
let scrubbing = false;
let playRequestId = 0;
let vizRafId = 0;
let audioCtx = null;
let analyserNode = null;
let sourceNode = null;
let analyserData = null;
const POMODORO_SECONDS = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60
};
let pomodoroMode = "focus";
let pomodoroRemaining = POMODORO_SECONDS.focus;
let pomodoroTick = null;
let layoutEditMode = false;
let activeDrag = null;
const LAYOUT_STORAGE_KEY = "homescreen.layout.v1";
const LAYOUT_GRID_SIZE = 24;
const LAYOUT_GAP = 8;

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatCountdown(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function normalizeTrack(entry) {
  if (typeof entry === "string") {
    return { file: entry, title: entry.replace(/\.[^/.]+$/, "") };
  }
  if (entry && typeof entry.file === "string") {
    return { file: entry.file, title: entry.title || entry.file.replace(/\.[^/.]+$/, "") };
  }
  return null;
}

function currentSrc() {
  const t = playlist[trackIndex];
  if (!t) return "";
  return `./music_files/${t.file}`;
}

function updateTrackUi() {
  const t = playlist[trackIndex];
  if (!t) {
    playerTrackTitleEl.textContent = "Add .mp3 files to music_files and list them in playlist.json";
    playerPlayBtn.textContent = "▶";
    playerPlayBtn.classList.add("is-play-icon");
    lofiPlayerEl.classList.remove("is-playing");
    return;
  }
  playerTrackTitleEl.textContent = t.title;
}

function loadTrack(index) {
  if (!playlist.length) {
    updateTrackUi();
    return;
  }

  playRequestId += 1;
  trackIndex = ((index % playlist.length) + playlist.length) % playlist.length;
  audioEl.src = currentSrc();
  audioEl.load();
  playerScrub.value = "0";
  playerCurrentEl.textContent = "0:00";
  playerDurationEl.textContent = "0:00";
  updateTrackUi();
}

async function initPlaylist() {
  try {
    const res = await fetch(PLAYLIST_URL);
    if (!res.ok) throw new Error("playlist missing");
    const data = await res.json();
    const raw = Array.isArray(data.tracks) ? data.tracks : [];
    playlist = raw.map(normalizeTrack).filter(Boolean);
  } catch {
    playlist = [];
  }

  audioEl.volume = Number(playerVolume.value) || 0.7;

  if (!playlist.length) {
    playerTrackTitleEl.textContent = "Add tracks to music_files + playlist.json";
    playerDurationEl.textContent = "0:00";
    playerCurrentEl.textContent = "0:00";
    return;
  }

  loadTrack(0);
}

function togglePlay() {
  if (!playlist.length) return;
  if (audioEl.paused) {
    requestPlayWithRetry(playRequestId);
  } else {
    audioEl.pause();
  }
}

function syncPlayButton() {
  const playing = !audioEl.paused;
  playerPlayBtn.textContent = playing ? "⏸" : "▶";
  playerPlayBtn.classList.toggle("is-play-icon", !playing);
  lofiPlayerEl.classList.toggle("is-playing", playing);
}

function requestPlayWithRetry(requestId = playRequestId) {
  initAudioVisualizer();
  const playPromise = audioEl.play();
  if (!playPromise || typeof playPromise.catch !== "function") return;
  playPromise.catch(() => {
    let retried = false;
    const retryWhenReady = () => {
      if (retried || requestId !== playRequestId) return;
      retried = true;
      audioEl.play().catch(() => {});
    };
    audioEl.addEventListener("canplay", retryWhenReady, { once: true });
  });
}

function initAudioVisualizer() {
  if (analyserNode) return true;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return false;
  try {
    audioCtx = new AudioContextCtor();
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 128;
    analyserNode.smoothingTimeConstant = 0.85;
    analyserData = new Uint8Array(analyserNode.frequencyBinCount);
    sourceNode = audioCtx.createMediaElementSource(audioEl);
    sourceNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);
    lofiPlayerEl.classList.add("has-reactive-viz");
    return true;
  } catch {
    return false;
  }
}

function setVisualizerIdle() {
  vizBars.forEach((bar) => {
    bar.style.setProperty("--bar-scale", "0.28");
    bar.style.setProperty("--bar-opacity", "0.35");
  });
}

function updateVisualizerFrame() {
  if (!analyserNode || !analyserData || !vizBars.length) return;
  analyserNode.getByteFrequencyData(analyserData);
  const bucket = Math.max(1, Math.floor(analyserData.length / vizBars.length));
  vizBars.forEach((bar, i) => {
    const start = i * bucket;
    const end = Math.min(analyserData.length, start + bucket);
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += analyserData[j];
    const avg = end > start ? sum / (end - start) : 0;
    const intensity = avg / 255;
    const gated = Math.max(0, intensity - 0.07);
    const boosted = Math.min(1, gated * 2.25);
    const scale = 0.2 + Math.pow(boosted, 0.72) * 1.65;
    const opacity = 0.33 + boosted * 0.67;
    bar.style.setProperty("--bar-scale", scale.toFixed(3));
    bar.style.setProperty("--bar-opacity", opacity.toFixed(3));
  });

  if (!audioEl.paused) {
    vizRafId = window.requestAnimationFrame(updateVisualizerFrame);
  }
}

function startVisualizer() {
  if (!initAudioVisualizer()) return;
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  if (vizRafId) window.cancelAnimationFrame(vizRafId);
  vizRafId = window.requestAnimationFrame(updateVisualizerFrame);
}

function stopVisualizer() {
  if (vizRafId) window.cancelAnimationFrame(vizRafId);
  vizRafId = 0;
  setVisualizerIdle();
}

function updatePomodoroUi(options = {}) {
  const { time = true, controls = true, modes = true } = options;
  if (time && pomodoroTimeEl) {
    pomodoroTimeEl.textContent = formatCountdown(pomodoroRemaining);
  }
  if (controls && pomodoroStartPauseBtn) {
    pomodoroStartPauseBtn.textContent = pomodoroTick ? "Pause" : "Start";
  }
  if (modes) {
    pomodoroModeBtns.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.mode === pomodoroMode);
    });
  }
}

function setPomodoroMode(mode) {
  if (!Object.prototype.hasOwnProperty.call(POMODORO_SECONDS, mode)) return;
  pomodoroMode = mode;
  pomodoroRemaining = POMODORO_SECONDS[mode];
  if (pomodoroTick) {
    window.clearInterval(pomodoroTick);
    pomodoroTick = null;
  }
  updatePomodoroUi();
}

function switchPomodoroMode() {
  if (pomodoroMode === "focus") {
    setPomodoroMode("short");
  } else {
    setPomodoroMode("focus");
  }
}

function tickPomodoro() {
  pomodoroRemaining -= 1;
  if (pomodoroRemaining <= 0) {
    pomodoroRemaining = 0;
    if (pomodoroTick) {
      window.clearInterval(pomodoroTick);
      pomodoroTick = null;
    }
    updatePomodoroUi({ time: true, controls: true, modes: false });
    switchPomodoroMode();
    return;
  }
  updatePomodoroUi({ time: true, controls: false, modes: false });
}

function togglePomodoro() {
  if (pomodoroTick) {
    window.clearInterval(pomodoroTick);
    pomodoroTick = null;
    updatePomodoroUi();
    return;
  }
  pomodoroTick = window.setInterval(tickPomodoro, 1000);
  updatePomodoroUi();
}

function initPomodoro() {
  if (!pomodoroTimeEl) return;
  pomodoroModeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const { mode } = btn.dataset;
      if (!mode) return;
      setPomodoroMode(mode);
    });
  });

  if (pomodoroStartPauseBtn) {
    pomodoroStartPauseBtn.addEventListener("click", togglePomodoro);
  }
  if (pomodoroResetBtn) {
    pomodoroResetBtn.addEventListener("click", () => {
      setPomodoroMode(pomodoroMode);
    });
  }
  if (pomodoroSkipBtn) {
    pomodoroSkipBtn.addEventListener("click", switchPomodoroMode);
  }
  updatePomodoroUi();
}

const movablePanels = [titleWrapEl, clockWrapEl, pomodoroEl, lofiPlayerEl, metricsPanelEl].filter(Boolean);

function setPanelFixedPosition(el, box) {
  const width = Math.max(140, Math.round(box.width));
  el.style.position = "fixed";
  el.style.left = `${Math.round(box.left)}px`;
  el.style.top = `${Math.round(box.top)}px`;
  el.style.right = "auto";
  el.style.bottom = "auto";
  el.style.height = "auto";
  el.style.width = `${width}px`;
  el.style.margin = "0";
  el.style.maxWidth = "none";
  el.style.zIndex = "6";
  el.dataset.layoutFixed = "true";
}

function captureCurrentPanelPosition(el) {
  const rect = el.getBoundingClientRect();
  setPanelFixedPosition(el, rect);
}

function getPanelLayoutSnapshot() {
  const snapshot = {};
  movablePanels.forEach((el) => {
    if (el.dataset.layoutFixed !== "true") return;
    snapshot[el.id] = {
      left: parseFloat(el.style.left) || 0,
      top: parseFloat(el.style.top) || 0,
      width: parseFloat(el.style.width) || el.getBoundingClientRect().width
    };
  });
  return snapshot;
}

function savePanelLayout() {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(getPanelLayoutSnapshot()));
  } catch (_error) {}
}

function hasSavedPanelLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return !!parsed && typeof parsed === "object" && Object.keys(parsed).length > 0;
  } catch (_error) {
    return false;
  }
}

function applySavedPanelLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return false;
    movablePanels.forEach((el) => {
      const box = parsed[el.id];
      if (!box || typeof box !== "object") return;
      if (!Number.isFinite(box.left) || !Number.isFinite(box.top) || !Number.isFinite(box.width)) return;
      setPanelFixedPosition(el, box);
    });
    if (metricsPanelEl && !parsed.metricsPanel) {
      const rect = metricsPanelEl.getBoundingClientRect();
      setPanelFixedPosition(metricsPanelEl, {
        left: Math.max(8, window.innerWidth - rect.width - 12),
        top: Math.max(8, window.innerHeight - rect.height - 12),
        width: rect.width
      });
    }
    resolveAllPanelCollisions();
    return true;
  } catch (_error) {}
  return false;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function snapToGrid(value) {
  return Math.round(value / LAYOUT_GRID_SIZE) * LAYOUT_GRID_SIZE;
}

function getPanelRectFromStyles(el, override = {}) {
  const width = override.width ?? (parseFloat(el.style.width) || el.getBoundingClientRect().width);
  const height = override.height ?? el.getBoundingClientRect().height;
  const left = override.left ?? (parseFloat(el.style.left) || 0);
  const top = override.top ?? (parseFloat(el.style.top) || 0);
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height
  };
}

function rectanglesOverlap(a, b) {
  return !(
    a.right + LAYOUT_GAP <= b.left ||
    a.left >= b.right + LAYOUT_GAP ||
    a.bottom + LAYOUT_GAP <= b.top ||
    a.top >= b.bottom + LAYOUT_GAP
  );
}

function candidateCollides(panel, candidateRect) {
  return movablePanels.some((other) => {
    if (other === panel || other.dataset.layoutFixed !== "true") return false;
    const otherRect = getPanelRectFromStyles(other);
    return rectanglesOverlap(candidateRect, otherRect);
  });
}

function findNearestFreePosition(panel, preferredLeft, preferredTop, width, height) {
  const maxLeft = Math.max(0, window.innerWidth - width);
  const maxTop = Math.max(0, window.innerHeight - height);
  const targetLeft = snapToGrid(clamp(preferredLeft, 0, maxLeft));
  const targetTop = snapToGrid(clamp(preferredTop, 0, maxTop));
  const preferredRect = {
    left: targetLeft,
    top: targetTop,
    width,
    height,
    right: targetLeft + width,
    bottom: targetTop + height
  };
  if (!candidateCollides(panel, preferredRect)) {
    return { left: targetLeft, top: targetTop };
  }

  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let y = 0; y <= maxTop; y += LAYOUT_GRID_SIZE) {
    for (let x = 0; x <= maxLeft; x += LAYOUT_GRID_SIZE) {
      const rect = { left: x, top: y, width, height, right: x + width, bottom: y + height };
      if (candidateCollides(panel, rect)) continue;
      const distance = Math.abs(x - targetLeft) + Math.abs(y - targetTop);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { left: x, top: y };
      }
    }
  }
  return best ?? { left: targetLeft, top: targetTop };
}

function resolveAllPanelCollisions() {
  movablePanels.forEach((panel) => {
    if (panel.dataset.layoutFixed !== "true") return;
    const rect = getPanelRectFromStyles(panel);
    const settled = findNearestFreePosition(panel, rect.left, rect.top, rect.width, rect.height);
    panel.style.left = `${Math.round(settled.left)}px`;
    panel.style.top = `${Math.round(settled.top)}px`;
  });
}

function applyDefaultPanelLayout() {
  const margin = 16;
  const gap = 12;

  const titleRect = titleWrapEl ? titleWrapEl.getBoundingClientRect() : null;
  const clockRect = clockWrapEl ? clockWrapEl.getBoundingClientRect() : null;
  const pomodoroRect = pomodoroEl ? pomodoroEl.getBoundingClientRect() : null;
  const playerRect = lofiPlayerEl ? lofiPlayerEl.getBoundingClientRect() : null;
  const metricsRect = metricsPanelEl ? metricsPanelEl.getBoundingClientRect() : null;

  if (titleWrapEl && titleRect && clockRect) {
    const maxTitleWidth = Math.max(
      260,
      window.innerWidth - clockRect.width - margin * 3
    );
    const titleWidth = Math.min(titleRect.width, maxTitleWidth);
    setPanelFixedPosition(titleWrapEl, {
      left: margin,
      top: margin,
      width: titleWidth
    });
  }

  if (clockWrapEl && clockRect) {
    setPanelFixedPosition(clockWrapEl, {
      left: Math.max(margin, window.innerWidth - clockRect.width - margin),
      top: margin,
      width: clockRect.width
    });
  }

  if (pomodoroEl && pomodoroRect && clockWrapEl) {
    const clockTop = parseFloat(clockWrapEl.style.top) || margin;
    const clockHeight = clockWrapEl.getBoundingClientRect().height;
    const clockLeft = parseFloat(clockWrapEl.style.left) || Math.max(margin, window.innerWidth - pomodoroRect.width - margin);
    const pomTop = clockTop + clockHeight + gap;
    setPanelFixedPosition(pomodoroEl, {
      left: clockLeft,
      top: pomTop,
      width: pomodoroRect.width
    });
  }

  if (lofiPlayerEl && playerRect) {
    const playerWidth = Math.min(playerRect.width, window.innerWidth - margin * 2);
    setPanelFixedPosition(lofiPlayerEl, {
      left: Math.max(margin, (window.innerWidth - playerWidth) / 2),
      top: Math.max(margin, window.innerHeight - playerRect.height - margin * 2),
      width: playerWidth
    });
  }

  if (metricsPanelEl && metricsRect) {
    setPanelFixedPosition(metricsPanelEl, {
      left: Math.max(margin, window.innerWidth - metricsRect.width - margin),
      top: Math.max(margin, window.innerHeight - metricsRect.height - margin),
      width: metricsRect.width
    });
  }

  resolveAllPanelCollisions();
  savePanelLayout();
}

function onLayoutDragMove(event) {
  if (!activeDrag) return;
  const { el, offsetX, offsetY, width, height } = activeDrag;
  const maxLeft = Math.max(0, window.innerWidth - width);
  const maxTop = Math.max(0, window.innerHeight - height);
  const desiredLeft = clamp(event.clientX - offsetX, 0, maxLeft);
  const desiredTop = clamp(event.clientY - offsetY, 0, maxTop);
  const settled = findNearestFreePosition(el, desiredLeft, desiredTop, width, height);
  activeDrag.lastLeft = settled.left;
  activeDrag.lastTop = settled.top;
  el.style.left = `${Math.round(settled.left)}px`;
  el.style.top = `${Math.round(settled.top)}px`;
}

function onLayoutDragEnd() {
  if (!activeDrag) return;
  activeDrag = null;
  document.removeEventListener("pointermove", onLayoutDragMove);
  document.removeEventListener("pointerup", onLayoutDragEnd);
  savePanelLayout();
}

function onLayoutDragStart(event) {
  if (!layoutEditMode) return;
  const el = event.currentTarget.parentElement;
  if (!el) return;
  if (el.dataset.layoutFixed !== "true") captureCurrentPanelPosition(el);
  event.preventDefault();
  const rect = el.getBoundingClientRect();
  activeDrag = {
    el,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    width: rect.width,
    height: rect.height,
    lastLeft: parseFloat(el.style.left) || rect.left,
    lastTop: parseFloat(el.style.top) || rect.top
  };
  document.addEventListener("pointermove", onLayoutDragMove);
  document.addEventListener("pointerup", onLayoutDragEnd);
}

function setLayoutEditMode(nextMode) {
  layoutEditMode = nextMode;
  document.body.classList.toggle("edit-mode", layoutEditMode);
  if (layoutEditToggleBtn) {
    layoutEditToggleBtn.textContent = layoutEditMode ? "Done Editing" : "Edit Layout";
  }
  if (layoutEditMode) {
    movablePanels.forEach((el) => {
      if (el.dataset.layoutFixed !== "true") captureCurrentPanelPosition(el);
    });
    resolveAllPanelCollisions();
    savePanelLayout();
  } else {
    onLayoutDragEnd();
  }
}

function initLayoutEditor() {
  movablePanels.forEach((el) => {
    el.classList.add("layout-movable");
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "layout-handle";
    handle.textContent = "Move";
    handle.setAttribute("aria-label", `Move ${el.id}`);
    handle.addEventListener("pointerdown", onLayoutDragStart);
    el.appendChild(handle);
  });

  const hasSavedLayout = hasSavedPanelLayout();
  if (hasSavedLayout) {
    applySavedPanelLayout();
  } else {
    applyDefaultPanelLayout();
  }

  if (layoutEditToggleBtn) {
    layoutEditToggleBtn.addEventListener("click", () => {
      setLayoutEditMode(!layoutEditMode);
    });
  }
  if (layoutResetBtn) {
    layoutResetBtn.addEventListener("click", () => {
      try {
        localStorage.removeItem(LAYOUT_STORAGE_KEY);
      } catch (_error) {}
      window.location.reload();
    });
  }

  window.addEventListener("resize", () => {
    if (!layoutEditMode) return;
    resolveAllPanelCollisions();
    savePanelLayout();
  });
}

audioEl.addEventListener("play", syncPlayButton);
audioEl.addEventListener("pause", syncPlayButton);
audioEl.addEventListener("play", startVisualizer);
audioEl.addEventListener("pause", stopVisualizer);
audioEl.addEventListener("ended", () => {
  loadTrack(trackIndex + 1);
  requestPlayWithRetry(playRequestId);
});

audioEl.addEventListener("loadedmetadata", () => {
  playerDurationEl.textContent = formatTime(audioEl.duration);
});

audioEl.addEventListener("timeupdate", () => {
  if (scrubbing || !Number.isFinite(audioEl.duration)) return;
  const p = audioEl.duration ? audioEl.currentTime / audioEl.duration : 0;
  playerScrub.value = String(Math.round(p * 1000));
  playerCurrentEl.textContent = formatTime(audioEl.currentTime);
});

playerPlayBtn.addEventListener("click", togglePlay);
playerPrevBtn.addEventListener("click", () => {
  if (!playlist.length) return;
  const wasPlaying = !audioEl.paused;
  loadTrack(trackIndex - 1);
  if (wasPlaying) requestPlayWithRetry(playRequestId);
});
playerNextBtn.addEventListener("click", () => {
  if (!playlist.length) return;
  const wasPlaying = !audioEl.paused;
  loadTrack(trackIndex + 1);
  if (wasPlaying) requestPlayWithRetry(playRequestId);
});

playerScrub.addEventListener("pointerdown", () => {
  scrubbing = true;
});
playerScrub.addEventListener("pointerup", () => {
  scrubbing = false;
});
playerScrub.addEventListener("input", () => {
  if (!Number.isFinite(audioEl.duration)) return;
  const v = Number(playerScrub.value) / 1000;
  audioEl.currentTime = v * audioEl.duration;
  playerCurrentEl.textContent = formatTime(audioEl.currentTime);
});

playerVolume.addEventListener("input", () => {
  audioEl.volume = Number(playerVolume.value);
});

setVisualizerIdle();
initLayoutEditor();
initPomodoro();
initPlaylist();
