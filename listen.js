// Modo "Voz → Señas": escucha el micrófono, transcribe y muestra cada palabra como seña.
// Las palabras con seña (predefinida o enseñada por el usuario) se muestran como seña;
// las demás se deletrean letra por letra.

const $ = (id) => document.getElementById(id);

const BUILTINS = [
  { label: "Hola", emoji: "🖐️", how: "Mano abierta", words: ["hola", "buenas"] },
  { label: "Bien", emoji: "👍", how: "Pulgar arriba", words: ["bien", "muy bien"] },
  { label: "Mal", emoji: "👎", how: "Pulgar abajo", words: ["mal", "muy mal"] },
  { label: "Paz", emoji: "✌️", how: "Índice y medio", words: ["paz"] },
  { label: "Te quiero", emoji: "🤟", how: "Pulgar, índice y meñique", words: ["te quiero", "te amo"] },
  { label: "Llámame", emoji: "🤙", how: "Pulgar y meñique", words: ["llamame", "llamar", "telefono"] },
  { label: "Un momento", emoji: "☝️", how: "Índice arriba", words: ["un momento", "espera", "espere"] },
  { label: "De acuerdo", emoji: "👌", how: "Círculo con pulgar e índice", words: ["de acuerdo", "ok", "okay", "vale"] },
];

// Conexiones entre los 21 puntos de la mano (mismo orden que MediaPipe).
const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const MAX_PHRASE_WORDS = 4;

/** minúsculas, sin acentos (pero conservando la ñ) ni puntuación */
export function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/(?!̃)[̀-ͯ]/g, "")
    .normalize("NFC")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildDictionary(customSigns) {
  const dict = new Map();
  for (const b of BUILTINS) {
    for (const w of b.words) dict.set(w, { type: "builtin", ...b });
  }
  // Las señas enseñadas por el usuario tienen prioridad.
  for (const [name, samples] of Object.entries(customSigns)) {
    const key = normalize(name);
    if (key && samples.length) dict.set(key, { type: "custom", label: name, samples });
  }
  return dict;
}

/** Convierte texto en una lista de señas a mostrar. */
export function tokenize(text, dict, spell) {
  const words = normalize(text).split(" ").filter(Boolean);
  const tokens = [];
  for (let i = 0; i < words.length; ) {
    let matched = false;
    for (let len = Math.min(MAX_PHRASE_WORDS, words.length - i); len >= 1; len--) {
      const phrase = words.slice(i, i + len).join(" ");
      const entry = dict.get(phrase);
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
      for (const ch of word) {
        tokens.push({ kind: "letter", word, letter: ch.toUpperCase(), entry: dict.get(ch) || null });
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
    if (entry?.type === "custom") {
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
    } else if (entry?.type === "builtin") {
      big.textContent = entry.emoji;
      how.textContent = token.kind === "letter" ? token.letter : `${entry.label} — ${entry.how}`;
    } else if (token.kind === "letter") {
      big.textContent = token.letter;
      how.textContent = "Letra";
    } else {
      big.textContent = "…";
      how.textContent = "Sin seña";
    }
  }

  function durationOf(token) {
    const base = token.kind === "letter" ? 700 : 1600;
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

  function enqueue(text) {
    const tokens = tokenize(text, buildDictionary(getSigns()), settings.spell);
    if (!tokens.length) return;
    const log = $("heardLog");
    log.textContent = (log.textContent ? log.textContent + " " : "") + text.trim();
    queue.push(...tokens);
    if (!playing) playNext();
  }

  // ----- Reconocimiento de voz -----
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = $("micBtn");
  const status = $("micStatus");
  let rec = null;
  let listening = false;

  if (!Recognition) {
    micBtn.disabled = true;
    status.textContent =
      "Este navegador no puede transcribir voz. Usa Chrome (Android/PC) o Safari (iPhone), o escribe el texto abajo.";
  }

  function startListening() {
    const r = new Recognition();
    rec = r;
    r.lang = settings.lang;
    // Frases cortas y reinicio automático: más fiable en móviles que el modo continuo.
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) enqueue(r[0].transcript);
        else interim += r[0].transcript;
      }
      $("interim").textContent = interim;
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        status.textContent = "No se dio permiso al micrófono. Actívalo en el navegador.";
        stopListening();
      } else if (e.error === "network") {
        status.textContent = "El reconocimiento de voz necesita conexión a internet.";
      }
    };
    r.onend = () => {
      $("interim").textContent = "";
      if (!listening || rec !== r) return;
      try {
        r.start();
      } catch {
        setTimeout(() => {
          if (listening && rec === r) r.start();
        }, 300);
      }
    };
    listening = true;
    r.start();
    micBtn.textContent = "Dejar de escuchar";
    micBtn.classList.add("listening");
    status.textContent = "Escuchando… habla con normalidad.";
  }

  function stopListening() {
    listening = false;
    rec?.abort();
    micBtn.textContent = "🎤 Escuchar";
    micBtn.classList.remove("listening");
    if (status.textContent.startsWith("Escuchando")) status.textContent = "";
  }

  micBtn.onclick = () => (listening ? stopListening() : startListening());
  $("langSelect").onchange = (e) => {
    settings.lang = e.target.value;
    if (listening) {
      stopListening();
      startListening();
    }
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
