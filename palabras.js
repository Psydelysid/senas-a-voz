// Diccionario de señas de palabras en LSM.
//
// Datos: MSL-150 (Armando de Jesús Becerril Carrillo, Universidad Anáhuac México Norte),
// https://doi.org/10.5281/zenodo.17783312 — CC BY 4.0. Cada seña es una grabación de una
// persona sorda nativa en LSM, convertida en puntos del cuerpo y de las manos (MediaPipe).
//
// Formato de cada cuadro: p = puntos del cuerpo (x, y por mil), l / r = mano izquierda /
// derecha de quien hace la seña (21 puntos, o 7 en las variantes), 0 si no se ve.

import { normalize } from "./text.js";

const URL_DATA = "senas-lsm.json";
let dataPromise = null;

/** Carga el diccionario (una sola vez). */
export function loadWordSigns() {
  dataPromise ??= fetch(URL_DATA)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(prepare);
  return dataPromise;
}

function prepare(data) {
  const asp = data.aspect;
  const showIdx = Object.fromEntries(data.pose.map((p, i) => [p, i]));
  const byKey = new Map();
  const signs = data.signs.map((s) => {
    const sign = { ...s, templates: [] };
    // La grabación original (con todos los puntos) y sus variantes sirven de plantilla.
    sign.templates.push(resample(s.frames.map((f) => datasetFeature(f, true, showIdx, asp)), N));
    for (const v of s.variants) sign.templates.push(resample(v.map((f) => datasetFeature(f, false, showIdx, asp)), N));
    // Claves para encontrarla en un texto: «sí» exige el acento para no confundirse con «si».
    sign.keys = [s.word, ...(s.alias || [])].map((w) => ({ key: normalize(w), raw: w.toLowerCase() }));
    for (const k of sign.keys) if (!byKey.has(k.key)) byKey.set(k.key, sign);
    return sign;
  });
  return { ...data, signs, byKey, showIdx };
}

/**
 * Busca la seña de una palabra o frase. `raw` es el texto original (con acentos), para las
 * palabras que solo cuentan con acento («sí», «papá», «cómo», «por qué»…).
 */
export function findSign(dict, key, raw) {
  const sign = dict.byKey.get(key);
  if (!sign) return null;
  if (sign.accent && !sign.keys.some((k) => raw.toLowerCase().includes(k.raw))) return null;
  return sign;
}

// ---------- Rasgos de movimiento ----------
const N = 24; // cuadros a los que se lleva cada secuencia
const DIM = 26;
const TIPS = [1, 2, 4, 5, 6]; // en la mano reducida: pulgar, índice, medio, anular, meñique

/**
 * Un cuadro → vector: por cada mano (derecha, izquierda) si se ve, dónde está la muñeca respecto a
 * los hombros y la forma (puntas de los dedos respecto a la muñeca). Todo en «anchos de hombros».
 * hands: { r, l } con 7 puntos {x, y} (muñeca, pulgar, índice, nudillo medio, medio, anular, meñique).
 */
export function frameFeature(ls, rs, hands, asp) {
  const ox = ((ls.x + rs.x) / 2) * asp;
  const oy = (ls.y + rs.y) / 2;
  const scale = Math.hypot((ls.x - rs.x) * asp, ls.y - rs.y) || 1e-6;
  const out = new Float32Array(DIM);
  let k = 0;
  for (const h of [hands.r, hands.l]) {
    if (!h) {
      out[k] = 0;
      out[k + 1] = 0;
      out[k + 2] = 1.8; // mano abajo, fuera de cuadro
      k += 13;
      continue;
    }
    const w = h[0];
    const ps = Math.hypot((h[3].x - w.x) * asp, h[3].y - w.y) || 1e-6;
    out[k] = 0.6;
    out[k + 1] = (w.x * asp - ox) / scale;
    out[k + 2] = (w.y - oy) / scale;
    let j = k + 3;
    for (const t of TIPS) {
      out[j++] = (0.35 * (h[t].x - w.x) * asp) / ps;
      out[j++] = (0.35 * (h[t].y - w.y)) / ps;
    }
    k += 13;
  }
  return out;
}

/** Igual que frameFeature, pero con la otra mano como dominante (para personas zurdas). */
function mirror(f) {
  const m = new Float32Array(DIM);
  for (let s = 0; s < 2; s++) {
    const a = s * 13;
    const b = (1 - s) * 13;
    m[b] = f[a];
    m[b + 1] = -f[a + 1];
    m[b + 2] = f[a + 2];
    for (let j = 3; j < 13; j += 2) {
      m[b + j] = -f[a + j];
      m[b + j + 1] = f[a + j + 1];
    }
  }
  return m;
}

