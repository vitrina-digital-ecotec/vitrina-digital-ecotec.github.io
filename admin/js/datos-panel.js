// =========================================================
// admin/js/datos-panel.js — leer y guardar el contenido en Supabase (con la sesión del admin)
//
// El admin ve TODO (también lo oculto): lo permite RLS porque su correo está en «administradores».
// Cada proyecto se guarda con sus columnas (id, carrera, orden, publicado) y el resto en «datos»,
// con la MISMA forma que data/proyectos.json.
// =========================================================
import { supabase } from './sesion.js';

export const estado = { proyectos: [], carreras: [], ajustes: {} };

const ok = ({ data, error }) => { if (error) throw error; return data; };
/** Avisa al panel que algo cambió (actualiza el resumen de arriba) */
const avisarCambio = () => document.dispatchEvent(new CustomEvent('panel:cambio'));

export async function cargarTodo() {
  const [proyectos, carreras, ajustes] = await Promise.all([
    supabase.from('proyectos').select('id, carrera, orden, publicado, datos, actualizado').order('orden').then(ok),
    supabase.from('carreras').select('id, orden, publicado, datos').order('orden').then(ok),
    supabase.from('ajustes').select('clave, valor').then(ok)
  ]);
  estado.proyectos = proyectos;
  estado.carreras = carreras;
  estado.ajustes = Object.fromEntries(ajustes.map(a => [a.clave, a.valor]));
  return estado;
}

// ---------- Proyectos ----------
export async function crearProyecto({ id, carrera, publicado, datos }) {
  const orden = Math.max(0, ...estado.proyectos.map(p => p.orden)) + 10;   // al final del carrusel
  const fila = ok(await supabase.from('proyectos').insert({ id, carrera, orden, publicado, datos }).select().single());
  estado.proyectos.push(fila);
  avisarCambio();
  return fila;
}

export async function guardarProyecto(id, cambios) {
  const fila = ok(await supabase.from('proyectos').update(cambios).eq('id', id).select().single());
  estado.proyectos[estado.proyectos.findIndex(p => p.id === id)] = fila;
  avisarCambio();
  return fila;
}

export async function borrarProyecto(id) {
  ok(await supabase.from('proyectos').delete().eq('id', id));
  estado.proyectos = estado.proyectos.filter(p => p.id !== id);
  avisarCambio();
}

/** Intercambia el orden de dos proyectos (subir / bajar en el carrusel) */
export async function intercambiarOrden(a, b) {
  const [oa, ob] = [a.orden, b.orden === a.orden ? a.orden + 1 : b.orden];
  await guardarProyecto(a.id, { orden: ob });
  await guardarProyecto(b.id, { orden: oa });
  estado.proyectos.sort((x, y) => x.orden - y.orden);
}

// ---------- Carreras ----------
export async function guardarCarrera(id, cambios, nueva = false) {
  const consulta = nueva
    ? supabase.from('carreras').insert({ id, ...cambios })
    : supabase.from('carreras').update(cambios).eq('id', id);
  const fila = ok(await consulta.select().single());
  const i = estado.carreras.findIndex(c => c.id === id);
  if (i >= 0) estado.carreras[i] = fila; else estado.carreras.push(fila);
  estado.carreras.sort((x, y) => x.orden - y.orden);
  return fila;
}

export async function borrarCarrera(id) {
  ok(await supabase.from('carreras').delete().eq('id', id));
  estado.carreras = estado.carreras.filter(c => c.id !== id);
}

// ---------- Ajustes (periodo actual, AR propia) ----------
export async function guardarAjuste(clave, valor) {
  ok(await supabase.from('ajustes').upsert({ clave, valor }));
  estado.ajustes[clave] = valor;
}

/**
 * Respaldo con la forma de data/proyectos.json (solo lo PUBLICADO): reemplazando ese archivo
 * en el repositorio, el Plan B queda al día con lo que se editó en el panel.
 */
export function respaldoJSON() {
  return {
    _instrucciones: 'Respaldo (Plan B) descargado del panel. El contenido se edita en /admin/; este archivo solo se usa si Supabase no responde.',
    periodoActual: estado.ajustes.periodoActual ?? '',
    configuracion: estado.ajustes.configuracion ?? {},
    carreras: estado.carreras.filter(c => c.publicado).map(c => ({ id: c.id, ...c.datos, orden: c.orden })),
    proyectos: estado.proyectos.filter(p => p.publicado).map(p => ({ id: p.id, carrera: p.carrera, ...p.datos }))
  };
}
