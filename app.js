import { initListen } from "./listen.js";

// MediaPipe se carga al encender la cámara, así el modo Voz → Señas funciona aunque falle.
const VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const STORAGE_KEY = "senas-a-voz:signs";
const RECORD_MS = 3000;

const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("overlay");
const ctx = canvas.getContext("2d");

// ---------- Estado ----------
let vision = null; // módulo de MediaPipe
let landmarker = null;
let drawer = null;
let running = false;
let lastVideoTime = -1;

const settings = {
  holdMs: 600,
  tolerance: 0.3,
  useBuiltins: true,
  rate: 1,
  muted: false,
  voice: null,
};

// Señas entrenadas: { [nombre]: [{ hands: 1|2, f: number[] }, ...] }
let customSigns = loadSigns();

let recording = null; // { name, until, samples: [] }

// ---------- Geometría ----------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const palmSize = (lm) => dist(lm[0], lm[9]) || 1e-6;

/** Qué dedos están extendidos: [pulgar, índice, medio, anular, meñique] */
function fingerStates(lm) {
  const w = lm[0];
  const ext = (tip, pip) => dist(lm[tip], w) > dist(lm[pip], w) * 1.15;
  const ps = palmSize(lm);
  const thumb = dist(lm[4], lm[9]) > ps * 0.7 && dist(lm[4], lm[5]) > ps * 0.4;
  return [thumb, ext(8, 6), ext(12, 10), ext(16, 14), ext(20, 18)];
}

/** Señas predefinidas por forma de la mano (una mano). */
function classifyBuiltin(lm) {
  const [t, i, m, r, p] = fingerStates(lm);
  const ps = palmSize(lm);
  const key = [t, i, m, r, p].map(Number).join("");

  if (dist(lm[4], lm[8]) < ps * 0.35 && m && r && p) return "De acuerdo";
  if (key === "11111") return "Hola";
  if (key === "11001") return "Te quiero";
  if (key === "10001") return "Llámame";
  if (i && m && !r && !p) return "Paz";
  if (key === "01000" && lm[8].y < lm[5].y) return "Un momento";
  if (key === "10000") {
    const dx = lm[4].x - lm[2].x;
    const dy = lm[4].y - lm[2].y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > ps * 0.4) {
      return dy < 0 ? "Bien" : "Mal";
    }
  }
  return null;
}

/**
 * Vector de rasgos invariable a posición y tamaño.
 * Una mano: coordenadas relativas a la muñeca, escaladas por el tamaño de la palma,
 * reflejadas si es la mano izquierda (así la seña sirve con cualquier mano).
 * Dos manos: ambas ordenadas de izquierda a derecha + vector entre muñecas.
 */
function handVector(lm, flip) {
  const ps = palmSize(lm);
  const out = [];
  for (let k = 1; k < 21; k++) {
    const dx = (lm[k].x - lm[0].x) / ps;
    out.push(flip ? -dx : dx, (lm[k].y - lm[0].y) / ps);
  }
  return out;
}

function features(result) {
  const hands = result.landmarks;
  if (hands.length === 1) {
    const label = result.handedness?.[0]?.[0]?.categoryName;
    return { hands: 1, f: handVector(hands[0], label === "Left") };
  }
  const [a, b] = [...hands].sort((h1, h2) => h1[0].x - h2[0].x);
  const ps = (palmSize(a) + palmSize(b)) / 2;
  return {
    hands: 2,
    f: [
      ...handVector(a, false),
      ...handVector(b, false),
      (b[0].x - a[0].x) / ps,
      (b[0].y - a[0].y) / ps,
    ],
  };
}

