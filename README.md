# Vitrina Digital en Ecotec · WebAR

Proyecto de Experiencias Inmersivas — Diana Espinoza, Arllys Ramos y Xavier Ponce.

Una placa NFC fuera del aula abre en el celular una galería de proyectos. Desde la ficha de un proyecto, el botón **«Ver en AR»** coloca la maqueta 3D sobre una mesa real, a escala, con 3 puntos de información y un asistente que responde preguntas sobre el proyecto. Sin instalar ninguna app.

---

## 1. El flujo completo (lo que vive la persona)

| Paso | Qué hace la persona | Archivo |
|---|---|---|
| 1 | Acerca el celular a la placa NFC (o escanea el QR) | La placa abre `index.html` |
| 2 | En «Elige una carrera» toca **Arquitectura** o **Multimedia y Producción Audiovisual** (toque 1) | `index.html` |
| 3 | Ve los proyectos de esa carrera y toca uno (toque 2) | `carrera.html?c=arquitectura` |
| 4 | Lee la información del proyecto (ficha) | `proyecto.html?id=casa-moderna` |
| 5 | Toca **VER EN AR** → maqueta en 3D → **Ver en mi espacio** abre la cámara | `ar.html?id=casa-moderna` |
| 6 | Vuelve con la flecha (a la ficha → a su carrera → a todas las carreras) y sigue explorando | — |

Los visitantes **nunca** inician sesión.

**¿Por qué una página por carrera (`carrera.html`) y no una sección que se despliega?** En el celular el botón «atrás» funciona como la persona espera, la dirección se puede compartir o grabar en la placa de un aula (por ejemplo `…/carrera.html?c=arquitectura`) y es fácil medir cuándo se eligió la carrera (hipótesis H1). Los enlaces viejos `index.html?c=…` redirigen solos a `carrera.html?c=…`.

