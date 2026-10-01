# Señas a Voz — Lengua de Señas Mexicana (LSM)

Aplicación web que traduce en tiempo real, en la computadora o en el celular:

- **💬 Conversación:** todo en una pantalla para platicar cara a cara.
  - La persona sorda se expresa **con señas** (la cámara reconoce el abecedario LSM y las señas que le enseñes), **con frases rápidas** de uso diario o **escribiendo**, y la app lo dice en voz alta.
  - Lo que dice la persona oyente aparece en **subtítulos grandes**.
  - Toda la plática queda registrada como un chat.
- **🎤 Voz → Señas:** el micrófono escucha lo que se dice y lo muestra en LSM. Las palabras que enseñaste aparecen con su seña y las demás se deletrean con el abecedario LSM, con manos animadas.
- **📖 Diccionario:** las 29 letras de la LSM y **149 señas de palabras** grabadas por una persona sorda nativa, con buscador y categorías.

👉 **App publicada:** https://psydelysid.github.io/senas-a-voz/ (una vez activado GitHub Pages)

## Señas de palabras (149)

Vienen del conjunto de datos **MSL-150**, grabado por una persona sorda nativa en LSM:
> Becerril Carrillo, Armando de Jesús (Universidad Anáhuac México Norte). *MSL-150: Mexican Sign Language (MSL) Keypoint Dataset for Domain-Specific Vocabulary*. https://doi.org/10.5281/zenodo.17783312 — licencia CC BY 4.0.

Incluye: sí, no, bien, mal, pregunta, duda, yo, nosotros; hoy, ayer, mañana, ahora, siempre, nunca, diario; días de la semana; meses; números del 1 al 10; cómo, cuántos, para qué, por qué; mamá, papá, esposo, esposa, hijo, hija; verbos (comer, beber, dormir, trabajar, estudiar, ir, caminar, correr…); estados (cansado, confundido, estresado, frío, caliente, mejor, peor…); animales; 45 señas de salud (doctor, hospital, dolor, ambulancia, emergencia, pastillas…); y 19 partes del cuerpo. Se omitió «garganta», cuya grabación está dañada.

- **Voz → Señas:** cuando una palabra tiene seña, se muestra la grabación animada (cuerpo y manos); si no, se deletrea. Las palabras ambiguas solo cuentan con acento: «sí» (no «si»), «papá» (no «papa»), «¿cómo?» (no «como»), «¿por qué?» (no «porque»).
- **Conversación (en prueba):** la cámara reconoce estas señas comparando el movimiento de tus manos respecto a tus hombros con las grabaciones. Hay que tener los hombros a la vista. El reconocimiento se aprendió de una sola persona, así que puede fallar con otras. Hay un control de tolerancia y se puede desactivar.

El archivo `senas-lsm.json` se generó con solo la grabación original y dos variantes de cada seña: unos 800 KB comprimido, en lugar de los 4.4 GB del conjunto completo.

## Referencia del abecedario

El abecedario sigue *Manos con voz. Diccionario de Lengua de Señas Mexicana* (CONAPRED / Libre Acceso A.C.), páginas 15-19. Tiene 29 letras: 21 estáticas y 8 con movimiento (J, K, LL, Ñ, Q, RR, X, Z). La LSM **no** es el abecedario estadounidense (ASL): letras como F, G, H, P y T son distintas.

Las ilustraciones son esquemáticas y las genera la propia app con un modelo 3D de la mano. Las descripciones están redactadas con palabras propias a partir del diccionario. Conviene que una persona usuaria de LSM las revise.

## Cómo usarla

### Conversación

- **Frases rápidas:** saludos, cortesía, respuestas, comunicarse («Soy sorda», «Más despacio, por favor»…), necesidades, salud y emergencias, y preguntas. Un toque y la app la dice. En «⭐ Mis frases» puedes guardar las tuyas.
- **Escribir:** escribe cualquier cosa y pulsa «🔊 Decir».
- **Subtítulos:** pulsa «🎤 Escuchar» y lo que dice la otra persona aparece en grande. El micrófono se pausa solo mientras la app habla, para no transcribir su propia voz.

