// =========================================================
// ar.js — lógica de la experiencia de realidad aumentada
//
// Qué hace, en orden:
//   1. Lee el id del proyecto de la URL y busca sus datos en el JSON.
//   2. Le pasa el modelo 3D a <model-viewer>.
//   3. Crea un botón (hotspot) por cada punto de información.
//   4. Escucha los eventos de la AR para guiar a la persona
//      («busca una superficie», «toca para colocar», etc.).
//   5. Conecta el asistente «Pregúntale a la maqueta».
//   6. Si el proyecto es un video ("tipo": "video"), carga la pantalla de cine (ar-video.js).
//   7. Si es una maqueta o un escenario ("tipo": "maqueta" / "escenario"): adelanto 3D
//      limitado + «Ver en mi espacio» con la AR propia (ar-propia.js) y, como red de
//      seguridad, la AR de model-viewer o Quick Look.
// =========================================================

import { cargarDatos, leerParametro, tipoDe, palabrasObjeto } from './datos.js';
import { responder } from './asistente.js';
import { registrar } from './metricas.js';
import { URL_PUBLICA } from './config.js';
import { diagnosticoActivo, medirARDeModelViewer } from './diagnostico.js';
import { infoNavegador, prepararAvisoNavegador } from './navegador.js';

const navegador = infoNavegador();
const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const visor = document.getElementById('visor');
const estado = document.getElementById('estado');
const tarjeta = document.getElementById('tarjeta-info');
const asistente = document.getElementById('asistente');
const botonAsistente = document.getElementById('abrir-asistente');

let proyecto = null;
let datos = null;
let enAR = false;          // true dentro de cualquier AR (la propia o la de model-viewer)
let arPropia = null;       // la AR propia (three.js + WebXR), si este celular la soporta

// ---------------------------------------------------------
// 1. Datos del proyecto
// ---------------------------------------------------------
try {
  datos = await cargarDatos();
  proyecto = datos.proyectos.find(p => p.id === leerParametro('id'));
  if (!proyecto?.ar) throw new Error('Este proyecto no tiene experiencia AR');
} catch (e) {
  document.getElementById('titulo').textContent = 'Proyecto no disponible en AR';
  visor.hidden = true;
  console.error(e);
  throw e;   // detiene el resto del script
}

const tipo = tipoDe(proyecto);
const esVideo = tipo === 'video';
const esMaqueta = !esVideo;                 // maqueta o escenario: usan la misma AR propia
const objeto = palabrasObjeto(tipo);        // «la maqueta» / «el escenario»
if (tipo === 'escenario') renombrarTextos(document.body);

/** En los escenarios, los textos fijos de la página dicen «el escenario» en vez de «la maqueta». */
function renombrarTextos(raiz) {
  const cambiar = (t) => t.replaceAll('a la maqueta', 'al escenario').replaceAll('la maqueta', 'el escenario');
  const caminante = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  while (caminante.nextNode()) caminante.currentNode.nodeValue = cambiar(caminante.currentNode.nodeValue);
  raiz.querySelectorAll('[aria-label]').forEach(n => n.setAttribute('aria-label', cambiar(n.getAttribute('aria-label'))));
}

document.title = `${proyecto.titulo} en AR · Vitrina Digital Ecotec`;
document.getElementById('titulo').textContent = proyecto.titulo;
document.getElementById('escala').textContent = esVideo
  ? `Pantalla de cine · ${proyecto.ar.escala}`
  : `${objeto.nombre} · escala ${proyecto.ar.escala}`;
document.getElementById('volver').href = `proyecto.html?id=${encodeURIComponent(proyecto.id)}`;

// ---------------------------------------------------------
// 2. Modelo 3D
//    GLB para todos. En iPhone, model-viewer convierte el GLB a USDZ
//    automáticamente; si quieres más calidad, exporta un .usdz y ponlo en "modeloIOS".
// ---------------------------------------------------------
visor.alt = proyecto.ar.alt;
if (esVideo) {
  // Solo WebXR: es la única AR que puede reproducir el video dentro de la cámara.
  // (Scene Viewer y Quick Look mostrarían una pantalla quieta, sin video ni sonido.)
  visor.setAttribute('ar-modes', 'webxr');
  visor.setAttribute('camera-orbit', '0deg 80deg auto');
}
// Vista inicial del visor 3D (opcional): "ángulo horizontal, ángulo vertical, distancia"
if (proyecto.ar.camara) visor.setAttribute('camera-orbit', proyecto.ar.camara);
if (proyecto.ar.modeloIOS) visor.setAttribute('ios-src', proyecto.ar.modeloIOS);

