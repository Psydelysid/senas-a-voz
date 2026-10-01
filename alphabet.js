// Pestaña "Abecedario": las 29 letras de la LSM con su descripción y animación.
import { LETTERS, LETTER_BY_KEY, drawLetter } from "./lsm.js";

const $ = (id) => document.getElementById(id);

export function initAlphabet() {
  const grid = $("alphabetGrid");
  const big = $("alphaCanvas");
  const bigCtx = big.getContext("2d");
  let selected = "A";
  let active = false;
  let anim = 0;
  let drawn = false;

  function select(key) {
    selected = key;
    const l = LETTER_BY_KEY[key];
    $("alphaKey").textContent = key;
    $("alphaDesc").textContent = l.desc;
    $("alphaMotion").textContent = l.motion ? "Lleva movimiento" : "Estática";
    for (const b of grid.children) b.classList.toggle("active", b.dataset.key === key);
    if (active) play();
  }

  function play() {
    cancelAnimationFrame(anim);
    const start = performance.now();
    const loopMs = LETTER_BY_KEY[selected].motion ? 1800 : 0;
    const step = (now) => {
      const t = loopMs ? ((now - start) % loopMs) / loopMs : 0.3;
      drawLetter(bigCtx, selected, t);
      if (loopMs && active) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

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
      select(l.key);
      big.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    grid.appendChild(b);
  }
  select(selected);

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