const pt = (arr, i) => ({ x: arr[2 * i] / 1000, y: arr[2 * i + 1] / 1000 });
const REDUCED_FROM_FULL = [0, 4, 8, 9, 12, 16, 20];

function datasetFeature(f, full, showIdx, asp) {
  const ls = full ? pt(f.p, showIdx[11]) : pt(f.p, 0);
  const rs = full ? pt(f.p, showIdx[12]) : pt(f.p, 1);
  const hand = (h) => (h ? (full ? REDUCED_FROM_FULL.map((i) => pt(h, i)) : [0, 1, 2, 3, 4, 5, 6].map((i) => pt(h, i))) : null);
  return frameFeature(ls, rs, { l: hand(f.l), r: hand(f.r) }, asp);
}

/** Reduce la mano de MediaPipe (21 puntos) a los 7 que se usan. */
export function reduceHand(lm) {
  return REDUCED_FROM_FULL.map((i) => lm[i]);
}

/** Lleva una secuencia a n cuadros por interpolación lineal. */
export function resample(seq, n) {
  if (!seq.length) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i * (seq.length - 1)) / (n - 1 || 1);
    const a = Math.floor(t);
    const b = Math.min(seq.length - 1, a + 1);
    const k = t - a;
    const f = new Float32Array(DIM);
    for (let d = 0; d < DIM; d++) f[d] = seq[a][d] * (1 - k) + seq[b][d] * k;
    out.push(f);
  }
  return out;
}

function frameDist(a, b) {
  let s = 0;
  for (let d = 0; d < DIM; d++) s += (a[d] - b[d]) ** 2;
  return Math.sqrt(s);
}

/** Distancia DTW con banda (tolera que la seña se haga más rápido o más lento). */
export function dtw(a, b, band = 6) {
  const n = a.length;
  const m = b.length;
  let prev = new Float32Array(m + 1).fill(Infinity);
  let cur = new Float32Array(m + 1).fill(Infinity);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    cur.fill(Infinity);
    const lo = Math.max(1, i - band);
    const hi = Math.min(m, i + band);
    for (let j = lo; j <= hi; j++) {
      cur[j] = frameDist(a[i - 1], b[j - 1]) + Math.min(prev[j], prev[j - 1], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m] / (n + m);
}

function diagDist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += frameDist(a[i], b[i]);
  return s / (2 * a.length);
}

/**
 * Compara una secuencia (ya llevada a N cuadros) contra todas las señas.
 * Devuelve las dos mejores señas distintas: { best, d, second, d2 }.
 */
export function matchSequence(dict, seq) {
  const variants = [seq, seq.map(mirror)];
  // Primero una medida barata para quedarse con las candidatas; luego DTW solo con ellas.
  const rough = [];
  for (const sign of dict.signs) {
    let d = Infinity;
    for (const t of sign.templates) for (const v of variants) d = Math.min(d, diagDist(v, t));
    rough.push({ sign, d });
  }
  rough.sort((x, y) => x.d - y.d);
  const scored = rough.slice(0, 16).map(({ sign }) => {
    let d = Infinity;
    for (const t of sign.templates) for (const v of variants) d = Math.min(d, dtw(v, t));
    return { sign, d };
  });
  scored.sort((x, y) => x.d - y.d);
  return { best: scored[0]?.sign, d: scored[0]?.d ?? Infinity, second: scored[1]?.sign, d2: scored[1]?.d ?? Infinity };
}

export const SEQ_LEN = N;

// ---------- Dibujo ----------
const HAND_LINKS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

/** Encuadre fijo por seña (cabeza a cadera) para que no "salte" durante la animación. */
function signBox(dict, sign) {
  if (sign._box) return sign._box;
  const asp = dict.aspect;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const see = (x, y) => {
    minX = Math.min(minX, x * asp); maxX = Math.max(maxX, x * asp);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };
  for (const f of sign.frames) {
    for (let i = 0; i < f.p.length; i += 2) see(f.p[i] / 1000, f.p[i + 1] / 1000);
    for (const h of [f.l, f.r]) if (h) for (let i = 0; i < h.length; i += 2) see(h[i] / 1000, h[i + 1] / 1000);
  }
  const ls = pt(sign.frames[0].p, dict.showIdx[11]);
  const rs = pt(sign.frames[0].p, dict.showIdx[12]);
  const sh = Math.hypot((ls.x - rs.x) * asp, ls.y - rs.y);
  minY -= sh * 0.35; // espacio para la cabeza
  sign._box = { minX: minX - sh * 0.15, maxX: maxX + sh * 0.15, minY, maxY: Math.min(maxY, ls.y + sh * 1.6) };
  return sign._box;
}