// Maqueta: la vista 3D es solo un ADELANTO (lo completo está en «Ver en mi espacio»):
// gira sola despacio, giro horizontal limitado a ±40°, ángulo vertical fijo, sin zoom ni desplazamiento.
if (esMaqueta) {
  document.body.classList.add('modo-maqueta');
  const [az, pol] = (proyecto.ar.camara ?? '25deg 62deg auto').split(' ').map(parseFloat);
  visor.setAttribute('min-camera-orbit', `${az - 40}deg ${pol}deg auto`);
  visor.setAttribute('max-camera-orbit', `${az + 40}deg ${pol}deg auto`);
  visor.setAttribute('disable-zoom', '');
  visor.setAttribute('disable-pan', '');
  visor.setAttribute('auto-rotate', '');
  visor.setAttribute('auto-rotate-delay', '0');
  visor.setAttribute('rotation-per-second', '10deg');
  visor.setAttribute('interaction-prompt', 'none');
  // Mientras carga se ve una captura del modelo, no una pantalla vacía
  if (proyecto.ar.poster) visor.setAttribute('poster', proyecto.ar.poster);
}
visor.src = proyecto.ar.modelo;

visor.addEventListener('progress', (e) => {
  document.getElementById('progreso').style.width = `${Math.round(e.detail.totalProgress * 100)}%`;
});

visor.addEventListener('load', () => {
  // canActivateAR = ¿este dispositivo puede abrir la AR?
  if (!visor.canActivateAR && esVideo) document.getElementById('aviso-sin-ar').hidden = false;
});

visor.addEventListener('error', () => {
  mostrarEstado('No se pudo cargar el modelo 3D. Revisa la ruta en el JSON.', 0);
});

// ---------------------------------------------------------
// 3. Puntos de información (hotspots)
//    model-viewer reconoce cualquier hijo con slot="hotspot-ALGO"
//    y lo mueve para que siga la posición 3D de data-position (en metros).
// ---------------------------------------------------------
proyecto.ar.puntos.forEach((punto, i) => {
  const boton = document.createElement('button');
  boton.className = 'punto';
  boton.type = 'button';
  boton.slot = `hotspot-${punto.id}`;
  boton.dataset.position = punto.posicion;
  boton.dataset.normal = punto.normal;
  boton.dataset.visibilityAttribute = 'visible';   // añade data-visible cuando no está tapado
  boton.dataset.id = punto.id;
  boton.setAttribute('aria-label', `Punto ${i + 1}: ${punto.titulo}`);
  boton.innerHTML = `${i + 1}<span class="punto-etiqueta" aria-hidden="true">${punto.titulo}</span>`;
  boton.addEventListener('click', () => (adelantoLimitado() ? avisarAdelanto(punto) : abrirPunto(punto.id)));
  visor.appendChild(boton);
});

/**
 * En el adelanto 3D de una maqueta, los puntos solo invitan a «Ver en mi espacio».
 * Excepción: en iPhone la AR (Quick Look) no muestra puntos, así que ahí se leen en 3D.
 */
function adelantoLimitado() { return esMaqueta && !enAR && !esIOS; }

function avisarAdelanto(punto) {
  resaltar(punto.id);
  document.getElementById('info-tipo').textContent = 'Adelanto';
  document.getElementById('info-titulo').textContent = punto.titulo;
  document.getElementById('info-texto').textContent = `Disponible en «Ver en mi espacio»: entra para recorrer ${objeto.la} y leer este punto.`;
  asistente.hidden = true;
  tarjeta.hidden = false;
}

function abrirPunto(id, textoAlternativo, tipo = 'Punto de información') {
  const punto = proyecto.ar.puntos.find(p => p.id === id);
  resaltar(id);
  document.getElementById('info-tipo').textContent = tipo;
  document.getElementById('info-titulo').textContent = punto ? punto.titulo : proyecto.titulo;
  document.getElementById('info-texto').textContent = limpiar(textoAlternativo ?? punto.texto);
  asistente.hidden = true;
  tarjeta.hidden = false;
  botonAsistente.hidden = true;
}

