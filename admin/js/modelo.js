// =========================================================
// admin/js/modelo.js — optimiza un modelo 3D (.glb) EN EL NAVEGADOR, como herramientas/maqueta/optimizar.mjs
//
// Así el docente no instala nada: elige el .glb y el panel hace lo mismo que hicimos a mano:
//   1. Maqueta: lo centra, deja la base en el piso (y = 0) y lo achica a la escala (1:25 → ÷25).
//   2. Quita luces y cámaras, une piezas repetidas y materiales de color liso (menos «llamadas de dibujo»).
//   3. Texturas a WebP (máx. 1024 px; las paletas de colores sin pérdida).
//   4. Compresión meshopt (el archivo pesa mucho menos).
//   5. Versión liviana para el carrusel: texturas de 512 px y, si es muy pesado, menos triángulos.
// El archivo original nunca se sube (así un modelo de 100 MB no choca con el límite de 15 MB).
// Librerías por CDN con versión fija (las mismas que la herramienta de Node).
// =========================================================
const V = '4.2.1';
const cdn = (paquete) => `https://cdn.jsdelivr.net/npm/${paquete}/+esm`;
let librerias = null;

function cargar() {
  librerias ??= Promise.all([
    import(cdn(`@gltf-transform/core@${V}`)),
    import(cdn(`@gltf-transform/extensions@${V}`)),
    import(cdn(`@gltf-transform/functions@${V}`)),
    import(cdn('meshoptimizer@0.22.0'))
  ]).then(([core, ext, fn, mo]) => ({ core, ext, fn, mo }));
  return librerias;
}

