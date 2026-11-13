// =========================================================
// datos.js — funciones compartidas por todas las páginas.
//
// De dónde salen los proyectos (en este orden):
//   1. Supabase: lo que el docente edita en el panel /admin/.
//   2. Plan B si Supabase no responde (sin internet, pausado, caído):
//      a) la última copia buena que este navegador guardó de Supabase;
//      b) data/proyectos.json, que viene con el sitio. La vitrina nunca queda en blanco.
// Las tres fuentes tienen la MISMA forma, así que el resto del sitio no se entera.
// =========================================================
import { SUPABASE_URL, SUPABASE_CLAVE_PUBLICA } from './config.js';

let cache = null;
const COPIA_LOCAL = 'vitrina-datos';
const ESPERA_MAXIMA = 4000;     // ms: si Supabase tarda más, se usa el Plan B

/** Descarga los datos una sola vez y los guarda en memoria. */
export async function cargarDatos() {
  if (cache) return cache;
  cache = await desdeSupabase().catch((e) => { console.warn('Supabase no respondió; se usa el Plan B.', e); return null; })
    ?? copiaLocal()
    ?? await desdeJSON();
  return cache;
}

async function desdeJSON() {
  const respuesta = await fetch('data/proyectos.json', { cache: 'no-cache' });
  if (!respuesta.ok) throw new Error('No se pudo leer data/proyectos.json');
  return { ...(await respuesta.json()), _origen: 'json' };
}

/** Lee ajustes, carreras y proyectos publicados con la API REST de Supabase (sin librerías: es más liviano). */
async function desdeSupabase() {
  if (!SUPABASE_URL || !SUPABASE_CLAVE_PUBLICA) return null;
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ESPERA_MAXIMA);
  const encabezados = { apikey: SUPABASE_CLAVE_PUBLICA };
  // La clave antigua («anon», empieza con eyJ) también va como token; la nueva (sb_publishable_…) no.
  if (SUPABASE_CLAVE_PUBLICA.startsWith('eyJ')) encabezados.Authorization = `Bearer ${SUPABASE_CLAVE_PUBLICA}`;
  // Vista previa del docente: con su sesión, la base de datos también le entrega lo oculto (RLS)
  const token = enVistaPrevia() ? tokenDelAdmin() : null;
  if (token) encabezados.Authorization = `Bearer ${token}`;
  const soloPublicado = token ? '' : '&publicado=eq.true';
  const pedir = async (ruta) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, { headers: encabezados, signal: control.signal, cache: 'no-cache' });
    if (!r.ok) throw new Error(`Supabase ${r.status} en ${ruta}`);
    return r.json();
  };
  try {
    const [ajustes, carreras, proyectos] = await Promise.all([
      pedir('ajustes?select=clave,valor'),
      pedir(`carreras?select=id,orden,datos${soloPublicado}&order=orden`),
      pedir(`proyectos?select=id,carrera,datos${soloPublicado}&order=orden`)
    ]);
    if (!proyectos.length) throw new Error('Supabase no tiene proyectos publicados');
    const ajuste = Object.fromEntries(ajustes.map(a => [a.clave, a.valor]));
    const datos = {
      periodoActual: ajuste.periodoActual ?? '',
      configuracion: ajuste.configuracion ?? {},
      carreras: carreras.map(c => ({ id: c.id, orden: c.orden, ...c.datos })),
      proyectos: proyectos.map(p => ({ id: p.id, carrera: p.carrera, ...p.datos }))
    };
    if (token) { mostrarBarraPrevia(); return { ...datos, _origen: 'vista-previa' }; }   // lo oculto no va a la copia local
    try { localStorage.setItem(COPIA_LOCAL, JSON.stringify(datos)); } catch { /* sin espacio o bloqueado: no importa */ }
    return { ...datos, _origen: 'supabase' };
  } finally {
    clearTimeout(reloj);
  }
}

// ---------------------------------------------------------
// Vista previa del docente: el panel abre «proyecto.html?id=…&vista=previa».
// Se recuerda mientras dure la pestaña (así también funciona «Ver en AR»).
// Sin una sesión de admin en este navegador no cambia nada.
// ---------------------------------------------------------
const PREVIA = 'vitrina-vista-previa';
function enVistaPrevia() {
  try {
    if (new URLSearchParams(location.search).get('vista') === 'previa') sessionStorage.setItem(PREVIA, '1');
    return sessionStorage.getItem(PREVIA) === '1';
  } catch { return false; }
}