function resaltar(id) {
  visor.querySelectorAll('.punto').forEach(b => b.classList.toggle('activo', b.dataset.id === id));
  arPropia?.resaltar(id);
  // En modo 3D (no AR) la cámara gira hacia el punto para que se vea claro.
  const punto = proyecto.ar.puntos.find(p => p.id === id);
  if (punto && !enAR) {
    const [x, y, z] = punto.posicion.split(' ');
    visor.cameraTarget = `${x}m ${y}m ${z}m`;
  }
}

function cerrarTarjeta() {
  tarjeta.hidden = true;
  botonAsistente.hidden = !proyecto.asistente || adelantoLimitado();
  visor.querySelectorAll('.punto').forEach(b => b.classList.remove('activo'));
  arPropia?.resaltar(null);
  if (!enAR) visor.cameraTarget = 'auto auto auto';
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
document.getElementById('cerrar-info').addEventListener('click', cerrarTarjeta);

// ---------------------------------------------------------
// 4. Guía durante la AR
//    Estos eventos son los que hacen que la experiencia se "sienta" bien:
//    la persona siempre sabe qué hacer.
// ---------------------------------------------------------
visor.addEventListener('ar-status', (e) => {
  switch (e.detail.status) {
    case 'session-started':          // se abrió la cámara (WebXR en Android)
      enAR = true;
      if (proyecto.asistente) botonAsistente.hidden = false;
      visor.cameraTarget = 'auto auto auto';
      mostrarEstado('Buscando una superficie…', 0);
      break;
    case 'object-placed':            // la maqueta ya está sobre la mesa
      mostrarEstado(esVideo
        ? 'Pantalla colocada. Toca ▶ para reproducir el video. Arrastra para moverla y pellizca para cambiar su tamaño.'
        : `${objeto.nombre} colocad${objeto.a}. Camina alrededor y toca los puntos numerados. Arrastra para moverl${objeto.a} y pellizca para cambiar su tamaño.`, 6000);
      break;
    case 'not-presenting':           // salió de la AR
      enAR = false;
      ocultarEstado();
      botonAsistente.hidden = !proyecto.asistente || adelantoLimitado();
      break;
    case 'failed':
      enAR = false;
      mostrarEstado(`No se pudo abrir la AR en este celular. Puedes seguir viendo ${objeto.la} en 3D.`, 6000);
      break;
  }
});

visor.addEventListener('ar-tracking', (e) => {
  if (e.detail.status === 'not-tracking') {
    mostrarEstado('Se perdió la superficie. Apunta otra vez a la mesa con buena luz.', 0);
  } else {
    ocultarEstado();
  }
});

let temporizador;
function mostrarEstado(texto, duracion) {
  clearTimeout(temporizador);
  estado.textContent = texto;
  estado.hidden = false;
  if (duracion) temporizador = setTimeout(ocultarEstado, duracion);
}
function ocultarEstado() { estado.hidden = true; }

// En WebXR, tocar la pantalla mueve la maqueta. Esto evita que tocar un
// botón, la tarjeta o el asistente la mueva por accidente.
visor.querySelectorAll('.punto, .tarjeta-info, .asistente, .boton-asistente, .estado-ar')
  .forEach(el => el.addEventListener('beforexrselect', ev => ev.preventDefault()));

// ---------------------------------------------------------
// 5. Asistente «Pregúntale a la maqueta»
// ---------------------------------------------------------
const datosAsistente = proyecto.asistente;
if (!datosAsistente) {
  botonAsistente.hidden = true;
} else {
  const contSugeridas = document.getElementById('sugeridas');
  datosAsistente.sugeridas.forEach(texto => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    b.addEventListener('click', () => preguntar(texto));
    contSugeridas.appendChild(b);
  });

  botonAsistente.addEventListener('click', () => {
    tarjeta.hidden = true;
    asistente.hidden = false;
    botonAsistente.hidden = true;
    botonAsistente.setAttribute('aria-expanded', 'true');
    // no se enfoca el input automáticamente para que no salte el teclado en la AR
  });
  document.getElementById('cerrar-asistente').addEventListener('click', () => {
    asistente.hidden = true;
    botonAsistente.hidden = false;
    botonAsistente.setAttribute('aria-expanded', 'false');
  });
  document.getElementById('form-pregunta').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('pregunta');
    if (input.value.trim()) preguntar(input.value.trim());
    input.value = '';
    input.blur();
  });
  // En el adelanto de una maqueta el asistente aparece recién dentro de la AR
  if (adelantoLimitado()) botonAsistente.hidden = true;
}

