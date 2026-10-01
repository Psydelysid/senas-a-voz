import { initListen } from "./listen.js";
import { initAlphabet } from "./alphabet.js";
import { FRASES, SUGERIDAS } from "./frases.js";
import { canListen, createListener } from "./speech.js";
import { loadWordSigns, frameFeature, reduceHand, resample, matchSequence, SEQ_LEN } from "./palabras.js";
import {
  LETTERS,
    STATIC_LETTER,
  dynamicLetter,
  shapeFeatures,
  orientFeature,
  classifyShape,
  drawLetter,
} from "./lsm.js";

// MediaPipe se carga al encender la cámara, así el modo Voz → Señas funciona aunque falle.
const VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const POSE_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const STORAGE_KEY = "senas-a-voz:signs";
const CALIB_KEY = "senas-a-voz:lsm-calibracion";
const MY_PHRASES_KEY = "senas-a-voz:mis-frases";
const RECORD_MS = 3000;
const CALIB_MS = 1500;

const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("overlay");
const ctx = canvas.getContext("2d");

// ---------- Estado ----------
let vision = null; // módulo de MediaPipe
let landmarker = null;
let poser = null; // postura del cuerpo: dónde se hace la seña (cara, pecho…)
let lastPose = null;
let frameCount = 0;
let wordDict = null; // diccionario de señas de palabras (MSL-150)
let drawer = null;
let running = false;
let lastVideoTime = -1;

const settings = {
  holdMs: 600,
  tolerance: 0.3, // señas propias
  letterTol: 0.45, // abecedario LSM
  wordGapMs: 1300, // sin mano este tiempo = fin de palabra
  words: true, // reconocer señas de palabras del diccionario LSM
  wordTol: 0.55,
  speakLetters: false,
  rate: 1,
  muted: false,
  voice: null,
};

// Señas entrenadas: { [nombre]: [{ hands: 1|2, f: number[] }, ...] }
let customSigns = loadJSON(STORAGE_KEY);
// Calibración del abecedario: { [forma]: [{ f, o }, ...] }
let calibration = loadJSON(CALIB_KEY);
let calibList = flattenCalibration();

let recording = null; // { name, until, samples: [] }
let calibrating = null; // { shape, until, samples: [] }

// ---------- Geometría ----------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const palmSize = (lm) => dist(lm[0], lm[9]) || 1e-6;

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

// ---------- Movimiento (letras J, K, LL, Ñ, Q, RR, X, Z) ----------
const trail = [];

/**
 * ¿La mano se está moviendo? Mira el recorrido de la punta del índice en los últimos 0.7 s,
 * contando solo desde `since` (cuando se aceptó la forma): el salto de una letra a otra no cuenta.
 */
function trackMotion(lm, now, since) {
  const ps = palmSize(lm);
  trail.push({ t: now, x: lm[8].x / ps, y: lm[8].y / ps });
  while (trail.length && now - trail[0].t > 700) trail.shift();
  const pts = trail.filter((p) => p.t >= since);
  let path = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach((p, i) => {
    if (i) path += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  });
  return path > 1.4 && Math.hypot(maxX - minX, maxY - minY) > 0.5;
}

// ---------- Deletreo ----------
let word = [];
let wordTimes = []; // cuándo se aceptó cada letra (para deshacerlas si era una seña de palabra)
let lastHandAt = 0;
let dyn = null; // forma sostenida que puede convertirse en letra con movimiento

function renderWord() {
  $("spelling").textContent = word.join("");
  $("spellRow").classList.toggle("empty", !word.length);
}

function addLetter(letter, now) {
  word.push(letter);
  wordTimes.push(now);
  renderWord();
  if (settings.speakLetters) speak(letter.toLowerCase());
}

function finishWord() {
  if (!word.length) return;
  const text = word.join("").toLowerCase();
  word = [];
  wordTimes = [];
  renderWord();
  emit(text);
}

/** Se llama en cada cuadro mientras se sostiene una forma ya aceptada. */
function checkMotion(moving, edgeOn) {
  if (!dyn || dyn.upgraded || !moving) return;
  const letter = dynamicLetter(dyn.shape, edgeOn);
  if (!letter) return;
  if (dyn.pending) {
    word.push(letter);
    wordTimes.push(dyn.since);
  } else {
    word[word.length - 1] = letter;
  }
  dyn.upgraded = true;
  renderWord();
  showCaption(letter);
}

// ---------- Estabilizador: una seña debe mantenerse antes de aceptarla ----------
const stab = { label: null, since: 0, spoken: null, emptySince: 0 };