/** Dibuja el cuadro `i` de una seña: cuerpo, cabeza, brazos y manos. */
export function drawSign(ctx, dict, sign, i, area = null) {
  const { width: W, height: H } = ctx.canvas;
  const A = area || { x: 0, y: 0, w: W, h: H };
  ctx.clearRect(A.x, A.y, A.w, A.h);
  const f = sign.frames[Math.max(0, Math.min(sign.frames.length - 1, i))];
  const asp = dict.aspect;
  const box = signBox(dict, sign);
  const s = Math.min(A.w / (box.maxX - box.minX), A.h / (box.maxY - box.minY));
  const ox = A.x + (A.w - (box.maxX - box.minX) * s) / 2;
  const oy = A.y + (A.h - (box.maxY - box.minY) * s) / 2;
  const P = (p) => [ox + (p.x * asp - box.minX) * s, oy + (p.y - box.minY) * s];
  const body = (idx) => pt(f.p, dict.showIdx[idx]);

  const dark = matchMedia?.("(prefers-color-scheme: dark)").matches;
  const bodyCol = dark ? "#3b4a63" : "#c9d6ea";
  const lineCol = dark ? "#8fa6c8" : "#5b7096";
  const skin = "#e9b48f";
  const skinLine = dark ? "#2a1a10" : "#7a4b32";

  ctx.save();
  ctx.beginPath();
  ctx.rect(A.x, A.y, A.w, A.h);
  ctx.clip();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const ls = body(11), rs = body(12), lh = body(23), rh = body(24);
  const sh = Math.hypot((ls.x - rs.x) * asp, ls.y - rs.y) * s;
  // Torso
  ctx.fillStyle = bodyCol;
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = 2;
  ctx.beginPath();
  [ls, rs, rh, lh].forEach((p, k) => (k ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Cabeza
  const nose = body(0);
  const le = body(7), re = body(8);
  const headR = (Math.hypot((le.x - re.x) * asp, le.y - re.y) * s) / 2 * 1.15 || sh * 0.3;
  const [hx, hy] = P({ x: (le.x + re.x) / 2, y: (nose.y + (le.y + re.y) / 2) / 2 });
  ctx.fillStyle = skin;
  ctx.strokeStyle = skinLine;
  ctx.beginPath();
  ctx.ellipse(hx, hy, headR, headR * 1.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Ojos y boca, para ver hacia dónde mira y dónde está la boca
  ctx.fillStyle = skinLine;
  for (const k of [2, 5]) {
    const [x, y] = P(body(k));
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, headR * 0.08), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = Math.max(1.5, headR * 0.06);
  ctx.beginPath();
  ctx.moveTo(...P(body(9)));
  ctx.lineTo(...P(body(10)));
  ctx.stroke();

  // Brazos y manos
  const handOf = (h) => (h ? Array.from({ length: 21 }, (_, k) => pt(h, k)) : null);
  const hands = { l: handOf(f.l), r: handOf(f.r) };
  for (const [side, sIdx, eIdx, wIdx] of [["l", 11, 13, 15], ["r", 12, 14, 16]]) {
    const hand = hands[side];
    const wrist = hand ? hand[0] : body(wIdx);
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = sh * 0.16;
    ctx.beginPath();
    ctx.moveTo(...P(body(sIdx)));
    ctx.lineTo(...P(body(eIdx)));
    ctx.lineTo(...P(wrist));
    ctx.stroke();
    ctx.strokeStyle = bodyCol;
    ctx.lineWidth = sh * 0.16 - 4;
    ctx.stroke();
    if (!hand) continue;
    const w = Math.max(3, sh * 0.055);
    for (const [a, b] of HAND_LINKS) {
      ctx.beginPath();
      ctx.moveTo(...P(hand[a]));
      ctx.lineTo(...P(hand[b]));
      ctx.strokeStyle = skinLine;
      ctx.lineWidth = w + 3;
      ctx.stroke();
    }
    for (const [a, b] of HAND_LINKS) {
      ctx.beginPath();
      ctx.moveTo(...P(hand[a]));
      ctx.lineTo(...P(hand[b]));
      ctx.strokeStyle = skin;
      ctx.lineWidth = w;
      ctx.stroke();
    }
  }
  ctx.restore();
}
