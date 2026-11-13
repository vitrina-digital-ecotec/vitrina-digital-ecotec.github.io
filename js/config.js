// =========================================================
// config.js — datos de configuración del sitio (los lee todo el sitio)
//
// URL_PUBLICA: la dirección de GitHub Pages. De aquí sale el QR de la placa,
// así el QR apunta al sitio publicado aunque abras la placa en tu compu.
// Desde la Ronda 4 el sitio vive en la organización vitrina-digital-ecotec, en la RAÍZ del dominio.
// Si algún día cambia la dirección (otra organización, dominio propio), se cambia SOLO aquí.
// Debe terminar en «/».
// =========================================================

export const URL_PUBLICA = 'https://vitrina-digital-ecotec.github.io/';

// =========================================================
// Supabase (Fase 5): la base de datos que edita el panel /admin/.
// SUPABASE_URL: «Project URL» (https://xxxx.supabase.co).
// SUPABASE_CLAVE_PUBLICA: la clave PÚBLICA («Publishable key», sb_publishable_…, o la «anon public»).
//   Es pública a propósito: solo permite leer lo publicado y registrar visitas (lo controla RLS).
//   NUNCA pongas aquí la «secret key» ni la «service_role».
// Si quedan vacías, el sitio usa data/proyectos.json (Plan B).
// =========================================================
export const SUPABASE_URL = '';
export const SUPABASE_CLAVE_PUBLICA = '';

/** Dirección que abre la placa. origen: 'qr' (el código impreso) o 'nfc' (el chip, más adelante). */
export function urlDeLaPlaca(origen) {
  return `${URL_PUBLICA}index.html?src=${origen}`;
}
