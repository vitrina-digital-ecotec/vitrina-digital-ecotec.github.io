// =========================================================
// admin/js/carreras.js — pestaña «Carreras»: nombre, nombre corto, descripción, ícono y orden
// =========================================================
import { $, $$, escapar, slug, avisar, confirmar, errorAlGuardar } from './util.js';
import { estado, guardarCarrera, borrarCarrera } from './datos-panel.js';
import { iconos } from '../../js/datos.js';

const ICONOS = { arquitectura: 'Edificio', multimedia: 'Cámara', ar: 'Cubo 3D' };
let raiz;

export function iniciarCarreras(seccion) {
  raiz = seccion;
  mostrar();
}

function mostrar() {
  raiz.innerHTML = `
    <div class="seccion-cabecera">
      <h2>Carreras</h2>
      <button type="button" class="boton-panel principal" id="nueva-carrera">+ Nueva carrera</button>
    </div>
    <p class="ayuda">Son las tarjetas de «Elige una carrera» del inicio, en este orden. El nombre corto se usa en botones y filtros.</p>
    <div class="lista-carreras">
      ${estado.carreras.map((c, i) => formulario(c, i)).join('')}
    </div>`;
  $('#nueva-carrera', raiz).addEventListener('click', nueva);
  $$('.form-carrera', raiz).forEach(f => {
    f.addEventListener('submit', (e) => { e.preventDefault(); guardar(f); });
    f.addEventListener('change', (e) => { if (e.target.name === 'icono') $('.icono-vista', f).innerHTML = iconos[e.target.value] ?? ''; });
    f.addEventListener('click', (e) => {
      const accion = e.target.closest('[data-accion]')?.dataset.accion;
      if (accion === 'subir' || accion === 'bajar') mover(f.dataset.id, accion === 'subir' ? -1 : 1);
      if (accion === 'eliminar') eliminar(f.dataset.id);
    });
  });
}

function formulario(c, i) {
  const d = c.datos;
  const n = estado.proyectos.filter(p => p.carrera === c.id).length;
  const p = `c-${c.id}`;
  return `
    <form class="tarjeta-panel form-carrera" data-id="${escapar(c.id)}" novalidate>
      <div class="form-carrera-cabecera">
        <span class="icono-vista" aria-hidden="true">${iconos[d.icono] ?? ''}</span>
        <h3>${escapar(d.nombre || 'Carrera nueva')}</h3>
        <span class="insignia">${n} proyecto${n === 1 ? '' : 's'}</span>
      </div>
      <div class="campo"><label for="${p}-nombre">Nombre</label><input id="${p}-nombre" name="nombre" value="${escapar(d.nombre ?? '')}" required></div>
      <div class="campo"><label for="${p}-corto">Nombre corto</label><input id="${p}-corto" name="nombreCorto" value="${escapar(d.nombreCorto ?? '')}"></div>
      <div class="campo"><label for="${p}-desc">Descripción</label><textarea id="${p}-desc" name="descripcion" rows="2">${escapar(d.descripcion ?? '')}</textarea></div>
      <div class="campo"><label for="${p}-icono">Ícono</label>
        <select id="${p}-icono" name="icono">${Object.entries(ICONOS).map(([id, nombre]) => `<option value="${id}" ${id === d.icono ? 'selected' : ''}>${nombre}</option>`).join('')}</select>
      </div>
      <div class="campo"><label class="interruptor"><input type="checkbox" role="switch" name="publicado" ${c.publicado ? 'checked' : ''}><span class="interruptor-pista" aria-hidden="true"></span> Se ve en la vitrina</label></div>
      <div class="form-carrera-botones">
        <button type="submit" class="boton-panel principal">Guardar</button>
        <span class="botones-orden">
          <button type="button" class="boton-icono" data-accion="subir" aria-label="Subir ${escapar(d.nombre)}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="boton-icono" data-accion="bajar" aria-label="Bajar ${escapar(d.nombre)}" ${i === estado.carreras.length - 1 ? 'disabled' : ''}>↓</button>
        </span>
        <button type="button" class="boton-panel peligro-linea" data-accion="eliminar">Eliminar</button>
      </div>
    </form>`;
}

async function guardar(f) {
  const nombre = f.elements.nombre.value.trim();
  if (!nombre) { avisar('Escribe el nombre de la carrera.', 'error'); f.elements.nombre.focus(); return; }
  const c = estado.carreras.find(x => x.id === f.dataset.id);
  try {
    await guardarCarrera(c.id, {
      publicado: f.elements.publicado.checked,
      datos: { ...c.datos, nombre, nombreCorto: f.elements.nombreCorto.value.trim() || nombre, descripcion: f.elements.descripcion.value.trim(), icono: f.elements.icono.value }
    });
    avisar('Carrera guardada');
    mostrar();
  } catch (error) { avisar(errorAlGuardar(error), 'error'); }
}

async function nueva() {
  let id = 'nueva-carrera', n = 2;
  while (estado.carreras.some(c => c.id === id)) id = `nueva-carrera-${n++}`;
  try {
    await guardarCarrera(slug(id), {
      orden: Math.max(0, ...estado.carreras.map(c => c.orden)) + 1, publicado: false,
      datos: { nombre: '', nombreCorto: '', descripcion: '', icono: 'ar' }
    }, true);
    mostrar();
    $(`[data-id="${CSS.escape(id)}"] [name="nombre"]`, raiz)?.focus();
    avisar('Carrera creada (oculta). Escribe su nombre y guárdala.');
  } catch (error) { avisar(errorAlGuardar(error), 'error'); }
}

async function mover(id, salto) {
  const i = estado.carreras.findIndex(c => c.id === id);
  const a = estado.carreras[i], b = estado.carreras[i + salto];
  if (!b) return;
  try {
    const [oa, ob] = [a.orden, b.orden === a.orden ? a.orden + salto : b.orden];
    await guardarCarrera(a.id, { orden: ob });
    await guardarCarrera(b.id, { orden: oa });
    mostrar();
    $(`[data-id="${CSS.escape(id)}"] [data-accion="${salto < 0 ? 'subir' : 'bajar'}"]`, raiz)?.focus();
  } catch (error) { avisar(errorAlGuardar(error), 'error'); }
}

async function eliminar(id) {
  const c = estado.carreras.find(x => x.id === id);
  const n = estado.proyectos.filter(p => p.carrera === id).length;
  if (n) { avisar(`«${c.datos.nombre}» tiene ${n} proyecto${n === 1 ? '' : 's'}. Muévelos a otra carrera (o elimínalos) antes de borrarla.`, 'error'); return; }
  if (!await confirmar({ titulo: '¿Eliminar esta carrera?', texto: `«${c.datos.nombre || 'Carrera nueva'}» dejará de aparecer en el inicio. No se puede deshacer.`, boton: 'Sí, eliminar', peligro: true })) return;
  try { await borrarCarrera(id); avisar('Carrera eliminada'); mostrar(); } catch (error) { avisar(errorAlGuardar(error), 'error'); }
}
