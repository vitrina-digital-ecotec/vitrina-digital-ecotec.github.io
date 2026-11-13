// =========================================================
// admin/js/modelo.js — prepara un modelo 3D (.glb) EN EL NAVEGADOR para el celular
//
// El trabajo pesado corre en segundo plano (modelo-trabajador.js): el panel no se congela
// aunque el modelo pese 80 MB, y «Cancelar» lo detiene al instante.
//   1. Preparar: escala, base en el piso, piezas y materiales unidos, texturas WebP, meshopt.
//   2. Si sigue pesado (más de 8 MB o 400 mil triángulos): «Reducir tamaño automáticamente»
//      prueba, en orden, quitar piezas diminutas, texturas más chicas y simplificar la geometría,
//      hasta llegar a un peso y un detalle que el celular mueva con fluidez.
//   3. Versión liviana para el carrusel y foto del modelo para el póster.
// =========================================================
export const OBJETIVO_MB = 8;            // fluido en un celular de gama media
export const MAXIMO_MB = 15;             // lo que acepta el almacenamiento
export const OBJETIVO_TRIANGULOS = 400000;
const MB = 1024 * 1024;

export class Cancelado extends Error {}

/** Un modelo abierto en el trabajador de segundo plano */
export class Preparador {
  constructor() {
    this.trabajador = new Worker(new URL('./modelo-trabajador.js', import.meta.url), { type: 'module' });
    this.pendiente = null;
    this.trabajador.onmessage = ({ data }) => {
      if (data.tipo === 'paso') { this.alPaso?.(data.texto); return; }
      const p = this.pendiente; this.pendiente = null;
      if (data.tipo === 'error') p?.fallo(new Error(data.mensaje)); else p?.listo(data);
    };
    this.trabajador.onerror = (e) => { const p = this.pendiente; this.pendiente = null; p?.fallo(new Error(e.message || 'El trabajo en segundo plano falló')); };
  }

  pedir(mensaje, alPaso, transferir = []) {
    this.alPaso = alPaso;
    return new Promise((listo, fallo) => { this.pendiente = { listo, fallo }; this.trabajador.postMessage(mensaje, transferir); });
  }

  async abrir(archivo, alPaso) {
    if (!/\.glb$/i.test(archivo.name)) throw new Error('Elige un archivo .glb (en Blender: Archivo → Exportar → glTF 2.0, formato .glb).');
    this.mbOriginal = archivo.size / MB;
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    await this.pedir({ tipo: 'cargar', bytes }, alPaso, [bytes.buffer]);
    this.info = await this.pedir({ tipo: 'medir' }, alPaso);
    return this.info;
  }

  async preparar(opciones, alPaso) {
    const r = await this.pedir({ tipo: 'preparar', opciones }, alPaso);
    return { ...r, blob: new Blob([r.bytes], { type: 'model/gltf-binary' }), mb: r.bytes.byteLength / MB };
  }

  /** Detiene todo al instante */
  cancelar() {
    this.trabajador.terminate();
    this.pendiente?.fallo(new Cancelado('Cancelado'));
    this.pendiente = null;
  }

  cerrar() { this.trabajador.terminate(); }
}

/** ¿Conviene reducirlo? */
export function estaPesado(r) { return r.mb > OBJETIVO_MB || r.triangulos > OBJETIVO_TRIANGULOS; }

/**
 * «Reducir tamaño automáticamente»: arma un plan según dónde está el peso (texturas o
 * geometría), lo prueba y lo ajusta hasta quedar bajo 8 MB y 400 mil triángulos (máx. 4 intentos).
 * Devuelve { resultado, cambios (frases simples), opciones (para la versión del carrusel) }.
 */
