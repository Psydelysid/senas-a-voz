// Modo "Voz → Señas": escucha el micrófono, transcribe y muestra cada palabra como seña.
// Las palabras que el usuario enseñó se muestran con su seña; las demás se deletrean con el
// abecedario de la Lengua de Señas Mexicana (LSM).
import { LETTER_BY_KEY, drawLetter, spellWord } from "./lsm.js";
import { canListen, createListener } from "./speech.js";
import { normalize } from "./text.js";
import { loadWordSigns, findSign, drawSign } from "./palabras.js";
export { normalize };

const $ = (id) => document.getElementById(id);


// Conexiones entre los 21 puntos de la mano (mismo orden que MediaPipe).
const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const MAX_PHRASE_WORDS = 4;

export function buildDictionary(customSigns) {
  const dict = new Map();
  for (const [name, samples] of Object.entries(customSigns)) {
    const key = normalize(name);
    if (key && samples.length) dict.set(key, { type: "custom", label: name, samples });
  }
  return dict;
}

/** Convierte texto en una lista de señas a mostrar. */
export function tokenize(text, dict, spell, lsm = null) {
  // Palabras con acentos (para distinguir «sí» de «si») y su forma normalizada.
  const raw = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => normalize(w));
  const words = raw.map(normalize);
  const tokens = [];
  for (let i = 0; i < words.length; ) {
    let matched = false;
    for (let len = Math.min(MAX_PHRASE_WORDS, words.length - i); len >= 1; len--) {
      const phrase = words.slice(i, i + len).join(" ");
      // Primero las señas que enseñó el usuario; luego el diccionario LSM.
      let entry = dict.get(phrase);
      if (!entry && lsm) {
        const sign = findSign(lsm, phrase, raw.slice(i, i + len).join(" "));
        if (sign) entry = { type: "lsm", label: sign.word, sign };
      }
      if (entry) {
        tokens.push({ kind: "sign", word: phrase, entry });
        i += len;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const word = words[i++];
    if (spell) {
      for (const letter of spellWord(word)) {
        tokens.push({ kind: "letter", word, letter, entry: dict.get(letter.toLowerCase()) || null });
      }
    } else {
      tokens.push({ kind: "unknown", word });
    }
  }
  return tokens;
}

// ---------- Dibujo de señas enseñadas a partir de sus muestras ----------
function samplePoints(sample) {
  const f = sample.f;
  const hand = (offset, ox, oy) => {
    const pts = [{ x: ox, y: oy }];
    for (let k = 0; k < 20; k++) pts.push({ x: ox + f[offset + 2 * k], y: oy + f[offset + 2 * k + 1] });
    return pts;
  };
  if (sample.hands === 1) return [hand(0, 0, 0)];
  return [hand(0, 0, 0), hand(40, f[80], f[81])];
}

function drawHands(ctx, hands, box) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  const areaH = h * 0.72; // la parte de abajo queda libre para el texto
  const scale = Math.min(w / (box.maxX - box.minX), areaH / (box.maxY - box.minY)) * 0.85;
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const P = (p) => [w / 2 - (p.x - cx) * scale, areaH / 2 + (p.y - cy) * scale]; // espejo, como la cámara
  ctx.lineCap = "round";
  for (const pts of hands) {
    ctx.strokeStyle = "#4f8cff";
    ctx.lineWidth = Math.max(4, scale * 0.06);
    for (const [a, b] of CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(...P(pts[a]));
      ctx.lineTo(...P(pts[b]));
      ctx.stroke();
    }
    ctx.fillStyle = "#22c55e";
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(...P(p), Math.max(4, scale * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function boundingBox(frames) {
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const hands of frames) {
    for (const pts of hands) {
      for (const p of pts) {
        box.minX = Math.min(box.minX, p.x);
        box.maxX = Math.max(box.maxX, p.x);
        box.minY = Math.min(box.minY, p.y);
        box.maxY = Math.max(box.maxY, p.y);
      }
    }
  }
  return box;
}

// ---------- Módulo ----------
export function initListen({ getSigns }) {
  const canvas = $("signCanvas");
  const ctx = canvas.getContext("2d");
  const settings = { lang: "es-MX", speed: 1, spell: true };

  let queue = [];
  let playing = false;
  let anim = 0;

  // ----- Reproductor de señas -----
  function show(token) {
    const big = $("signBig");
    const how = $("signHow");
    $("signWord").textContent = token.kind === "letter" ? `${token.word} · deletreo` : token.word;
    cancelAnimationFrame(anim);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    big.textContent = "";
    how.textContent = "";

    const entry = token.entry;
    if (entry?.type === "lsm") {
      // Seña del diccionario LSM: la grabación de una persona sorda, cuadro a cuadro.
      loadWordSigns().then((lsm) => {
        const area = { x: 0, y: 0, w: canvas.width, h: canvas.height * 0.72 };
        const start = performance.now();
        const n = entry.sign.frames.length;
        const step = (now) => {
          const i = Math.floor((Math.max(0, now - start) / 1000) * 20 * settings.speed) % (n + 8);
          drawSign(ctx, lsm, entry.sign, Math.min(i, n - 1), area); // pausa breve al final
          anim = requestAnimationFrame(step);
        };
        anim = requestAnimationFrame(step);
      });
      how.textContent = `Seña LSM: ${entry.label}`;
    } else if (entry?.type === "custom") {
      // Reproduce las muestras grabadas: así se ve también el movimiento de la seña.
      const frames = entry.samples.slice(0, 90).map(samplePoints);
      const box = boundingBox(frames);
      const start = performance.now();
      const step = (now) => {
        const elapsed = Math.max(0, now - start);
        const idx = Math.floor((elapsed / 1000) * 30 * settings.speed) % frames.length;
        drawHands(ctx, frames[idx], box);
        anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
      how.textContent = token.kind === "letter" ? token.letter : entry.label;
    } else if (token.kind === "letter" && LETTER_BY_KEY[token.letter]) {
      const letter = LETTER_BY_KEY[token.letter];
      const area = { x: 0, y: 0, w: canvas.width, h: canvas.height * 0.72 };
      const start = performance.now();
      const step = (now) => {
        const t = letter.motion ? (Math.max(0, now - start) / durationOf(token)) % 1 : 0.3;
        drawLetter(ctx, token.letter, t, area);
        if (letter.motion) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
      how.textContent = `Letra ${token.letter}`;
    } else if (token.kind === "letter") {
      big.textContent = token.letter;
      how.textContent = "Letra";
    } else {
      big.textContent = "…";
      how.textContent = "Sin seña";
    }
  }

  function durationOf(token) {
    const moving = token.kind === "letter" && LETTER_BY_KEY[token.letter]?.motion;
    if (token.entry?.type === "lsm") return ((token.entry.sign.frames.length + 8) / 20) * 1000 / settings.speed;
    const base = token.kind !== "letter" ? 1600 : moving ? 1400 : 800;
    return base / settings.speed;
  }

  function playNext() {
    if (!queue.length) {
      playing = false;
      $("queueInfo").textContent = "";
      return;
    }
    playing = true;
    const token = queue.shift();
    show(token);
    $("queueInfo").textContent = queue.length ? `${queue.length} en espera` : "";
    setTimeout(playNext, durationOf(token));
  }

  // En cadena, para respetar el orden aunque el diccionario LSM tarde en cargar la primera vez.
  let chain = Promise.resolve();
  function enqueue(text) {
    chain = chain.then(async () => {
      const lsm = await loadWordSigns().catch(() => null);
      const tokens = tokenize(text, buildDictionary(getSigns()), settings.spell, lsm);
      if (!tokens.length) return;
      const log = $("heardLog");
      log.textContent = (log.textContent ? log.textContent + " " : "") + text.trim();
      queue.push(...tokens);
      if (!playing) playNext();
    });
  }

  // ----- Reconocimiento de voz -----
  const micBtn = $("micBtn");
  const status = $("micStatus");
  const listener = createListener({
    getLang: () => settings.lang,
    onFinal: enqueue,
    onInterim: (text) => ($("interim").textContent = text),
    onError: (msg) => {
      status.textContent = msg;
      if (!listener.listening) setIdle();
    },
  });

  if (!canListen) {
    micBtn.disabled = true;
    status.textContent =
      "Este navegador no puede transcribir voz. Usa Chrome (Android/PC) o Safari (iPhone), o escribe el texto abajo.";
  }

  function setIdle() {
    micBtn.textContent = "🎤 Escuchar";
    micBtn.classList.remove("listening");
  }

  function startListening() {
    listener.start();
    micBtn.textContent = "Dejar de escuchar";
    micBtn.classList.add("listening");
    status.textContent = "Escuchando… habla con normalidad.";
  }

  function stopListening() {
    listener.stop();
    setIdle();
    if (status.textContent.startsWith("Escuchando")) status.textContent = "";
  }

  micBtn.onclick = () => (listener.listening ? stopListening() : startListening());
  $("langSelect").onchange = (e) => {
    settings.lang = e.target.value;
    listener.restart();
  };
  $("signSpeed").oninput = (e) => {
    settings.speed = Number(e.target.value);
    $("signSpeedVal").textContent = settings.speed.toFixed(1);
  };
  $("spellChk").onchange = (e) => (settings.spell = e.target.checked);
  $("typeForm").onsubmit = (e) => {
    e.preventDefault();
    const input = $("typeText");
    enqueue(input.value);
    input.value = "";
  };
  $("skipBtn").onclick = () => {
    queue = [];
    $("heardLog").textContent = "";
  };

  return { stop: stopListening };
}