/** label: "w:<palabra>" (seña propia) · "s:<forma>" (abecedario) · null */
function update(label, now) {
  if (label !== stab.label) {
    stab.label = label;
    stab.since = now;
    dyn = null;
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
  $("current").textContent = describe(label);

  if (label && held >= 1 && stab.spoken !== label) {
    stab.spoken = label;
    accept(label, now);
  }
}

function describe(label) {
  if (!label) return "—";
  if (label.startsWith("w:")) return label.slice(2);
  const shape = label.slice(2);
  const letter = STATIC_LETTER[shape];
  if (letter) return `Letra ${letter}`;
  return shape === "Z0" ? "Z (muévela)" : "Q / X (muévela)";
}

function accept(label, now) {
  if (label.startsWith("w:")) {
    finishWord();
    emit(label.slice(2));
    return;
  }
  const shape = label.slice(2);
  const letter = STATIC_LETTER[shape];
  if (letter) {
    addLetter(letter, now);
    showCaption(letter);
    dyn = { shape, pending: false, upgraded: false, since: now };
  } else {
    dyn = { shape, pending: true, upgraded: false, since: now };
  }
}

// ---------- Salida: voz + subtítulos ----------
let captionTimer = 0;
let lastSaid = "";

/** Lo que expresa la persona que usa la app: se muestra, se registra y se dice en voz alta. */
function emit(text) {
  lastSaid = text;
  addMsg("me", text);
  showCaption(text);
  speak(text);
}

/** Registro de la conversación: "me" = quien usa la app, "them" = la otra persona. */
function addMsg(who, text) {
  const log = $("chatLog");
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  const label = document.createElement("small");
  label.textContent = who === "me" ? "🧏 Yo" : "🗣️ La otra persona";
  div.append(label, text);
  log.appendChild(div);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

function showCaption(text) {
  const cap = $("caption");
  cap.textContent = text;
  cap.classList.add("show");
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => cap.classList.remove("show"), 1800);
}

let speakToken = 0;
function speak(text, interrupt = true) {
  if (settings.muted || !("speechSynthesis" in window) || !text) return;
  if (interrupt) speechSynthesis.cancel();
  // El micrófono se pausa mientras la app habla, para no transcribir su propia voz.
  const token = ++speakToken;
  convListener.pause();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = settings.voice?.lang || "es-ES";
  if (settings.voice) u.voice = settings.voice;
  u.rate = settings.rate;
  u.onend = u.onerror = () => {
    if (token === speakToken) setTimeout(() => token === speakToken && convListener.resume(), 300);
  };
  speechSynthesis.speak(u);
}

// ---------- Escuchar a la otra persona ----------
const convListener = createListener({
  getLang: () => $("langSelect").value || "es-MX",
  onFinal: (text) => {
    text = text.trim();
    if (!text) return;
    const they = $("theySay");
    they.classList.remove("muted");
    they.textContent = text;
    addMsg("them", text);
  },
  onInterim: (text) => ($("theyInterim").textContent = text),
  onError: (msg) => {
    $("convMicStatus").textContent = msg;
    if (!convListener.listening) setConvMicIdle();
  },
});

function setConvMicIdle() {
  const b = $("convMicBtn");
  b.textContent = "🎤 Escuchar";
  b.classList.remove("listening");
}

function toggleConvMic() {
  if (convListener.listening) {
    convListener.stop();
    setConvMicIdle();
    $("convMicStatus").textContent = "";
    return;
  }
  convListener.start();
  const b = $("convMicBtn");
  b.textContent = "Dejar de escuchar";
  b.classList.add("listening");
  $("convMicStatus").textContent = "Escuchando a la otra persona…";
}

// ---------- Frases rápidas ----------
let myPhrases = loadJSON(MY_PHRASES_KEY);
if (!Array.isArray(myPhrases)) myPhrases = [];
let phraseCat = FRASES[0].cat;
const MY_CAT = "⭐ Mis frases";

function renderPhrases() {
  const cats = $("phraseCats");
  cats.innerHTML = "";
  for (const name of [...FRASES.map((c) => c.cat), MY_CAT]) {
    const b = document.createElement("button");
    b.className = "chip" + (name === phraseCat ? " active" : "");
    b.textContent = name;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", name === phraseCat);
    b.onclick = () => {
      phraseCat = name;
      renderPhrases();
    };
    cats.appendChild(b);
  }
  const grid = $("phraseGrid");
  grid.innerHTML = "";
  const mine = phraseCat === MY_CAT;
  const items = mine ? myPhrases : FRASES.find((c) => c.cat === phraseCat).items;
  if (mine && !items.length) {
    grid.innerHTML = '<p class="muted small">Agrega aquí las frases que usas seguido (tu nombre, tu dirección…).</p>';
  }
  items.forEach((text, idx) => {
    const b = document.createElement("button");
    b.className = "phrase";
    b.textContent = text;
    b.onclick = () => {
      finishWord();
      emit(text);
    };
    if (mine) {
      const del = document.createElement("span");
      del.className = "del";
      del.textContent = "✕";
      del.setAttribute("aria-label", "Quitar frase");
      del.onclick = (e) => {
        e.stopPropagation();
        myPhrases.splice(idx, 1);
        saveJSON(MY_PHRASES_KEY, myPhrases);
        renderPhrases();
      };
      b.appendChild(del);
    }
    grid.appendChild(b);
  });
  $("myPhraseForm").hidden = !mine;
}

function renderSuggestions() {
  const box = $("suggestList");
  box.innerHTML = "";
  for (const text of SUGERIDAS) {
    const b = document.createElement("button");
    const done = Boolean(customSigns[text]);
    b.className = "chip" + (done ? " done" : "");
    b.textContent = (done ? "✓ " : "") + text;
    b.onclick = () => {
      $("signName").value = text;
      record();
    };
    box.appendChild(b);
  }
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
      // Postura y diccionario de palabras: si fallan, el deletreo sigue funcionando.
      vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_URL, delegate: opts.baseOptions.delegate },
        runningMode: "VIDEO",
        numPoses: 1,
      })
        .then((p) => (poser = p))
        .catch((e) => console.warn("Sin postura:", e));
      loadWordSigns()
        .then((d) => (wordDict = d))
        .catch((e) => console.warn("Sin diccionario de palabras:", e));
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
  lastPose = null;
  wordBuf.length = 0;
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
    // La postura cambia despacio: basta calcularla un cuadro sí y otro no.
    if (poser && settings.words && frameCount++ % 2 === 0) {
      lastPose = poser.detectForVideo(video, now).landmarks?.[0] || null;
    }
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
    flushPending(now);
    lastWord.dropped = true;
    update(null, now);
    trail.length = 0;
    if (word.length && now - lastHandAt > settings.wordGapMs) finishWord();
    return;
  }
  lastHandAt = now;
  const feat = features(result);
  const lm = result.landmarks[0];

  if (calibrating) {
    if (now < calibrating.until && result.landmarks.length === 1) {
      calibrating.samples.push(letterFeatures(result));
      $("countdown").textContent = `● ${calibrating.samples.length}`;
    }
    update(null, now);
    return;
  }

  if (recording) {
    if (now < recording.until) {
      recording.samples.push(feat);
      $("countdown").textContent = `● ${recording.samples.length}`;
    }
    update(null, now);
    return;
  }

  const moving = trackMotion(lm, now, dyn ? dyn.since : Infinity);
  const custom = classifyCustom(feat);
  let label = custom ? `w:${custom}` : null;
  if (!label && result.landmarks.length === 1) {
    const { f, o } = letterFeatures(result);
    const r = classifyShape(f, o, calibList, settings.letterTol);
    if (r) label = `s:${r.label}`;
  }
  update(label, now);
  const edgeOn = dist(lm[5], lm[17]) < dist(lm[0], lm[9]) * 0.4;
  checkMotion(moving, edgeOn);
  spotWords(result, now);
}

