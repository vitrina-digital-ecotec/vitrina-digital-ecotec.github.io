// =========================================================
// limpiar-cafeteria.mjs — arregla la geometría de la Cafetería antes de optimizarla
//
// Problemas del original (se ven como rayas, manchas blancas y parpadeo):
//   1. Piezas DUPLICADAS en el mismo lugar (una con material y otra sin material):
//      la tarjeta gráfica no sabe cuál dibujar delante → parpadean (z-fighting).
//   2. 17 piezas SIN material: glTF las dibuja metálicas (oscuras o con brillos raros).
//   3. Los materiales «aluminio» tienen metalicidad 3 (el máximo válido es 1): brillos y manchas.
//      Se dejan en 0 (blanco brillante): así se veían en el carrusel y así se ven en la AR propia.
//   4. Muros, mostrador y otras piezas solo se ven bien con «doble cara» (muchas caras miran
//      hacia el lado contrario). La AR propia dibuja un solo lado (es más rápida): desde la vista
//      de la AR esas caras desaparecían y quedaban flotando franjas, puertas y marcos.
//      Arreglo: cada cara recibe su copia de atrás como geometría real (giro al revés y normal
//      invertida, que es justo lo que hace «doble cara»), y ningún material usa «doble cara».
//      Se ve igual que el original en el carrusel (model-viewer) y en la AR, sin caras superpuestas
//      (de cada par solo se dibuja la que mira a la cámara).
//   5. Caras ocultas pegadas al muro o al piso (la espalda de las molduras, la base de los
//      muebles): nunca se ven y, vistas desde atrás, parpadean con el muro. Se quitan.
// El archivo original de la estudiante no se modifica.
// =========================================================
import { getBounds } from '@gltf-transform/functions';

const TOL = 1e-3;

export function limpiarCafeteria(doc) {
  const raiz = doc.getRoot();
  const escena = raiz.getDefaultScene();
  const nodos = [];
  escena.traverse(n => { if (n.getMesh()) nodos.push(n); });

  // ---------- 1. Duplicados: misma caja y mismos triángulos → se queda la copia con material ----------
  const triangulos = (n) => n.getMesh().listPrimitives().reduce((s, p) => s + (p.getIndices()?.getCount() ?? 0), 0);
  const firma = (n) => { const b = getBounds(n); return [...b.min, ...b.max].map(v => Math.round(v / TOL)).join(',') + '|' + triangulos(n); };
  const tieneMaterial = (n) => n.getMesh().listPrimitives().every(p => p.getMaterial());
  const grupos = new Map();
  for (const n of nodos) { const f = firma(n); grupos.set(f, [...(grupos.get(f) ?? []), n]); }
  const borrados = [];
  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    grupo.sort((a, b) => tieneMaterial(b) - tieneMaterial(a));      // primero el que tiene material
    for (const n of grupo.slice(1)) { borrados.push(`${n.getName()} (igual a ${grupo[0].getName()})`); n.dispose(); }
  }
  console.log(`  Duplicados quitados: ${borrados.length} → ${borrados.join(', ')}`);
  const vivos = nodos.filter(n => !n.isDisposed());

  // ---------- 2 y 3. Materiales ----------
  const aluminio = raiz.listMaterials().find(m => m.getName() === 'aluminio');
  let sinMaterial = 0;
  for (const n of vivos) for (const p of n.getMesh().listPrimitives()) if (!p.getMaterial()) { p.setMaterial(aluminio); sinMaterial++; }
  console.log(`  Piezas sin material → «aluminio»: ${sinMaterial}`);
  for (const m of raiz.listMaterials()) {
    if (m.getMetallicFactor() > 1) { console.log(`  Metalicidad de «${m.getName()}»: ${m.getMetallicFactor()} → 0`); m.setMetallicFactor(0); }
    m.setDoubleSided(false);
  }

  // ---------- 5. Planos del cuarto: muros (x e z mínimos de la pieza «Cubo») y el piso ----------
  const cuarto = getBounds(vivos.find(n => n.getName() === 'Cubo'));
  const piso = getBounds(vivos.find(n => n.getName() === 'Cubo.013'));
  // [eje, valor, sentido hacia AFUERA del cuarto]
  const planos = [[0, cuarto.min[0], -1], [2, cuarto.min[2], -1], [1, piso.max[1], -1]];

  // ---------- 4 y 5. Caras: quitar las ocultas y agregar la copia de atrás ----------
  const usos = new Map();
  for (const n of vivos) usos.set(n.getMesh(), (usos.get(n.getMesh()) ?? 0) + 1);
  let ocultas = 0;
  const hechas = new Set();       // una malla usada por varios nodos se arregla una sola vez
  // El original COMPARTE los mismos datos entre piezas iguales (hasta 48 banquitos). Antes de
  // cambiar nada, cada pieza se queda con su propia copia (dedup() los vuelve a juntar al final).
  const vistos = new Set();
  for (const n of vivos) for (const p of n.getMesh().listPrimitives()) {
    if (vistos.has(p.getIndices())) p.setIndices(p.getIndices().clone());
    vistos.add(p.getIndices());
    for (const s of p.listSemantics()) {
      if (vistos.has(p.getAttribute(s))) p.setAttribute(s, p.getAttribute(s).clone());
      vistos.add(p.getAttribute(s));
    }
  }
  for (const n of vivos) {
    const esCuarto = n.getName() === 'Cubo' || n.getName() === 'Cubo.013';
    const M = n.getWorldMatrix();
    const mundo = (v) => [0, 1, 2].map(i => M[i] * v[0] + M[4 + i] * v[1] + M[8 + i] * v[2] + M[12 + i]);
    for (const p of n.getMesh().listPrimitives()) {
      if (hechas.has(p)) continue;
      hechas.add(p);
      const pos = p.getAttribute('POSITION');
      let caras = leerCaras(p);
      // 5. Caras pegadas a un muro o al piso, mirando hacia afuera del cuarto (solo en una malla usada una vez)
      if (!esCuarto && usos.get(n.getMesh()) === 1) {
        const antes = caras.length;
        caras = caras.filter(c => {
          const w = c.map(i => mundo(pos.getElement(i, [])));
          const nrm = normalDe(w);
          return !planos.some(([eje, valor, afuera]) =>
            w.every(v => Math.abs(v[eje] - valor) < TOL * 10) && nrm[eje] * afuera > 0.9);
        });
        ocultas += antes - caras.length;
      }
      // 4. Copia de atrás de cada cara (true = giro al revés y normal invertida)
      caras = [...caras, ...caras.map(([a, b, c]) => [a, c, b, true])];
      escribirCaras(doc, p, caras);
    }
  }
  console.log(`  Caras ocultas quitadas: ${ocultas} · todas las caras con su copia de atrás (sin «doble cara»)`);
}