/** k vecinos más cercanos sobre las señas entrenadas. */
function classifyCustom(feat) {
  const candidates = [];
  for (const [name, samples] of Object.entries(customSigns)) {
    for (const s of samples) {
      if (s.hands !== feat.hands || s.f.length !== feat.f.length) continue;
      let sum = 0;
      for (let k = 0; k < s.f.length; k++) sum += (s.f[k] - feat.f[k]) ** 2;
      candidates.push({ name, d: Math.sqrt(sum / s.f.length) });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((x, y) => x.d - y.d);
  const top = candidates.slice(0, 5);
  const votes = {};
  for (const c of top) votes[c.name] = (votes[c.name] || 0) + 1;
  const [best, count] = Object.entries(votes).sort((x, y) => y[1] - x[1])[0];
  const needed = Math.min(3, top.length);
  const nearest = top.find((c) => c.name === best).d;
  return count >= needed && nearest < settings.tolerance ? best : null;
}

// ---------- Estabilizador: una seña debe mantenerse antes de hablar ----------
const stab = { label: null, since: 0, spoken: null, emptySince: 0 };

function update(label, now) {
  if (label !== stab.label) {
    stab.label = label;
    stab.since = now;
  }
  if (label === null) {
    if (!stab.emptySince) stab.emptySince = now;
    // Bajar la mano o hacer puño ~0.3 s permite repetir la misma seña.
    if (now - stab.emptySince > 300) stab.spoken = null;
  } else {
    stab.emptySince = 0;
  }

  const held = label ? Math.min(1, (now - stab.since) / settings.holdMs) : 0;
  $("holdBar").style.width = `${held * 100}%`;
  $("current").textContent = label ?? "—";

  if (label && held >= 1 && stab.spoken !== label) {
    stab.spoken = label;
    emit(label);
  }
}

// ---------- Salida: voz + subtítulos ----------
let captionTimer = 0;
function emit(text) {
  const t = $("transcript");
  t.textContent = (t.textContent ? t.textContent + " " : "") + text;
  const cap = $("caption");
  cap.textContent = text;
  cap.classList.add("show");
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => cap.classList.remove("show"), 1800);
  speak(text);
}

function speak(text, interrupt = true) {
  if (settings.muted || !("speechSynthesis" in window) || !text) return;
  if (interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = settings.voice?.lang || "es-ES";
  if (settings.voice) u.voice = settings.voice;
  u.rate = settings.rate;
  speechSynthesis.speak(u);
}

function loadVoices() {
  const sel = $("voiceSelect");
  const voices = speechSynthesis.getVoices();
  const spanish = voices.filter((v) => v.lang.toLowerCase().startsWith("es"));
  const list = spanish.length ? spanish : voices;
  sel.innerHTML = "";
  list.forEach((v, idx) => {
    const o = document.createElement("option");
    o.value = idx;
    o.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(o);
  });
  const preferred = list.findIndex((v) => /es-(MX|US|419)/i.test(v.lang));
  const pick = preferred >= 0 ? preferred : 0;
  sel.value = pick;
  settings.voice = list[pick] || null;
  sel.onchange = () => (settings.voice = list[Number(sel.value)] || null);
}

// ---------- Cámara + bucle principal ----------
async function start() {
  const btn = $("startBtn");
  const status = $("loadStatus");
  btn.disabled = true;
  try {
    status.textContent = "Cargando modelo de manos…";
    if (!landmarker) {
      vision = await import(VISION_URL);
      const { FilesetResolver, HandLandmarker } = vision;
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const opts = {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5,
      };
      try {
        landmarker = await HandLandmarker.createFromOptions(fileset, opts);
      } catch {
        opts.baseOptions.delegate = "CPU";
        landmarker = await HandLandmarker.createFromOptions(fileset, opts);
      }
    }
    status.textContent = "Pidiendo permiso para la cámara…";
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    drawer = new vision.DrawingUtils(ctx);
    $("placeholder").hidden = true;
    running = true;
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    status.textContent =
      err?.name === "NotAllowedError"
        ? "No se dio permiso a la cámara. Actívalo en el navegador y vuelve a intentarlo."
        : `No se pudo iniciar: ${err?.message || err}`;
    btn.disabled = false;
  }
}

function stopCamera() {
  running = false;
  video.srcObject?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  update(null, performance.now());
  $("placeholder").hidden = false;
  $("startBtn").disabled = false;
  $("loadStatus").textContent = "";
}

function loop() {
  if (!running) return;
  const now = performance.now();
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = landmarker.detectForVideo(video, now);
    draw(result);
    process(result, now);
  }
  requestAnimationFrame(loop);
}

function draw(result) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const lm of result.landmarks) {
    drawer.drawConnectors(lm, vision.HandLandmarker.HAND_CONNECTIONS, { color: "#4f8cff", lineWidth: 4 });
    drawer.drawLandmarks(lm, { color: "#ffffff", fillColor: "#22c55e", radius: 4 });
  }
}

function process(result, now) {
  if (!result.landmarks.length) {
    update(null, now);
    return;
  }
  const feat = features(result);

  if (recording) {
    if (now < recording.until) {
      recording.samples.push(feat);
      $("countdown").textContent = `● ${recording.samples.length}`;
    }
    update(null, now);
    return;
  }

  let label = classifyCustom(feat);
  if (!label && settings.useBuiltins) label = classifyBuiltin(result.landmarks[0]);
  update(label, now);
}

// ---------- Entrenamiento de señas propias ----------
function loadSigns() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}
function saveSigns() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customSigns));
  } catch {
    /* almacenamiento no disponible: las señas solo duran esta sesión */
  }
  renderSigns();
}

