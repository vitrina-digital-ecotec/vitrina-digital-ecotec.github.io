// =========================================================
// optimizar.mjs — prepara un modelo 3D para el celular
//
// Uso directo (como con «Casa Moderna»):
//   cd herramientas/maqueta  →  npm install  →
//   node optimizar.mjs ruta/al/original.glb ../../modelos/casa-moderna.glb 25
// Para los demás proyectos, con sus recetas: node preparar.mjs (ver ese archivo).
//
// Qué hace, en orden:
//   1. Pasa el modelo (en metros reales) a MAQUETA: lo centra, deja la base en y = 0
//      y lo divide por la escala (25 → maqueta 1:25).
//   2. Quita lo que no aporta (nodos o materiales por nombre, luces, cámaras), cambia
//      las transparencias caras por recortes u opacos (Ronda 4) y, si se pide,
//      simplifica SOLO las piezas chicas (comida, adornos), nunca muros ni pisos.
//   3. Reduce las «llamadas de dibujo» (lo que más pone lento a un celular):
//      une materiales de color liso en una paleta (palette) y junta las mallas
//      que comparten material (join).
//   4. Pasa las texturas a WebP (máx. 1024 px).
//   5. Opcional: compresión meshopt (el archivo pesa mucho menos; three.js y
//      model-viewer la leen con un decodificador chiquito).
// =========================================================
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, prune, weld, weldPrimitive, flatten, join, palette, getBounds, simplifyPrimitive, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

/** Triángulos y llamadas de dibujo que se dibujan de verdad (una malla usada 3 veces cuenta 3), materiales y texturas. */
export function medir(doc) {
  const raiz = doc.getRoot();
  let triangulos = 0, llamadas = 0;
  raiz.getDefaultScene().traverse(n => {
    for (const p of n.getMesh()?.listPrimitives() ?? []) {
      llamadas++;
      triangulos += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
    }
  });
  return { triangulos: Math.round(triangulos), llamadas, materiales: raiz.listMaterials().length, texturas: raiz.listTextures().length };
}
const texto = (m) => `${m.triangulos} triángulos · ${m.llamadas} llamadas de dibujo · ${m.materiales} materiales · ${m.texturas} texturas`;

/**
 * @param {object} o
 *   entrada, salida   rutas de los .glb
 *   escala            1:escala (25 → maqueta 1:25)
 *   quitar            RegExp: nodos que se borran (techo, cielo, colisiones…)
 *   quitarMateriales  RegExp: se borran las piezas con esos materiales (por ejemplo, invisibles)
 *   recorte           RegExp: materiales transparentes que en realidad son «recortes» (cada píxel es
 *                     100 % visible o invisible: marcos, rejas, hojas). Pasan a alphaMode MASK: se
 *                     dibujan como opacos (sin mezclar colores ni ordenar), mucho más barato.
 *   opacos            RegExp: materiales transparentes que pasan a opacos
 *   simplificar       { nodos: RegExp, ratio: 0.5, error: 0.002 } → solo esas piezas
 *   simplificarTodo   { ratio, error, planas } → todo el modelo (para la versión liviana del carrusel)
 *                     planas: true = sin normales (caras planas), para poder soldar y simplificar más
 *   maxTextura        lado máximo de las texturas (1024)
 *   calidadTextura    calidad WebP de las fotos y texturas (82). Las paletas de colores siempre van SIN pérdida:
 *                     son imágenes chiquitas de colores lisos y la compresión con pérdida mezcla los colores vecinos.
 *   soloColor         true = quita mapas de normales, rugosidad, oclusión y barniz (deja color y brillo propio)
 *   meshopt           true = compresión meshopt
 *   antes(doc)        función opcional para pasos propios (por ejemplo, cambiar texturas)
 */