function leerCaras(p) {
  const idx = p.getIndices();
  const caras = [];
  for (let i = 0; i < idx.getCount(); i += 3) caras.push([idx.getScalar(i), idx.getScalar(i + 1), idx.getScalar(i + 2)]);
  return caras;
}

function normalDe([a, b, c]) {
  const u = b.map((x, i) => x - a[i]), v = c.map((x, i) => x - a[i]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  return n.map(x => x / l);
}



/** Reescribe los índices. Las caras de atrás usan vértices copiados con la normal invertida. */
function escribirCaras(doc, p, caras) {
  const atras = caras.filter(c => c[3]);
  if (atras.length) {
    const usados = [...new Set(atras.flatMap(c => c.slice(0, 3)))];
    const base = p.getAttribute('POSITION').getCount();
    const nuevo = new Map(usados.map((v, k) => [v, base + k]));
    for (const semantica of p.listSemantics()) {
      const acc = p.getAttribute(semantica);
      const t = acc.getElementSize();
      const arr = new (acc.getArray().constructor)((base + usados.length) * t);
      arr.set(acc.getArray());
      usados.forEach((v, k) => {
        const e = acc.getElement(v, []);
        if (semantica === 'NORMAL') e.forEach((x, j) => { e[j] = -x; });
        if (semantica === 'TANGENT') { e[0] = -e[0]; e[1] = -e[1]; e[2] = -e[2]; }
        arr.set(e, (base + k) * t);
      });
      acc.setArray(arr);
    }
    caras = caras.map(c => (c[3] ? c.slice(0, 3).map(v => nuevo.get(v)) : c));
  }
  const total = p.getAttribute('POSITION').getCount();
  const Tipo = total > 65535 ? Uint32Array : Uint16Array;
  p.getIndices().setArray(new Tipo(caras.flatMap(c => c.slice(0, 3))));
}