### Diseño
- Mismo lenguaje visual que la referencia: hero con degradado Ecotec, titulares grandes en mayúsculas (Inter Tight), tarjeta blanca + tarjeta translúcida de datos, chips, botones circulares con flecha y tarjetas de carrera y de proyecto con imagen. Sin fondos azul oscuro.
- Colores Ecotec definidos en `css/estilos.css` (`--azul` #0662AE, `--azul-medio` #0489C9, `--celeste` #01B3E6, `--hielo` #DEF1FF y `--degradado`). Si cambias un color ahí, cambia en todo el sitio.
- **Responsive:** se diseñó primero para celular (una columna). Desde 900 px de ancho (monitor) aparece el marco redondeado, el menú, la maqueta en el centro del hero y las dos tarjetas de carrera lado a lado.
- **Carrusel del hero** (`js/carrusel.js`): el visor 3D grande va rotando entre los proyectos cada 8 s con un fundido. Mientras se ve uno, el otro visor **precarga** el siguiente. Tiene nombre y carrera (que llevan a la ficha) y puntos para elegir. Con *reducir movimiento* no cambia ni gira solo.
  - **Se gira con el dedo o el mouse** (Ronda 4): arrastre horizontal. El arrastre vertical sigue moviendo la página (`touch-action="pan-y"`). Mientras se gira, el carrusel se pausa, y retoma **4 s después de soltar**. También se pausa con el mouse encima o con el teclado (no al tocarlo: tocar le da el foco al visor y la pausa no se quitaría).
  - **Celular:** ~60 % del alto de la pantalla y todo el ancho, con la cámara un poco más cerca (`camaraHero`) para que el modelo llene el visor.
  - **Monitor** (Ronda 4): el visor ocupa **todo el ancho del hero, detrás de los títulos** (los textos van por encima), y su alto se ajusta a la pantalla (entre 360 y 560 px) para que el modelo, el nombre y la carrera se vean sin hacer scroll, incluso en una laptop de 1366 × 768. La distancia de la cámara es «auto»: model-viewer la calcula para que el modelo se vea **completo** desde cualquier lado mientras gira. La inclinación de cada proyecto sale de `camaraHero`.
  - El proyecto de video aparece como el televisor 3D con el **póster** en la pantalla, no con el video: así la portada no descarga 9 MB. La imagen `img/cuentos-y-espias-pantalla.webp` está **volteada verticalmente** a propósito, porque así la pide la textura.
  - Opcional por proyecto en el JSON: `ar.modeloHero` (versión liviana del modelo solo para el carrusel) y `ar.camaraHero` (encuadre).
- **El periodo** («SEMESTRE 2 - 2026» en la tarjeta blanca) sale de un solo lugar: `data/proyectos.json` → `"periodoActual"`.
- **Botón «volver»**: pastilla de 48 px con flecha y texto, arriba a la izquierda en todas las páginas. Carrera → «Todas las carreras». Ficha → «Proyectos de Arquitectura/Multimedia» (usa `nombreCorto` de la carrera para que entre en una línea). AR → «Volver al proyecto».

### Modelo de negocio (B2B) y por qué implementarlo
El cliente es la universidad. El modelo tiene dos etapas:
1. **Etapa 1 · Prototipo gratis para Ecotec**, junto con los resultados de la prueba de usabilidad con 5 usuarios.
2. **Etapa 2 · Implementación:** un **pago único** por instalación y capacitación, más una **suscripción anual** que cubre hosting, licencia, soporte y actualizaciones.

Cuatro motivos para implementarlo:
- **Visibilidad:** el trabajo de los estudiantes se ve desde fuera del aula, a cualquier hora.
- **Multiformato:** maquetas 3D, video, imágenes y texto en un mismo lugar.
- **Actualizable:** cada semestre se cambia el contenido sin reimprimir nada.
- **Orientación vocacional:** los visitantes y colegiales entienden qué se hace en cada carrera.

## 2. Cómo se siente la experiencia AR, momento a momento

Esto es lo que hace que la AR "se sienta" bien: la persona **siempre sabe qué hacer**.

1. **Entra a la página AR.** Ve la maqueta en 3D sobre un fondo claro. Puede girarla con el dedo. Ya ve los 3 puntos numerados latiendo (invitan a tocarlos).
2. **Toca «Ver en mi espacio».** Se abre la cámara.
3. **Busca la superficie.** Aparece un celular animado moviéndose de lado a lado con el texto *«Apunta a una mesa o al piso y mueve el celular despacio»*. (Es el `slot="ar-prompt"`).
4. **La maqueta aparece sobre la mesa,** con sombra en la superficie, como si estuviera ahí. Mensaje: *«¡Listo! Camina alrededor y toca los puntos numerados…»*.
5. **Explora:** camina alrededor, se acerca, arrastra para moverla, pellizca para cambiar el tamaño.
6. **Toca un punto (1, 2 o 3):** el punto se ilumina y aparece una tarjeta abajo con la explicación.
7. **Pregúntale a la maqueta:** toca el botón, elige una pregunta sugerida o escribe la suya. La respuesta aparece en la tarjeta, **se lee en voz alta** y **se resalta el punto** de la maqueta al que se refiere.
8. Si se pierde el rastreo (poca luz, se movió rápido): *«Se perdió la superficie. Apunta otra vez a la mesa con buena luz»*.

## 3. Cómo funciona por dentro

Todo el AR lo hace **`<model-viewer>`**, un componente web gratuito de Google. Se carga con una sola línea en `ar.html`:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@google/model-viewer@4.0.0/dist/model-viewer.min.js"></script>
```

y se usa como una etiqueta HTML:

```html
<model-viewer src="modelos/casa-moderna.glb" ar ar-modes="webxr scene-viewer quick-look" ar-placement="floor" camera-controls>
  <button slot="hotspot-ventanal" data-position="-0.08 0.07 0.096" data-normal="0 0 1">1</button>
</model-viewer>
```

- **`ar`** activa la realidad aumentada.
- **`ar-modes`** decide qué tecnología usar según el celular (ver tabla de abajo).
- **`ar-placement="floor"`** busca superficies horizontales: mesa o piso.
- **Los puntos de información** son botones HTML normales con `slot="hotspot-…"`. `data-position` es la coordenada 3D en **metros** dentro del modelo. model-viewer los mueve para que sigan a la maqueta cuando la giras o caminas alrededor.
- **Eventos** que usa `js/ar.js` para guiar a la persona: `ar-status` (`session-started`, `object-placed`, `failed`, `not-presenting`) y `ar-tracking` (`tracking` / `not-tracking`).

### Qué pasa en cada celular

| Dispositivo | Tecnología AR | Puntos y asistente dentro de la AR |
|---|---|---|
| Android con Chrome (con ARCore / "Servicios de Google Play para RA") | **WebXR** dentro del navegador | ✅ Sí, todo se ve encima de la cámara |
| Android sin WebXR | Scene Viewer (app de Google) | ❌ Solo la maqueta |
| iPhone con Safari | **Quick Look** (AR nativa de Apple) | ❌ Solo la maqueta (Apple no permite HTML encima) |
| Computadora | Solo visor 3D | ✅ Puntos y asistente en 3D |

**Importante para la presentación y la validación:** en iPhone la maqueta sí aparece sobre la mesa, a escala y se puede rodear, pero los puntos y el asistente se usan **en la vista 3D** (antes o después de entrar a la AR). Es una limitación de iOS, no del proyecto. Regístrenlo como hallazgo en la métrica de compatibilidad.

### AR del proyecto de Multimedia: pantalla de cine con letra
`ar.html?id=cuentos-y-espias` coloca sobre la mesa un **televisor retro** (`modelos/pantalla-cine.glb`, pantalla 16:9 de 60 cm de ancho) que **reproduce el video con su audio**. La letra aparece **palabra por palabra** al ritmo de la canción, leída de `videos/cuentos-y-espias.es.vtt`.

- **Un solo video para todo.** model-viewer crea el `<video>` con `createVideoTexture()`. `js/ar-video.js` lo controla y `js/karaoke.js` dibuja la letra. Como es el mismo video, el sonido sigue igual al entrar y salir de la AR y nunca suena dos veces.
- **Controles:** reproducir/pausar, sonido sí/no, reiniciar, barra de progreso, **Ocultar letra / Mostrar letra** (se recuerda en el celular) y pantalla completa.
- **Sonido:** los navegadores no dejan sonar un video solo. El video arranca cuando la persona toca ▶, con sonido. Si el navegador igual lo bloquea, arranca en silencio y aparece el botón grande **«🔊 Activar sonido»**.
- **Letra:** la etiqueta muestra la sección (VERSO 1, PRE-CORO, CORO…). Los créditos van con otro estilo. Se ven como máximo 2 líneas: la actual y la anterior, más tenue. Si el celular tiene activado *reducir movimiento*, cada línea aparece entera.
- **Para cambiar los tiempos de la letra:** edita `videos/cuentos-y-espias.es.vtt` (formato `00:00:07.400 --> 00:00:10.800`). El identificador de cada línea (`verso1-1`, `coro-3`, `credito-1`…) decide su sección.

| Dispositivo | Qué ve la persona |
|---|---|
| Android con Chrome (WebXR) | La pantalla de cine sobre la mesa, con video, sonido, letra y controles encima de la cámara |
| iPhone | **Limitación de Apple:** Quick Look no reproduce video. Al tocar «Ver con la letra» se abre un **reproductor propio a pantalla completa** con la misma letra animada y los mismos botones, y un aviso amable |
| Android sin WebXR / computadora | Vista 3D con el video en el televisor, y «Ver con la letra» a pantalla completa |

> En iPhone no hay hoy una alternativa mejor sin instalar apps: Safari no tiene WebXR para AR, y Quick Look (USDZ) no admite texturas de video. Las plataformas de WebAR de pago (por ejemplo 8th Wall) podrían hacerlo, pero cuestan dinero y dependen de un servicio externo.

#### Tres modos de visualización (selector 📺 Televisor · 🎬 Sin televisor · 🌐 360°)
En los tres siguen la letra palabra por palabra, «Ocultar letra» y los controles. **El video nunca se reinicia**, porque siempre es el mismo `<video>`.

| Modo | Qué es | Cómo funciona |
|---|---|---|
| 📺 **Televisor** | El televisor retro con el video | Igual que antes |
| 🎬 **Sin televisor** | Solo la pantalla 16:9 con bordes redondeados, flotando, con un halo celeste y un reflejo de luz en la mesa | El `.glb` trae las dos versiones y solo se cambia la transparencia de los materiales. Se agranda y achica con los dedos igual que el televisor |
| 🌐 **360°** | «Cine curvo»: una pantalla curva gigante de 120° con el video **sin deformar**, un domo con los rayos de colores del video, siluetas de ciudad con ventanas y confeti | `js/cine-360.js` con three.js (se descarga solo al abrirlo). Se mira girando el celular (giroscopio; en iPhone pide permiso con un toque) o arrastrando con el dedo o el mouse. Funciona en Android, iPhone y computadora |

- Si se elige 360° **dentro de la AR** de Android, primero se cierra la AR y luego se abre el cine curvo; el audio sigue. model-viewer no permite poner una escena envolvente alrededor de la persona dentro de su AR.
- Botón «✕ Salir del 360°»: vuelve al modo anterior.
- En el JSON: `ar.modos` (qué modos se ofrecen) y `ar.modoInicial` (`televisor` o `sin-televisor`). El admin podrá editarlos en la Fase 5.
- Cada cambio se registra como el evento `modo_video` (para las métricas de la Fase 6).

**El modelo de la pantalla** se genera por código: `herramientas/pantalla-glb.js`. Con Node: `node --input-type=module -e "import('./herramientas/pantalla-glb.js').then(m => require('fs').writeFileSync('modelos/pantalla-cine.glb', m.crearPantallaGLB()))"`, o abre `herramientas/generar-pantalla.html` con Live Server y toca «Descargar».

#### Ficha de Multimedia
Solo tiene el video (con subtítulos), los créditos y «Ver la letra completa». El póster (`"portada"` en el JSON) se usa como portada: tarjeta de la carrera, fondo de la ficha y póster del video.

## 4. Estructura de archivos

```
vitrina-digital/
├── index.html          ← lo que abre la placa: hero + «Elige una carrera» (2 tarjetas)
├── carrera.html        ← proyectos de una carrera (?c=arquitectura / ?c=multimedia)
├── proyecto.html       ← información del proyecto + «Ver en AR»
├── ar.html             ← la experiencia AR (model-viewer)
├── placa.html          ← diseño imprimible de la placa (NFC + QR automático)
├── data/
│   └── proyectos.json  ← contenido de respaldo (Plan B) y semilla de Supabase
├── admin/
│   ├── login.html      ← ingreso del docente (correo + contraseña, «¿Olvidaste tu contraseña?»)
│   ├── index.html      ← panel (sin sesión de admin, manda al login)
│   ├── admin.css       ← estilos del panel
│   └── js/sesion.js    ← cliente de Supabase (supabase-js 2.118.0 por CDN) y revisión de admin
├── supabase/
│   ├── CONFIGURAR.md   ← ★ guía paso a paso de Supabase (proyecto, claves, SQL, admin, URLs)
│   ├── 01-esquema.sql  ← tablas, seguridad (RLS) y buckets
│   └── 02-semilla.sql  ← los 6 proyectos actuales (se genera con herramientas/supabase/semilla.mjs)
├── modelos/
│   ├── casa-moderna.glb        ← maqueta 1:25 optimizada (947 KB, ver sección 7)
│   ├── oficina.glb, london.glb, deliveryrush.glb, cafeteria.glb  ← proyectos de la Ronda 3 (sección 7b)
│   ├── *-hero.glb              ← versiones livianas (< 1 MB) para el carrusel del inicio
│   └── pantalla-cine.glb       ← televisor retro para la AR de Multimedia (generado por código)
├── videos/
│   ├── cuentos-y-espias.mp4    ← video 720p (9 MB, H.264 + AAC)
│   └── cuentos-y-espias.es.vtt ← letra con tiempos (subtítulos)
├── herramientas/       ← no es parte del recorrido:
│   ├── pantalla-glb.js       generador del .glb de la pantalla de cine
│   ├── maqueta/              optimizar.mjs, preparar.mjs (recetas por proyecto), imagenes.mjs (planos y GDD a WebP)
│   └── supabase/semilla.mjs  convierte data/proyectos.json en supabase/02-semilla.sql
├── img/                ← portadas (<id>-render.webp) y una carpeta por proyecto con sus planos o su GDD
├── css/
│   ├── estilos.css     ← estilos generales (colores Ecotec)
│   └── ar.css          ← estilos de la página AR
└── js/
    ├── datos.js        ← lee los proyectos de Supabase; si no responde, Plan B (copia local o el JSON)
    ├── config.js       ← URL_PUBLICA (GitHub Pages), URL de la placa y dirección + clave pública de Supabase
    ├── navegador.js    ← detecta navegadores sin AR (Brave, Firefox, WhatsApp…) y ofrece «Abrir en Chrome»
    ├── carrusel.js     ← carrusel de proyectos del hero
    ├── ar.js           ← lógica de la AR: modelo, puntos, guía, asistente
    ├── ar-propia.js    ← «Ver en mi espacio» de la maqueta con three.js + WebXR (gestos, botones, tutorial)
    ├── diagnostico.js  ← panel ?debug=1 de la AR propia (FPS, llamadas, triángulos, memoria)
    ├── visor-planos.js ← galería (planos o páginas de un documento) con visor grande y zoom
    ├── ar-video.js     ← pantalla de cine: video, sonido, controles, pantalla completa y modos
    ├── cine-360.js     ← modo 360° «cine curvo» (three.js, giroscopio)
    ├── karaoke.js      ← letra palabra por palabra sincronizada con el video
    ├── metricas.js     ← registro anónimo de eventos (se conecta a Supabase en la Fase 6)
    └── asistente.js    ← «Pregúntale a la maqueta»
```

No hay que instalar nada (sin npm, sin compilar). Son archivos estáticos.

## 5. Correrlo en VS Code

1. Abre la carpeta `vitrina-digital` en VS Code (**File → Open Folder**).
2. Instala la extensión **Live Server** (de Ritwick Dey).
3. Clic derecho en `index.html` → **Open with Live Server**. Se abre en `http://127.0.0.1:5500`.

> ⚠️ No abras `index.html` con doble clic (`file://…`): el navegador bloquea la lectura del JSON. Siempre con Live Server.

En la computadora verás todo el flujo y la maqueta en 3D con sus puntos y el asistente. **La AR solo funciona en el celular.**

## 6. Probarlo en tu celular (necesita HTTPS)

El celular solo abre la cámara para AR si la página está en **HTTPS**. Dos caminos:

### Opción A — rápida, para desarrollar (puerto reenviado de VS Code)
1. Con Live Server corriendo, abre el panel **Ports** (Puertos) en VS Code (abajo, junto a Terminal).
2. **Forward a Port** → escribe `5500`. Te pedirá iniciar sesión con GitHub.
3. Clic derecho sobre el puerto → **Port Visibility → Public**.
4. Copia la dirección `https://…devtunnels.ms` y ábrela en el celular.

### Opción B — definitiva, para la placa y la prueba con usuarios (GitHub Pages, gratis)
1. Sube la carpeta a un repositorio de GitHub (desde VS Code: ícono **Source Control → Publish to GitHub**).
2. En GitHub: **Settings → Pages → Branch: main / root → Save**.
3. En 1–2 minutos tendrás la dirección pública. **Esa es la URL que va en la placa NFC.**

**Dirección actual (desde la Ronda 4):** el repositorio es `vitrina-digital-ecotec/vitrina-digital-ecotec.github.io`, de la organización de GitHub **vitrina-digital-ecotec**. Como el repositorio se llama igual que la organización + `.github.io`, el sitio se publica en la **raíz**: **https://vitrina-digital-ecotec.github.io/** (sin `/vitrina-digital/` al final). Todas las rutas del sitio son relativas (`css/…`, `modelos/…`), así que funciona igual en la raíz, en una subcarpeta o con Live Server. La dirección anterior (`dianapapo.github.io/vitrina-digital/`) ya no funciona.
4. Cada semestre: se edita `data/proyectos.json`, se sube el cambio, y la placa sigue igual.

(Netlify Drop también sirve: arrastras la carpeta a app.netlify.com/drop y te da una URL HTTPS.)

## 7. La maqueta de Arquitectura

**Proyecto actual: «Casa Moderna», de Madeleine Morales. Es un PROYECTO DE EJEMPLO** (`"ejemplo": true` en el JSON muestra la etiqueta amarilla en la ficha y en la tarjeta).
- **Modelo original:** «Modern Home» por Ciolan-T. Sebastian (Sketchfab, https://skfb.ly/6Yr8Q), licencia **CC BY 4.0**. La licencia **permite modificarlo y mostrarlo** si se nombra al autor, se enlaza la licencia y se indican los cambios; todo eso aparece en la ficha. **Adaptación del modelo:** Diana Espinoza (interiores, mobiliario y planos).
- **Planos:** 9 láminas (A-01 a A-09) en WebP de 2000 px (de 7,7 MB a 664 KB, más miniaturas de ~10 KB). En la ficha, al tocar una se abre el visor grande (`js/visor-planos.js`), que permite pellizcar con dos dedos, usar la rueda del mouse o los botones − / +, tocar dos veces para acercar y pasar de lámina con ‹ ›.
- **Textos:** la descripción, los 3 puntos y el asistente salen de la memoria descriptiva y de los cuadros de áreas, vanos y acabados de los planos. La materia sigue como `[EJEMPLO]`.

### Optimización (C2)
`herramientas/maqueta/optimizar.mjs` (con Node.js):
```bash
cd herramientas/maqueta && npm install
node optimizar.mjs ruta/al/original.glb ../../modelos/casa-moderna.glb 25
```
1. Pasa el modelo, que está en metros reales, a **maqueta 1:25** (59 × 26 cm en planta y 33 cm de alto), centrada y con la base en y = 0.
2. Junta los materiales de color liso en una paleta y une las mallas: de **339 a 6 llamadas de dibujo**, que era lo que hacía lento al celular. **No se simplifican los triángulos**: son solo 12 382 y así el interior queda intacto.
3. Texturas a **WebP**. **Sin Draco ni meshopt**: el archivo ya es chico y así el celular no tiene que descargar un decodificador.

| | Antes | Después |
|---|---|---|
| Peso | 2,1 MB (la casa anterior: 8,1 MB) | **947 KB** |
| Llamadas de dibujo / materiales | 339 / 33 | **6 / 6** |
| Triángulos | 12 382 | 12 382 |
| Tiempo hasta verse con 4G (9 Mbps, medido) | 3,3 s (la casa anterior: 9,8 s) | **1,7 s** |

En la página: mientras carga se ve el **póster** (`img/casa-moderna-render.webp`, una captura del modelo). La luz es el entorno neutro de model-viewer, sin descargas extra, y la sombra se calcula una vez cuando la maqueta está quieta. En la AR propia la sombra es una imagen, así que no hay sombras en tiempo real.

### Adelanto 3D (C3)
La propuesta de valor es **«Ver en mi espacio»**, por eso la vista 3D es solo un adelanto:
- gira sola y despacio, con giro horizontal limitado a ±40° y el ángulo vertical fijo, sin zoom ni desplazamiento;
- al tocar un punto aparece «Disponible en “Ver en mi espacio”»;
- el botón principal es grande, con un brillo que invita a tocarlo, y debajo dice «Ingresa a “Ver en mi espacio” para recorrer la maqueta».

En **computadora** se ve el mismo adelanto con un **QR** («Escanea con tu celular para verla en tu espacio»), que apunta a `URL_PUBLICA/ar.html?id=casa-moderna&src=qr`.
**Excepción en iPhone:** Quick Look no puede mostrar los puntos ni el asistente, así que en iPhone se leen completos en la vista 3D.

### «Ver en mi espacio» con AR propia (C4) — `js/ar-propia.js`
En Android con Chrome se usa una **AR propia con three.js + WebXR**: en la AR de model-viewer los gestos son fijos y un dedo mueve la maqueta en vez de girarla.

| Gesto / botón | Qué hace |
|---|---|
| 1 dedo arrastrando | Gira la maqueta sobre su eje (no la mueve de lugar) |
| 2 dedos pellizcando | Agranda / achica (de ×0,2 a ×8; antes ×0,25 a ×4) |
| 2 dedos arrastrando | Mueve la maqueta sobre la mesa |
| Doble toque | Vuelve al tamaño y la posición de colocación |
| ⟲ ⟳ | Gira 45° con animación |
| − + | Achica / agranda (×1,25 por toque, mismos topes) |
| ⊙ Centrar | Lleva la maqueta al punto de la mesa al que apuntas |
| 🏠 Ver interior | Completa → **Sin techo** → **Planta baja**: un corte horizontal a la altura de cada losa (`ar.cortes` en el JSON) |
| ✕ Salir · ? | Salir · volver a ver el tutorial |

- **Solo tamaño «Maqueta» (1:25).** La «Escala real 1:1» se **descartó tras la prueba en el celular, por rendimiento** (Ronda 3 · Bloque E): con la casa de 14,8 m la página se trababa. Para verla más grande: pellizcar o «+» (hasta ×8) y acercarse caminando.
- **Acercarse sin que se corte** (Ronda 4): la cámara dibuja desde **1 cm** («near» = 0,01 m; WebXR usa 10 cm si no se le indica). three.js copia el near de la cámara a la sesión WebXR (`depthNear`) y lo reinicia en cada sesión: se revisó en el código de three.js 0.170. Lo comprueba `proyectos.test.mjs` en los 5 modelos.
- **Los 5 modelos (maquetas y escenarios) usan exactamente la misma AR**: mismos gestos, botones, tutorial, retícula y puntos; solo cambian los textos («la maqueta» / «el escenario»).
- **Inicio rápido:** three.js, el modelo, los shaders y las texturas se **preparan mientras la persona mira el adelanto**, antes de abrir la cámara. Al entrar aparece «Buscando superficie…», luego una **retícula con la sombra de la casa** donde va a quedar, y un toque la coloca.
- **Encontrar la mesa más rápido:** la búsqueda (hit-test) empieza apenas se abre la cámara, aunque el tutorial esté visible, y acepta **planos y también puntos sueltos** de ARCore (`entityTypes: ['plane', 'point']`), que aparecen mucho antes que un plano completo. El primer paso del tutorial aconseja «Apunta a una superficie con textura y buena luz».
- **«📍 Colocar aquí»:** si a los 6 s no se encontró ninguna superficie, aparece este botón. Pone la maqueta unos 60 cm frente a la cámara, sobre un plano estimado (45 cm por debajo del celular). La búsqueda sigue: si después aparece la mesa, el aviso invita a tocar **⊙ Centrar**, que la apoya en ella.
- **Tutorial de 3 pasos**, siempre al entrar: avanza solo cada 3 s o con un toque, tiene «Ocultar tutorial» en la esquina y «?» para volver a verlo. Registra `tutorial_ocultado` con el paso.
- Los puntos 1-2-3 siguen a la maqueta y se ven tenues si una pared los tapa; con «Ver interior» desaparecen los que quedan sobre el corte. La tarjeta y el asistente funcionan dentro de la AR.
- **Red de seguridad:** si el celular no soporta WebXR con hit-test y DOM overlay, o si algo falla al iniciar, se abre **automáticamente la AR de model-viewer**.
- **Interruptor para la presentación:**
  - `"configuracion": { "arPropia": false }` en `data/proyectos.json` usa siempre la AR anterior (el admin lo podrá cambiar en la Fase 5);
  - o abre `ar.html?id=casa-moderna&ar=clasica` para forzarla solo en ese celular.
#### Fluidez en celulares de gama media (Ronda 3 · Bloque E)
Meta: 60 fps (mínimo 30 estables). El modelo ya era liviano (12 384 triángulos, 6 llamadas de dibujo), así que la lentitud venía de **cómo** se dibujaba:

| Qué se cambió | Por qué |
|---|---|
| El visor 3D de la página se **oculta** durante la AR | Seguía girando y dibujando por detrás: eran dos motores 3D compitiendo por la GPU |
| La AR se dibuja al **75 % de la resolución** (`framebufferScaleFactor`) | 44 % menos píxeles; con antialias no se nota borroso |
| Materiales **Lambert** + 2 luces, sin mapa de entorno (exposición 1,3 para compensar) | Los PBR con reflejos son lo más caro por píxel |
| Caras de un solo lado y **sin plano de corte** salvo en «Ver interior»; los materiales del corte se preparan una vez | Antes todo se dibujaba por las dos caras y con corte, aunque no se usara |
| Sin `light-estimation` y **hit-test apagado** al colocar | El celular dejaba de buscar la mesa en cada cuadro |
| Puntos 1-2-3: `translate3d` cada 2 cuadros, **sin transición CSS**, sin leer el layout; revisa paredes de a un punto | La transición se reiniciaba en cada cuadro y el punto quedaba atrás |
| Botón del asistente sin desenfoque (`backdrop-filter`) en la AR | Desenfocar la cámara en cada cuadro es carísimo |
| Cero objetos nuevos por cuadro; shaders (`compileAsync`) y texturas (`initTexture`) listos antes de la cámara | Sin tirones del recolector de basura ni al colocar |

#### Fluidez de los 6 modelos (Ronda 4)
Meta: **60 FPS estables** en un Infinix HOT 60 Pro+ (Helio G200) con todos los proyectos. Lo que se probó y lo que quedó:

| Qué se probó | Resultado |
|---|---|
| **Resolución dinámica** (`js/resolucion.js`) | ✅ **Queda.** Es lo que más pesa: dibujar menos píxeles. La imagen se pide al 90 % de la pantalla y se dibuja una parte (al empezar ≈ 75 %, como antes). Si los FPS bajan de 58, se dibuja un 10 % menos (hasta 45 %) y el celular la estira; si sobran (66 FPS o más, en pantallas de 120 Hz), sube despacio hasta el 90 %. Usa `XRView.requestViewportScale` de WebXR, sin recrear la sesión. Si el celular no lo permite, queda fija al 75 % (el panel `?debug=1` lo dice). Si bajar la resolución no mejora los FPS (por ejemplo, porque la cámara va a 30 cuadros), vuelve a la inicial y deja de ajustar. |
| **Foveación** de WebXR | ⚪ three.js ya la pide al máximo, pero **solo la usan los visores** (Meta Quest); en los celulares no cambia nada. Se dejó explícita (`setFoveation(1)`). |
| **Menos transparencias** | ✅ London: fuera las persianas (opacidad 0, invisibles pero se dibujaban) y el destello rojo; muebles y cortinas del lobby como **recorte**. Oficina: su material transparente grande, como recorte. La fachada de London y los vidrios de la Casa siguen transparentes: como recorte se perdían detalles (las franjas de los pisos, el interior detrás del muro cortina) y en la medición la diferencia no se notaba. Delivery Rush y la Cafetería no tenían transparencias. |
| **Atlas de texturas** | ⚪ No. Ya hay pocas llamadas de dibujo (7 a 19 por modelo) y las texturas de pisos y azulejos se **repiten** (no se pueden juntar en un atlas sin que se vean costuras). |
| **LOD / simplificación** | ⚪ No como LOD. Se midió con la versión liviana del carrusel en la AR (`&modelo=hero`): bajaba 24–36 % el tiempo, pero le quita los muebles, la comida y el lobby, justo lo que se explora de cerca: se notaría. Los modelos ya estaban simplificados donde no se nota (comida de Delivery Rush, fachadas de London). |
| **Frustum culling** | ⚪ three.js ya no dibuja lo que queda fuera de la pantalla, pieza por pieza. Como cada modelo está unido en pocas piezas grandes (para tener pocas llamadas), casi siempre hay alguna parte visible. Partir los modelos en trozos aumentaría las llamadas para ahorrar solo triángulos, que no es lo que más pesa. |
| Tone mapping, sombra pre-dibujada | ⚪ Se midieron (`&tm=0`, `&sombra=0`): la diferencia quedó dentro del ruido de la medición. Se mantienen. |
| Antialias | ⚪ Por software cuesta mucho, pero en las GPU de celular (Mali) el antialias por hardware es casi gratis y sin él los bordes de las maquetas se ven dentados. Se mantiene (`&aa=0` para probar en el celular). |

**Cómo se midió en la compu:** `cd pruebas && node rendimiento.mjs todos --sw`. Dibuja 60 cuadros con el modelo girando, a la resolución que tendría en el celular, con la **GPU por software** (SwiftShader): así el costo de cada píxel pesa de verdad (con la GPU de la compu todo da «rápido»). Cada caso se mide 3 veces y se queda el mejor. Es ~8 veces más lento que el Infinix, así que sirve para **comparar** antes y después, no como FPS reales: esos se miden en el celular con `?debug=1`.

Con `--dinamica` compara, en la misma página y alternando, la resolución inicial (75 %) con el mínimo de la dinámica (45 %), en ms por cuadro (menos es mejor):

| Proyecto | 75 % | 45 % | De cerca ×3, 75 % | De cerca ×3, 45 % |
|---|---|---|---|---|
| Casa Moderna | 92 | 44 (−52 %) | 257 | 103 (−60 %) |
| Oficina | 121 | 64 (−47 %) | 267 | 116 (−57 %) |
| Delivery Rush (1:12) | 61 | 31 (−49 %) | 81 | 39 (−53 %) |
| London | 39 | 24 (−37 %) | 66 | 80 (ruido) |
| Cafetería | 104 | 55 (−47 %) | 190 | 82 (−57 %) |

Es decir: cuando un modelo pesa más de lo que el celular puede dibujar a 60 FPS (sobre todo de cerca), la resolución dinámica puede reducir el trabajo **a la mitad**. Comparar corridas distintas (versión anterior contra nueva) dio resultados con demasiado ruido (el mismo modelo de la Cafetería dio 104 y 40 ms en dos corridas), por eso la comparación definitiva es la de `?debug=1` en el celular.

**Modo diagnóstico:** agrega `&debug=1` a la dirección (`ar.html?id=casa-moderna&debug=1`). Muestra FPS, tiempo por cuadro, JS por cuadro, llamadas, triángulos, memoria, resolución (y si es **dinámica** o fija) y los segundos (contados desde el toque en «Ver en mi espacio») hasta ver la cámara, detectar la mesa y colocar la maqueta; si se usó «Colocar aquí», lo indica. Interruptores para probar en el celular: `&res=0.6` (resolución fija), `&aa=0` (sin antialias), `&tm=0` (sin tone mapping), `&transp=0` (todo opaco), `&sombra=0` y `&modelo=hero` (versión liviana). En el **proyecto de video** (AR de model-viewer) `&debug=1` muestra los FPS y el tiempo por cuadro de la sesión WebXR.

- **iPhone:** Quick Look (AR de Apple). Antes de abrirlo aparece una hoja con sus gestos (arrastrar, girar con dos dedos, pellizcar, cambiar entre «AR» y «Objeto»).
- **Modo de prueba en la computadora:** `ar.html?id=casa-moderna&arprueba=1` abre la misma experiencia sin cámara, con el mouse. Lo usan las pruebas automáticas.

### Para usar el modelo propio de la estudiante

1. **Exportar desde Blender:** File → Export → **glTF 2.0** → Format: **glTF Binary (.glb)**. Marca *Apply Modifiers*, deja *+Y Up*.
2. **Escala:** model-viewer trabaja en **metros**. Para una maqueta 1:50 de una casa de 15 m de ancho, el modelo debe medir 0,30 m. En Blender, escala el objeto y aplica la escala (Ctrl+A → Scale). Coloca el **origen en la base** del modelo (para que se apoye sobre la mesa y no quede flotando ni enterrado).
3. **Peso:** que el `.glb` pese **menos de 10 MB** (ideal 2–5 MB). Para comprimirlo, arrástralo a **gltf.report** y usa la opción de compresión, o reduce texturas a 1024 px.
4. Guárdalo en `modelos/` y cambia la ruta en el JSON: `"modelo": "modelos/tu-archivo.glb"`.
5. **Ubicar los 3 puntos:** abre **modelviewer.dev/editor**, arrastra tu `.glb`, entra a la pestaña de *Hotspots*, haz clic en el modelo donde quieres cada punto y copia los valores `data-position` y `data-normal` al JSON (`"posicion"` y `"normal"`).

## 7b. Los proyectos de la Ronda 3 (Bloque F)

| Proyecto | Carrera · tipo | Autores | ¿Ejemplo? | Galería |
|---|---|---|---|---|
| Casa Moderna | Arquitectura · maqueta | Madeleine Morales | Sí | 9 planos |
| Oficina Loft 18 | Arquitectura · maqueta | Alberto Urgilés | Sí | 8 planos |
| Rascacielos London | Arquitectura · maqueta | Arianna Gutiérrez | Sí | 10 planos |
| Bienvenidos a Cuentos y Espías | Multimedia · video | Diana Espinoza | No | Video |
| Next Order: Delivery Rush | Multimedia · escenario | Arllys Ramos y Xavier Ponce | No | GDD (12 páginas) |
| Cafetería M3D | Multimedia · escenario | Arllys Ramos | No | — |

Las descripciones, los puntos y el asistente de los 4 proyectos nuevos los redactó Claude a partir del GDD, los planos y los modelos, y el equipo los revisó en la Ronda 4 (ya no llevan `"_revisar"`). Periodo de Delivery Rush y Cafetería: Semestre 2 - 2026 (proyectos reales). En Oficina y London la materia sigue como `[EJEMPLO]`.

### Modelos optimizados (`node preparar.mjs todos`)

| Modelo | Original | En el sitio | Triángulos | Llamadas de dibujo | Carrusel |
|---|---|---|---|---|---|
| Delivery Rush (diorama **1:12**, 112 × 60 cm) | 11,5 MB (FBX convertido) | **0,8 MB** | 347 688 → 81 718 | 1 020 → 19 | 0,45 MB |
| Cafetería (1:22, 56 × 55 cm) | 1,6 MB | **0,3 MB** | 32 357 | 189 → 9 | 0,19 MB |
| Oficina (1:30, 51 × 39 cm) | 11,8 MB | **1,9 MB** | 39 882 | 133 → 17 | 0,9 MB |
| London (1:400, 42 cm de alto) | 29,7 MB | **1,8 MB** | 142 742 → 80 791 | 60 → 18 | 0,95 MB |

- **Delivery Rush:** sin techo (diorama) y sin las guías del diseño del nivel (huella de inicio, círculos de giro y ruta del robot), que no se ven en el juego. **Ronda 4: pasó de 1:24 a 1:12** (el doble) para explorarlo como las maquetas de Arquitectura: a 1:24 aparecía muy chico. Con el pellizco llega hasta ×8 (≈ 1:1,5). Por eso en el JSON las alturas de los cortes y las posiciones de los 3 puntos se multiplicaron por 2, y «Colocar aquí» lo deja más lejos si el modelo es grande (su borde queda a ~30 cm del celular). La comida y los adornos se simplificaron (son piezas de pocos centímetros). Como eran piezas *low poly* con caras planas, se guardan sin normales (se sombrean planas igual).
- **London:** sin los mapas de relieve y rugosidad (a 1:400 no se notan y la AR propia no los usa) y con las fachadas simplificadas. **Ronda 4:** se quitaron las persianas (tenían opacidad 0: no se veían, pero se dibujaban) y el destello rojo de la punta (casi invisible), y los muebles y cortinas del lobby pasaron de transparentes a **recorte** (`recorte` en la receta). La fachada se probó como recorte pero perdía las franjas de los pisos y no ganaba velocidad: sigue transparente.
- **Oficina (Ronda 4):** su único material transparente grande (`material_9`, 76 % de píxeles invisibles) pasó a recorte.
- Todos van con **compresión meshopt**. model-viewer y three.js bajan un decodificador de 25 KB (configurado en `index.html`, `ar.html` y `js/ar-propia.js`).
- «Ver interior»: Oficina → Sin techo / Planta baja · London → Piso 12 / Lobby · Delivery Rush → Sin vigas / Muros bajos · Cafetería → Sin plafón (`"cortesDobleCara": false` porque sus muros son planos de una sola cara).

### Créditos y licencias (confirmados en la Ronda 4)
- **Oficina Loft 18:** modelo «free Loft 18 mini office v.optimization» de **dasy444** (Sketchfab), **licencia Sketchfab Standard**. Permite usarlo en cualquier medio y en obras derivadas, pero **no permite redistribuir el archivo del modelo suelto**. Ojo: para que la AR funcione, `modelos/oficina.glb` queda publicado y se puede descargar desde el repositorio público. **Decisión del equipo:** se mantiene porque es un prototipo académico y un proyecto de ejemplo; el crédito al autor queda visible en la ficha y en la presentación se aclara que los proyectos de ejemplo no pertenecen al equipo. **Adaptación del modelo:** Xavier Ponce.
- **Rascacielos London:** «[FREE] London Skyscraper» de **99.Miles** (Sketchfab), **CC BY 4.0**: permite modificarlo y publicarlo nombrando al autor y la licencia (está en la ficha). **Adaptación del modelo:** Xavier Ponce.
- **Next Order: Delivery Rush:** «Modelado en Blender · Desarrollado en Unreal Engine 5». **Todos los modelos y props son originales del equipo** (confirmado en la Ronda 4; la mención de recursos externos de la lámina 12 del GDD no aplica al escenario publicado).
- **Cafetería M3D:** el modelo original usaba imágenes de internet (un damero de iStock y fotos de Marilyn Monroe, una guitarra y los Beatles en los cuadros). En la versión web se cambiaron por diseños propios generados en `herramientas/maqueta/texturas-cafeteria.mjs`; el archivo de la estudiante no se modificó. El equipo aprobó estos diseños en blanco y negro.

## 8. La placa: QR (hoy) y NFC (después)

**La dirección pública está en un solo lugar:** `js/config.js` → `URL_PUBLICA = 'https://vitrina-digital-ecotec.github.io/'`.

- **QR (método principal por ahora).** `placa.html` lo genera a partir de `URL_PUBLICA`, así que apunta al sitio publicado **aunque abras la placa en tu compu**. Abre `…/index.html?src=qr`. El `?src=qr` sirve para que las métricas (Fase 6) sepan que la visita llegó por el QR.
- **Descargas para imprenta:** botones «Descargar QR (PNG)», de unos 2.000 px, y «Descargar QR (SVG)», vectorial. Los dos traen el margen blanco reglamentario de 4 módulos y corrección de errores media (M).
- **Imprimir la placa:** botón «Imprimir placa» o Ctrl+P (10 × 15 cm). La zona punteada «Acerca tu celular» queda para el chip.
- **NFC (más adelante):** la placa muestra la dirección `…/index.html?src=nfc` con un botón «Copiar». Compra etiquetas **NTAG213 o NTAG215**, instala **NFC Tools** → Escribir → Añadir un registro → URL → pega la dirección → Escribir, y acerca la etiqueta. Pégala detrás de la zona punteada.

### Pruebas automáticas (carpeta `pruebas/`)
- `npm test` corre `proyectos.test.mjs` (ficha y AR propia de los 4 proyectos nuevos, «3 proyectos» por carrera y carrusel de 6), `qr.test.mjs` (el QR, ver abajo), `maqueta.test.mjs` (adelanto, QR de la maqueta, AR propia en modo de prueba, ficha y visor de planos), `video-modos.test.mjs` (Televisor → Sin televisor → 360° → salir, sin que el video se reinicie, en monitor y celular) y `carrusel.test.mjs`. Este último comprueba que el carrusel avance solo a los 8 s, que los puntos cambien de proyecto, que se pause con el mouse, que con *reducir movimiento* no avance, que el televisor muestre el póster y (Ronda 4) que **se gire con el dedo** (con eventos táctiles reales: el arrastre horizontal gira y pausa, retoma 4 s después de soltar y el vertical mueve la página) y que en monitor el visor ocupe todo el ancho detrás de los títulos. `proyectos.test.mjs` también revisa (Ronda 4) los datos confirmados y, en los 5 modelos, el near de 1 cm y el pellizco hasta ×8.
- `node rendimiento.mjs todos --sw` mide la AR propia de los 5 modelos (ver «Fluidez de los 6 modelos»).
- `navegador.test.mjs` (Fase 5) simula Android con Brave, Instagram y Chrome sin AR: aviso «Ábrelo en Chrome», enlace `intent://` y evento `navegador_no_compatible`.
- `datos-supabase.test.mjs` (Fase 5) finge un Supabase que responde, que está caído y que tarda: el sitio usa Supabase o el Plan B sin quedar en blanco.
- `admin-login.test.mjs` (Fase 5): sin sesión el panel manda al login; contraseña incorrecta (contra el Supabase real); con un Supabase fingido, entra un admin, una cuenta no admin no puede y «Salir» cierra la sesión.
- `node seguridad-supabase.mjs` (con las claves ya en `config.js`) prueba la seguridad **del Supabase real** con la clave pública.
- `resolucion.test.mjs` simula FPS altos, bajos y con tope de cámara, y revisa la resolución dinámica.
- `node capturas.mjs` recorre todas las páginas en **390 px y 1440 px**: revisa que no haya errores en la consola ni scroll horizontal y guarda capturas en `pruebas/capturas/` (no se suben al repositorio).

### Prueba automática del QR
`pruebas/qr.test.mjs` abre `placa.html` en Chrome y **decodifica** con jsQR el QR de la pantalla, el PNG y el SVG descargados. Comprueba que los tres apuntan exactamente a `https://vitrina-digital-ecotec.github.io/index.html?src=qr`, que esa URL abre el inicio y que no hay errores en la consola.

```bash
cd pruebas
npm install      # solo la primera vez
npm test
```

## 9. El asistente «Pregúntale a la maqueta»

Archivo: `js/asistente.js`. Datos: `asistente.pasajes` en el JSON.

- Cada pasaje es una frase corta de la ficha, ligada a un punto de la maqueta (`"punto": "ventanal"`) o a ninguno (`null`), con sus palabras `claves`.
- Cuando la persona pregunta, se normaliza el texto (sin tildes ni signos), se compara con las claves y el texto de cada pasaje, y se devuelve el que más coincide. Reconoce variaciones: *dormitorio* ≈ *dormitorios*.
- Si nada coincide lo suficiente: *«No tengo esa información…»*. **Nunca inventa**: solo devuelve lo que cargaron el estudiante y el docente.
- La respuesta se muestra, se lee en voz alta (`speechSynthesis`, viene en el navegador) y resalta el punto en la maqueta.
- No usa servidor, no guarda datos de nadie, no usa cámara ni micrófono para la IA.

**Fase 2 (búsqueda semántica con Transformers.js):** reemplazar la función `puntuar()` por una comparación de *embeddings* con `@huggingface/transformers`. La función `responder()` devuelve lo mismo, así que `ar.js` no cambia. Ojo: los modelos multilingües pesan ~100 MB, demasiado para un celular frente a un aula; por eso el MVP usa palabras clave.

## 10. Cómo agregar un proyecto nuevo (guía para el docente — H4)

Todo el contenido está en `data/proyectos.json`. En la Fase 5 esto se hará desde el panel de administración; mientras tanto:

1. **Elige el tipo** (campo `"tipo"`). Decide qué experiencia AR se abre, sin tocar código:
   | `tipo` | Para qué | AR |
   |---|---|---|
   | `maqueta` | Arquitectura: casas, edificios | AR propia con puntos, asistente y «Ver interior» |
   | `escenario` | Un diorama de videojuego o un modelo 3D (Multimedia) | La misma AR propia; los textos dicen «el escenario» |
   | `video` | Un video | Pantalla de cine con la letra (como Cuentos y Espías) |
2. **Prepara el modelo 3D** (maqueta o escenario):
   - Expórtalo a `.glb` desde Blender (File → Export → glTF Binary). Si viene en `.fbx`, conviértelo con `npx fbx2gltf@0.9.7-p1` o reexpórtalo desde Blender.
   - Copia el original a `_material/3_proyectos/<carrera>/` y agrega una receta en `herramientas/maqueta/preparar.mjs` (copia una existente: escala, qué quitar, qué simplificar).
   - `cd herramientas/maqueta && npm install && node preparar.mjs <id>` → crea `modelos/<id>.glb` y `modelos/<id>-hero.glb` (versión liviana para el carrusel, < 1 MB).
3. **Prepara las imágenes**: agrega el grupo en `herramientas/maqueta/imagenes.mjs` y córrelo (`node imagenes.mjs`): genera WebP de 2000 px y miniaturas en `img/<id>/`. La portada va en `img/<id>-render.webp` (1200 × 900).
4. **Copia un bloque de proyecto** en `"proyectos"` (el más parecido) y cambia:
   - `id` (sin espacios ni tildes), `carrera`, `tipo`, `titulo`, `estudiante`, `materia`, `periodo`, `descripcion`, `portada`
   - `ejemplo`: `true` muestra la etiqueta amarilla «PROYECTO DE EJEMPLO»; bórralo en los proyectos reales
   - `galeria` (opcional): `{ "titulo": "Planos", "estilo": "planos" | "documento", "imagenes": [ { src, mini, titulo, alt } ] }`. «documento» muestra páginas apaisadas (por ejemplo, un GDD).
   - `creditos` (opcional): lista de `{ "etiqueta", "texto" }`. `creditoModelo` (opcional): modelo de Sketchfab u otro sitio con autor, enlace y licencia.
   - `ar`: `modelo`, `modeloHero`, `poster`, `escala` (texto, por ejemplo «1:30»), `camara` (vista del adelanto), `cortes` (para «Ver interior»: nombre y altura en metros de la maqueta; si no hay, el botón se oculta), `alt` y los 3 `puntos` (ver la sección 7 para ubicarlos)
   - `asistente`: 3 preguntas `sugeridas` y los `pasajes` con sus palabras `claves`
5. Borra las marcas `[EJEMPLO]` y el campo `_revisar` cuando el texto esté confirmado.
6. Corre las pruebas (`cd pruebas && npm test`) y sube los cambios.

La página de la carrera, las tarjetas («3 PROYECTOS»), el carrusel del inicio y el contador «Proyectos expuestos» se actualizan solos.

> Consejo: valida el JSON en **jsonlint.com** si la página deja de cargar (casi siempre es una coma de más o de menos).

## 11. Checklist antes de la prueba con 5 usuarios

- [ ] La URL de la placa es HTTPS y abre `index.html`
- [ ] NFC probado en un Android y un iPhone; QR de respaldo funciona
- [ ] La maqueta real carga en menos de ~5 s con datos móviles
- [ ] La maqueta se apoya sobre la mesa (no flota ni se hunde) y tiene tamaño razonable
- [ ] Los 3 puntos están sobre los elementos correctos
- [ ] Las 3 preguntas sugeridas devuelven la respuesta correcta
- [ ] Se borraron todos los `[EJEMPLO]`
- [ ] Mesa con buena luz y superficie con textura (el vidrio y las mesas blancas brillantes cuestan detectarse)

## Créditos técnicos

- Modelo 3D original de Arquitectura: [Modern Home](https://skfb.ly/6Yr8Q) por Ciolan-T. Sebastian (Sketchfab), licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Adaptación del modelo: Diana Espinoza (interiores, mobiliario y planos); optimizado para celular.
- Oficina Loft 18: [free Loft 18 mini office v.optimization](https://sketchfab.com/3d-models/free-loft-18-mini-office-voptimization-e434caaeaa4a4347a3c45eac6c138c30) por dasy444 (Sketchfab), licencia [Sketchfab Standard](https://sketchfab.com/licenses).
- Rascacielos London: [[FREE] London Skyscraper](https://skfb.ly/pKVG9) por 99.Miles (Sketchfab), licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- [three.js](https://threejs.org) 0.170 (licencia MIT): AR propia y modo 360°.
- [meshoptimizer](https://github.com/zeux/meshoptimizer) 0.22 (licencia MIT): compresión de los modelos.
- Logo de la Universidad Ecotec: propiedad de la universidad.

- [model-viewer](https://modelviewer.dev) (Google, licencia Apache 2.0)
- Tipografía Poppins (Google Fonts)

## Fase 5 · Navegadores sin AR y Supabase

### Navegadores sin AR (parte 0) — `js/navegador.js`
La AR en el navegador solo existe en **Chrome de Android** (y algunos parecidos). En Android, si el navegador no la tiene (Brave, Firefox, los navegadores internos de WhatsApp, Instagram y Facebook):
- **Maquetas y escenarios:** «Ver en mi espacio» prueba primero **Scene Viewer** (la app de AR de Google). Si en 3 s no se abrió, aparece el aviso *«Tu navegador no permite realidad aumentada. Ábrelo en Chrome para verla en tu espacio»* con **Abrir en Chrome** (un enlace `intent://…;package=com.android.chrome;end` que abre la misma página en Chrome; si no lo tiene, Android ofrece instalarlo), **Copiar enlace** y **Seguir en 3D**. En los navegadores internos de las apps el aviso sale directo (ahí Scene Viewer deja una página de error).
- **Video:** el aviso aparece al cargar, con «Ver el video aquí» (pantalla completa con la letra, como en iPhone).
- **Chrome en un celular sin AR** (sin «Servicios de Google Play para RA»): el aviso dice que es el celular, y no ofrece «Abrir en Chrome».
- Se registra el evento `navegador_no_compatible` con el nombre del navegador. iPhone y computadora no cambian.

### Supabase y Plan B (parte 1)
Guía completa: **`supabase/CONFIGURAR.md`**. Resumen:
- **Tablas:** `administradores`, `ajustes` (periodo, arPropia), `carreras`, `proyectos`, `eventos`. Cada proyecto guarda sus datos en una columna `datos` (jsonb) con **la misma forma** que `data/proyectos.json`: así el sitio no cambia, se pueden crear proyectos de cualquier tipo con campos nuevos sin tocar la base, y el Plan B es el mismo archivo.
- **Seguridad (RLS):** con la clave pública solo se leen los proyectos publicados y se registran eventos. Editar, subir archivos, ver métricas y ver proyectos ocultos: solo correos de la tabla `administradores`.
- **Plan B:** `js/datos.js` espera a Supabase hasta 4 s. Si no responde (sin internet, pausado, caído), usa la **última copia buena** guardada en el navegador y, si no hay, `data/proyectos.json`. La vitrina nunca queda en blanco.
- Si cambias `data/proyectos.json`, regenera la semilla: `node herramientas/supabase/semilla.mjs`.

### Login del panel (parte 2) — `/admin/`
- **Dirección:** https://vitrina-digital-ecotec.github.io/admin/ — el sitio público no tiene enlaces al panel (y las páginas tienen `noindex` para que Google no las muestre).
- `admin/login.html`: correo + contraseña (Supabase Auth), botón 👁 para ver la contraseña, mensajes simples («Correo o contraseña incorrectos», «Supabase pausado»…). Después de entrar revisa en la base de datos (`es_admin()`) que el correo esté en `administradores`: si no, cierra la sesión y avisa.
- **«¿Olvidaste tu contraseña?»** manda un enlace; al abrirlo, la misma página muestra «Contraseña nueva» (mínimo 12 caracteres).
- `admin/index.html`: sin sesión de admin no muestra nada y manda al login. Si la sesión se cierra en otra pestaña, también vuelve al login. Tiene las pestañas Proyectos · Carreras · Ajustes · Métricas (se llenan en las partes 3–7).
- La sesión dura mientras se use (el token se renueva solo) y se guarda en ese navegador hasta tocar **Salir**.

### Arreglo de las texturas de la Cafetería (Fase 5)
En el carrusel y en la AR se veían rayas, manchas blancas y parpadeo en las paredes y en el mostrador. Causas encontradas en el original (`Modelo3D_ArllysRamos.glb`) y arreglo en `herramientas/maqueta/limpiar-cafeteria.mjs` (el original no se toca):
1. **17 piezas duplicadas** en el mismo lugar (una con material y otra sin): parpadeaban (z-fighting). Se quita la copia sin material.
2. **Piezas sin material** (glTF las dibuja metálicas) → «aluminio». Los «aluminio» tenían **metalicidad 3** (el máximo es 1) → 0, que es como ya se veían en la AR.
3. **Muros y mostrador solo se veían bien con «doble cara»**, y la AR propia dibuja un solo lado (es más rápida): en la AR el muro de las puertas desaparecía y quedaban flotando la franja de damero, las puertas y los marcos. Ahora cada cara tiene su copia de atrás como geometría real (lo mismo que hace «doble cara») y ningún material usa «doble cara»: se ve igual en el carrusel y en la AR, sin caras superpuestas.
4. Se quitan las caras pegadas al muro o al piso (espaldas de molduras, bases de muebles y **la punta de la barra que toca el muro de las puertas**: con su copia de atrás se veía como un rectángulo rosado a través del muro, desde afuera). Se respetan los vidrios de las ventanas redondas de la puerta.
4b. Del lado de afuera, cada muro es **un solo rectángulo** 3 mm más afuera (el original tenía uniones mal calzadas por donde se asomaban bordes de la barra). Los 3 mm son menos de lo que sobresalen la puerta (17 mm) y su vidrio (4,4 mm).
5. **Optimización:** sin simplificar (tampoco la versión del carrusel), texturas WebP de más calidad (92) y la **paleta de colores sin pérdida** (en `optimizar.mjs`, para todos los modelos: la compresión con pérdida mezclaba los colores vecinos de la paleta).
6. **AR propia:** filtro anisotrópico ×4 en las texturas (el piso y las franjas vistos de costado no se ven borrosos).

Resultado: `cafeteria.glb` 407 KB y `cafeteria-hero.glb` 397 KB, 8 llamadas de dibujo. Los cuadros propios (disco, malteada y estrella) siguen igual.

### Panel de proyectos (parte 3) — `admin/js/`
- **Proyectos** (`proyectos.js`): lista en el orden del carrusel, con filtro por carrera. Cada proyecto: **Editar**, **Ver en el sitio** (vista previa), **Publicar/Ocultar**, **↑ ↓** (orden del carrusel) y **Eliminar** (con confirmación). **+ Nuevo proyecto** de cualquier tipo (maqueta, escenario o video): la dirección (`id`) se arma sola con el título y empieza **oculto**.
- **Editor por secciones:** lo básico (título, carrera, tipo, estudiante, materia, periodo con «Usar el periodo actual», ubicación, descripción), **etiqueta «PROYECTO DE EJEMPLO»** (sí/no), **créditos** (lista «qué hizo / quién»), **modelo 3D de otra persona** (autor, sitio, enlace, licencia, adaptación, cambios), **AR** (escala, descripción para lectores de pantalla y los botones de **«Ver interior»**: texto y altura en cm de cada corte, y el texto del modelo completo `ar.textoCompleta`), **video** (modos Televisor / Sin televisor / 360° y modo inicial) y **letra** por secciones.
- Lo que el formulario no toca (puntos, asistente, galería, rutas de archivos, cámara) **se conserva** al guardar.
- **No se puede publicar** un proyecto sin título, portada y modelo 3D (o video) y la descripción del modelo: el panel dice qué falta.
- **Carreras** (`carreras.js`): nombre, nombre corto, descripción, ícono, orden y si se ve. No se borra una carrera con proyectos.
- **Ajustes** (`ajustes.js`): periodo actual, interruptor de la **AR propia** y **Descargar respaldo**: un `proyectos.json` con lo publicado para actualizar el Plan B en GitHub (los pasos están en el panel).
- **Vista previa** (`js/datos.js`): `proyecto.html?id=…&vista=previa` muestra también lo oculto **solo** si ese navegador tiene la sesión del admin (usa su token; RLS lo permite). Aparece una barra amarilla con «Salir de la vista previa». Lo oculto no se guarda en la copia local.
- Prueba: `admin-proyectos.test.mjs`, con el Supabase fingido de `supabase-falso.mjs`.

### Archivos y modelos (parte 4) — `admin/js/archivos.js`, `modelo.js`, `editor-archivos.js`
En el editor de cada proyecto, sección **«Imágenes, modelo y video»**. Cada archivo se sube apenas se elige (con barra de progreso) a Supabase Storage, en `<bucket>/<id del proyecto>/<nombre>-<código>.<ext>` (el código cambia en cada subida: el navegador nunca muestra una versión vieja). El proyecto cambia al tocar **Guardar cambios**.
- **Portada:** se achica a 1200 px y se pasa a WebP en el navegador.
- **Modelo 3D (.glb):** se optimiza **en el navegador** con gltf-transform 4.2.1 y meshoptimizer 0.22.0 (las mismas versiones que `herramientas/maqueta`): centrado, base en el piso, **a escala** (el panel muestra las medidas reales y cuánto medirá sobre la mesa), piezas y materiales unidos, texturas WebP de 1024 px (paletas sin pérdida) y compresión meshopt. También crea la **versión del carrusel** (texturas de 512 px y, si pasa de 60 000 triángulos, menos triángulos) y una **foto** del modelo para el póster (y la portada, si no hay). El original **no se sube**. Con la Cafetería original (1,6 MB) tarda unos 2,5 s y queda en 610 KB + 397 KB.
- **Galería:** varias imágenes a la vez (grande de 2000 px + miniatura de 640 px), título, forma (planos o páginas 16:9), orden y una **descripción breve obligatoria** por imagen.
- **Video:** MP4/WebM de hasta 50 MB; **póster** (960 × 540, y la pantalla del televisor del carrusel, dada vuelta como la pide su textura); **subtítulos .vtt** (se revisa que empiecen con `WEBVTT`).
- **Limpieza:** al guardar se borran del almacenamiento los archivos reemplazados o quitados; al cancelar, lo que se subió en esa edición; al eliminar un proyecto, su carpeta. Los archivos que vienen con el sitio (`modelos/…`, `img/…`) nunca se borran.
- Prueba: `admin-archivos.test.mjs` (el Supabase fingido también guarda archivos).
- Límite conocido: los modelos con «doble cara» que solo se ven bien desde un lado (como la Cafetería original) pueden necesitar el arreglo de `limpiar-cafeteria.mjs`; si en la AR desaparece un muro, avísame.