export async function optimizar(o) {
  const { entrada, salida, escala = 1, quitar, simplificar, simplificarTodo, maxTextura = 1024, calidadTextura = 82, antes } = o;
  const doc = await io.read(entrada);
  const raiz = doc.getRoot();
  const escena = raiz.getDefaultScene();
  const inicio = medir(doc);
  console.log(`ANTES:   ${texto(inicio)}`);

  if (antes) await antes(doc);

  // Solo color: a escala de maqueta los mapas de relieve no se notan (y la AR propia no los usa)
  if (o.soloColor) {
    for (const m of raiz.listMaterials()) {
      m.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null);
      m.setExtension('KHR_materials_clearcoat', null).setExtension('KHR_materials_specular', null);
    }
  }

  // Quitar nodos que no aportan, luces y cámaras
  if (quitar) {
    const borrar = [];
    escena.traverse(n => { if (quitar.test(n.getName())) borrar.push(n); });
    borrar.forEach(n => n.dispose());
    console.log(`Quitados ${borrar.length} nodos (${quitar})`);
  }
  if (o.quitarMateriales) {
    let n = 0;
    for (const m of raiz.listMeshes()) for (const p of m.listPrimitives()) {
      if (o.quitarMateriales.test(p.getMaterial()?.getName() ?? '')) { m.removePrimitive(p); p.dispose(); n++; }
    }
    console.log(`Quitadas ${n} piezas con materiales ${o.quitarMateriales}`);
  }
  // Transparencias: mezclar colores es lo más caro por píxel en un celular
  for (const m of raiz.listMaterials()) {
    if (m.getAlphaMode() !== 'BLEND') continue;
    if (o.recorte?.test(m.getName())) { m.setAlphaMode('MASK').setAlphaCutoff(0.5); console.log(`Recorte: ${m.getName()}`); }
    else if (o.opacos?.test(m.getName())) { m.setAlphaMode('OPAQUE'); console.log(`Opaco: ${m.getName()}`); }
  }
  escena.traverse(n => { n.setExtension('KHR_lights_punctual', null); n.setCamera(null); });
  raiz.listExtensionsUsed().filter(e => e.extensionName === 'KHR_lights_punctual').forEach(e => e.dispose());

  // 1. Maqueta: centrada, base en y = 0, dividida por la escala
  const b = getBounds(escena);
  const s = 1 / Number(escala);
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  const maqueta = doc.createNode('maqueta').setScale([s, s, s]).setTranslation([-cx * s, -b.min[1] * s, -cz * s]);
  for (const hijo of escena.listChildren()) { escena.removeChild(hijo); maqueta.addChild(hijo); }
  escena.addChild(maqueta);
  const b2 = getBounds(escena);
  const medidas = [0, 1, 2].map(i => b2.max[i] - b2.min[i]);
  console.log(`Maqueta 1:${escala}: ${medidas.map(v => v.toFixed(3)).join(' × ')} m · base y=${b2.min[1].toFixed(4)}`);
  console.log(`Centro original: x=${cx.toFixed(3)} z=${cz.toFixed(3)} · y mínima=${b.min[1].toFixed(3)}`);

  // 2. Simplificar solo piezas chicas (antes de unirlas)
  await doc.transform(dedup(), prune(), weld());
  await MeshoptSimplifier.ready;
  // Una malla usada por varios nodos se simplifica una sola vez
  const hechas = new Set();
  const simplificarUna = (p, opciones) => { if (!hechas.has(p)) { hechas.add(p); simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ...opciones }); } };
  if (simplificar) {
    let n = 0;
    escena.traverse(nodo => {
      if (!nodo.getMesh() || !simplificar.nodos.test(nodo.getName())) return;
      for (const p of nodo.getMesh().listPrimitives()) {
        // Piezas «low poly» con caras planas: cada triángulo tiene sus vértices propios y no se pueden unir.
        // Sin normales se pueden soldar y simplificar; el visor las vuelve a sombrear con caras planas.
        if (simplificar.planas && !hechas.has(p)) { p.setAttribute('NORMAL', null); weldPrimitive(p); }
        simplificarUna(p, { ratio: simplificar.ratio, error: simplificar.error ?? 0.02 });
      }
      n++;
    });
    console.log(`Simplificadas ${n} piezas chicas (${simplificar.nodos}, ratio ${simplificar.ratio})`);
  }
  if (simplificarTodo) {
    for (const m of raiz.listMeshes()) for (const p of m.listPrimitives()) {
      if (simplificarTodo.planas && !hechas.has(p)) { p.setAttribute('NORMAL', null); weldPrimitive(p); }
      simplificarUna(p, { ratio: simplificarTodo.ratio, error: simplificarTodo.error ?? 0.01 });
    }
  }

  // 3. Menos llamadas de dibujo
  await doc.transform(dedup(), prune(), flatten(), palette({ min: 2 }), join(), dedup(), prune());

  // 4. Texturas a WebP
  doc.createExtension(EXTTextureWebP).setRequired(true);
  for (const t of raiz.listTextures()) {
    const img = Buffer.from(t.getImage());
    const { width, height } = await sharp(img).metadata();
    const k = Math.min(1, maxTextura / Math.max(width, height));
    const webp = await sharp(img).resize(Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k)), { fit: 'fill', kernel: 'lanczos3' })
      .webp(/^Palette/.test(t.getName()) ? { lossless: true } : { quality: calidadTextura, effort: 5 }).toBuffer();
    t.setImage(new Uint8Array(webp)).setMimeType('image/webp');
    if (t.getURI()) t.setURI(t.getURI().replace(/\.\w+$/, '.webp'));
  }

  // 5. Compresión meshopt (opcional)
  if (o.meshopt) {
    await MeshoptEncoder.ready;
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  }

  const fin = medir(doc);
  console.log(`DESPUÉS: ${texto(fin)}`);
  await io.write(salida, doc);
  const pesos = [statSync(entrada).size, statSync(salida).size];
  console.log(`Peso: ${(pesos[0] / 1024).toFixed(0)} KB → ${(pesos[1] / 1024).toFixed(0)} KB`);
  return { inicio, fin, pesos, medidas };
}

// Uso directo por línea de comandos
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , entrada, salida, escala = '25'] = process.argv;
  await optimizar({ entrada, salida, escala: Number(escala) });
}
