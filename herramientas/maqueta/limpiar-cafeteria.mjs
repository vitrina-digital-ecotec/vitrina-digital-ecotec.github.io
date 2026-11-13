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
//   5. Caras pegadas al muro o al piso (la espalda de las molduras, la base de los muebles, la
//      punta de la barra que toca el muro): desde adentro las tapa el muro y, con su copia de atrás,
//      se veían A TRAVÉS del muro desde afuera (el rectángulo rosado junto a la puerta). Se quitan,
//      miren hacia donde miren. Excepción: los vidrios de las ventanas redondas de la puerta.
// El archivo original de la estudiante no se modifica.
// =========================================================
import { getBounds } from '@gltf-transform/functions';

const TOL = 1e-3;
const PEGADO = 2e-3;   // «pegado al muro»: a menos de 2 mm (los cuadros sobresalen 1 cm y se quedan)
const GROSOR = 3e-3;   // grosor que se le da a los muros por afuera: 3 mm del café real. Tiene que ser MENOR
                      // que lo que sobresalen la puerta (17 mm) y el vidrio de sus ventanas (4,4 mm), si no los tapa

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
  // [eje, valor]
  const planos = [[0, cuarto.min[0]], [2, cuarto.min[2]], [1, piso.max[1]]];

  // ---------- 4 y 5. Caras: quitar las ocultas y agregar la copia de atrás ----------
  const usos = new Map();
  for (const n of vivos) usos.set(n.getMesh(), (usos.get(n.getMesh()) ?? 0) + 1);
  let ocultas = 0;
  const muro = [];             // partes de la pieza «Cubo» (los muros): se arreglan juntas al final
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
      // 5. Caras pegadas a un muro o al piso (solo en una malla usada una vez; los vidrios de la puerta se quedan)
      if (!esCuarto && usos.get(n.getMesh()) === 1 && !/vidrio/.test(p.getMaterial()?.getName() ?? '')) {
        const antes = caras.length;
        caras = caras.filter(c => {
          const w = c.map(i => mundo(pos.getElement(i, [])));
          const nrm = normalDe(w);
          return !planos.some(([eje, valor]) =>
            w.every(v => Math.abs(v[eje] - valor) < PEGADO) && Math.abs(nrm[eje]) > 0.9);
        });
        ocultas += antes - caras.length;
      }
      // 4. Copia de atrás de cada cara (true = giro al revés y normal invertida)
      caras = [...caras, ...caras.map(([a, b, c]) => [a, c, b, true])];
      const base = pos.getCount();
      escribirCaras(doc, p, caras);
      if (n.getName() === 'Cubo') muro.push([p, base]);
    }
  }
  console.log(`  Caras ocultas quitadas: ${ocultas} · todas las caras con su copia de atrás (sin «doble cara»)`);
  engrosarMuros(muro);
}

/**
 * Cara de AFUERA de los muros (pieza «Cubo»: muros en x mínimo y z mínimo).
 * El muro original está hecho de muchos triángulos cortados alrededor de la barra; sus uniones
 * no calzan perfecto y, desde atrás, por esas rendijas finísimas se asomaba el borde de la barra.
 * Arreglo: del lado de afuera, cada muro pasa a ser UN rectángulo sin uniones, 2 cm más afuera,
 * cerrado arriba, en la punta y en la esquina (el muro queda con 2 cm de grosor).
 * Los muros vienen en varias partes: se miden juntas, a todas se les quitan las caras de afuera
 * y los rectángulos se agregan una sola vez (en la primera), para que no se superpongan.
 */