// ---------- Señas de palabras (diccionario LSM) ----------
const wordBuf = [];
let lastSpot = 0;
let wordCooldown = 0;
let pending = null; // mejor coincidencia hasta ahora; se acepta cuando deja de mejorar
let lastWord = { id: null, t: 0, dropped: true };

/**
 * Busca, en los últimos 0.8–1.7 s, una seña del diccionario. Compara la trayectoria de las manos
 * respecto a los hombros y su forma con las grabaciones (DTW).
 */
function spotWords(result, now) {
  if (!settings.words || !wordDict || !lastPose) return;
  const ls = lastPose[11];
  const rs = lastPose[12];
  if (!ls || !rs) return;
  const aspect = video.videoWidth / video.videoHeight || 4 / 3;
  // Cada mano detectada se asigna al lado del cuerpo cuya muñeca (según la postura) está más cerca.
  const hands = { l: null, r: null };
  const d2 = (a, b) => (a && b ? ((a.x - b.x) * aspect) ** 2 + (a.y - b.y) ** 2 : Infinity);
  for (const hlm of result.landmarks) {
    let side = d2(hlm[0], lastPose[16]) <= d2(hlm[0], lastPose[15]) ? "r" : "l";
    if (hands[side]) side = side === "r" ? "l" : "r";
    hands[side] = reduceHand(hlm);
  }
  wordBuf.push({ t: now, f: frameFeature(ls, rs, hands, aspect) });
  while (wordBuf.length && now - wordBuf[0].t > 2000) wordBuf.shift();
  if (now - lastSpot < 200 || now < wordCooldown) return;
  lastSpot = now;

  let best = null;
  for (const win of [800, 1200, 1700]) {
    const frames = wordBuf.filter((e) => now - e.t <= win);
    if (frames.length < 10 || now - frames[0].t < win * 0.8) continue;
    if (handTravel(frames) < 0.5) continue; // sin movimiento: se deja al deletreo
    const r = matchSequence(wordDict, resample(frames.map((e) => e.f), SEQ_LEN));
    if (!best || r.d < best.d) best = { ...r, start: frames[0].t };
  }
  const good = best && best.d < settings.wordTol && best.d / best.d2 < 0.8 ? best : null;
  // Se espera al punto de mejor coincidencia: mientras siga mejorando, se actualiza.
  if (good && (!pending || (good.best === pending.best && good.d < pending.d))) {
    pending = { ...good, t: now };
  } else if (pending && (!good || good.best !== pending.best || good.d >= pending.d || now - pending.t > 400)) {
    flushPending(now);
  }
}

