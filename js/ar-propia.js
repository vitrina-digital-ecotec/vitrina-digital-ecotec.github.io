// =========================================================
// ar-propia.js — «Ver en mi espacio» con three.js + WebXR (Android)
//
// Por qué una AR propia: en la AR de model-viewer los gestos son fijos
// (un dedo MUEVE la maqueta). Aquí los gestos son los que pidió el equipo:
//   - 1 dedo arrastrando  → girar la maqueta sobre su eje
//   - 2 dedos pellizcando → agrandar / achicar
//   - 2 dedos arrastrando → moverla sobre la mesa
//   - doble toque         → volver al tamaño y la posición de colocación
// Botones: ⟲ ⟳ girar 45° · − + tamaño · ⊙ centrar · Ver interior (cortes)
//          · ✕ Salir · ? tutorial.
//
// Fluidez (Ronda 3 · Bloque E), pensada para celulares de gama media:
//   - La AR se dibuja al 75 % de la resolución de la pantalla (framebufferScaleFactor).
//   - Materiales Lambert (más baratos que los PBR) con 2 luces, sin mapa de entorno.
//   - Caras de un solo lado y SIN plano de corte mientras no se usa «Ver interior»;
//     los materiales del corte se preparan una sola vez al cargar.
//   - Sombra pre-dibujada (una imagen), sin sombras en tiempo real.
//   - El hit-test (buscar la mesa) empieza con la cámara y acepta planos y puntos sueltos;
//     se apaga en cuanto se coloca la maqueta. A los 6 s sin mesa aparece «Colocar aquí».
//   - Los puntos 1-2-3 se mueven con transform cada 2 cuadros, sin leer el layout.
//   - Ningún objeto nuevo por cuadro (vectores y matrices reutilizados).
//   - Shaders y texturas se preparan ANTES de abrir la cámara.
//   - El visor 3D de la página se oculta mientras dura la AR (deja de dibujar).
// Ronda 4:
//   - Resolución DINÁMICA (js/resolucion.js): si los FPS bajan de 58 se dibuja una parte
//     más chica de la imagen y el celular la estira; si sobran, se vuelve a subir.
//   - Cámara con «near» de 1 cm: se puede acercar el celular sin que el modelo se corte.
//   - Pellizco de ×0,2 a ×8.
// Modo diagnóstico: ?debug=1 muestra FPS, llamadas, triángulos y memoria
// (js/diagnostico.js). Con ?debug=1 también se puede probar &res=0.6 (resolución fija),
// &aa=0 (sin antialias), &tm=0 (sin tone mapping), &transp=0 (todo opaco), &sombra=0 y &modelo=hero (versión liviana).
//
// Red de seguridad: si algo falla al iniciar, iniciar() devuelve false y
// ar.js abre la AR de model-viewer.
// Modo de prueba (?arprueba=1): la misma experiencia sin cámara, con el mouse,
// para revisarla en la computadora.
// =========================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { diagnosticoActivo, crearDiagnostico } from './diagnostico.js';
import { crearResolucionDinamica } from './resolucion.js';

// Cámara: «near» = lo más cerca que se dibuja. 1 cm deja acercar el celular a la maqueta sin
// que se corte (WebXR usa 10 cm si no se le dice nada). «far» = 20 m, de sobra para la mesa.
const CERCA = 0.01, LEJOS = 20;
// Tamaño con el pellizco y los botones − +, respecto del tamaño al colocar
const ZOOM_MIN = 0.2, ZOOM_MAX = 8;
// Resolución dinámica: la imagen se pide al 90 % de la pantalla y se dibuja una parte de ella
const RES_DINAMICA_BASE = 0.9;

/** ¿Este navegador puede abrir AR con WebXR? (Chrome en Android con ARCore) */
export async function soportaARPropia() {
  if (!window.isSecureContext || !navigator.xr?.isSessionSupported) return false;
  try { return await navigator.xr.isSessionSupported('immersive-ar'); } catch { return false; }
}

const $ = (sel, raiz = document) => raiz.querySelector(sel);

/** Ajustes de dibujo. Con ?debug=1 se pueden cambiar desde la dirección para probar en el celular. */
function leerAjustes() {
  const p = new URLSearchParams(location.search);
  const debug = diagnosticoActivo();
  const res = debug && p.has('res') ? THREE.MathUtils.clamp(Number(p.get('res')) || 0.75, 0.4, 1) : 0.75;
  const apagado = (clave) => debug && p.get(clave) === '0';
  return {
    res, debug,
    resFija: debug && p.has('res'),                       // &res=… desactiva la resolución dinámica
    modeloHero: debug && p.get('modelo') === 'hero',
    antialias: !apagado('aa'), toneMapping: !apagado('tm'), transparencias: !apagado('transp'), sombra: !apagado('sombra')
  };
}

