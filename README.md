# Señas a Voz

Aplicación web que usa la cámara para reconocer señas hechas con las manos y las dice en voz alta en tiempo real.

## Cómo usarla

La cámara solo funciona en `https://` o en `localhost`. Para probarla en tu computadora:

```bash
cd traductor-senas
python3 -m http.server 8000
# abre http://localhost:8000 en Chrome, Edge o Safari
```

1. Pulsa **Encender cámara** y da permiso.
2. Haz una seña y mantenla ~0.6 s: aparece el subtítulo y se oye la voz.
3. Para repetir la misma seña, baja la mano o haz un puño un momento.

## Señas incluidas

| Seña | Se dice |
|---|---|
| 🖐️ Mano abierta | Hola |
| 👍 Pulgar arriba | Bien |
| 👎 Pulgar abajo | Mal |
| ✌️ Índice y medio | Paz |
| 🤟 Pulgar, índice y meñique | Te quiero |
| 🤙 Pulgar y meñique | Llámame |
| ☝️ Índice arriba | Un momento |
| 👌 Círculo con pulgar e índice | De acuerdo |

## Enseñar tus propias señas

En el panel **Enseñar mis propias señas** escribe la palabra o frase, pulsa **Grabar** y haz la seña durante 3 segundos. Funciona con una o dos manos. Las señas se guardan en tu navegador y puedes exportarlas o importarlas como JSON.

## Limitaciones

- Reconoce **formas estáticas de la mano**. Las señas que dependen del movimiento, la expresión facial o el lugar del cuerpo (gran parte de la LSM, LSE o ASL) no se distinguen solo por la forma. Para esas, entrena una variante estática.
- La precisión depende de la luz y de que la mano se vea completa.

## Cómo funciona

- [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) detecta 21 puntos por mano, directamente en el navegador.
- Las señas incluidas se clasifican según qué dedos están extendidos.
- Las señas propias se reconocen con k vecinos más cercanos sobre los puntos normalizados.
- La voz usa la Web Speech API (`speechSynthesis`) del navegador.

El video no sale de tu dispositivo.