function flushPending(now) {
  if (!pending) return;
  const { best: sign, start } = pending;
  pending = null;
  // La misma palabra no se repite hasta bajar las manos o pasar 2.5 s.
  if (sign.id === lastWord.id && !lastWord.dropped && now - lastWord.t < 2500) return;
  lastWord = { id: sign.id, t: now, dropped: false };
  acceptWordSign(sign, start, now);
}

/** Recorrido total de las muñecas, en anchos de hombros. */
function handTravel(frames) {
  let sum = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].f;
    const b = frames[i].f;
    for (const k of [0, 13]) if (a[k] && b[k]) sum += Math.hypot(b[k + 1] - a[k + 1], b[k + 2] - a[k + 2]);
  }
  return sum;
}

function acceptWordSign(sign, start, now) {
  // Las letras que se colaron mientras se hacía la seña no eran letras: se quitan.
  while (wordTimes.length && wordTimes[wordTimes.length - 1] >= start) {
    word.pop();
    wordTimes.pop();
  }
  renderWord();
  finishWord();
  emit(sign.word);
  wordBuf.length = 0;
  wordCooldown = now + 1000;
  dyn = null;
  stab.spoken = stab.label; // la forma que quedó en la mano no cuenta como letra nueva
}

/** Rasgos de forma (3D, del modelo de MediaPipe) y orientación (en la imagen). */
function letterFeatures(result) {
  const lm = result.landmarks[0];
  const world = result.worldLandmarks?.[0] || lm;
  const aspect = video.videoWidth / video.videoHeight || 4 / 3;
  return {
    f: shapeFeatures(world),
    o: orientFeature((lm[9].x - lm[0].x) * aspect, lm[9].y - lm[0].y),
  };
}