function engrosarMuros(partes) {
  if (!partes.length) return;
  let min = [Infinity, Infinity, Infinity];
  for (const [p, base] of partes) for (let i = 0; i < base; i++) {
    const v = p.getAttribute('POSITION').getElement(i, []);
    min = min.map((m, j) => Math.min(m, v[j]));
  }
  const enPlano = (v, eje) => Math.abs(v[eje] - min[eje]) < PEGADO;
  // Medidas de cada muro (con todas las caras de todas las partes que están en su plano)
  const muros = [0, 2].map(eje => {
    const otro = eje === 0 ? 2 : 0;
    let lo = Infinity, hi = -Infinity, abajo = Infinity, arriba = -Infinity, hay = false;
    for (const [p] of partes) for (const c of leerCaras(p)) for (const i of c) {
      const v = p.getAttribute('POSITION').getElement(i, []);
      if (!enPlano(v, eje)) continue;
      hay = true; lo = Math.min(lo, v[otro]); hi = Math.max(hi, v[otro]); abajo = Math.min(abajo, v[1]); arriba = Math.max(arriba, v[1]);
    }
    return hay ? { eje, otro, lo, hi, abajo, arriba } : null;
  }).filter(Boolean);
  // A todas las partes se les quitan las caras de afuera que están en el plano de un muro
  let quitadas = 0;
  for (const [p] of partes.slice(1)) {
    const caras = leerCaras(p);
    const quedan = caras.filter(c => !muros.some(m => esDeAfueraEn(p, c, m.eje)));
    quitadas += caras.length - quedan.length;
    p.getIndices().setArray(new (p.getIndices().getArray().constructor)(quedan.flat()));
  }
  const [p] = partes[0];
  const pos = p.getAttribute('POSITION');
  const total = pos.getCount();
  const caras = leerCaras(p);
  const quedan = caras.filter(c => !muros.some(m => esDeAfueraEn(p, c, m.eje)));
  quitadas += caras.length - quedan.length;
  function esDeAfueraEn(prim, c, eje) {
    const w = c.map(i => prim.getAttribute('POSITION').getElement(i, []));
    return w.every(v => enPlano(v, eje)) && normalDe(w)[eje] < 0;      // mira hacia -x o -z
  }
  // …y se agregan los rectángulos limpios
  const nuevos = [];     // { puntos: [4 × xyz], normal }
  const G = GROSOR;
  for (const m of muros) {
    const plano = min[m.eje] - G;
    const lo = m.lo - G;                       // llega hasta la esquina (cierra la esquina con el otro muro)
    const punto = (a, y, valor = plano) => { const v = [0, 0, 0]; v[m.eje] = valor; v[m.otro] = a; v[1] = y; return v; };
    const normal = [0, 0, 0]; normal[m.eje] = -1;
    nuevos.push({ puntos: [punto(lo, m.abajo), punto(m.hi, m.abajo), punto(m.hi, m.arriba), punto(lo, m.arriba)], normal });
    // Tapa de arriba (mira hacia +y) y tapa de la punta (mira hacia +otro)
    nuevos.push({ puntos: [punto(lo, m.arriba), punto(m.hi, m.arriba), punto(m.hi, m.arriba, min[m.eje]), punto(lo, m.arriba, min[m.eje])], normal: [0, 1, 0] });
    const nPunta = [0, 0, 0]; nPunta[m.otro] = 1;
    nuevos.push({ puntos: [punto(m.hi, m.abajo), punto(m.hi, m.abajo, min[m.eje]), punto(m.hi, m.arriba, min[m.eje]), punto(m.hi, m.arriba)], normal: nPunta });
  }
  // Vértices nuevos: posición y normal propias; el resto de los datos se copia de un vértice cualquiera
  const semanticas = p.listSemantics();
  const agregados = nuevos.length * 4;
  for (const s of semanticas) {
    const acc = p.getAttribute(s);
    const tam = acc.getElementSize();
    const arr = new (acc.getArray().constructor)((total + agregados) * tam);
    arr.set(acc.getArray());
    const muestra = acc.getElement(0, []);
    nuevos.forEach((q, k) => q.puntos.forEach((pt, j) => {
      arr.set(s === 'POSITION' ? pt : s === 'NORMAL' ? q.normal : muestra, (total + k * 4 + j) * tam);
    }));
    acc.setArray(arr);
  }
  // Dos triángulos por rectángulo, girados hacia su normal
  nuevos.forEach((q, k) => {
    const [a, b, c, d] = [0, 1, 2, 3].map(j => total + k * 4 + j);
    const g = normalDe([q.puntos[0], q.puntos[1], q.puntos[2]]);
    const deFrente = g[0] * q.normal[0] + g[1] * q.normal[1] + g[2] * q.normal[2] > 0;
    quedan.push(...(deFrente ? [[a, b, c], [a, c, d]] : [[a, c, b], [a, d, c]]));
  });
  const Tipo = total + agregados > 65535 ? Uint32Array : Uint16Array;
  p.getIndices().setArray(new Tipo(quedan.flat()));
  console.log(`  Muros: ${quitadas} caras de afuera → ${muros.length} rectángulos limpios, ${GROSOR * 1000} mm más afuera`);
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