function preguntar(pregunta) {
  const r = responder(pregunta, datosAsistente.pasajes);
  abrirPunto(r.punto, r.texto, `Respuesta · «${pregunta}»`);
  if (!r.punto) document.getElementById('info-titulo').textContent = r.encontrado ? proyecto.titulo : 'Sin información';
  hablar(r.texto);
}

function hablar(texto) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const voz = new SpeechSynthesisUtterance(limpiar(texto));
  voz.lang = 'es-ES';
  speechSynthesis.speak(voz);
}

/** Quita la marca [EJEMPLO] al mostrar o leer textos de ejemplo. */
function limpiar(texto = '') { return texto.replace('[EJEMPLO]', '').trim(); }

// Para pruebas desde la consola del navegador
window.vitrina = { proyecto, abrirPunto, preguntar };

// ---------------------------------------------------------
// 6. Proyecto con video → pantalla de cine con letra sincronizada
// ---------------------------------------------------------
if (esVideo) {
  if (diagnosticoActivo()) medirARDeModelViewer(visor);     // ?debug=1: FPS dentro de la AR
  const { iniciarCine } = await import('./ar-video.js');
  iniciarCine(visor, proyecto).catch((e) => {
    console.error(e);
    mostrarEstado('No se pudo preparar el video. Revisa tu conexión e intenta de nuevo.', 0);
  });
  // Android sin WebXR (Brave, Firefox, navegador de WhatsApp…): se invita a abrir Chrome.
  // Si la persona se queda, el video se ve igual a pantalla completa con «Ver con la letra».
  const revisarNavegador = () => {
    if (!navegador.android || visor.canActivateAR) return;
    registrar('navegador_no_compatible', { proyecto: proyecto.id, navegador: navegador.nombre });
    prepararAvisoNavegador({ textoSeguir: 'Ver el video aquí' }).mostrar();
  };
  visor.loaded ? revisarNavegador() : visor.addEventListener('load', revisarNavegador, { once: true });
}

