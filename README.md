# Señas a Voz

Aplicación web que traduce en tiempo real, en la computadora o en el celular:

- **Señas → Voz:** la cámara reconoce las señas que haces con las manos y las dice en voz alta.
- **Voz → Señas:** el micrófono escucha lo que se dice y lo muestra como señas en pantalla.

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

## Usarla en el celular

Publícala con GitHub Pages (Settings → Pages → *Deploy from a branch* → `main` / root) y abre la dirección `https://<usuario>.github.io/<repositorio>/` en el celular. Para tenerla como app, en el menú del navegador elige «Agregar a la pantalla de inicio».

- **Android:** Chrome. Funcionan los dos modos.
- **iPhone:** Safari. La transcripción de voz requiere iOS 14.5 o superior.
- Firefox no puede transcribir voz; en ese caso usa la caja «escribe un texto».

## Voz → Señas

1. Abre la pestaña **🎤 Voz → Señas** y pulsa **Escuchar** (pide permiso al micrófono).
2. Habla: cada palabra con seña se muestra como seña. Las señas que enseñaste se reproducen animadas tal como las grabaste.
3. Las palabras sin seña se deletrean. Si enseñas el alfabeto (señas llamadas «A», «B», «C»…), el deletreo usa tus señas.

También puedes escribir un texto en lugar de hablar. La transcripción la hace el navegador; en Chrome, eso significa enviar el audio a Google.

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
- La voz usa la Web Speech API del navegador: `speechSynthesis` para hablar y `SpeechRecognition` para escuchar.

El video de la cámara no sale de tu dispositivo.
