/* Tablero de rutina — estático, sin dependencias.
   Cambiá DATA_BASE al publicar (ruta de los JSON y de img/). */
const DATA_BASE = "data";

const PREP_MS = 3000;
const SIDE_SWITCH_MS = 2500;
const PAUSA_MIN_S = 15;
const FREE_PRESETS = [30, 45, 60, 90];
const RING_C = 2 * Math.PI * 54; // r=54

const $app = document.getElementById("app");

const ICONS = {
  close: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  back: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-8 7 8 7"/></svg>`,
  soundOn: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h3l5 4V6L7 10H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a8 8 0 0 1 0 12"/></svg>`,
  soundOff: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h3l5 4V6L7 10H4z"/><path d="M19 9l-6 6M13 9l6 6"/></svg>`,
  timer: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 3h6"/></svg>`,
  rest: `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3a7.5 7.5 0 1 0 5 13.5A8 8 0 1 1 16 3z"/></svg>`,
  pose: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="5" r="2.2"/><path d="M12 8v5M8 11l4 2 4-2M9 21l3-8 3 8"/></svg>`,
  check: `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/></svg>`,
  wait: `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 3h6"/></svg>`,
};

const state = {
  view: "loading", // loading | day | rest | missing | error | workout | done | freetimer
  fecha: null,
  routine: null,
  steps: [],
  stepIndex: 0,
  soundOn: loadSoundPref(),
  confirmExit: false,
  freePreset: 45,
  freePhase: "pick", // pick | running | done
  totalMs: 0,
};

const timer = {
  mode: "idle", // idle | countdown | running | paused | sideswitch
  kind: "tiempo", // tiempo | pausa | reps | free
  totalMs: 0,
  durationMs: 0,
  startedAt: 0,
  remainingMs: 0,
  elapsedMs: 0,
  pausedRemaining: 0,
  pausedElapsed: 0,
  side: 0,
  sides: 1,
  sideDurationMs: 0,
  lastBeepSec: -1,
  raf: 0,
};

const vueltaStartedAt = new Map();
let workoutStartedAt = 0;
let workoutEndedAt = 0;
let audioCtx = null;
let wakeLock = null;
let dialogEl = null;

function loadSoundPref() {
  try { return localStorage.getItem("rutina-sonido") !== "off"; }
  catch { return true; }
}
function saveSoundPref() {
  try { localStorage.setItem("rutina-sonido", state.soundOn ? "on" : "off"); }
  catch { /* ignore */ }
}

function todayBA() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function fechaFromQuery() {
  const q = new URLSearchParams(location.search).get("fecha");
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  return todayBA();
}

function isSunday(fecha) {
  return new Date(`${fecha}T12:00:00-03:00`).getDay() === 0;
}

function formatFecha(fecha) {
  const dt = new Date(`${fecha}T12:00:00-03:00`);
  const raw = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    timeZone: "America/Buenos_Aires",
  }).format(dt);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function imgUrl(key) {
  if (!key) return null;
  return `${DATA_BASE}/img/${key}.jpg`;
}

function jsonUrl(fecha) {
  return `${DATA_BASE}/${fecha}.json`;
}

function flatten(routine) {
  const steps = [];
  (routine.bloques || []).forEach((bloque, bi) => {
    const vueltas = bloque.vueltas || 1;
    for (let v = 1; v <= vueltas; v++) {
      (bloque.ejercicios || []).forEach((ej, ei) => {
        steps.push({
          bloque,
          bloqueIndex: bi,
          vuelta: v,
          vueltas,
          ejercicioIndex: ei,
          ejerciciosEnVuelta: (bloque.ejercicios || []).length,
          ejercicio: ej,
        });
      });
    }
  });
  return steps;
}

function dose(ej) {
  if (!ej) return "";
  if (ej.tipo === "pausa") {
    if (ej.completar_vuelta) return "hasta completar";
    return ej.segundos ? `${ej.segundos} s` : "Pausa";
  }
  if (ej.por_lado) {
    if (ej.tipo === "reps") return `${ej.reps} por lado`;
    if (ej.segundos) return `${ej.segundos} s por lado`;
  }
  if (ej.tipo === "reps") return `${ej.reps} reps`;
  if (ej.segundos) return `${ej.segundos} s`;
  return "";
}

