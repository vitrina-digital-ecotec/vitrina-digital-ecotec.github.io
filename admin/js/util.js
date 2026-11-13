// =========================================================
// admin/js/util.js — herramientas pequeñas que usan todas las pestañas del panel
// =========================================================
export { escapar } from '../../js/datos.js';

export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

/** «Casa Moderna 2» → «casa-moderna-2» (el id que va en la dirección del proyecto) */
export function slug(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'proyecto';
}

/** Mensaje breve abajo de la pantalla («Guardado», «No se pudo guardar…») */
let temporizador;
export function avisar(texto, tipo = 'ok') {
  let caja = document.getElementById('aviso-flotante');
  if (!caja) {
    caja = document.createElement('p');
    caja.id = 'aviso-flotante';
    caja.className = 'aviso-flotante';
    document.body.append(caja);
  }
  caja.textContent = texto;
  caja.dataset.tipo = tipo;
  caja.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  caja.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { caja.hidden = true; }, tipo === 'error' ? 7000 : 3000);
}

/**
 * Ventana de confirmación accesible. Devuelve una promesa: true si la persona confirma.
 *   confirmar({ titulo, texto, boton: 'Eliminar', peligro: true })
 */
export function confirmar({ titulo, texto, boton = 'Aceptar', peligro = false }) {
  return new Promise((resolver) => {
    const anterior = document.activeElement;
    const fondo = document.createElement('div');
    fondo.className = 'dialogo-fondo';
    fondo.innerHTML = `
      <div class="dialogo" role="alertdialog" aria-modal="true" aria-labelledby="dialogo-titulo" aria-describedby="dialogo-texto">
        <h2 id="dialogo-titulo"></h2>
        <p id="dialogo-texto"></p>
        <div class="dialogo-botones">
          <button type="button" class="boton-panel" data-r="no">Cancelar</button>
          <button type="button" class="boton-panel principal ${peligro ? 'peligro' : ''}" data-r="si"></button>
        </div>
      </div>`;
    $('#dialogo-titulo', fondo).textContent = titulo;
    $('#dialogo-texto', fondo).textContent = texto;
    $('[data-r="si"]', fondo).textContent = boton;
    const cerrar = (r) => { fondo.remove(); anterior?.focus?.(); resolver(r); };
    fondo.addEventListener('click', (e) => {
      if (e.target === fondo) cerrar(false);
      const b = e.target.closest('[data-r]');
      if (b) cerrar(b.dataset.r === 'si');
    });
    fondo.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cerrar(false);
      if (e.key === 'Tab') {                       // el foco no se escapa de la ventana
        const botones = $$('button', fondo);
        const i = botones.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); botones.at(-1).focus(); }
        else if (!e.shiftKey && i === botones.length - 1) { e.preventDefault(); botones[0].focus(); }
      }
    });
    document.body.append(fondo);
    $('[data-r="no"]', fondo).focus();             // lo seguro primero
  });
}

/** Traduce los errores de la base de datos a frases simples */
export function errorAlGuardar(error) {
  const m = `${error?.message ?? error ?? ''}`.toLowerCase();
  if (m.includes('duplicate key') || m.includes('already exists')) return 'Ya existe un elemento con esa dirección (id). Cambia el título o el id.';
  if (m.includes('row-level security') || m.includes('permission') || m.includes('jwt')) return 'Tu sesión venció o no tienes permiso. Cierra sesión y vuelve a entrar.';
  if (m.includes('foreign key')) return 'Hay proyectos que usan esta carrera: muévelos a otra carrera antes de borrarla.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sin conexión con Supabase. Revisa tu internet e intenta de nuevo.';
  return 'No se pudo guardar. Intenta de nuevo en un momento.';
}
