// Pestaña "Diccionario": abecedario LSM (29 letras) y señas de palabras (MSL-150).
import { LETTERS, LETTER_BY_KEY, drawLetter } from "./lsm.js";
import { loadWordSigns, drawSign } from "./palabras.js";
import { normalize } from "./text.js";

const $ = (id) => document.getElementById(id);

export function initAlphabet() {
  const grid = $("alphabetGrid");
  const big = $("alphaCanvas");
  const bigCtx = big.getContext("2d");
  let selected = { type: "letter", key: "A" };
  let active = false;
  let anim = 0;
  let drawn = false;
  let dict = null;
  let wordCat = "Todas";

  // ----- Detalle (arriba) -----
  function selectLetter(key) {
    selected = { type: "letter", key };
    const l = LETTER_BY_KEY[key];
    $("alphaKey").textContent = key;
    $("alphaDesc").textContent = l.desc;
    $("alphaMotion").textContent = l.motion ? "Letra con movimiento" : "Letra estática";
    for (const b of grid.children) b.classList.toggle("active", b.dataset.key === key);
    if (active) play();
  }

  function selectWord(sign) {
    selected = { type: "word", sign };
    $("alphaKey").textContent = sign.word;
    $("alphaMotion").textContent = `Seña de palabra · ${sign.cat}`;
    $("alphaDesc").textContent = "Grabada por una persona sorda nativa en LSM (MSL-150).";
    for (const b of $("wordGrid").children) b.classList.toggle("active", b.dataset.id === sign.id);
    if (active) play();
  }

  function play() {
    cancelAnimationFrame(anim);
    const start = performance.now();
    const step = (now) => {
      const ms = Math.max(0, now - start);
      if (selected.type === "letter") {
        const moving = LETTER_BY_KEY[selected.key].motion;
        drawLetter(bigCtx, selected.key, moving ? (ms % 1800) / 1800 : 0.3);
        if (moving && active) anim = requestAnimationFrame(step);
      } else {
        const n = selected.sign.frames.length;
        const i = Math.floor((ms / 1000) * 20) % (n + 10); // pausa breve antes de repetir
        drawSign(bigCtx, dict, selected.sign, Math.min(i, n - 1));
        if (active) anim = requestAnimationFrame(step);
      }
    };
    anim = requestAnimationFrame(step);
  }

  // ----- Abecedario -----
  function drawGrid() {
    if (drawn) return;
    drawn = true;
    for (const b of grid.children) drawLetter(b.querySelector("canvas").getContext("2d"), b.dataset.key, 0.3);
  }

  for (const l of LETTERS) {
    const b = document.createElement("button");
    b.className = "alpha-card";
    b.dataset.key = l.key;
    b.setAttribute("aria-label", `Letra ${l.key}`);
    const c = document.createElement("canvas");
    c.width = 120;
    c.height = 120;
    const label = document.createElement("span");
    label.textContent = l.key + (l.motion ? " ↻" : "");
    b.append(c, label);
    b.onclick = () => {
      selectLetter(l.key);
      big.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    grid.appendChild(b);
  }
  selectLetter("A");

  // ----- Palabras -----
  function renderWords() {
    if (!dict) return;
    const cats = ["Todas", ...new Set(dict.signs.map((s) => s.cat))];
    const catBox = $("wordCats");
    catBox.innerHTML = "";
    for (const c of cats) {
      const b = document.createElement("button");
      b.className = "chip" + (c === wordCat ? " active" : "");
      b.textContent = c;
      b.onclick = () => {
        wordCat = c;
        renderWords();
      };
      catBox.appendChild(b);
    }
    const q = normalize($("wordSearch").value);
    const box = $("wordGrid");
    box.innerHTML = "";
    const list = dict.signs.filter(
      (s) => (wordCat === "Todas" || s.cat === wordCat) && (!q || s.keys.some((k) => k.key.includes(q))),
    );
    if (!list.length) box.innerHTML = '<p class="muted">No hay señas con esa palabra.</p>';
    for (const s of list) {
      const b = document.createElement("button");
      b.textContent = s.word;
      b.dataset.id = s.id;
      if (selected.type === "word" && selected.sign === s) b.classList.add("active");
      b.onclick = () => {
        selectWord(s);
        big.scrollIntoView({ behavior: "smooth", block: "nearest" });
      };
      box.appendChild(b);
    }
  }

  function showPane(words) {
    $("dictLettersBtn").classList.toggle("active", !words);
    $("dictWordsBtn").classList.toggle("active", words);
    $("dictLettersBtn").setAttribute("aria-selected", !words);
    $("dictWordsBtn").setAttribute("aria-selected", words);
    grid.hidden = words;
    $("wordsPane").hidden = !words;
    if (!words) return;
    loadWordSigns()
      .then((d) => {
        dict = d;
        renderWords();
        if (selected.type !== "word") selectWord(d.signs[0]);
      })
      .catch(() => ($("wordGrid").innerHTML = '<p class="muted">No se pudieron cargar las señas. Revisa tu conexión.</p>'));
  }

  $("dictLettersBtn").onclick = () => showPane(false);
  $("dictWordsBtn").onclick = () => showPane(true);
  $("wordSearch").oninput = renderWords;

  return {
    setActive(on) {
      active = on;
      if (on) {
        drawGrid(); // se dibuja al abrir la pestaña: el canvas oculto no ocupa tiempo al cargar
        play();
      } else {
        cancelAnimationFrame(anim);
      }
    },
  };
}