function bloqueMeta(b) {
  const v = b.vueltas || 1;
  const vueltasTxt = v === 1 ? "1 vuelta" : `${v} vueltas`;
  if (b.duracion_vuelta_s) {
    const min = Math.round(b.duracion_vuelta_s / 60);
    if (min >= 1) {
      return v > 1 ? `${vueltasTxt} de ${min} min` : `${vueltasTxt} · ${min} min`;
    }
  }
  return vueltasTxt;
}

function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function formatElapsed(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r} s`;
  return `${m} min ${r} s`;
}

function placeholder(extraClass = "") {
  return `<div class="thumb-ph ${extraClass}" aria-hidden="true">${ICONS.pose}</div>`;
}

function thumbHtml(ej, cls = "thumb") {
  const src = imgUrl(ej && ej.imagen);
  if (!src) return placeholder();
  return `<img class="${cls}" src="${esc(src)}" alt="${esc(ej.nombre)}">`;
}

/* ---------- audio / haptic / wake ---------- */
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch { /* ignore */ }
}

function beep(freq, dur) {
  if (!state.soundOn) return;
  try {
    unlockAudio();
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  } catch { /* ignore */ }
}

function vibrate(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); }
  catch { /* ignore */ }
}

async function requestWake() {
  try {
    if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request("screen");
  } catch { /* ignore */ }
}
async function releaseWake() {
  try { if (wakeLock) await wakeLock.release(); }
  catch { /* ignore */ }
  wakeLock = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" &&
      (state.view === "workout" || (state.view === "freetimer" && state.freePhase === "running"))) {
    if (!wakeLock) requestWake();
  }
});

function toggleSound() {
  state.soundOn = !state.soundOn;
  saveSoundPref();
  if (state.soundOn) {
    unlockAudio();
    beep(880, 0.1);
  }
  const btn = document.getElementById("btn-sound");
  if (btn) {
    btn.setAttribute("aria-pressed", String(state.soundOn));
    btn.setAttribute("aria-label", state.soundOn ? "Sonido encendido" : "Sonido apagado");
    btn.innerHTML = state.soundOn ? ICONS.soundOn : ICONS.soundOff;
  }
}

/* ---------- carga ---------- */
async function loadRoutine() {
  state.view = "loading";
  state.fecha = fechaFromQuery();
  state.routine = null;
  state.steps = [];
  render();
  try {
    const res = await fetch(jsonUrl(state.fecha), { cache: "no-store" });
    if (!res.ok) {
      state.view = isSunday(state.fecha) ? "rest" : "missing";
      render();
      return;
    }
    const data = await res.json();
    state.routine = data;
    state.steps = flatten(data);
    state.view = "day";
    render();
  } catch (err) {
    console.error(err);
    state.view = isSunday(state.fecha) ? "rest" : "missing";
    render();
  }
}

/* ---------- timer engine ---------- */
function stopTick() {
  if (timer.raf) cancelAnimationFrame(timer.raf);
  timer.raf = 0;
}

function startTick() {
  stopTick();
  const loop = () => {
    tick();
    if (timer.mode === "running" || timer.mode === "countdown" || timer.mode === "sideswitch" ||
        (timer.mode === "running-reps")) {
      timer.raf = requestAnimationFrame(loop);
    }
  };
  timer.raf = requestAnimationFrame(loop);
}

function nowRemaining() {
  if (timer.mode === "paused") return timer.pausedRemaining;
  return Math.max(0, timer.durationMs - (performance.now() - timer.startedAt));
}

function nowElapsed() {
  if (timer.mode === "paused") return timer.pausedElapsed;
  return timer.pausedElapsed + (performance.now() - timer.startedAt);
}

function tick() {
  if (timer.kind === "reps" && timer.mode === "running-reps") {
    timer.elapsedMs = nowElapsed();
    syncTimerUI();
    return;
  }
  timer.remainingMs = nowRemaining();
  const secLeft = Math.ceil(timer.remainingMs / 1000);
  if (timer.mode === "running" && secLeft <= 3 && secLeft > 0 && timer.lastBeepSec !== secLeft) {
    timer.lastBeepSec = secLeft;
    beep(880, 0.11);
    vibrate(70);
  }
  if (timer.remainingMs <= 0 && timer.mode !== "idle" && timer.mode !== "paused") {
    onTimerDone();
    return;
  }
  syncTimerUI();
}

function beginCountdown(thenMs, meta = {}) {
  Object.assign(timer, meta);
  timer.mode = "countdown";
  timer.durationMs = PREP_MS;
  timer.totalMs = PREP_MS;
  timer.startedAt = performance.now();
  timer.remainingMs = PREP_MS;
  timer.lastBeepSec = -1;
  timer._thenMs = thenMs;
  startTick();
  syncTimerUI();
}

function beginRun(durationMs, meta = {}) {
  Object.assign(timer, meta);
  timer.mode = "running";
  timer.kind = timer.kind || "tiempo";
  timer.durationMs = durationMs;
  timer.totalMs = durationMs;
  timer.startedAt = performance.now();
  timer.remainingMs = durationMs;
  timer.lastBeepSec = -1;
  startTick();
  syncTimerUI();
}

function beginReps() {
  timer.mode = "running-reps";
  timer.kind = "reps";
  timer.startedAt = performance.now();
  timer.elapsedMs = 0;
  timer.pausedElapsed = 0;
  startTick();
  syncTimerUI();
}

function beginSideSwitch() {
  timer.mode = "sideswitch";
  timer.side = 1;
  timer.durationMs = SIDE_SWITCH_MS;
  timer.totalMs = SIDE_SWITCH_MS;
  timer.startedAt = performance.now();
  timer.remainingMs = SIDE_SWITCH_MS;
  timer.lastBeepSec = -1;
  beep(770, 0.18);
  vibrate([50, 70, 50]);
  renderWorkout(false);
  startTick();
}

function pauseTimer() {
  if (timer.mode === "running") {
    timer.pausedRemaining = nowRemaining();
    timer.remainingMs = timer.pausedRemaining;
    timer.mode = "paused";
    stopTick();
    syncTimerUI();
    syncControlLabels();
  } else if (timer.mode === "running-reps") {
    timer.pausedElapsed = nowElapsed();
    timer.elapsedMs = timer.pausedElapsed;
    timer.mode = "paused";
    stopTick();
    syncTimerUI();
    syncControlLabels();
  } else if (timer.mode === "paused" && timer.kind === "reps") {
    timer.mode = "running-reps";
    timer.startedAt = performance.now();
    startTick();
    syncControlLabels();
  } else if (timer.mode === "paused") {
    timer.mode = "running";
    timer.durationMs = timer.pausedRemaining;
    timer.startedAt = performance.now();
    startTick();
    syncControlLabels();
  }
}

function addTen() {
  if (timer.mode === "countdown" || timer.mode === "sideswitch" || timer.kind === "reps") return;
  if (timer.mode === "paused") {
    timer.pausedRemaining += 10000;
    timer.remainingMs = timer.pausedRemaining;
    timer.totalMs += 10000;
  } else if (timer.mode === "running") {
    timer.durationMs += 10000;
    timer.totalMs += 10000;
    timer.remainingMs = nowRemaining();
  }
  syncTimerUI();
}

function onTimerDone() {
  if (timer.mode === "idle") return;
  const finishedMode = timer.mode;
  timer.mode = "idle";
  stopTick();
  if (finishedMode === "countdown") {
    beep(700, 0.12);
    vibrate(40);
    const ms = timer._thenMs;
    beginRun(ms, { kind: timer.kind, side: timer.side, sides: timer.sides, sideDurationMs: timer.sideDurationMs });
    renderWorkout(false);
    return;
  }
  if (finishedMode === "sideswitch") {
    beginRun(timer.sideDurationMs, { kind: "tiempo", side: 1, sides: 2, sideDurationMs: timer.sideDurationMs });
    renderWorkout(false);
    return;
  }
  if (finishedMode === "running") {
    beep(1046, 0.28);
    vibrate([80, 50, 180]);
    if (timer.sides === 2 && timer.side === 0) {
      beginSideSwitch();
      return;
    }
    if (state.view === "freetimer") {
      state.freePhase = "done";
      timer.mode = "idle";
      releaseWake();
      render();
      return;
    }
    goNext();
  }
}

function pauseDurationMs(step) {
  const ej = step.ejercicio;
  if (!ej.completar_vuelta) {
    return (ej.segundos || PAUSA_MIN_S) * 1000;
  }
  const key = `${step.bloqueIndex}-${step.vuelta}`;
  const start = vueltaStartedAt.get(key) ?? performance.now();
  const elapsedS = (performance.now() - start) / 1000;
  const target = step.bloque.duracion_vuelta_s || 0;
  return Math.max(PAUSA_MIN_S, target - elapsedS) * 1000;
}

function markVueltaStart(step) {
  const key = `${step.bloqueIndex}-${step.vuelta}`;
  if (!vueltaStartedAt.has(key)) vueltaStartedAt.set(key, performance.now());
}

function enterStep(opts = {}) {
  const step = state.steps[state.stepIndex];
  if (!step) { finishWorkout(); return; }
  markVueltaStart(step);
  const ej = step.ejercicio;
  timer.side = 0;
  timer.sides = ej.por_lado ? 2 : 1;
  timer.lastBeepSec = -1;

  if (ej.tipo === "reps") {
    stopTick();
    beginReps();
    if (opts.elapsedMs != null) {
      timer.pausedElapsed = opts.elapsedMs;
      timer.elapsedMs = opts.elapsedMs;
      timer.startedAt = performance.now();
    }
    if (opts.side) timer.side = opts.side;
    if (opts.paused) {
      timer.mode = "paused";
      stopTick();
    }
    render();
    return;
  }

  let ms;
  if (ej.tipo === "pausa") ms = pauseDurationMs(step);
  else ms = (ej.segundos || 0) * 1000;
  if (ms <= 0) ms = 15000;
  timer.sideDurationMs = ms;
  timer.kind = ej.tipo === "pausa" ? "pausa" : "tiempo";

  if (opts.skipPrep) {
    const remain = opts.remainingMs != null ? opts.remainingMs : ms;
    if (opts.frozen) {
      timer.kind = timer.kind;
      timer.side = opts.side || 0;
      timer.sides = timer.sides;
      timer.sideDurationMs = ms;
      timer.durationMs = ms;
      timer.totalMs = ms;
      timer.remainingMs = remain;
      timer.startedAt = performance.now() - (ms - remain);
      timer.mode = "running";
      timer.lastBeepSec = -1;
      stopTick();
      render();
      return;
    }
    beginRun(remain, {
      kind: timer.kind,
      side: opts.side || 0,
      sides: timer.sides,
      sideDurationMs: ms,
    });
    if (opts.paused) {
      timer.pausedRemaining = remain;
      timer.remainingMs = remain;
      timer.totalMs = ms;
      timer.mode = "paused";
      stopTick();
    }
    render();
    return;
  }
  beginCountdown(ms, { kind: timer.kind, side: 0, sides: timer.sides, sideDurationMs: ms });
  render();
}

function startWorkout(opts = {}) {
  unlockAudio();
  state.view = "workout";
  state.stepIndex = opts.stepIndex || 0;
  state.confirmExit = false;
  vueltaStartedAt.clear();
  workoutStartedAt = performance.now();
  workoutEndedAt = 0;
  requestWake();
  enterStep(opts);
}

function finishWorkout() {
  stopTick();
  timer.mode = "idle";
  workoutEndedAt = performance.now();
  state.totalMs = workoutEndedAt - workoutStartedAt;
  state.view = "done";
  releaseWake();
  beep(880, 0.12);
  setTimeout(() => beep(1174, 0.22), 140);
  vibrate([60, 40, 60, 40, 200]);
  render();
}

function goNext() {
  if (state.stepIndex >= state.steps.length - 1) {
    finishWorkout();
    return;
  }
  state.stepIndex += 1;
  enterStep();
}

function goPrev() {
  if (state.stepIndex <= 0) return;
  state.stepIndex -= 1;
  enterStep({ skipPrep: true, paused: false });
}

function skipCurrent() {
  goNext();
}

function listo() {
  const step = state.steps[state.stepIndex];
  if (step && step.ejercicio.por_lado && timer.side === 0) {
    timer.side = 1;
    beep(770, 0.16);
    vibrate([50, 70, 50]);
    render();
    return;
  }
  beep(1046, 0.2);
  vibrate([80, 50, 160]);
  goNext();
}

function askExit() {
  state.confirmExit = true;
  render();
}

function cancelExit() {
  state.confirmExit = false;
  render();
}

function confirmExit() {
  stopTick();
  timer.mode = "idle";
  state.confirmExit = false;
  state.view = "day";
  releaseWake();
  render();
}

/* ---------- timer libre ---------- */
function openFreeTimer() {
  unlockAudio();
  state.view = "freetimer";
  state.freePhase = "pick";
  state.freePreset = 45;
  timer.mode = "idle";
  render();
}

function startFree(sec) {
  unlockAudio();
  state.freePreset = sec;
  state.freePhase = "running";
  timer.kind = "free";
  timer.side = 0;
  timer.sides = 1;
  requestWake();
  beginCountdown(sec * 1000, { kind: "free", side: 0, sides: 1, sideDurationMs: sec * 1000 });
  render();
}

function closeFree() {
  stopTick();
  timer.mode = "idle";
  state.view = "day";
  state.freePhase = "pick";
  releaseWake();
  render();
}

/* ---------- render ---------- */
function soundBtn() {
  const on = state.soundOn;
  return `<button type="button" class="icon-btn" id="btn-sound" aria-pressed="${on}" aria-label="${on ? "Sonido encendido" : "Sonido apagado"}">${on ? ICONS.soundOn : ICONS.soundOff}</button>`;
}

function render() {
  const v = state.view;
  if (v === "loading") {
    $app.innerHTML = `<section class="screen screen-center"><div class="spin" role="status" aria-label="Cargando"></div><p>Cargando la rutina…</p></section>`;
    return;
  }
  if (v === "rest") {
    $app.innerHTML = `<section class="screen screen-center empty">
      <div class="hero-icon">${ICONS.rest}</div>
      <h2>Hoy es descanso</h2>
      <p>El domingo no hay rutina. Mañana seguimos.</p>
      <p style="color:var(--faint)">${esc(formatFecha(state.fecha))}</p>
    </section>`;
    return;
  }
  if (v === "missing" || v === "error") {
    $app.innerHTML = `<section class="screen screen-center empty">
      <div class="hero-icon">${ICONS.wait}</div>
      <h2>Todavía no está</h2>
      <p>Bruno todavía no cargó la rutina de hoy (sale ~10:00, sábados ~9:00).</p>
      <p style="color:var(--faint)">${esc(formatFecha(state.fecha))}</p>
      <button type="button" class="btn btn-primary" id="btn-retry" style="max-width:280px;margin-top:8px">Reintentar</button>
    </section>`;
    bind();
    return;
  }
  if (v === "day") { renderDay(); return; }
  if (v === "workout") { renderWorkout(true); return; }
  if (v === "done") { renderDone(); return; }
  if (v === "freetimer") { renderFree(); return; }
}

function renderDay() {
  const r = state.routine;
  const bloques = (r.bloques || []).map((b) => {
    const items = (b.ejercicios || []).map((ej) => {
      const more = [];
      if (ej.indicacion) more.push(`<p class="ind">${esc(ej.indicacion)}</p>`);
      if (ej.respiracion) more.push(`<p class="resp">${esc(ej.respiracion)}</p>`);
      const details = more.length
        ? `<details class="ex-more"><summary>Cómo</summary>${more.join("")}</details>`
        : "";
      const doseClass = ej.tipo === "pausa" ? "dose pausa" : "dose";
      return `<article class="ex">
        <div class="ex-row">
          ${thumbHtml(ej)}
          <div class="ex-body"><p class="ex-name">${esc(ej.nombre)}</p></div>
          <span class="${doseClass}">${esc(dose(ej))}</span>
        </div>
        ${details}
      </article>`;
    }).join("");
    return `<section class="block">
      <div class="block-head">
        <h3>${esc(b.nombre)}</h3>
        <span class="meta">${esc(bloqueMeta(b))}</span>
      </div>
      ${items}
    </section>`;
  }).join("");

  const nota = r.nota ? `<p class="nota">${esc(r.nota)}</p>` : "";
  $app.innerHTML = `<section class="screen screen-day">
    <div class="topbar">
      <p class="day-kicker" style="margin:0">De hoy</p>
      <button type="button" class="text-btn" id="btn-free" aria-label="Timer libre">${ICONS.timer} Timer</button>
    </div>
    <header class="day-head">
      <h2>${esc(r.titulo || formatFecha(r.fecha || state.fecha))}</h2>
      <div class="day-meta"><span class="day-dur">${esc(String(r.duracion_min))} min</span></div>
      ${nota}
    </header>
    ${bloques}
    <div class="dock">
      <button type="button" class="btn btn-primary" id="btn-start">Empezar</button>
    </div>
  </section>`;
  bind();
}

function progressText(step) {
  const parts = [step.bloque.nombre];
  if (step.vueltas > 1) parts.push(`vuelta ${step.vuelta}/${step.vueltas}`);
  parts.push(`ejercicio ${step.ejercicioIndex + 1}/${step.ejerciciosEnVuelta}`);
  return parts.join(" · ");
}

function progressFrac() {
  const n = state.steps.length;
  if (!n) return 0;
  let frac = state.stepIndex / n;
  if (timer.kind === "reps") {
    const sideF = timer.sides === 2 ? (timer.side + 0.5) / 2 : 0.4;
    frac += sideF / n;
  } else if (timer.mode === "running" || timer.mode === "paused") {
    const t = timer.totalMs || 1;
    const left = timer.mode === "paused" ? timer.pausedRemaining : timer.remainingMs;
    const inner = 1 - Math.min(1, Math.max(0, left / t));
    const sideBase = timer.sides === 2 ? timer.side / 2 : 0;
    const sideSpan = timer.sides === 2 ? 0.5 : 1;
    frac += (sideBase + inner * sideSpan) / n;
  } else if (timer.mode === "sideswitch") {
    frac += 0.5 / n;
  }
  return Math.min(1, frac);
}

function ringSvg() {
  return `<div class="ring-wrap" id="ring-wrap">
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="ring-bg" cx="60" cy="60" r="54"></circle>
      <circle class="ring-fg" id="ring-fg" cx="60" cy="60" r="54"></circle>
    </svg>
    <div class="ring-center">
      <div class="ring-time" id="ring-time">0:00</div>
      <div class="ring-sub" id="ring-sub"></div>
    </div>
  </div>`;
}

function renderWorkout(full) {
  const step = state.steps[state.stepIndex];
  if (!step) return;
  const ej = step.ejercicio;
  const canPrev = state.stepIndex > 0;
  const sideLabel = ej.por_lado
    ? (timer.side === 0 ? "Lado izquierdo" : "Lado derecho")
    : "";

  let mid = "";
  if (timer.mode === "sideswitch") {
    mid = `<div class="wo-timer"><div class="switch-msg"><h3>Cambiá de lado</h3><p class="side-tag">Ahora el lado derecho</p></div></div>`;
  } else if (ej.tipo === "reps") {
    const unit = ej.por_lado ? "por lado" : "reps";
    mid = `<div class="wo-timer">
      <p class="side-tag" id="side-tag">${esc(sideLabel)}</p>
      <div class="reps-box">
        <div class="reps-num">${esc(String(ej.reps ?? ""))}</div>
        <div class="reps-label">${esc(unit)}</div>
        <div class="reps-clock" id="reps-clock">${formatClock(timer.elapsedMs || 0)}</div>
      </div>
    </div>`;
  } else {
    mid = `<div class="wo-timer">
      <p class="side-tag" id="side-tag">${esc(sideLabel)}</p>
      ${ringSvg()}
    </div>`;
  }

  const controls = ej.tipo === "reps"
    ? `<div class="btn-row">
         <button type="button" class="btn btn-ghost" id="btn-pause">Pausá</button>
         <button type="button" class="btn btn-primary" id="btn-listo">Listo</button>
       </div>`
    : `<div class="btn-row">
         <button type="button" class="btn btn-ghost" id="btn-pause">Pausá</button>
         <button type="button" class="btn btn-ghost" id="btn-plus">+10 s</button>
         <button type="button" class="btn btn-ghost" id="btn-skip">Saltar</button>
       </div>`;

  const exitSheet = state.confirmExit ? `<div class="backdrop" id="exit-sheet">
    <div class="sheet" role="dialog" aria-labelledby="exit-title">
      <h3 id="exit-title">¿Salís del entrenamiento?</h3>
      <p>Vas a volver a la lista del día. El tiempo no se guarda.</p>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" id="btn-stay">Seguir</button>
        <button type="button" class="btn btn-danger" id="btn-leave">Salir</button>
      </div>
    </div>
  </div>` : "";

  $app.innerHTML = `<section class="screen workout">
    <div class="topbar">
      <button type="button" class="icon-btn" id="btn-exit" aria-label="Cerrar">${ICONS.close}</button>
      <span class="title">Entrenamiento</span>
      ${soundBtn()}
    </div>
    <div class="progress-wrap">
      <p class="progress-label" id="prog-label">${esc(progressText(step))}</p>
      <div class="bar" aria-hidden="true"><i id="prog-bar"></i></div>
    </div>
    <div class="wo-img">${thumbHtml(ej, "wo-photo")}</div>
    <div class="wo-copy">
      <h2>${esc(ej.nombre)}</h2>
      ${ej.indicacion ? `<p class="wo-ind">${esc(ej.indicacion)}</p>` : ""}
      ${ej.respiracion ? `<p class="wo-res">${esc(ej.respiracion)}</p>` : ""}
    </div>
    ${mid}
    <div class="wo-controls">
      ${controls}
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" id="btn-prev" ${canPrev ? "" : "disabled"}>Anterior</button>
        <button type="button" class="btn btn-ghost" id="btn-next">Siguiente</button>
      </div>
    </div>
    ${exitSheet}
  </section>`;
  bind();
  syncTimerUI();
  syncControlLabels();
}

function renderDone() {
  $app.innerHTML = `<section class="screen screen-center">
    <div class="hero-icon">${ICONS.check}</div>
    <h2>Terminaste</h2>
    <p>Tiempo real</p>
    <div class="done-time">${esc(formatElapsed(state.totalMs))}</div>
    <button type="button" class="btn btn-primary" id="btn-home" style="max-width:280px">Volver al inicio</button>
  </section>`;
  bind();
}

function renderFree() {
  if (state.freePhase === "pick") {
    const btns = FREE_PRESETS.map((s) =>
      `<button type="button" class="preset${state.freePreset === s ? " is-on" : ""}" data-sec="${s}" aria-pressed="${state.freePreset === s}">${s}<small>segundos</small></button>`
    ).join("");
    $app.innerHTML = `<section class="screen">
      <div class="topbar">
        <button type="button" class="icon-btn" id="btn-free-back" aria-label="Volver">${ICONS.back}</button>
        <span class="title">Timer libre</span>
        ${soundBtn()}
      </div>
      <header class="day-head">
        <h2>Elegí un tiempo</h2>
        <p style="color:var(--muted);margin:8px 0 0">Presets para un ejercicio suelto o una pausa.</p>
      </header>
      <div class="presets">${btns}</div>
      <div class="dock">
        <button type="button" class="btn btn-primary" id="btn-free-start">Empezar</button>
      </div>
    </section>`;
    bind();
    return;
  }
  if (state.freePhase === "done") {
    $app.innerHTML = `<section class="screen screen-center">
      <div class="topbar" style="position:absolute;top:calc(12px + var(--safe-top));left:0;right:0;padding:0 var(--pad)">
        <button type="button" class="icon-btn" id="btn-free-back" aria-label="Volver">${ICONS.back}</button>
        <span class="title">Timer libre</span>
        ${soundBtn()}
      </div>
      <div class="hero-icon">${ICONS.check}</div>
      <h2>Listo</h2>
      <p>Se cumplieron ${state.freePreset} s.</p>
      <div class="btn-row" style="width:100%;max-width:280px;margin-top:8px">
        <button type="button" class="btn btn-ghost" id="btn-free-again">Repetir</button>
        <button type="button" class="btn btn-primary" id="btn-free-pick">Otro</button>
      </div>
    </section>`;
    bind();
    return;
  }
  // running
  $app.innerHTML = `<section class="screen workout">
    <div class="topbar">
      <button type="button" class="icon-btn" id="btn-free-back" aria-label="Volver">${ICONS.back}</button>
      <span class="title">Timer libre</span>
      ${soundBtn()}
    </div>
    <div class="wo-timer" style="flex:1">
      ${ringSvg()}
    </div>
    <div class="wo-controls">
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" id="btn-pause">Pausá</button>
        <button type="button" class="btn btn-ghost" id="btn-plus">+10 s</button>
      </div>
    </div>
  </section>`;
  bind();
  syncTimerUI();
  syncControlLabels();
}

function ringOffset(progress) {
  const p = Math.min(1, Math.max(0, progress));
  return RING_C * (1 - p);
}

function syncTimerUI() {
  const bar = document.getElementById("prog-bar");
  if (bar) bar.style.width = `${Math.round(progressFrac() * 1000) / 10}%`;

  const clock = document.getElementById("reps-clock");
  if (clock) clock.textContent = formatClock(timer.kind === "reps" ? nowElapsed() : timer.elapsedMs);

  const ringTime = document.getElementById("ring-time");
  const ringSub = document.getElementById("ring-sub");
  const ringFg = document.getElementById("ring-fg");
  const ringWrap = document.getElementById("ring-wrap");
  if (!ringTime) return;

  let remaining = timer.remainingMs;
  if (timer.mode === "running" || timer.mode === "countdown" || timer.mode === "sideswitch") {
    remaining = nowRemaining();
  } else if (timer.mode === "paused") {
    remaining = timer.pausedRemaining;
  }

  const total = timer.totalMs || 1;
  const left = Math.max(0, remaining);
  const secLeft = Math.ceil(left / 1000);

  if (timer.mode === "countdown") {
    ringTime.textContent = String(Math.max(1, secLeft));
    if (ringSub) ringSub.textContent = "Preparados";
    if (ringFg) ringFg.style.strokeDashoffset = String(ringOffset(left / total));
    if (ringWrap) ringWrap.className = "ring-wrap";
    return;
  }
  if (timer.mode === "sideswitch") {
    ringTime.textContent = String(Math.max(1, secLeft));
    if (ringSub) ringSub.textContent = "Cambiá";
    return;
  }

  ringTime.textContent = formatClock(left);
  if (ringSub) {
    ringSub.textContent = timer.mode === "paused" ? "Pausa" : (timer.kind === "pausa" ? "Pausa" : "");
  }
  if (ringFg) ringFg.style.strokeDashoffset = String(ringOffset(left / total));
  if (ringWrap) {
    ringWrap.className = "ring-wrap" + (secLeft <= 3 && timer.mode === "running" ? " warn" : "");
  }
}

function syncControlLabels() {
  const pause = document.getElementById("btn-pause");
  if (!pause) return;
  if (timer.mode === "paused") pause.textContent = "Seguí";
  else if (timer.mode === "countdown" || timer.mode === "sideswitch") pause.textContent = "Pausá";
  else pause.textContent = "Pausá";
  // Don't pause during countdown? I'll allow skip only. Pause during countdown just... skip pause on countdown.
  if (timer.mode === "countdown" || timer.mode === "sideswitch") {
    pause.disabled = true;
    const plus = document.getElementById("btn-plus");
    if (plus) plus.disabled = true;
  } else {
    pause.disabled = false;
    const plus = document.getElementById("btn-plus");
    if (plus) plus.disabled = false;
  }
}

function bind() {
  const byId = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  };
  byId("btn-sound", toggleSound);
  byId("btn-retry", loadRoutine);
  byId("btn-start", () => startWorkout());
  byId("btn-free", openFreeTimer);
  byId("btn-exit", askExit);
  byId("btn-stay", cancelExit);
  byId("btn-leave", confirmExit);
  byId("btn-pause", pauseTimer);
  byId("btn-plus", addTen);
  byId("btn-skip", skipCurrent);
  byId("btn-listo", listo);
  byId("btn-prev", goPrev);
  byId("btn-next", skipCurrent);
  byId("btn-home", () => { state.view = "day"; render(); });
  byId("btn-free-back", closeFree);
  byId("btn-free-start", () => startFree(state.freePreset));
  byId("btn-free-again", () => startFree(state.freePreset));
  byId("btn-free-pick", () => { state.freePhase = "pick"; timer.mode = "idle"; render(); });

  document.querySelectorAll(".preset").forEach((el) => {
    el.addEventListener("click", () => {
      state.freePreset = Number(el.dataset.sec);
      document.querySelectorAll(".preset").forEach((p) => {
        const on = p === el;
        p.classList.toggle("is-on", on);
        p.setAttribute("aria-pressed", String(on));
      });
    });
  });
}

/* Hooks para capturas / prueba */
window.__tablero = {
  DATA_BASE,
  getState: () => ({ ...state, timer: { ...timer } }),
  startWorkout,
  enterStep,
  jumpTo(index, opts = {}) {
    if (state.view !== "workout") startWorkout({ stepIndex: index, skipPrep: true, ...opts });
    else {
      state.stepIndex = index;
      enterStep({ skipPrep: true, ...opts });
    }
  },
  showDone(ms) {
    stopTick();
    state.totalMs = ms;
    state.view = "done";
    releaseWake();
    render();
  },
  showDay() { stopTick(); state.view = "day"; releaseWake(); render(); },
  pauseTimer,
  addTen,
};


document.addEventListener("error", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLImageElement)) return;
  if (!t.classList.contains("thumb") && !t.classList.contains("wo-photo")) return;
  const ph = document.createElement("div");
  ph.className = "thumb-ph";
  ph.setAttribute("aria-hidden", "true");
  ph.innerHTML = ICONS.pose;
  t.replaceWith(ph);
}, true);

loadRoutine();