function renderSigns() {
  const ul = $("signList");
  ul.innerHTML = "";
  const names = Object.keys(customSigns);
  if (!names.length) {
    ul.innerHTML = '<li class="muted small">Aún no has enseñado ninguna seña.</li>';
    return;
  }
  for (const name of names) {
    const samples = customSigns[name];
    const hands = samples[0]?.hands === 2 ? "2 manos" : "1 mano";
    const li = document.createElement("li");
    li.innerHTML = `<span><strong></strong> <span class="muted small">${samples.length} muestras · ${hands}</span></span>`;
    li.querySelector("strong").textContent = name;
    const del = document.createElement("button");
    del.textContent = "Eliminar";
    del.onclick = () => {
      delete customSigns[name];
      saveSigns();
    };
    li.appendChild(del);
    ul.appendChild(li);
  }
}

async function record() {
  const name = $("signName").value.trim();
  if (!name) {
    $("signName").focus();
    return;
  }
  if (!running) {
    alert("Primero enciende la cámara.");
    return;
  }
  const btn = $("recordBtn");
  btn.disabled = true;
  const cd = $("countdown");
  cd.hidden = false;
  for (const n of [3, 2, 1]) {
    cd.textContent = n;
    await new Promise((r) => setTimeout(r, 700));
  }
  recording = { name, until: performance.now() + RECORD_MS, samples: [] };
  await new Promise((r) => setTimeout(r, RECORD_MS));
  const { samples } = recording;
  recording = null;
  cd.hidden = true;
  btn.disabled = false;

  // Conserva solo las muestras con el número de manos más frecuente.
  const ones = samples.filter((s) => s.hands === 1);
  const twos = samples.filter((s) => s.hands === 2);
  const kept = ones.length >= twos.length ? ones : twos;
  if (kept.length < 10) {
    alert("No se vieron bien las manos. Acércate a la luz y vuelve a intentarlo.");
    return;
  }
  const existing = (customSigns[name] || []).filter((s) => s.hands === kept[0].hands);
  customSigns[name] = [...existing, ...kept].slice(-240);
  saveSigns();
  $("signName").value = "";
}

function exportSigns() {
  const blob = new Blob([JSON.stringify(customSigns)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "mis-senas.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importSigns(file) {
  try {
    const data = JSON.parse(await file.text());
    for (const [name, samples] of Object.entries(data)) {
      if (!Array.isArray(samples)) continue;
      const valid = samples.filter((s) => (s.hands === 1 || s.hands === 2) && Array.isArray(s.f));
      if (valid.length) customSigns[name] = [...(customSigns[name] || []), ...valid];
    }
    saveSigns();
  } catch {
    alert("El archivo no es válido.");
  }
}

// ---------- Controles ----------
$("startBtn").onclick = start;
$("recordBtn").onclick = record;
$("signName").addEventListener("keydown", (e) => e.key === "Enter" && record());
$("exportBtn").onclick = exportSigns;
$("importFile").onchange = (e) => e.target.files[0] && importSigns(e.target.files[0]);
$("clearBtn").onclick = () => ($("transcript").textContent = "");
$("speakAllBtn").onclick = () => speak($("transcript").textContent);
$("testVoiceBtn").onclick = () => speak("Hola, así sonará mi voz.");
$("muteChk").onchange = (e) => {
  settings.muted = e.target.checked;
  if (settings.muted) speechSynthesis.cancel();
};
$("builtinChk").onchange = (e) => (settings.useBuiltins = e.target.checked);
$("rate").oninput = (e) => {
  settings.rate = Number(e.target.value);
  $("rateVal").textContent = settings.rate.toFixed(1);
};
$("hold").oninput = (e) => {
  settings.holdMs = Number(e.target.value);
  $("holdVal").textContent = settings.holdMs;
};
$("tol").oninput = (e) => {
  settings.tolerance = Number(e.target.value);
  $("tolVal").textContent = settings.tolerance.toFixed(2);
};

// ---------- Pestañas ----------
const listener = initListen({ getSigns: () => customSigns });

for (const tab of document.querySelectorAll(".tab")) {
  tab.onclick = () => {
    const mode = tab.dataset.mode;
    for (const t of document.querySelectorAll(".tab")) {
      const active = t === tab;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", active);
    }
    $("modeSign").hidden = mode !== "sign";
    $("modeVoice").hidden = mode !== "voice";
    if (mode === "voice") {
      // Sin cámara ni voz sintética: ahorra batería y evita que el micrófono se oiga a sí mismo.
      if (running) stopCamera();
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    } else {
      listener.stop();
    }
  };
}

if ("speechSynthesis" in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}
renderSigns();