/**
 * @param {object} opciones
 *   proyecto      datos del proyecto (ar.modelo, ar.puntos, ar.cortes)
 *   capa          elemento raíz del DOM overlay (#capa-ar)
 *   compartidos   elementos de la página que se usan también dentro de la AR (tarjeta, asistente)
 *   alTocarPunto  función(id) que abre la tarjeta del punto
 *   registrar     función de métricas
 *   modoPrueba    true = sin cámara (computadora)
 *   objeto        palabras para los mensajes: «la maqueta» o «el escenario» (datos.js → palabrasObjeto)
 */
export function crearARPropia({ proyecto, capa, compartidos = [], alTocarPunto, alEntrar = () => {}, alSalir = () => {}, registrar = () => {}, modoPrueba = false,
  objeto = { la: 'la maqueta', nombre: 'Maqueta', a: 'a' } }) {
  const cortes = proyecto.ar.cortes ?? [];
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ajustes = leerAjustes();

  let renderer, escena, camaraPrueba, pivote, modelo, reticula, raycaster;
  // Resolución dinámica: solo si el navegador sabe dibujar una parte de la imagen (XRView.requestViewportScale).
  // Se crea una nueva en cada sesión (ver iniciar).
  const puedeDinamica = !modoPrueba && !ajustes.resFija && typeof XRView !== 'undefined' && 'requestViewportScale' in XRView.prototype;
  let dinamica = null;
  const plano = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
  const variantes = [];              // por malla: material normal y material con corte
  let precarga = null;
  let diag = null;                   // modo diagnóstico (?debug=1)
  let sesion = null, referencia = null, fuenteHit = null;
  let hayHit = false, colocada = false;
  // Si no aparece la mesa en unos segundos, se ofrece «Colocar aquí» (frente a la cámara, sobre un plano estimado)
  const ESPERA_MESA = 6000;
  let buscandoDesde = 0, colocadaManual = false;
  const sinMesaPrueba = modoPrueba && new URLSearchParams(location.search).get('sinmesa') === '1';
  const puntoHit = new THREE.Vector3();
  const inicial = { posicion: new THREE.Vector3(), giro: 0 };
  let giroObjetivo = 0, escalaObjetivo = 1, posicionObjetivo = null;
  let radioModelo = 0.3;             // media diagonal en planta (m): para «Colocar aquí»
  let nivelInterior = 0;
  let cuadroN = 0, relojAnterior = 0;
  let anchoCapa = innerWidth, altoCapa = innerHeight;
  const botonesPunto = [];
  const lugaresOriginales = new Map();

  // Objetos reutilizados en cada cuadro (cero objetos nuevos en el bucle)
  const matrizHit = new THREE.Matrix4();
  const v = new THREE.Vector3(), mundo = new THREE.Vector3(), origen = new THREE.Vector3(), haciaPunto = new THREE.Vector3();
  const golpes = [];

  const el = {
    gestos: $('#ar-gestos', capa), puntos: $('#ar-puntos', capa), estado: $('#ar-estado', capa),
    tutorial: $('#ar-tutorial', capa), interior: $('#ar-interior', capa), compartidos: $('#ar-compartidos', capa),
    colocarAqui: $('#ar-colocar-aqui', capa)
  };
  el.interior.hidden = cortes.length === 0;   // «Ver interior» solo si el modelo tiene cortes
  marcarInterior();                           // texto inicial (el admin puede cambiar «Completa» en el panel)

  // ---------------------------------------------------------
  // Precarga: se baja el modelo, se arma la escena y se preparan shaders y texturas
  // mientras la persona mira el adelanto 3D.
  // ---------------------------------------------------------
  function precargar() {
    precarga ??= (async () => {
      // &modelo=hero (diagnóstico): carga la versión liviana del carrusel, para medir cuánto pesan los triángulos
      const url = ajustes.modeloHero && proyecto.ar.modeloHero ? proyecto.ar.modeloHero : proyecto.ar.modelo;
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);   // modelos comprimidos con meshopt
      escena = new THREE.Scene();
      renderer = new THREE.WebGLRenderer({ antialias: ajustes.antialias, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.setSize(innerWidth, innerHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = ajustes.toneMapping ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
      renderer.toneMappingExposure = 1.3;           // compensa el brillo que antes daban los reflejos del entorno
      renderer.localClippingEnabled = true;          // para «Ver interior»
      renderer.xr.enabled = true;
      // La resolución de la AR (fija o dinámica) se decide al abrir la sesión: ver iniciar()
      // Foveación (menos detalle en los bordes de la imagen): three.js ya la pide al máximo,
      // pero solo la aplican los visores (Quest); en los celulares no tiene efecto.
      renderer.xr.setFoveation(1);
      // Luz: solo 2 luces y sin mapa de entorno (con materiales Lambert se ve casi igual y cuesta mucho menos)
      escena.add(new THREE.HemisphereLight(0xffffff, 0xd6d0c6, 3.2));
      const sol = new THREE.DirectionalLight(0xffffff, 1.4);
      sol.position.set(1, 2, 1.5);
      escena.add(sol);

      // Maqueta dentro de un «pivote» que se mueve, gira y escala
      pivote = new THREE.Group();
      modelo = gltf.scene;
      modelo.traverse(o => {
        if (!o.isMesh) return;
        const normal = materialBarato(o.material);
        const corte = normal.clone();
        // Con el techo cortado se ven las caras de adentro de los muros. Si los muros son planos simples
        // (una sola cara, como en la Cafetería), "cortesDobleCara": false evita que aparezca su lado de afuera.
        corte.side = proyecto.ar.cortesDobleCara === false ? THREE.FrontSide : THREE.DoubleSide;
        corte.clippingPlanes = [plano];
        variantes.push({ malla: o, normal, corte });
        o.material = normal;
      });
      pivote.add(modelo);
      const caja = new THREE.Box3().setFromObject(modelo);
      const tam = caja.getSize(new THREE.Vector3());
      radioModelo = Math.hypot(tam.x, tam.z) / 2;
      if (ajustes.sombra) pivote.add(sombraFalsa(tam.x * 1.25, tam.z * 1.7));
      escena.add(pivote);

      // Retícula: anillo + la sombra de la casa donde va a aparecer
      reticula = new THREE.Group();
      const anillo = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.065, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const centro = new THREE.Mesh(new THREE.CircleGeometry(0.012, 20).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x01b3e6 }));
      reticula.add(sombraFalsa(tam.x * 1.25, tam.z * 1.7, 0.6), anillo, centro);
      escena.add(reticula);

      raycaster = new THREE.Raycaster();
      crearBotonesPunto();

      // Preparar AHORA (y no al abrir la cámara) los shaders de las dos variantes y subir las texturas a la GPU.
      // compile() solo recorre lo visible, por eso se muestra todo un momento (nada se dibuja aquí).
      // En WebXR three.js copia el near/far de esta cámara a la sesión (depthNear/depthFar)
      camaraPrueba = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, CERCA, LEJOS);
      pivote.visible = reticula.visible = true;
      usarCorte(true);
      await renderer.compileAsync(escena, camaraPrueba);
      usarCorte(false);
      await renderer.compileAsync(escena, camaraPrueba);
      escena.traverse(o => { if (o.material?.map) renderer.initTexture(o.material.map); });
      variantes.forEach(({ normal }) => normal.emissiveMap && renderer.initTexture(normal.emissiveMap));
      pivote.visible = reticula.visible = false;

      if (ajustes.debug) {
        const apagados = ['toneMapping', 'transparencias', 'sombra'].filter(k => !ajustes[k]);
        diag = crearDiagnostico(capa, renderer, `Ronda 4 · AA ${ajustes.antialias ? 'sí' : 'no'}${apagados.length ? ' · sin ' + apagados.join(', ') : ''}`,
          () => dinamica
            ? `Res. dinámica ${Math.round(dinamica.escala * RES_DINAMICA_BASE * 100)} %${dinamica.fija ? ' (fija: el límite no es la GPU)' : ''}`
            : `Res. fija ${Math.round(ajustes.res * 100)} %${ajustes.resFija || modoPrueba ? '' : ' (este celular no permite la dinámica)'}`);
      }
      return true;
    })();
    return precarga;
  }

  /** Material Lambert con lo mismo que se ve del original (color, textura, brillo propio, transparencia). */
  function materialBarato(m) {
    const b = new THREE.MeshLambertMaterial({
      name: m.name, color: m.color, map: m.map, emissive: m.emissive, emissiveMap: m.emissiveMap,
      emissiveIntensity: m.emissiveIntensity,
      transparent: m.transparent && ajustes.transparencias, opacity: ajustes.transparencias ? m.opacity : 1,
      alphaTest: m.alphaTest, depthWrite: m.depthWrite, vertexColors: m.vertexColors, side: THREE.FrontSide,
      flatShading: m.flatShading                    // piezas «low poly» guardadas sin normales
    });
    // Filtro anisotrópico: las texturas vistas de costado (el piso de damero, las franjas) no se ven borrosas ni con rayas
    if (b.map) b.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    m.dispose();
    return b;
  }

  /** «Ver interior»: cambia de material una sola vez (al tocar el botón), nunca dentro del bucle. */
  function usarCorte(si) {
    variantes.forEach(({ malla, normal, corte }) => { malla.material = si ? corte : normal; });
  }

  /** Sombra de contacto falsa: un degradado radial en una imagen (cuesta casi nada). */
  function sombraFalsa(ancho, fondo, opacidad = 0.55) {
    const lienzo = document.createElement('canvas');
    lienzo.width = lienzo.height = 128;
    const ctx = lienzo.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ancho, fondo).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(lienzo), transparent: true, opacity: opacidad, depthWrite: false }));
    m.position.y = 0.002;
    m.renderOrder = -1;
    return m;
  }

  // ---------------------------------------------------------
  // Puntos 1-2-3 (botones HTML que siguen a la maqueta)
  // ---------------------------------------------------------
  function crearBotonesPunto() {
    el.puntos.innerHTML = '';
    proyecto.ar.puntos.forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'punto';
      b.dataset.id = p.id;
      b.setAttribute('aria-label', `Punto ${i + 1}: ${p.titulo}`);
      b.innerHTML = `${i + 1}<span class="punto-etiqueta" aria-hidden="true">${p.titulo}</span>`;
      b.addEventListener('click', () => { registrar('punto_tocado', { proyecto: proyecto.id, punto: p.id }); alTocarPunto(p.id); });
      el.puntos.append(b);
      botonesPunto.push({ id: p.id, boton: b, local: new THREE.Vector3(...p.posicion.split(' ').map(Number)), x: -1, y: -1, oculto: false });
    });
  }

  function resaltar(id) {
    botonesPunto.forEach(({ boton, id: clave }) => boton.classList.toggle('activo', clave === id));
  }

  // ---------------------------------------------------------
  // Iniciar / salir
  // ---------------------------------------------------------
  async function iniciar() {
    const tocado = performance.now();
    try {
      await precargar();
      diag?.empezar(tocado);
      if (modoPrueba) {
        document.body.append(renderer.domElement);
        renderer.domElement.className = 'ar-prueba-lienzo';
        renderer.xr.enabled = false;
        hayHit = !sinMesaPrueba;                 // &sinmesa=1 simula que no se encuentra la mesa
        puntoHit.set(0, 0, 0);
        camaraPrueba.position.set(0, 0.6, 1.15);
        camaraPrueba.lookAt(0, 0.08, 0);
      } else {
        // La capa HTML debe estar visible ANTES de pedir la sesión: es la que WebXR dibuja sobre la cámara
        capa.hidden = false;
        sesion = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['hit-test', 'dom-overlay'],
          domOverlay: { root: capa }
        });
        sesion.addEventListener('end', alTerminar);
        // Resolución: con la dinámica la imagen se pide al 90 % y se dibuja una parte (al empezar
        // 0,83 × 0,9 ≈ 75 %, como antes). Sin ella (o con &res=…) queda fija en el 75 %.
        // La dinámica solo funciona con la capa clásica (XRWebGLLayer), que es la que usa three.js
        // cuando el navegador no ofrece la «Layers API» de WebXR (así es en los celulares Android).
        dinamica = puedeDinamica && sesion.renderState.layers === undefined ? crearResolucionDinamica({ inicial: 0.83 }) : null;
        renderer.xr.setFramebufferScaleFactor(dinamica ? RES_DINAMICA_BASE : ajustes.res);
        renderer.xr.setReferenceSpaceType('local');
        await renderer.xr.setSession(sesion);
        referencia = renderer.xr.getReferenceSpace();
        if (dinamica) {
          // three.js pide el rectángulo de dibujo de cada vista con getViewport(); justo antes se le
          // indica a la vista qué parte usar. Así no hay que modificar three.js.
          const capaXR = renderer.xr.getBaseLayer();
          const original = capaXR.getViewport.bind(capaXR);
          capaXR.getViewport = (vista) => { vista.requestViewportScale?.(dinamica.escala); return original(vista); };
        }
        const espacioVista = await sesion.requestReferenceSpace('viewer');
        fuenteHit = await pedirHitTest(espacioVista);
      }
    } catch (e) {
      console.warn('AR propia no disponible, se usará la de model-viewer:', e);
      try { await sesion?.end(); } catch { /* ya terminada */ }
      sesion = null;
      capa.hidden = true;
      return false;
    }
    entrar();
    registrar('ar_iniciada', { proyecto: proyecto.id, modo: modoPrueba ? 'propia-prueba' : 'propia' });
    return true;
  }

  /**
   * Hit-test = «¿qué superficie hay en el centro de la pantalla?». Empieza apenas se abre la cámara,
   * aunque el tutorial esté visible. Además de planos completos acepta PUNTOS sueltos de ARCore:
   * aparecen mucho antes que un plano, sobre todo en mesas lisas o con poca luz.
   */
  async function pedirHitTest(espacio) {
    try { return await sesion.requestHitTestSource({ space: espacio, entityTypes: ['plane', 'point'] }); }
    catch { return sesion.requestHitTestSource({ space: espacio }); }
  }

  function entrar() {
    // Los elementos compartidos (tarjeta, asistente) pasan a la capa de la AR
    compartidos.forEach(n => { lugaresOriginales.set(n, [n.parentNode, n.nextSibling]); el.compartidos.append(n); });
    capa.hidden = false;
    document.body.classList.add('ar-propia-activa');     // oculta el visor de la página: deja de dibujar
    colocada = false; colocadaManual = false; pivote.visible = false; nivelInterior = 0;
    el.colocarAqui.hidden = true;
    buscandoDesde = performance.now();
    usarCorte(false);
    el.puntos.hidden = true;
    escalaObjetivo = 1; pivote.scale.setScalar(1);
    marcarInterior();
    medirCapa();
    mostrarEstado('Buscando superficie… Mueve el celular despacio apuntando a la mesa.');
    mostrarTutorial(0);
    relojAnterior = performance.now();
    renderer.setAnimationLoop(cuadro);
    alEntrar();
  }

  async function salir() {
    if (sesion) { try { await sesion.end(); } catch { alTerminar(); } }
    else alTerminar();
  }

  function alTerminar() {
    renderer?.setAnimationLoop(null);
    apagarHitTest();
    sesion = null;
    if (modoPrueba) renderer?.domElement.remove();
    capa.hidden = true;
    document.body.classList.remove('ar-propia-activa');
    cerrarTutorial(false);
    lugaresOriginales.forEach(([padre, siguiente], n) => padre.insertBefore(n, siguiente));
    lugaresOriginales.clear();
    alSalir();
  }

  function apagarHitTest() {
    fuenteHit?.cancel?.();
    fuenteHit = null;
  }

  // El tamaño de la capa se lee solo al entrar y al girar la pantalla (nunca dentro del bucle)
  function medirCapa() { anchoCapa = capa.clientWidth || innerWidth; altoCapa = capa.clientHeight || innerHeight; }
  addEventListener('resize', () => { if (!capa.hidden) medirCapa(); });

  // ---------------------------------------------------------
  // Cada cuadro
  // ---------------------------------------------------------
  function camaraActual() {
    if (modoPrueba) return camaraPrueba;
    const c = renderer.xr.getCamera();
    return c.cameras?.[0] ?? c;
  }

  function cuadro(tiempo, frame) {
    const ahora = performance.now();
    if (frame) dinamica?.cuadro(ahora);
    const dt = Math.min((ahora - relojAnterior) / 1000, 0.1);
    relojAnterior = ahora;

    if (frame) diag?.hito('camara');
    // El hit-test busca la mesa hasta colocar (o, si se usó «Colocar aquí», hasta encontrarla)
    if ((!colocada || colocadaManual) && frame && fuenteHit) {
      const resultados = frame.getHitTestResults(fuenteHit);
      hayHit = resultados.length > 0;
      if (hayHit) puntoHit.setFromMatrixPosition(matrizHit.fromArray(resultados[0].getPose(referencia).transform.matrix));
      if (hayHit && colocadaManual && el.estado.dataset.fase !== 'mesa-hallada') {
        mostrarEstado(`Se encontró la mesa: toca ⊙ Centrar para apoyar ${objeto.la} en ella.`, 0, 'mesa-hallada');
      }
    }
    // Antes de colocar: la retícula sigue a la superficie detectada
    if (!colocada) {
      if (hayHit) diag?.hito('superficie');
      reticula.visible = hayHit;
      const buscando = (el.estado.dataset.fase ?? '').startsWith('buscando');
      if (hayHit) {
        if (buscando) mostrarEstado(`Toca para colocar ${objeto.la}.`, 0, 'colocar');
      } else if (!buscando) {
        mostrarEstado('Buscando superficie… Mueve el celular despacio apuntando a la mesa.');
      }
      // A los 6 s sin mesa: consejo + botón «Colocar aquí» (el DOM solo se toca cuando cambia)
      const ofrecer = !hayHit && ahora - buscandoDesde > ESPERA_MESA;
      if (ofrecer === el.colocarAqui.hidden) {
        el.colocarAqui.hidden = !ofrecer;
        if (ofrecer) mostrarEstado('No encuentro la mesa todavía. Apunta a una superficie con textura y buena luz, o toca «Colocar aquí».', 0, 'buscando-lento');
      }
    }

    // Animaciones suaves de giro, tamaño y posición
    const k = sinMovimiento ? 1 : Math.min(1, dt * 10);
    pivote.rotation.y += (giroObjetivo - pivote.rotation.y) * k;
    pivote.scale.setScalar(pivote.scale.x + (escalaObjetivo - pivote.scale.x) * k);
    if (posicionObjetivo) {
      pivote.position.lerp(posicionObjetivo, k);
      if (pivote.position.distanceToSquared(posicionObjetivo) < 2.5e-7) posicionObjetivo = null;
    }

    // «Ver interior»: el plano de corte sigue a la maqueta (solo cambia un número)
    if (nivelInterior > 0) plano.constant = pivote.position.y + cortes[nivelInterior - 1].altura * pivote.scale.y;

    // En WebXR three.js usa la cámara del celular; la cámara que se pasa aquí solo cuenta en el modo de prueba
    renderer.render(escena, camaraPrueba);
    if (colocada && cuadroN % 2 === 0) moverBotonesPunto();
    cuadroN++;
    diag?.cuadro(performance.now() - ahora);
  }

  let puntoRevisado = 0;
  function moverBotonesPunto() {
    const camara = camaraActual();
    modelo.updateMatrixWorld();
    // Cada 8 cuadros se revisa UN punto (por turnos) para saber si una pared lo tapa
    const revisar = cuadroN % 8 === 0 ? botonesPunto[puntoRevisado++ % botonesPunto.length] : null;
    for (const p of botonesPunto) {
      mundo.copy(p.local).applyMatrix4(modelo.matrixWorld);
      v.copy(mundo).project(camara);
      const oculto = v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2 ||
        (nivelInterior > 0 && mundo.y > plano.constant + 0.0001);
      if (oculto !== p.oculto) { p.boton.hidden = p.oculto = oculto; }
      if (oculto) continue;
      const x = ((v.x + 1) / 2) * anchoCapa, y = ((1 - v.y) / 2) * altoCapa;
      // Solo se toca el estilo si el punto se movió más de medio píxel
      if (Math.abs(x - p.x) > 0.5 || Math.abs(y - p.y) > 0.5) {
        p.x = x; p.y = y;
        p.boton.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      }
      if (p === revisar) {
        // ¿Hay una pared entre la cámara y el punto? → se ve más tenue
        origen.setFromMatrixPosition(camara.matrixWorld);
        haciaPunto.subVectors(mundo, origen);
        const distancia = haciaPunto.length();
        raycaster.set(origen, haciaPunto.normalize());
        raycaster.far = distancia;
        golpes.length = 0;
        raycaster.intersectObject(modelo, true, golpes);
        const golpe = golpes.find(g => nivelInterior === 0 || g.point.y <= plano.constant);
        p.boton.toggleAttribute('data-visible', !golpe || golpe.distance > distancia - 0.004 * pivote.scale.x);
      }
    }
  }

  // ---------------------------------------------------------
  // Colocar y restablecer
  // ---------------------------------------------------------
  /** «Colocar aquí»: sin mesa detectada, la maqueta va frente a la cámara (60 cm, o más si es grande:
   *  su borde queda a unos 30 cm), sobre un plano estimado. */
  function colocarFrente() {
    const camara = camaraActual();
    origen.setFromMatrixPosition(camara.matrixWorld);
    haciaPunto.setFromMatrixColumn(camara.matrixWorld, 2).negate();   // hacia dónde mira la cámara
    haciaPunto.y = 0;
    if (haciaPunto.lengthSq() < 1e-6) haciaPunto.set(0, 0, -1);
    haciaPunto.normalize();
    puntoHit.copy(origen).addScaledVector(haciaPunto, Math.max(0.6, radioModelo + 0.3));
    puntoHit.y = origen.y - 0.45;          // plano estimado: una mesa unos 45 cm por debajo del celular
    colocar(true);
  }

  function colocar(manual = false) {
    const camara = camaraActual();
    origen.setFromMatrixPosition(camara.matrixWorld);
    pivote.position.copy(puntoHit);
    // La fachada (lado +Z de la maqueta) queda mirando a la persona
    giroObjetivo = Math.atan2(origen.x - puntoHit.x, origen.z - puntoHit.z);
    pivote.rotation.y = giroObjetivo;
    escalaObjetivo = 1;
    pivote.scale.setScalar(1);
    pivote.visible = true;
    reticula.visible = false;
    colocada = true;
    colocadaManual = manual;
    el.colocarAqui.hidden = true;
    // Ya no hace falta buscar la mesa en cada cuadro (con «Colocar aquí» se sigue buscando para poder apoyarla)
    if (!manual) apagarHitTest();
    hayHit = false;
    el.puntos.hidden = false;
    botonesPunto.forEach(p => { p.x = p.y = -1; });
    inicial.posicion.copy(pivote.position);
    inicial.giro = giroObjetivo;
    diag?.hito('colocada');
    if (manual) diag?.hito('manual');
    mostrarEstado(manual
      ? `${objeto.nombre} colocad${objeto.a} frente a ti. Muével${objeto.a} con dos dedos; si aparece la mesa, toca ⊙ Centrar para apoyarl${objeto.a}.`
      : `${objeto.nombre} colocad${objeto.a}. Gira con un dedo, pellizca para el tamaño y acércate para ver los detalles.`, 5000);
    registrar('ar_colocada', { proyecto: proyecto.id, modo: manual ? 'colocar-aqui' : 'mesa' });
    if (el.tutorial.dataset.paso !== undefined && !el.tutorial.hidden && Number(el.tutorial.dataset.paso) < 2) mostrarTutorial(2);
  }

  function restablecer() {
    if (!colocada) return;
    posicionObjetivo = inicial.posicion.clone();
    giroObjetivo = inicial.giro;
    escalaObjetivo = 1;
    mostrarEstado('Tamaño y posición iniciales.', 1800);
  }

  // ---------------------------------------------------------
  // Gestos (capa invisible sobre la cámara)
  // ---------------------------------------------------------
  const punteros = new Map();
  let inicioGesto = null, ultimoToque = 0;
  const ndc = new THREE.Vector2();
  const mesa = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  /** Punto de la mesa (plano horizontal de la maqueta) bajo una posición de la pantalla */
  function puntoEnLaMesa(x, y, destino = new THREE.Vector3()) {
    ndc.set((x / anchoCapa) * 2 - 1, -(y / altoCapa) * 2 + 1);
    raycaster.setFromCamera(ndc, camaraActual());
    raycaster.far = Infinity;
    mesa.constant = -pivote.position.y;
    return raycaster.ray.intersectPlane(mesa, destino);
  }

  el.gestos.addEventListener('pointerdown', (e) => {
    el.gestos.setPointerCapture(e.pointerId);
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.size === 1) {
      inicioGesto = { t: performance.now(), x: e.clientX, y: e.clientY, movido: false };
    } else if (punteros.size === 2 && colocada) {
      const [a, b] = [...punteros.values()];
      inicioGesto = {
        ...inicioGesto, movido: true, dos: true,
        distancia: Math.hypot(a.x - b.x, a.y - b.y), escala: escalaObjetivo,
        mesa: puntoEnLaMesa((a.x + b.x) / 2, (a.y + b.y) / 2), posicion: pivote.position.clone(),
        ahora: new THREE.Vector3()
      };
      posicionObjetivo = null;
    }
  });

  el.gestos.addEventListener('pointermove', (e) => {
    const previo = punteros.get(e.pointerId);
    if (!previo) return;
    const dx = e.clientX - previo.x;
    previo.x = e.clientX; previo.y = e.clientY;
    if (!colocada || !inicioGesto) return;
    if (punteros.size === 1 && !inicioGesto.dos) {
      if (Math.abs(e.clientX - inicioGesto.x) > 8) inicioGesto.movido = true;
      giroObjetivo += (dx / anchoCapa) * Math.PI * 1.3;
      pivote.rotation.y = giroObjetivo;
    } else if (punteros.size === 2 && inicioGesto.dos) {
      const [a, b] = [...punteros.values()];
      escalaObjetivo = THREE.MathUtils.clamp(inicioGesto.escala * Math.hypot(a.x - b.x, a.y - b.y) / inicioGesto.distancia, ZOOM_MIN, ZOOM_MAX);
      pivote.scale.setScalar(escalaObjetivo);
      const ahora = puntoEnLaMesa((a.x + b.x) / 2, (a.y + b.y) / 2, inicioGesto.ahora);
      if (ahora && inicioGesto.mesa) {
        pivote.position.x = inicioGesto.posicion.x + (ahora.x - inicioGesto.mesa.x);
        pivote.position.z = inicioGesto.posicion.z + (ahora.z - inicioGesto.mesa.z);
      }
    }
  });

  function finGesto(e) {
    punteros.delete(e.pointerId);
    if (punteros.size > 0 || !inicioGesto) return;
    const fueToque = !inicioGesto.movido && !inicioGesto.dos && performance.now() - inicioGesto.t < 350;
    inicioGesto = null;
    if (!fueToque) return;
    if (!colocada) { if (hayHit) colocar(); return; }
    const ahora = performance.now();
    if (ahora - ultimoToque < 320) { restablecer(); ultimoToque = 0; } else ultimoToque = ahora;
  }
  el.gestos.addEventListener('pointerup', finGesto);
  el.gestos.addEventListener('pointercancel', finGesto);
  // Tocar la capa de la AR nunca debe disparar el «select» de WebXR: los toques los manejamos nosotros
  capa.addEventListener('beforexrselect', (e) => e.preventDefault());

  // ---------------------------------------------------------
  // Botones
  // ---------------------------------------------------------
  capa.addEventListener('click', (e) => {
    const accion = e.target.closest('[data-ar]')?.dataset.ar;
    if (!accion) return;
    if (accion === 'salir') salir();
    if (accion === 'ayuda') mostrarTutorial(0);
    if (accion === 'ocultar-tutorial') cerrarTutorial(true);
    if (accion === 'colocar-aqui') { if (!colocada) colocarFrente(); return; }
    if (!colocada &&['izquierda', 'derecha', 'menos', 'mas', 'centrar', 'interior'].includes(accion)) {
      mostrarEstado(`Primero coloca ${objeto.la}: toca la pantalla cuando veas el anillo.`, 2500);
      return;
    }
    if (accion === 'izquierda') giroObjetivo += Math.PI / 4;
    if (accion === 'derecha') giroObjetivo -= Math.PI / 4;
    if (accion === 'mas') escalaObjetivo = Math.min(ZOOM_MAX, escalaObjetivo * 1.25);
    if (accion === 'menos') escalaObjetivo = Math.max(ZOOM_MIN, escalaObjetivo / 1.25);
    if (accion === 'centrar' && colocadaManual && hayHit) {
      // Se colocó con «Colocar aquí» y ahora sí se encontró la mesa: se apoya en ella
      posicionObjetivo = puntoHit.clone();
      inicial.posicion.copy(puntoHit);
      colocadaManual = false;
      apagarHitTest();
      mostrarEstado(`${objeto.nombre} apoyad${objeto.a} en la mesa.`, 2200);
    } else if (accion === 'centrar') {
      // El centro de la pantalla sobre el plano de la mesa (sin volver a encender el hit-test)
      const centro = puntoEnLaMesa(anchoCapa / 2, altoCapa / 2);
      if (centro && centro.distanceTo(pivote.position) < 5) posicionObjetivo = centro;
      else mostrarEstado(`Apunta a la mesa para centrar ${objeto.la}.`, 2200);
    }
    if (accion === 'interior') {
      nivelInterior = (nivelInterior + 1) % (cortes.length + 1);
      if (nivelInterior === 0) plano.constant = 1e6;
      usarCorte(nivelInterior > 0);
      marcarInterior();
    }
  });

  function marcarInterior() {
    const nombres = [proyecto.ar.textoCompleta || 'Completa', ...cortes.map(c => c.nombre)];
    el.interior.querySelector('.ar-boton-texto').textContent = nombres[nivelInterior];
    el.interior.setAttribute('aria-label', `Ver interior: ${nombres[nivelInterior]}`);
    el.interior.setAttribute('aria-pressed', String(nivelInterior > 0));
  }

  // ---------------------------------------------------------
  // Mensaje de estado
  // ---------------------------------------------------------
  let temporizadorEstado = 0;
  function mostrarEstado(texto, duracion = 0, fase) {
    clearTimeout(temporizadorEstado);
    el.estado.textContent = texto;
    el.estado.hidden = false;
    el.estado.dataset.fase = fase ?? (texto.startsWith('Buscando') ? 'buscando' : 'otro');
    if (duracion) temporizadorEstado = setTimeout(() => { el.estado.hidden = true; }, duracion);
  }

  // ---------------------------------------------------------
  // Tutorial de 3 pasos (aparece SIEMPRE al entrar)
  // ---------------------------------------------------------
  let temporizadorTutorial = 0;
  const pasos = [...el.tutorial.querySelectorAll('.ar-tutorial-paso')];
  function mostrarTutorial(paso) {
    clearTimeout(temporizadorTutorial);
    el.tutorial.hidden = false;
    el.tutorial.dataset.paso = paso;
    pasos.forEach((p, i) => { p.hidden = i !== paso; });
    el.tutorial.querySelectorAll('.ar-tutorial-puntos span').forEach((s, i) => s.classList.toggle('activo', i === paso));
    // Avanza solo cada 3 s; después del último paso se cierra solo
    temporizadorTutorial = setTimeout(() => (paso < pasos.length - 1 ? mostrarTutorial(paso + 1) : cerrarTutorial(false)), 3000);
  }
  function cerrarTutorial(porLaPersona) {
    clearTimeout(temporizadorTutorial);
    if (porLaPersona && !el.tutorial.hidden) registrar('tutorial_ocultado', { proyecto: proyecto.id, paso: Number(el.tutorial.dataset.paso) + 1 });
    el.tutorial.hidden = true;
  }
  el.tutorial.querySelector('.ar-tutorial-tarjeta').addEventListener('click', () => {
    const paso = Number(el.tutorial.dataset.paso);
    paso < pasos.length - 1 ? mostrarTutorial(paso + 1) : cerrarTutorial(false);
  });

  /**
   * Solo para medir en la computadora (pruebas/rendimiento.mjs, modo de prueba): dibuja `cuadros`
   * cuadros con el modelo girando, al tamaño `escala` y a la resolución `res`, y espera a que la GPU termine cada uno
   * (leer un píxel obliga a esperar; gl.finish() en Chrome no espera de verdad).
   * La resolución imita la de la AR en el celular (pantalla × res). Devuelve ms por cuadro.
   */
  function medirCuadros(cuadros = 60, escala = 1, res = ajustes.res) {
    if (!modoPrueba || !colocada) return null;
    const gl = renderer.getContext(), proporcion = renderer.getPixelRatio(), giro = pivote.rotation.y;
    const pixel = new Uint8Array(4), esperar = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    renderer.setPixelRatio(devicePixelRatio * res);
    pivote.scale.setScalar(escala);
    renderer.render(escena, camaraPrueba); esperar();            // primer cuadro fuera de la cuenta
    const t0 = performance.now();
    for (let i = 0; i < cuadros; i++) {
      pivote.rotation.y = giro + (i / cuadros) * Math.PI * 2;
      renderer.render(escena, camaraPrueba);
      esperar();
    }
    const ms = (performance.now() - t0) / cuadros;
    const resultado = { ms, ancho: renderer.domElement.width, alto: renderer.domElement.height,
      llamadas: renderer.info.render.calls, triangulos: renderer.info.render.triangles };
    pivote.rotation.y = giro; pivote.scale.setScalar(escalaObjetivo);
    renderer.setPixelRatio(proporcion);
    return resultado;
  }

  return {
    precargar, iniciar, salir, resaltar, medirCuadros,
    get activa() { return !capa.hidden; },
    // Solo lectura, para las pruebas automáticas
    estado: () => ({ colocada, nivelInterior, giro: giroObjetivo, escala: escalaObjetivo, visible: !!pivote?.visible, hitTest: !!fuenteHit,
      cerca: camaraPrueba?.near, zoom: [ZOOM_MIN, ZOOM_MAX] })
  };
}