/** Token de la sesión que guardó el panel (supabase-js lo guarda como «sb-<proyecto>-auth-token») */
function tokenDelAdmin() {
  try {
    const proyecto = new URL(SUPABASE_URL).hostname.split('.')[0];
    const sesion = JSON.parse(localStorage.getItem(`sb-${proyecto}-auth-token`));
    return sesion?.access_token && sesion.expires_at * 1000 > Date.now() ? sesion.access_token : null;
  } catch { return null; }
}

function mostrarBarraPrevia() {
  const barra = document.createElement('div');
  barra.className = 'barra-previa';
  barra.setAttribute('role', 'status');
  barra.innerHTML = '<span>Vista previa del docente: también ves los proyectos ocultos.</span> <button type="button">Salir de la vista previa</button>';
  barra.querySelector('button').addEventListener('click', () => {
    try { sessionStorage.removeItem(PREVIA); } catch { /* nada */ }
    const url = new URL(location.href);
    url.searchParams.delete('vista');
    location.replace(url);
  });
  document.body.append(barra);
}

function copiaLocal() {
  try {
    const guardado = JSON.parse(localStorage.getItem(COPIA_LOCAL));
    return guardado?.proyectos?.length ? { ...guardado, _origen: 'copia-local' } : null;
  } catch { return null; }
}

/** Devuelve las carreras en el orden que eligió el docente (campo "orden"). */
export function carrerasOrdenadas(datos) {
  return [...datos.carreras].sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
}

/** Imagen de portada de un proyecto: "portada" del JSON, o la primera imagen de su galería. */
export function portadaDe(p) {
  return p.portada ?? p.imagenes?.[0]?.src ?? '';
}

/**
 * Tipo de experiencia de un proyecto: "maqueta" (arquitectura), "escenario" (diorama de
 * un videojuego o un modelo 3D) o "video" (pantalla de cine). Decide qué AR se abre.
 */
export function tipoDe(p) {
  return p.tipo ?? p.ar?.tipo ?? 'maqueta';
}

/** Cómo se nombra lo que se coloca en la AR, con el artículo correcto. */
export function palabrasObjeto(tipo) {
  return tipo === 'escenario'
    ? { la: 'el escenario', al: 'al escenario', La: 'El escenario', nombre: 'Escenario', a: 'o' }
    : { la: 'la maqueta', al: 'a la maqueta', La: 'La maqueta', nombre: 'Maqueta', a: 'a' };
}

/** «1 proyecto» / «2 proyectos» */
export function textoProyectos(n) {
  return `${n} proyecto${n === 1 ? '' : 's'}`;
}

/** Lee un parámetro de la URL. Ej.: proyecto.html?id=casa-moderna → leerParametro('id') = 'casa-moderna' */
export function leerParametro(nombre) {
  return new URLSearchParams(window.location.search).get(nombre);
}

/** Escapa texto antes de meterlo en HTML (evita romper la página con comillas o <). */
export function escapar(texto = '') {
  return String(texto)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Muestra un mensaje de error amable dentro de <main>. */
export function mostrarError(mensaje) {
  const main = document.querySelector('main');
  main.innerHTML = `<div class="alerta"><p role="alert">${escapar(mensaje)}</p><p><a href="index.html">Volver a los proyectos</a></p></div>`;
}

/** Íconos SVG de línea (heredan el color del texto). */
const trazo = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
export const iconos = {
  flecha: `<svg viewBox="0 0 24 24" ${trazo} aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>`,
  arquitectura: `<svg viewBox="0 0 24 24" ${trazo} aria-hidden="true"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/></svg>`,
  multimedia: `<svg viewBox="0 0 24 24" ${trazo} aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>`,
  ar: `<svg viewBox="0 0 24 24" ${trazo} aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg>`,
  nfc: `<svg viewBox="0 0 24 24" ${trazo} aria-hidden="true"><path d="M6 8.5a5 5 0 0 1 0 7M9.5 6a9 9 0 0 1 0 12M13 3.5a13 13 0 0 1 0 17"/></svg>`};
