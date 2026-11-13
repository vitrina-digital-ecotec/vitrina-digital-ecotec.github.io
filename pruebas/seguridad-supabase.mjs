// =========================================================
// seguridad-supabase.mjs — ¿la clave PÚBLICA está bien encerrada? (RLS)
//
// Correr (con SUPABASE_URL y SUPABASE_CLAVE_PUBLICA ya puestas en js/config.js):
//   cd pruebas → node seguridad-supabase.mjs
//
// Hace lo que podría hacer cualquier visitante con la clave pública y revisa
// que solo funcione lo permitido. Deja UN evento de prueba (sesion «prueba-seguridad»).
// =========================================================
import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../js/config.js', import.meta.url), 'utf8');
const URL_SB = config.match(/SUPABASE_URL = '([^']*)'/)[1];
const CLAVE = config.match(/SUPABASE_CLAVE_PUBLICA = '([^']*)'/)[1];
if (!URL_SB || !CLAVE) { console.log('Primero pon SUPABASE_URL y SUPABASE_CLAVE_PUBLICA en js/config.js'); process.exit(1); }

const encabezados = { apikey: CLAVE, 'Content-Type': 'application/json' };
// Las claves viejas (anon, eyJ…) también van como token; las nuevas (sb_publishable_…) no.
if (CLAVE.startsWith('eyJ')) encabezados.Authorization = `Bearer ${CLAVE}`;
const api = (ruta, opciones = {}) => fetch(`${URL_SB}${ruta}`, { ...opciones, headers: { ...encabezados, ...opciones.headers } });

let fallas = 0;
async function revisar(nombre, debePermitir, hacer) {
  let r, cuerpo = '';
  try { r = await hacer(); cuerpo = await r.text(); } catch (e) { cuerpo = e.message; }
  // «Permitido» = respondió 2xx y, si es una lectura, trajo filas
  const permitido = r?.ok && !(cuerpo.trim() === '[]');
  const bien = permitido === debePermitir;
  if (!bien) fallas++;
  console.log(`${bien ? '✅' : '❌'} ${nombre} → ${r?.status ?? 'error'} ${bien ? '' : cuerpo.slice(0, 160)}`);
}

console.log(`Probando ${URL_SB} con la clave pública…\n`);
await revisar('leer proyectos publicados', true, () => api('/rest/v1/proyectos?select=id&publicado=eq.true'));
await revisar('leer carreras', true, () => api('/rest/v1/carreras?select=id'));
await revisar('leer ajustes (periodo)', true, () => api('/rest/v1/ajustes?select=clave'));
await revisar('registrar un evento válido', true, () => api('/rest/v1/eventos', {
  method: 'POST', headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ sesion: 'prueba-seguridad', tipo: 'visita', datos: { origen: 'prueba' } })
}));
console.log('');
await revisar('leer eventos', false, () => api('/rest/v1/eventos?select=*'));
await revisar('leer administradores', false, () => api('/rest/v1/administradores?select=*'));
await revisar('leer proyectos NO publicados', false, () => api('/rest/v1/proyectos?select=id&publicado=eq.false'));
await revisar('evento con tipo inventado', false, () => api('/rest/v1/eventos', {
  method: 'POST', headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ sesion: 'prueba-seguridad', tipo: 'hackeo', datos: {} })
}));
await revisar('evento gigante (más de 2 KB)', false, () => api('/rest/v1/eventos', {
  method: 'POST', headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ sesion: 'prueba-seguridad', tipo: 'visita', datos: { relleno: 'x'.repeat(5000) } })
}));
await revisar('crear un proyecto', false, () => api('/rest/v1/proyectos', {
  method: 'POST', headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ id: 'intruso', carrera: 'arquitectura', publicado: true, datos: { titulo: 'Intruso' } })
}));
// Un UPDATE/DELETE bloqueado por RLS no da error: simplemente no toca filas. Se pide la fila de vuelta para saberlo.
await revisar('editar un proyecto', false, () => api('/rest/v1/proyectos?id=eq.casa-moderna', {
  method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ orden: 999 })
}));
await revisar('borrar un proyecto', false, () => api('/rest/v1/proyectos?id=eq.casa-moderna', {
  method: 'DELETE', headers: { Prefer: 'return=representation' }
}));
await revisar('cambiar el periodo', false, () => api('/rest/v1/ajustes?clave=eq.periodoActual', {
  method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ valor: 'hackeado' })
}));
await revisar('subir un archivo al bucket imagenes', false, () => api('/storage/v1/object/imagenes/intruso.png', {
  method: 'POST', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array([137, 80, 78, 71])
}));

console.log(fallas ? `\n❌ ${fallas} problema(s). Revisa que hayas corrido 01-esquema.sql completo.` : '\n✅ Todo en orden: la clave pública solo lee lo publicado y registra eventos.');
process.exit(fallas ? 1 : 0);