export async function reducir(preparador, base, { escala, alPaso }) {
  const objetivo = OBJETIVO_MB * MB * 0.9;
  const total = base.bytes.byteLength;
  const texturas = base.bytesTexturas;
  const geometria = Math.max(1, total - texturas);
  const maxOriginal = preparador.info.maxTextura || 1024;
  let maxTextura = Math.min(1024, maxOriginal);
  if (maxTextura > 512 && (texturas > total * 0.25 || texturas > 2 * MB)) maxTextura = 512;
  const texturasEstimadas = maxTextura < 1024 ? texturas * 0.35 : texturas;
  const geometriaObjetivo = Math.max(objetivo - texturasEstimadas, objetivo * 0.4);
  let ratio = Math.min(1, geometriaObjetivo / geometria, OBJETIVO_TRIANGULOS / base.triangulos);
  if (ratio > 0.95) ratio = null;

  // Se queda con el resultado que entra en el objetivo con MÁS detalle: si un intento queda muy por
  // debajo (se simplificó de más), el siguiente prueba con más detalle; si se pasa, con menos.
  let resultado = null, mejor = null, mejorRatio = null;
  for (let intento = 1; intento <= 4; intento++) {
    alPaso(`Reduciendo (intento ${intento} de 4)…`);
    resultado = await preparador.preparar({ escala, maxTextura, calidad: 0.85, simplificar: ratio, quitarDiminutos: true }, (t) => alPaso(`Intento ${intento}: ${t}`));
    const pesaMucho = resultado.bytes.byteLength > OBJETIVO_MB * MB;
    const muchoDetalle = resultado.triangulos > OBJETIVO_TRIANGULOS * 1.1;
    if (!pesaMucho && !muchoDetalle) {
      if (!mejor || (ratio ?? 1) > (mejorRatio ?? 1)) { mejor = resultado; mejorRatio = ratio; }
      // Techo real: cuántos triángulos quedarían sin simplificar (después de quitar repetidas y diminutas)
      const techoReal = Math.min(1, OBJETIVO_TRIANGULOS / (resultado.triangulos / (ratio ?? 1)));
      const sobraEspacio = resultado.bytes.byteLength < objetivo * 0.55;
      if (!sobraEspacio || ratio === null || ratio >= techoReal * 0.98) break;
      ratio = Math.min(techoReal, ratio * Math.min(2, (objetivo * 0.85) / resultado.bytes.byteLength));
      if (ratio > 0.95) ratio = null;
      continue;
    }
    if (mejor) break;                 // ya hay uno que entra: con más detalle se pasaba
    if (pesaMucho && resultado.bytesTexturas > resultado.bytes.byteLength * 0.4 && maxTextura > 256) maxTextura /= 2;
    const factor = pesaMucho ? Math.min(0.8, Math.max(0.3, (objetivo / resultado.bytes.byteLength) * 0.9)) : OBJETIVO_TRIANGULOS / resultado.triangulos;
    ratio = Math.max(0.03, (ratio ?? 1) * factor);
  }
  resultado = mejor ?? resultado;
  ratio = mejor ? mejorRatio : ratio;

  const mil = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} millones` : `${Math.round(n / 1000)} mil`);
  const mb = (b) => `${(b / MB).toFixed(1).replace('.', ',')} MB`;
  const cambios = [];
  if (maxTextura < maxOriginal) cambios.push(`Las texturas (las imágenes de las superficies) bajarán de ${maxOriginal} a ${maxTextura} px.`);
  if (resultado.repetidas) cambios.push(`Se quitarán ${resultado.repetidas} copias repetidas de piezas que estaban una encima de otra (se ven igual que una sola).`);
  if (resultado.piezasQuitadas) cambios.push(`Se quitarán ${resultado.piezasQuitadas} piezas diminutas o invisibles: sobre la mesa medirían menos de 2,5 mm${resultado.triangulosQuitados > 1000 ? ` (${mil(resultado.triangulosQuitados)} triángulos)` : ''}.`);
  if (ratio && ratio < 0.95) cambios.push(`La geometría se simplificará: se conserva cerca del ${Math.round(ratio * 100)} % del detalle. A escala de maqueta casi no se nota.`);
  if (resultado.triangulos < base.triangulos * 0.97) {
    cambios.push(`En total, el modelo tendrá ${Math.round((1 - resultado.triangulos / base.triangulos) * 100)} % menos triángulos (de ${mil(base.triangulos)} a ${mil(resultado.triangulos)}): irá más fluido en el celular.`);
  }
  cambios.push(`Peso final: ${mb(resultado.bytes.byteLength)} (antes ${mb(total)}).`);
  if (resultado.bytes.byteLength > MAXIMO_MB * MB) cambios.push(`Sigue pasando el máximo de ${MAXIMO_MB} MB: conviene simplificarlo en Blender (por ejemplo, con el modificador «Decimate»).`);
  return { resultado, cambios, opciones: { maxTextura, ratio } };
}

/**
 * Versión liviana para el carrusel: texturas chicas y, si es pesado, unos 60 mil triángulos.
 * Se ve chica, así que puede ir sin normales (caras planas) y deformarse un poco más.
 */
export async function versionCarrusel(preparador, { escala, alPaso }) {
  const r = 60000 / preparador.info.triangulos;
  const pesado = r < 0.95;
  return preparador.preparar({
    escala, maxTextura: preparador.info.triangulos > 200000 ? 256 : 512, calidad: 0.8, quitarDiminutos: true,
    simplificar: pesado ? Math.max(0.02, r) : null, errorMaximo: pesado ? 0.2 : null, sinNormales: pesado
  }, alPaso);
}

/** Escala automática: que el lado más largo mida unos 60 cm sobre la mesa */
export function escalaAutomatica([x, , z], cm = 60) {
  return Math.max(1, Math.round(Math.max(x, z) / (cm / 100)));
}

/**
 * Foto del modelo para el póster (lo que se ve mientras carga) y la portada.
 * Usa un <model-viewer> invisible (pero dentro de la pantalla: si no, no dibuja).
 */
export async function cargarModelViewer() {
  if (customElements.get('model-viewer')) return;
  self.ModelViewerElement ??= { meshoptDecoderLocation: 'https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_decoder.js' };
  await import('https://cdn.jsdelivr.net/npm/@google/model-viewer@4.0.0/dist/model-viewer.min.js');
}

export async function fotoDelModelo(blob, { camara = '25deg 62deg auto', ancho = 1200, alto = 900 } = {}) {
  await cargarModelViewer();
  const visor = document.createElement('model-viewer');
  visor.setAttribute('camera-orbit', camara);
  visor.setAttribute('shadow-intensity', '1');
  visor.setAttribute('interaction-prompt', 'none');
  visor.setAttribute('loading', 'eager');
  visor.style.cssText = `position:fixed;left:0;top:0;width:${ancho / 2}px;height:${alto / 2}px;opacity:0;pointer-events:none;z-index:-1;background:#DEF1FF`;
  const url = URL.createObjectURL(blob);
  document.body.append(visor);
  try {
    await new Promise((listo, fallo) => {
      const reloj = setTimeout(() => fallo(new Error('El modelo tardó demasiado en mostrarse')), 30000);
      visor.addEventListener('load', () => { clearTimeout(reloj); listo(); }, { once: true });
      visor.addEventListener('error', () => { clearTimeout(reloj); fallo(new Error('No se pudo mostrar el modelo')); }, { once: true });
      visor.src = url;
    });
    await new Promise(r => setTimeout(r, 500));
    return await visor.toBlob({ mimeType: 'image/webp', qualityArgument: 0.85, idealAspect: true });
  } finally {
    visor.remove();
    URL.revokeObjectURL(url);
  }
}