### Deletreo con señas
1. Pulsa **Encender cámara** y da permiso.
2. Haz cada letra y sostenla ~0.6 s; aparece en la línea «Deletreando».
3. Para las letras con movimiento, haz la forma y muévela (por ejemplo, la L moviéndola de lado a lado es LL).
4. Para repetir una letra (como la R de «zorro», que no es RR), baja la mano un momento entre las dos.
5. **Baja la mano** (~1.3 s) para terminar la palabra: la app la dice en voz alta. También puedes usar «Terminar palabra» y «⌫».

**Calibrar (muy recomendado):** en «Calibrar el abecedario con mi mano», la app te muestra cada letra y graba cómo la haces tú. Toma un par de minutos y mejora mucho el reconocimiento.

**Señas de palabras y expresiones cotidianas:** en LSM, la mayoría de las palabras y expresiones («gracias», «¿dónde está el baño?»…) tienen su propia seña, casi siempre con movimiento, posición en el cuerpo y expresión facial. La app no las inventa: quien sabe LSM las graba una vez. En «Enseñar señas de palabras» hay una lista de **expresiones cotidianas sugeridas**: toca una, haz su seña 3 segundos y desde entonces la cámara la reconoce y la dice en voz alta. En «Voz → Señas» también aparece con su seña. Las señas se guardan en tu navegador y puedes exportarlas o importarlas, por ejemplo para pasarlas a otro teléfono. Para consultar cómo se hace una seña, usa el [Diccionario de Lengua de Señas Mexicana (SEP)](https://educacionespecial.sep.gob.mx/storage/recursos/2023/05/xzrfl019nV-4Diccionario_lengua_%20Senas.pdf).

### Voz → Señas
Pulsa **Escuchar** y habla, o escribe un texto. Funciona en Chrome (Android/PC) y en Safari (iPhone, iOS 14.5+). En Chrome, el navegador envía el audio a Google para transcribirlo.

## Ejecutarla localmente

La cámara solo funciona en `https://` o en `localhost`:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Instalarla en el celular

Abre https://psydelysid.github.io/senas-a-voz/ y:

- **Android (Chrome):** pulsa **📲 Instalar app**, arriba a la derecha. Si no aparece: menú ⋮ → **Instalar app** (o «Agregar a la pantalla de inicio»).
- **iPhone (Safari):** botón Compartir → **Agregar a inicio**.

Queda un ícono como cualquier app y se abre a pantalla completa. Después de abrirla una vez con internet, la cámara, el deletreo, el diccionario y las frases funcionan **sin conexión**. Escuchar voz (subtítulos y Voz → Señas) sí necesita internet.

## Publicarla (GitHub Pages)

Settings → Pages → *Deploy from a branch* → `main` / `(root)` → Save.

## Limitaciones

- La app reconoce el **deletreo** (abecedario) y las palabras que le enseñes. **No** traduce la LSM completa: la gramática, la expresión facial y el uso del espacio quedan fuera.
- Las letras se reconocen comparando tu mano con plantillas del modelo 3D. Sin calibrar, las letras muy parecidas se confunden: S/T/A/E, M/N, R/U y C/O.
- Las letras con movimiento se detectan de forma aproximada: forma inicial + movimiento.
- Las señas de palabras se muestran como esqueleto del cuerpo y las manos, **sin la expresión facial**, que en LSM también comunica.
- Las palabras más comunes que no están en MSL-150 (por ejemplo «hola», «gracias», «por favor») no tienen seña precargada: grábalas en «Enseñar señas de palabras» o usa las frases rápidas.
- La precisión depende de la luz y de que la mano se vea completa.

## Cómo funciona

- [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) detecta 21 puntos 3D por mano, y Pose Landmarker (modelo ligero) los hombros, todo en el navegador.
- `palabras.js` reconoce las señas de palabras con DTW sobre la trayectoria de las manos respecto a los hombros.
- `lsm.js` define cada letra como una postura de un modelo 3D de la mano. Ese modelo sirve para dibujar las letras y como plantilla para reconocerlas, con rasgos que no dependen de cómo esté girada la mano ni de si es la derecha o la izquierda.
- Las señas de palabras se reconocen con k vecinos más cercanos sobre las muestras grabadas.
- La voz usa la Web Speech API: `speechSynthesis` para hablar y `SpeechRecognition` para escuchar.

El video de la cámara no sale de tu dispositivo.
