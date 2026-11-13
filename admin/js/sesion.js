// =========================================================
// admin/js/sesion.js — inicio de sesión del panel (Supabase Auth)
//
// - Crea el cliente de Supabase con la clave PÚBLICA de js/config.js.
// - exigirAdmin(): si no hay sesión, o la cuenta no está en la tabla
//   «administradores», manda al login. Lo usan todas las páginas del panel.
// - La contraseña NUNCA se guarda en el código: la persona la escribe en el login
//   y Supabase devuelve una sesión (un token temporal que se renueva solo).
// =========================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
import { SUPABASE_URL, SUPABASE_CLAVE_PUBLICA } from '../../js/config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_CLAVE_PUBLICA, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/** ¿La cuenta con sesión está en la tabla «administradores»? (lo responde la base de datos) */
export async function esAdmin() {
  const { data, error } = await supabase.rpc('es_admin');
  if (error) throw error;
  return data === true;
}

/**
 * Para las páginas del panel: devuelve la sesión si es de un admin.
 * Si no hay sesión → login. Si la cuenta no es admin → cierra la sesión y avisa en el login.
 */
export async function exigirAdmin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { irAlLogin(); return new Promise(() => {}); }     // la página no sigue
  let admin = false;
  try { admin = await esAdmin(); } catch (e) { console.error(e); irAlLogin('sin-conexion'); return new Promise(() => {}); }
  if (!admin) { await supabase.auth.signOut(); irAlLogin('sin-permiso'); return new Promise(() => {}); }
  // Si la sesión se cierra en otra pestaña (o vence), vuelve al login
  supabase.auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT' && !saliendo) irAlLogin(); });
  return session;
}

let saliendo = false;      // «Cerrar sesión» ya manda al login con su mensaje: el aviso de arriba no debe repetirlo
export async function cerrarSesion() {
  saliendo = true;
  await supabase.auth.signOut();
  irAlLogin('salio');
}

function irAlLogin(motivo) {
  window.location.replace(`login.html${motivo ? `?motivo=${motivo}` : ''}`);
}

/** Traduce los errores de Supabase a frases simples */
export function mensajeDeError(error) {
  const m = `${error?.message ?? error ?? ''}`.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Esta cuenta aún no está confirmada. En Supabase, márcala como confirmada (Auto Confirm).';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.';
  if (m.includes('password should be') || m.includes('weak')) return 'La contraseña es muy débil: usa al menos 12 caracteres, con letras, números y algún símbolo.';
  if (m.includes('same') && m.includes('password')) return 'La contraseña nueva debe ser distinta de la anterior.';
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) {
    return 'No se pudo conectar con Supabase. Revisa tu internet o si el proyecto está pausado (ver supabase/CONFIGURAR.md).';
  }
  return 'Algo salió mal. Intenta de nuevo en un momento.';
}
