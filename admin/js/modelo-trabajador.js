// =========================================================
// admin/js/modelo-trabajador.js — el trabajo pesado del modelo 3D, en segundo plano (Web Worker)
//
// Corre aparte de la página: aunque el modelo pese 80 MB, el panel no se congela y
// «Cancelar» lo detiene al instante. Lo usa admin/js/modelo.js. Mensajes:
//   { tipo: 'cargar', bytes }            → guarda el original (una sola vez)
//   { tipo: 'medir' }                    → { medidas, triangulos, maxTextura }
//   { tipo: 'preparar', opciones }       → { bytes, medidas, triangulos, bytesTexturas, piezasQuitadas }
//   mientras trabaja manda { tipo: 'paso', texto }
// Mismos pasos que herramientas/maqueta/optimizar.mjs y las mismas versiones de las librerías.
// =========================================================
const V = '4.2.1';
const cdn = (paquete) => `https://cdn.jsdelivr.net/npm/${paquete}/+esm`;
let librerias = null;
let original = null;

function cargarLibrerias() {
  librerias ??= Promise.all([
    import(cdn(`@gltf-transform/core@${V}`)),
    import(cdn(`@gltf-transform/extensions@${V}`)),
    import(cdn(`@gltf-transform/functions@${V}`)),
    import(cdn('meshoptimizer@0.22.0'))
  ]).then(([core, ext, fn, mo]) => ({ core, ext, fn, mo }));
  return librerias;
}

const paso = (texto) => postMessage({ tipo: 'paso', texto });

self.onmessage = async ({ data }) => {
  try {
    if (data.tipo === 'cargar') { original = data.bytes; postMessage({ tipo: 'listo' }); return; }
    if (data.tipo === 'medir') { postMessage({ tipo: 'listo', ...(await medir()) }); return; }
    if (data.tipo === 'preparar') {
      const r = await preparar(data.opciones);
      postMessage({ tipo: 'listo', ...r }, [r.bytes.buffer]);
    }
  } catch (e) {
    postMessage({ tipo: 'error', mensaje: e?.message ?? String(e) });
  }
};