async function leer(bytes) {
  const { core, ext, mo } = await cargar();
  await mo.MeshoptDecoder.ready;
  const io = new core.WebIO().registerExtensions(ext.ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': mo.MeshoptDecoder, 'meshopt.encoder': mo.MeshoptEncoder });
  return { io, doc: await io.readBinary(bytes) };
}

/** Triángulos que se dibujan de verdad (una pieza usada 3 veces cuenta 3) */
function triangulos(doc) {
  let t = 0;
  doc.getRoot().getDefaultScene().traverse(n => {
    for (const p of n.getMesh()?.listPrimitives() ?? []) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  });
  return Math.round(t);
}

/** Lee el .glb y devuelve sus medidas reales (en metros) para elegir la escala */
export async function medir(archivo) {
  if (!/\.glb$/i.test(archivo.name)) throw new Error('Elige un archivo .glb (en Blender: Archivo → Exportar → glTF 2.0, formato .glb).');
  const { fn } = await cargar();
  const { doc } = await leer(new Uint8Array(await archivo.arrayBuffer()));
  const b = fn.getBounds(doc.getRoot().getDefaultScene());
  return { medidas: [0, 1, 2].map(i => b.max[i] - b.min[i]), triangulos: triangulos(doc), mb: archivo.size / 1024 / 1024 };
}

/**
 * Optimiza el modelo. Devuelve { principal, liviano } (Blobs .glb) y las medidas de la maqueta.
 *   escala: 25 → maqueta 1:25 (1 = tal cual)
 *   alPaso(texto): para mostrar en qué va
 */
export async function optimizar(archivo, { escala = 1, alPaso = () => {} } = {}) {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  alPaso('Preparando la maqueta…');
  const principal = await procesar(bytes, { escala, maxTextura: 1024, calidad: 0.9, alPaso });
  alPaso('Creando la versión liviana para el carrusel…');
  const liviano = await procesar(bytes, { escala, maxTextura: 512, calidad: 0.85, liviano: true, alPaso: () => {} });
  return { principal: principal.blob, liviano: liviano.blob, medidas: principal.medidas, triangulos: principal.triangulos };
}

async function procesar(bytes, { escala, maxTextura, calidad, liviano = false, alPaso }) {
  const { ext, fn, mo } = await cargar();
  const { io, doc } = await leer(bytes);
  const raiz = doc.getRoot();
  const escena = raiz.getDefaultScene();

  // Sin luces ni cámaras (la vitrina pone las suyas)
  escena.traverse(n => { n.setExtension('KHR_lights_punctual', null); n.setCamera(null); });
  raiz.listExtensionsUsed().filter(e => e.extensionName === 'KHR_lights_punctual').forEach(e => e.dispose());

  // 1. Maqueta: centrada, base en y = 0, dividida por la escala
  const b = fn.getBounds(escena);
  const s = 1 / Number(escala || 1);
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  const maqueta = doc.createNode('maqueta').setScale([s, s, s]).setTranslation([-cx * s, -b.min[1] * s, -cz * s]);
  for (const hijo of escena.listChildren()) { escena.removeChild(hijo); maqueta.addChild(hijo); }
  escena.addChild(maqueta);
  const b2 = fn.getBounds(escena);
  const medidas = [0, 1, 2].map(i => b2.max[i] - b2.min[i]);

  // 2. Menos piezas y materiales (lo que más pone lento a un celular)
  alPaso('Uniendo piezas y materiales…');
  await doc.transform(fn.dedup(), fn.prune(), fn.weld());
  if (liviano && triangulos(doc) > 60000) {
    // Solo si es pesado: menos triángulos en el carrusel (se ve chico, no se nota)
    await mo.MeshoptSimplifier.ready;
    const ratio = Math.max(0.2, 60000 / triangulos(doc));
    await doc.transform(fn.simplify({ simplifier: mo.MeshoptSimplifier, ratio, error: 0.01 }));
  }
  await doc.transform(fn.dedup(), fn.prune(), fn.flatten(), fn.palette({ min: 2 }), fn.join(), fn.dedup(), fn.prune());

  // 3. Texturas a WebP
  alPaso('Achicando las texturas…');
  let usaWebP = false;
  for (const t of raiz.listTextures()) {
    const imagen = await texturaComprimida(t, maxTextura, calidad);
    if (!imagen) continue;
    t.setImage(imagen.bytes).setMimeType(imagen.tipo);
    if (t.getURI()) t.setURI(t.getURI().replace(/\.\w+$/, `.${imagen.tipo.split('/')[1]}`));
    usaWebP ||= imagen.tipo === 'image/webp';
  }
  if (usaWebP) doc.createExtension(ext.EXTTextureWebP).setRequired(true);

  // 4. Compresión meshopt
  alPaso('Comprimiendo…');
  await mo.MeshoptEncoder.ready;
  await doc.transform(fn.meshopt({ encoder: mo.MeshoptEncoder, level: 'medium' }));

  const salida = await io.writeBinary(doc);
  return { blob: new Blob([salida], { type: 'model/gltf-binary' }), medidas, triangulos: triangulos(doc) };
}

/** Una textura achicada: WebP (o PNG sin pérdida si es una paleta de colores o si el navegador no sabe WebP) */
async function texturaComprimida(textura, maxLado, calidad) {
  const original = textura.getImage();
  if (!original) return null;
  let mapa;
  try {
    // Sin corrección de color: los mapas de relieve son datos, no fotos
    mapa = await createImageBitmap(new Blob([original], { type: textura.getMimeType() }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  } catch { return null; }                 // formato raro (KTX2…): se deja tal cual
  const k = Math.min(1, maxLado / Math.max(mapa.width, mapa.height));
  const [w, h] = [Math.max(1, Math.round(mapa.width * k)), Math.max(1, Math.round(mapa.height * k))];
  const lienzo = document.createElement('canvas');
  lienzo.width = w; lienzo.height = h;
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(mapa, 0, 0, w, h);
  mapa.close?.();
  const paleta = /^Palette/.test(textura.getName());
  let blob = paleta ? null : await new Promise(r => lienzo.toBlob(r, 'image/webp', calidad));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise(r => lienzo.toBlob(r, 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), tipo: blob.type };
}

/**
 * Foto del modelo para el póster (lo que se ve mientras carga) y la portada.
 * Usa un <model-viewer> escondido con la misma cámara que el adelanto 3D.
 */
export async function fotoDelModelo(blob, { camara = '25deg 62deg auto', ancho = 1200, alto = 900 } = {}) {
  if (!customElements.get('model-viewer')) {
    self.ModelViewerElement ??= { meshoptDecoderLocation: 'https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_decoder.js' };
    await import('https://cdn.jsdelivr.net/npm/@google/model-viewer@4.0.0/dist/model-viewer.min.js');
  }
  const visor = document.createElement('model-viewer');
  visor.setAttribute('camera-orbit', camara);
  visor.setAttribute('shadow-intensity', '1');
  visor.setAttribute('interaction-prompt', 'none');
  visor.setAttribute('loading', 'eager');
  // Invisible pero DENTRO de la pantalla: model-viewer no dibuja lo que está fuera de la vista
  visor.style.cssText = `position:fixed;left:0;top:0;width:${ancho / 2}px;height:${alto / 2}px;opacity:0;pointer-events:none;z-index:-1;background:#DEF1FF`;
  const url = URL.createObjectURL(blob);
  document.body.append(visor);
  try {
    await new Promise((listo, fallo) => {
      const reloj = setTimeout(() => fallo(new Error('El modelo tardó demasiado en mostrarse')), 20000);
      visor.addEventListener('load', () => { clearTimeout(reloj); listo(); }, { once: true });
      visor.addEventListener('error', () => { clearTimeout(reloj); fallo(new Error('No se pudo mostrar el modelo')); }, { once: true });
      visor.src = url;
    });
    await new Promise(r => setTimeout(r, 500));          // unos cuadros más para la sombra
    return await visor.toBlob({ mimeType: 'image/webp', qualityArgument: 0.85, idealAspect: true });
  } finally {
    visor.remove();
    URL.revokeObjectURL(url);
  }
}
