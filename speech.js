// Reconocimiento de voz del navegador (Web Speech API), compartido por las pestañas que escuchan.

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const canListen = Boolean(Recognition);

/**
 * Crea un oyente que transcribe frases y se reinicia solo mientras esté activo.
 * `pause()`/`resume()` lo detienen temporalmente, por ejemplo mientras la app habla,
 * para que no se transcriba a sí misma.
 */
export function createListener({ getLang, onFinal, onInterim = () => {}, onError = () => {} }) {
  let rec = null;
  let wanted = false; // el usuario quiere escuchar
  let paused = false;

  function open() {
    const r = new Recognition();
    rec = r;
    r.lang = getLang();
    // Frases cortas y reinicio automático: más fiable en móviles que el modo continuo.
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) onFinal(res[0].transcript);
        else interim += res[0].transcript;
      }
      onInterim(interim);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        onError("No se dio permiso al micrófono. Actívalo en el navegador.");
        stop();
      } else if (e.error === "network") {
        onError("El reconocimiento de voz necesita conexión a internet.");
      }
    };
    r.onend = () => {
      onInterim("");
      if (!wanted || paused || rec !== r) return;
      try {
        r.start();
      } catch {
        setTimeout(() => {
          if (wanted && !paused && rec === r) r.start();
        }, 300);
      }
    };
    r.start();
  }

  function start() {
    if (!Recognition) return;
    wanted = true;
    paused = false;
    open();
  }

  function stop() {
    wanted = false;
    rec?.abort();
    rec = null;
  }

  return {
    start,
    stop,
    pause() {
      if (!wanted || paused) return;
      paused = true;
      rec?.abort();
    },
    resume() {
      if (!wanted || !paused) return;
      paused = false;
      open();
    },
    restart() {
      if (!wanted) return;
      rec?.abort();
      paused = false;
      open();
    },
    get listening() {
      return wanted;
    },
  };
}