async function leer() {
  const { core, ext, mo } = await cargarLibrerias();
  await mo.MeshoptDecoder.ready;
  const io = new core.WebIO().registerExtensions(ext.ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': mo.MeshoptDecoder, 'meshopt.encoder': mo.MeshoptEncoder });
  return { io, doc: await io.readBinary(original) };
}

function triangulos(doc) {
  let t = 0;
  doc.getRoot().getDefaultScene().traverse(n => {
    for (const p of n.getMesh()?.listPrimitives() ?? []) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  });
  return Math.round(t);
}

async function medir() {
  paso('Leyendo el modelo…');
  const { fn } = await cargarLibrerias();
  const { doc } = await leer();
  const b = fn.getBounds(doc.getRoot().getDefaultScene());
  const maxTextura = Math.max(0, ...doc.getRoot().listTextures().map(t => Math.max(...(t.getSize() ?? [0, 0]))));
  return { medidas: [0, 1, 2].map(i => b.max[i] - b.min[i]), triangulos: triangulos(doc), maxTextura };
}

/**
 * opciones:
 *   escala          1:escala
 *   maxTextura      lado máximo de las texturas (1024 / 512 / 256)
 *   calidad         calidad WebP (0..1)
 *   simplificar     null o fracción de triángulos que se conservan (0.3 = 30 %)
 *   quitarDiminutos true = quita piezas que sobre la mesa medirían menos de 2,5 mm (a la escala elegida)
 *   errorMaximo     cuánto puede deformarse al simplificar (si no se da, se elige según «simplificar»)
 *   sinNormales     true = sin normales (caras planas): así se pueden unir muchos más vértices y simplificar
 *                   mucho más. Solo para la versión chica del carrusel (como London), donde no se nota.
 */
async function preparar({ escala = 1, maxTextura = 1024, calidad = 0.9, simplificar = null, quitarDiminutos = false, errorMaximo = null, sinNormales = false }) {
  const { ext, fn, mo } = await cargarLibrerias();
  paso('Leyendo el modelo…');
  const { io, doc } = await leer();
  const raiz = doc.getRoot();
  const escena = raiz.getDefaultScene();

  escena.traverse(n => { n.setExtension('KHR_lights_punctual', null); n.setCamera(null); });
  raiz.listExtensionsUsed().filter(e => e.extensionName === 'KHR_lights_punctual').forEach(e => e.dispose());

  // Copias exactas de una pieza en el mismo lugar (misma forma, posición y aspecto): se ven igual
  // que una sola, pero se dibujan muchas veces y pueden parpadear. Se deja una.
  await doc.transform(fn.dedup());           // une los datos idénticos: así las copias comparten los mismos datos
  const firmas = new Set();
  let repetidas = 0;
  escena.traverse(n => {
    const malla = n.getMesh();
    if (!malla) return;
    const aspecto = (m) => m ? [m.getBaseColorFactor().join(), m.getBaseColorTexture()?.getName() ?? '', raiz.listTextures().indexOf(m.getBaseColorTexture()), m.getAlphaMode(), m.getEmissiveFactor().join(), m.getDoubleSided()].join('/') : '-';
    const firma = n.getWorldMatrix().map(v => v.toFixed(4)).join() + '|' + malla.listPrimitives().map(p =>
      [raiz.listAccessors().indexOf(p.getAttribute('POSITION')), raiz.listAccessors().indexOf(p.getIndices()), aspecto(p.getMaterial())].join(':')).join(';');
    if (firmas.has(firma)) { n.setMesh(null); repetidas++; } else firmas.add(firma);
  });

  // Piezas invisibles (totalmente transparentes) y, si se pide, diminutas
  let piezasQuitadas = 0;
  const minimo = 0.0025 * Number(escala || 1);      // 2,5 mm sobre la mesa, en medidas reales del modelo
  const borrar = [];
  escena.traverse(n => {
    const malla = n.getMesh();
    if (!malla) return;
    const invisible = malla.listPrimitives().every(p => {
      const m = p.getMaterial();
      return m && m.getAlphaMode() === 'BLEND' && m.getBaseColorFactor()[3] < 0.02 && !m.getBaseColorTexture();
    });
    let diminuta = false;
    if (quitarDiminutos && !invisible) {
      const b = fn.getBounds(n);
      diminuta = Math.hypot(...b.max.map((v, i) => v - b.min[i])) < minimo;
    }
    if (invisible || diminuta) borrar.push(n);
  });
  const trianglosAntes = triangulos(doc);
  borrar.forEach(n => n.setMesh(null));
  piezasQuitadas = borrar.length;
  const triangulosQuitados = trianglosAntes - triangulos(doc);

  // Maqueta: centrada, base en el piso, a escala
  paso('Poniendo el modelo a escala…');
  const b = fn.getBounds(escena);
  const s = 1 / Number(escala || 1);
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  const maqueta = doc.createNode('maqueta').setScale([s, s, s]).setTranslation([-cx * s, -b.min[1] * s, -cz * s]);
  for (const hijo of escena.listChildren()) { escena.removeChild(hijo); maqueta.addChild(hijo); }
  escena.addChild(maqueta);
  const b2 = fn.getBounds(escena);
  const medidas = [0, 1, 2].map(i => b2.max[i] - b2.min[i]);

  if (sinNormales) for (const malla of raiz.listMeshes()) for (const p of malla.listPrimitives()) { p.setAttribute('NORMAL', null); p.setAttribute('TANGENT', null); }
  paso('Uniendo piezas repetidas…');
  await doc.transform(fn.dedup(), fn.prune(), fn.weld());
  if (simplificar && simplificar < 1) {
    paso(`Simplificando la geometría (se conserva el ${Math.round(simplificar * 100)} %)…`);
    await mo.MeshoptSimplifier.ready;
    // El margen de error crece cuando se pide simplificar mucho (si no, se queda corto)
    const error = errorMaximo ?? (simplificar < 0.15 ? 0.08 : simplificar < 0.3 ? 0.04 : simplificar < 0.6 ? 0.02 : 0.01);
    await doc.transform(fn.simplify({ simplifier: mo.MeshoptSimplifier, ratio: simplificar, error }));
  }
  paso('Uniendo materiales…');
  await doc.transform(fn.dedup(), fn.prune(), fn.flatten(), fn.palette({ min: 2 }), fn.join(), fn.dedup(), fn.prune());

  paso('Achicando las texturas…');
  let usaWebP = false, bytesTexturas = 0;
  const texturas = raiz.listTextures();
  for (const [i, t] of texturas.entries()) {
    if (texturas.length > 4) paso(`Achicando las texturas (${i + 1} de ${texturas.length})…`);
    const imagen = await texturaComprimida(t, maxTextura, calidad);
    if (imagen) {
      t.setImage(imagen.bytes).setMimeType(imagen.tipo);
      if (t.getURI()) t.setURI(t.getURI().replace(/\.\w+$/, `.${imagen.tipo.split('/')[1]}`));
      usaWebP ||= imagen.tipo === 'image/webp';
    }
    bytesTexturas += t.getImage()?.byteLength ?? 0;
  }
  if (usaWebP) doc.createExtension(ext.EXTTextureWebP).setRequired(true);

  paso('Comprimiendo…');
  await mo.MeshoptEncoder.ready;
  await doc.transform(fn.meshopt({ encoder: mo.MeshoptEncoder, level: 'medium' }));
  const bytes = await io.writeBinary(doc);
  return { bytes, medidas, triangulos: triangulos(doc), bytesTexturas, piezasQuitadas, triangulosQuitados, repetidas };
}

async function texturaComprimida(textura, maxLado, calidad) {
  const imagen = textura.getImage();
  if (!imagen) return null;
  let mapa;
  try {
    mapa = await createImageBitmap(new Blob([imagen], { type: textura.getMimeType() }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  } catch { return null; }
  const k = Math.min(1, maxLado / Math.max(mapa.width, mapa.height));
  const [w, h] = [Math.max(1, Math.round(mapa.width * k)), Math.max(1, Math.round(mapa.height * k))];
  const lienzo = new OffscreenCanvas(w, h);
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(mapa, 0, 0, w, h);
  mapa.close?.();
  const paleta = /^Palette/.test(textura.getName());
  let blob = paleta ? null : await lienzo.convertToBlob({ type: 'image/webp', quality: calidad });
  if (!blob || blob.type !== 'image/webp') blob = await lienzo.convertToBlob({ type: 'image/png' });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), tipo: blob.type };
}