// ---------------------------------------------------------
// 7. Maqueta: «Ver en mi espacio»
//    Android con WebXR → AR propia (three.js). Si no se puede o falla → AR de model-viewer.
//    iPhone → explicación de gestos y Quick Look. Computadora → QR para el celular.
//    Interruptor: "configuracion.arPropia" en el JSON, o ?ar=clasica en la dirección.
// ---------------------------------------------------------
if (esMaqueta) {
  const modoPrueba = leerParametro('arprueba') === '1';
  const forzarClasica = leerParametro('ar') === 'clasica' || datos.configuracion?.arPropia === false;
  if (forzarClasica && diagnosticoActivo()) medirARDeModelViewer(visor);
  // Se revisa el soporte SIN descargar three.js (solo se descarga si se va a usar)
  let soporta = false;
  if (window.isSecureContext && navigator.xr?.isSessionSupported) {
    try { soporta = await navigator.xr.isSessionSupported('immersive-ar'); } catch { soporta = false; }
  }
  // Android sin WebXR (Brave, Firefox, navegador de WhatsApp/Instagram/Facebook…):
  // al tocar «Ver en mi espacio» se prueba Scene Viewer y, si no abre, se invita a abrir Chrome.
  const sinWebXR = navegador.android && !soporta && !modoPrueba;
  const avisoNavegador = sinWebXR ? prepararAvisoNavegador() : null;
  if (sinWebXR) registrar('navegador_no_compatible', { proyecto: proyecto.id, navegador: navegador.nombre });
  if (modoPrueba || (soporta && !forzarClasica)) {
    try {
      const { crearARPropia } = await import('./ar-propia.js');
      arPropia = crearARPropia({
        proyecto, modoPrueba, registrar, objeto,
        capa: document.getElementById('capa-ar'),
        compartidos: [tarjeta, asistente, botonAsistente],
        alTocarPunto: (id) => abrirPunto(id),
        alEntrar: () => { enAR = true; cerrarTarjeta(); botonAsistente.hidden = !proyecto.asistente; },
        alSalir: () => { enAR = false; cerrarTarjeta(); }
      });
      // Precarga: el modelo y la escena quedan listos mientras la persona mira el adelanto
      const precargar = () => arPropia.precargar().catch(e => { console.warn('No se pudo precargar la AR propia', e); arPropia = null; });
      visor.loaded ? precargar() : visor.addEventListener('load', precargar, { once: true });
    } catch (e) {
      console.warn('No se pudo cargar la AR propia; se usará la de model-viewer', e);
      arPropia = null;
    }
  }

  const entrar = document.getElementById('entrar-ar');
  const mostrarEntrada = () => {
    if (arPropia || visor.canActivateAR || sinWebXR) {
      entrar.hidden = false;
    } else {
      // Computadora (o celular sin AR): adelanto + QR para abrirla en el celular
      document.getElementById('aviso-sin-ar').textContent = `Estás viendo un adelanto en 3D. Para recorrer ${objeto.la} en tu espacio, ábrel${objeto.a} en tu celular.`;
      document.getElementById('aviso-sin-ar').hidden = false;
      mostrarQR();
    }
  };
  visor.loaded ? mostrarEntrada() : visor.addEventListener('load', mostrarEntrada, { once: true });

  document.getElementById('ver-en-mi-espacio').addEventListener('click', async () => {
    if (arPropia) {
      cerrarTarjeta();
      const ok = await arPropia.iniciar();
      if (ok) return;
      registrar('ar_fallida', { proyecto: proyecto.id, modo: 'propia' });
      mostrarEstado('Abriendo la AR estándar…', 2500);
    }
    if (esIOS) { document.getElementById('ayuda-ios').hidden = false; document.getElementById('ayuda-ios-abrir').focus(); return; }
    if (sinWebXR) { probarSceneViewer(); return; }
    if (visor.canActivateAR) visor.activateAR();
    else mostrarEstado(`Este dispositivo no puede abrir la AR. Puedes seguir viendo ${objeto.la} en 3D.`, 5000);
  });

  /**
   * Respaldo en Android sin WebXR: Scene Viewer (la app de AR de Google, sin puntos ni asistente).
   * Si se abre, esta página pasa a segundo plano. Si en 3 s no pasó nada o falló → aviso «Abrir en Chrome».
   * En los navegadores internos de las apps no se intenta: ahí Scene Viewer deja una página de error.
   */
  function probarSceneViewer() {
    if (!visor.canActivateAR || navegador.interno) { avisoNavegador.mostrar(); return; }
    let listo = false;
    const alOcultarse = () => { if (document.hidden) terminar(true); };
    const alFallar = (e) => { if (e.detail.status === 'failed') terminar(false); };
    const reloj = setTimeout(() => terminar(false), 3000);
    function terminar(abrio) {
      if (listo) return;
      listo = true;
      clearTimeout(reloj);
      document.removeEventListener('visibilitychange', alOcultarse);
      visor.removeEventListener('ar-status', alFallar);
      if (abrio) registrar('ar_iniciada', { proyecto: proyecto.id, modo: 'scene-viewer' });
      else { ocultarEstado(); avisoNavegador.mostrar(); }
    }
    document.addEventListener('visibilitychange', alOcultarse);
    visor.addEventListener('ar-status', alFallar);
    visor.activateAR();
  }

  // iPhone: explicación de los gestos de Quick Look antes de abrirlo
  document.getElementById('ayuda-ios-abrir').addEventListener('click', () => {
    document.getElementById('ayuda-ios').hidden = true;
    registrar('ar_iniciada', { proyecto: proyecto.id, modo: 'quick-look' });
    visor.activateAR();
  });
  document.getElementById('ayuda-ios-cancelar').addEventListener('click', () => { document.getElementById('ayuda-ios').hidden = true; });
  document.getElementById('ayuda-ios').addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('ayuda-ios').hidden = true; });

  if (modoPrueba) window.vitrina.arPropia = arPropia;
}

/** QR (solo en computadora) con la dirección PÚBLICA de esta misma maqueta */
async function mostrarQR() {
  if (matchMedia('(max-width: 899px)').matches) return;
  await new Promise((listo, error) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
    s.onload = listo; s.onerror = error;
    document.head.append(s);
  }).catch(() => null);
  if (!window.qrcode) return;
  const qr = window.qrcode(0, 'M');
  qr.addData(`${URL_PUBLICA}ar.html?id=${encodeURIComponent(proyecto.id)}&src=qr`);
  qr.make();
  document.getElementById('ar-qr-codigo').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  document.getElementById('ar-qr').hidden = false;
}
