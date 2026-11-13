// =========================================================
// admin/js/archivos.js — subir y borrar archivos en Supabase Storage
//
// - subir(): con barra de progreso (por eso usa XMLHttpRequest y no supabase-js).
//   Cada archivo va a <bucket>/<id del proyecto>/<nombre>-<fecha>.<ext>: el nombre
//   cambia en cada subida, así el navegador nunca muestra una versión vieja guardada.
// - Las imágenes se convierten a WebP en el navegador (más livianas) antes de subirlas.
// - Límites (los mismos que los buckets): imágenes 2 MB, modelos 15 MB, video 50 MB.
// =========================================================
import { supabase } from './sesion.js';
import { SUPABASE_URL, SUPABASE_CLAVE_PUBLICA } from '../../js/config.js';

export const LIMITES = { imagenes: 2, modelos: 15, videos: 50 };   // MB
const PUBLICO = `${SUPABASE_URL}/storage/v1/object/public/`;

/** ¿Este archivo está en nuestro Storage? Devuelve { bucket, ruta } o null (los del sitio, como modelos/…, no) */
export function enStorage(url) {
  if (!url?.startsWith(PUBLICO)) return null;
  const [bucket, ...resto] = url.slice(PUBLICO.length).split('/');
  return { bucket, ruta: decodeURIComponent(resto.join('/')) };
}

/**
 * Sube un archivo y devuelve su dirección pública.
 *   subir('imagenes', 'casa-moderna', 'portada.webp', blob, (0..1) => …)
 */
export async function subir(bucket, idProyecto, nombre, blob, alProgreso = () => {}) {
  const mb = blob.size / 1024 / 1024;
  if (mb > LIMITES[bucket]) throw new ErrorAmable(`El archivo pesa ${mb.toFixed(1)} MB y el máximo es ${LIMITES[bucket]} MB.`);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new ErrorAmable('Tu sesión venció. Cierra sesión y vuelve a entrar.');
  const punto = nombre.lastIndexOf('.');
  const ruta = `${idProyecto}/${nombre.slice(0, punto)}-${Date.now().toString(36)}${nombre.slice(punto)}`;
  await new Promise((listo, fallo) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${bucket}/${ruta}`);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader('apikey', SUPABASE_CLAVE_PUBLICA);
    xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
    xhr.setRequestHeader('Cache-Control', 'max-age=31536000');
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) alProgreso(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { alProgreso(1); listo(); return; }
      const texto = xhr.responseText.toLowerCase();
      if (texto.includes('mime') || texto.includes('invalid_mime_type')) fallo(new ErrorAmable('Ese tipo de archivo no está permitido aquí.'));
      else if (texto.includes('maximum allowed size') || xhr.status === 413) fallo(new ErrorAmable(`El archivo es muy grande (máximo ${LIMITES[bucket]} MB).`));
      else if (xhr.status === 401 || xhr.status === 403 || texto.includes('row-level security')) fallo(new ErrorAmable('Tu sesión venció o no tienes permiso. Cierra sesión y vuelve a entrar.'));
      else fallo(new ErrorAmable('No se pudo subir el archivo. Intenta de nuevo.'));
    };
    xhr.onerror = () => fallo(new ErrorAmable('Se cortó la conexión mientras se subía el archivo. Revisa tu internet e intenta de nuevo.'));
    xhr.send(blob);
  });
  return PUBLICO + bucket + '/' + ruta.split('/').map(encodeURIComponent).join('/');
}

/** Borra archivos de nuestro Storage (los del sitio se ignoran). No falla si alguno ya no existe. */
export async function borrar(urls) {
  const porBucket = {};
  for (const url of urls) {
    const s = enStorage(url);
    if (s) (porBucket[s.bucket] ??= []).push(s.ruta);
  }
  for (const [bucket, rutas] of Object.entries(porBucket)) {
    const { error } = await supabase.storage.from(bucket).remove(rutas);
    if (error) console.warn('No se pudieron borrar archivos viejos', error);
  }
}

/** Borra todos los archivos de un proyecto (al eliminarlo) */
export async function borrarCarpeta(idProyecto) {
  for (const bucket of Object.keys(LIMITES)) {
    const { data } = await supabase.storage.from(bucket).list(idProyecto, { limit: 1000 });
    if (data?.length) await supabase.storage.from(bucket).remove(data.map(f => `${idProyecto}/${f.name}`));
  }
}

/** Todas las direcciones de archivos que usa un proyecto (para saber qué se dejó de usar) */
export function archivosDe(d) {
  return [d.portada, d.video, d.poster, d.subtitulos, d.ar?.modelo, d.ar?.modeloHero, d.ar?.poster, d.ar?.pantallaHero, d.ar?.modeloIOS,
    ...(d.imagenes ?? []).map(i => i.src), ...(d.galeria?.imagenes ?? []).flatMap(i => [i.src, i.mini])].filter(Boolean);
}

/** Error con un mensaje que se puede mostrar tal cual a la persona */
export class ErrorAmable extends Error {}

// ---------------------------------------------------------
// Imágenes: se achican y se pasan a WebP en el navegador
// ---------------------------------------------------------
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Convierte una imagen a WebP con un lado máximo. Si el navegador no sabe crear WebP (Safari
 * en algunos iPhone), la deja en JPEG. Devuelve un Blob.
 *   voltear: true = la da vuelta de arriba abajo (la pantalla del televisor del carrusel la pide así)
 *   llenar: [ancho, alto] = recorta para llenar exactamente esa medida (como «cover»)
 */
export async function aWebP(archivo, { lado = 1600, calidad = 0.85, voltear = false, llenar = null } = {}) {
  if (archivo.type && !TIPOS_IMAGEN.includes(archivo.type)) throw new ErrorAmable('Usa una imagen JPG, PNG o WebP.');
  let mapa;
  try { mapa = await createImageBitmap(archivo); } catch { throw new ErrorAmable('No se pudo abrir la imagen. Prueba con otra (JPG o PNG).'); }
  let [w, h] = [mapa.width, mapa.height];
  let origen = [0, 0, w, h];
  if (llenar) {
    const [W, H] = llenar;
    const k = Math.max(W / w, H / h);
    origen = [(w - W / k) / 2, (h - H / k) / 2, W / k, H / k];
    [w, h] = [W, H];
  } else {
    const k = Math.min(1, lado / Math.max(w, h));
    [w, h] = [Math.round(w * k), Math.round(h * k)];
  }
  const lienzo = document.createElement('canvas');
  lienzo.width = w; lienzo.height = h;
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  if (voltear) { ctx.translate(0, h); ctx.scale(1, -1); }
  ctx.drawImage(mapa, ...origen, 0, 0, w, h);
  mapa.close?.();
  const blob = await new Promise(r => lienzo.toBlob(r, 'image/webp', calidad));
  if (blob?.type === 'image/webp') return blob;
  return new Promise(r => lienzo.toBlob(r, 'image/jpeg', calidad));
}

export const extension = (blob) => ({ 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }[blob.type] ?? 'bin');