// ---------- Entrenamiento de señas propias ----------
function loadJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento no disponible: los datos solo duran esta sesión */
  }
}
function saveSigns() {
  saveJSON(STORAGE_KEY, customSigns);
  renderSigns();
  renderSuggestions();
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

// ---------- Calibración del abecedario ----------
// Formas estáticas a calibrar (las letras con movimiento usan la forma con la que empiezan).
const CALIB_STEPS = [
  ...LETTERS.filter((l) => !l.motion).map((l) => ({ shape: l.shape, key: l.key, title: l.key })),
  { shape: "Z0", key: "Z", title: "Z (sin moverla)" },
  { shape: "GARRA", key: "X", title: "Q / X (sin moverla)" },
];
let calibAbort = false;
let calibSkip = false;

function flattenCalibration() {
  return Object.entries(calibration).flatMap(([label, samples]) =>
    samples.map((s) => ({ label, f: s.f, o: s.o })),
  );
}

function renderCalibStatus() {
  const n = Object.keys(calibration).length;
  $("calibStatus").textContent = n
    ? `${n} de ${CALIB_STEPS.length} formas calibradas con tu mano.`
    : "Sin calibrar: se usan las formas de referencia.";
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function calibrate() {
  if (!running) {
    alert("Primero enciende la cámara.");
    return;
  }
  calibAbort = false;
  $("calibBtn").hidden = true;
  $("calibControls").hidden = false;
  const hint = $("hint");
  const hintCtx = $("hintCanvas").getContext("2d");
  const cd = $("countdown");
  hint.hidden = false;
  cd.hidden = false;
  for (const step of CALIB_STEPS) {
    if (calibAbort) break;
    calibSkip = false;
    $("hintTitle").textContent = `Haz la ${step.title}`;
    drawLetter(hintCtx, step.key, 0.3);
    for (const n of [3, 2, 1]) {
      cd.textContent = n;
      await wait(800);
      if (calibAbort || calibSkip) break;
    }
    if (calibAbort) break;
    if (calibSkip) continue;
    calibrating = { shape: step.shape, until: performance.now() + CALIB_MS, samples: [] };
    await wait(CALIB_MS);
    const { samples } = calibrating;
    calibrating = null;
    if (samples.length >= 8) {
      calibration[step.shape] = samples.slice(-40);
      calibList = flattenCalibration();
      saveJSON(CALIB_KEY, calibration);
      renderCalibStatus();
    }
  }
  calibrating = null;
  hint.hidden = true;
  cd.hidden = true;
  $("calibBtn").hidden = false;
  $("calibControls").hidden = true;
}

// ---------- Controles ----------
$("startBtn").onclick = start;
$("recordBtn").onclick = record;
$("signName").addEventListener("keydown", (e) => e.key === "Enter" && record());
$("exportBtn").onclick = exportSigns;
$("importFile").onchange = (e) => e.target.files[0] && importSigns(e.target.files[0]);
$("clearBtn").onclick = () => ($("chatLog").innerHTML = "");
$("repeatBtn").onclick = () => speak(lastSaid);
$("convMicBtn").onclick = toggleConvMic;
if (!canListen) {
  $("convMicBtn").disabled = true;
  $("convMicStatus").textContent = "Este navegador no puede transcribir voz: pide a la otra persona que escriba.";
}
$("sayForm").onsubmit = (e) => {
  e.preventDefault();
  const text = $("sayText").value.trim();
  if (!text) return;
  finishWord();
  emit(text);
  $("sayText").value = "";
};
$("myPhraseForm").onsubmit = (e) => {
  e.preventDefault();
  const text = $("myPhraseText").value.trim();
  if (!text) return;
  myPhrases.push(text);
  saveJSON(MY_PHRASES_KEY, myPhrases);
  $("myPhraseText").value = "";
  renderPhrases();
};
$("testVoiceBtn").onclick = () => speak("Hola, así sonará mi voz.");
$("muteChk").onchange = (e) => {
  settings.muted = e.target.checked;
  if (settings.muted) speechSynthesis.cancel();
};
$("speakLettersChk").onchange = (e) => (settings.speakLetters = e.target.checked);
$("wordsChk").onchange = (e) => {
  settings.words = e.target.checked;
  wordBuf.length = 0;
};
$("wordTol").oninput = (e) => {
  settings.wordTol = Number(e.target.value);
  $("wordTolVal").textContent = settings.wordTol.toFixed(2);
};
$("letterTol").oninput = (e) => {
  settings.letterTol = Number(e.target.value);
  $("letterTolVal").textContent = settings.letterTol.toFixed(2);
};
$("backspaceBtn").onclick = () => {
  word.pop();
  wordTimes.pop();
  renderWord();
};
$("finishBtn").onclick = finishWord;
$("calibBtn").onclick = calibrate;
$("calibSkipBtn").onclick = () => (calibSkip = true);
$("calibStopBtn").onclick = () => (calibAbort = true);
$("calibClearBtn").onclick = () => {
  if (!confirm("¿Borrar la calibración del abecedario?")) return;
  calibration = {};
  calibList = [];
  saveJSON(CALIB_KEY, calibration);
  renderCalibStatus();
};
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
const alphabet = initAlphabet();

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
    $("modeAlphabet").hidden = mode !== "alphabet";
    alphabet.setActive(mode === "alphabet");
    if (mode !== "sign") {
      convListener.stop();
      setConvMicIdle();
      // Sin cámara ni voz sintética: ahorra batería y evita que el micrófono se oiga a sí mismo.
      if (running) stopCamera();
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    }
    if (mode !== "voice") listener.stop();
  };
}

if ("speechSynthesis" in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}
renderSigns();
renderSuggestions();
renderPhrases();
renderCalibStatus();
renderWord();

// Pruebas automáticas: con ?debug en la URL se puede alimentar el reconocimiento sin cámara.
if (new URLSearchParams(location.search).has("debug")) {
  window.__debug = {
    process,
    setPose: (p) => (lastPose = p),
    loadWords: async () => (wordDict = await loadWordSigns()),
  };
}
