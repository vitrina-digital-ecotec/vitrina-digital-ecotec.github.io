// =========================================================
// admin/js/proyectos.js — pestaña «Proyectos» del panel
//
// Lista: miniatura, carrera, tipo, publicado/oculto y botones (editar, ver, subir/bajar,
// publicar/ocultar, eliminar). Editor por secciones con lenguaje simple (hipótesis H4:
// cambiar un proyecto en 15 minutos o menos). Los archivos (imágenes, modelo, video) se
// suben desde la parte 4; los puntos y el asistente, desde la parte 5.
// =========================================================
import { $, $$, escapar, slug, avisar, confirmar, errorAlGuardar } from './util.js';
import { estado, crearProyecto, guardarProyecto, borrarProyecto, intercambiarOrden } from './datos-panel.js';
import { portadaDe, tipoDe } from '../../js/datos.js';

const TIPOS = {
  maqueta: { nombre: 'Maqueta', ayuda: 'Arquitectura: se pone sobre la mesa a escala, con «Ver interior».' },
  escenario: { nombre: 'Escenario', ayuda: 'Un nivel de videojuego o un modelo 3D que se recorre en la mesa.' },
  video: { nombre: 'Video', ayuda: 'Un video que se ve en una pantalla de cine en AR, con su letra.' }
};
const MODOS_VIDEO = { televisor: 'Televisor', 'sin-televisor': 'Sin televisor', 360: '360°' };
const LICENCIAS = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC BY-NC 4.0': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'Sketchfab Standard': 'https://sketchfab.com/licenses'
};

let raiz;                // <section id="seccion-proyectos">
let filtro = 'todas';
let editando = null;     // { fila, nuevo }
let sucio = false;       // hay cambios sin guardar

export function iniciarProyectos(seccion) {
  raiz = seccion;
  window.addEventListener('beforeunload', (e) => { if (sucio) e.preventDefault(); });
  mostrarLista();
}

/** ¿Hay cambios sin guardar? (para avisar antes de cambiar de pestaña) */
export function hayCambiosSinGuardar() { return sucio; }

// =========================================================
// Lista
// =========================================================
function mostrarLista() {
  editando = null;
  sucio = false;
  const carreras = estado.carreras;
  const nombreCarrera = (id) => carreras.find(c => c.id === id)?.datos.nombreCorto ?? carreras.find(c => c.id === id)?.datos.nombre ?? id;
  const lista = estado.proyectos.filter(p => filtro === 'todas' || p.carrera === filtro);

  raiz.innerHTML = `
    <div class="seccion-cabecera">
      <h2>Proyectos</h2>
      <button type="button" class="boton-panel principal" id="nuevo-proyecto">+ Nuevo proyecto</button>
    </div>
    <p class="ayuda">El orden de la lista es el del carrusel del inicio. Los proyectos <strong>ocultos</strong> no se ven en la vitrina.</p>
    <div class="chips-filtro" role="group" aria-label="Filtrar por carrera">
      ${[['todas', 'Todas'], ...carreras.map(c => [c.id, c.datos.nombreCorto ?? c.datos.nombre])].map(([id, nombre]) =>
        `<button type="button" class="chip" data-filtro="${escapar(id)}" aria-pressed="${filtro === id}">${escapar(nombre)}</button>`).join('')}
    </div>
    <ul class="lista-proyectos">
      ${lista.map(p => {
        const d = p.datos;
        const i = estado.proyectos.indexOf(p);
        const portada = portadaDe(d);
        return `
        <li class="tarjeta-proyecto" data-id="${escapar(p.id)}">
          <div class="tarjeta-proyecto-img">${portada ? `<img src="${escapar(urlSitio(portada))}" alt="" loading="lazy">` : '<span aria-hidden="true">Sin imagen</span>'}</div>
          <div class="tarjeta-proyecto-texto">
            <h3>${escapar(d.titulo || 'Sin título')}</h3>
            <p>${escapar(nombreCarrera(p.carrera))} · ${escapar(TIPOS[tipoDe(d)]?.nombre ?? '')}</p>
            <p class="insignias">
              <span class="insignia ${p.publicado ? 'publicado' : 'oculto'}">${p.publicado ? 'Publicado' : 'Oculto'}</span>
              ${d.ejemplo ? '<span class="insignia ejemplo">Ejemplo</span>' : ''}
            </p>
          </div>
          <div class="tarjeta-proyecto-acciones">
            <button type="button" class="boton-panel principal" data-accion="editar">Editar</button>
            <a class="boton-panel" href="../proyecto.html?id=${encodeURIComponent(p.id)}&vista=previa" target="_blank" rel="noopener">Ver en el sitio ↗</a>
            <button type="button" class="boton-panel" data-accion="publicar">${p.publicado ? 'Ocultar' : 'Publicar'}</button>
            <span class="botones-orden">
              <button type="button" class="boton-icono" data-accion="subir" aria-label="Subir «${escapar(d.titulo)}» en el orden" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="boton-icono" data-accion="bajar" aria-label="Bajar «${escapar(d.titulo)}» en el orden" ${i === estado.proyectos.length - 1 ? 'disabled' : ''}>↓</button>
            </span>
            <button type="button" class="boton-panel peligro-linea" data-accion="eliminar">Eliminar</button>
          </div>
        </li>`;
      }).join('') || '<li class="vacio">No hay proyectos en esta carrera.</li>'}
    </ul>`;

  $('#nuevo-proyecto', raiz).addEventListener('click', () => abrirEditor(null));
  $$('[data-filtro]', raiz).forEach(b => b.addEventListener('click', () => { filtro = b.dataset.filtro; mostrarLista(); }));
  $('.lista-proyectos', raiz).addEventListener('click', async (e) => {
    const boton = e.target.closest('[data-accion]');
    if (!boton) return;
    const fila = estado.proyectos.find(p => p.id === boton.closest('[data-id]').dataset.id);
    const accion = boton.dataset.accion;
    if (accion === 'editar') return abrirEditor(fila);
    boton.disabled = true;
    try {
      if (accion === 'publicar') await cambiarPublicado(fila, !fila.publicado);
      if (accion === 'eliminar') await eliminar(fila);
      if (accion === 'subir' || accion === 'bajar') {
        const i = estado.proyectos.indexOf(fila);
        const otro = estado.proyectos[accion === 'subir' ? i - 1 : i + 1];
        if (otro) { await intercambiarOrden(fila, otro); avisar('Orden guardado'); }
      }
    } catch (error) {
      avisar(errorAlGuardar(error), 'error');
    }
    mostrarLista();
    $(`[data-id="${CSS.escape(fila.id)}"] [data-accion="${accion}"]`, raiz)?.focus();
  });
}

async function cambiarPublicado(fila, publicar) {
  if (publicar) {
    const falta = faltaParaPublicar(fila.datos, fila.carrera);
    if (falta.length) { avisar(`Para publicarlo falta: ${falta.join(', ')}.`, 'error'); return; }
  }
  await guardarProyecto(fila.id, { publicado: publicar });
  avisar(publicar ? 'Publicado: ya se ve en la vitrina' : 'Oculto: ya no se ve en la vitrina');
}

async function eliminar(fila) {
  const si = await confirmar({
    titulo: '¿Eliminar este proyecto?',
    texto: `«${fila.datos.titulo}» se borrará de la vitrina y del panel. No se puede deshacer. Si solo quieres quitarlo por un tiempo, usa «Ocultar».`,
    boton: 'Sí, eliminar', peligro: true
  });
  if (!si) return;
  await borrarProyecto(fila.id);
  avisar('Proyecto eliminado');
}

/** Lo mínimo para que el proyecto se vea bien en la vitrina */
function faltaParaPublicar(d, carrera) {
  const falta = [];
  if (!d.titulo?.trim()) falta.push('el título');
  if (!carrera) falta.push('la carrera');
  if (!portadaDe(d)) falta.push('la imagen de portada');
  if (tipoDe(d) === 'video') {
    if (!d.video) falta.push('el video');
  } else {
    if (!d.ar?.modelo) falta.push('el modelo 3D');
    if (!d.ar?.alt?.trim()) falta.push('una descripción breve del modelo (la escuchan las personas con discapacidad visual)');
  }
  return falta;
}

/** Las rutas del JSON son relativas al sitio (modelos/…); desde /admin/ hay que subir un nivel */
function urlSitio(ruta) { return /^https?:/.test(ruta) ? ruta : `../${ruta}`; }

// =========================================================
// Editor
// =========================================================
function abrirEditor(fila) {
  const nuevo = !fila;
  const d = nuevo ? {} : structuredClone(fila.datos);
  editando = { fila, nuevo, datos: d };
  const tipo = nuevo ? 'maqueta' : tipoDe(d);
  const carreraActual = fila?.carrera ?? estado.carreras[0]?.id;
  const cm = d.creditoModelo;
  const creditos = creditosComoLista(d.creditos);

  raiz.innerHTML = `
    <form class="editor" id="editor" novalidate>
      <div class="editor-cabecera">
        <button type="button" class="enlace" id="volver-lista"><span aria-hidden="true">←</span> Volver a la lista</button>
        <h2>${nuevo ? 'Nuevo proyecto' : `Editar: ${escapar(d.titulo)}`}</h2>
      </div>

      <fieldset class="bloque">
        <legend>Lo básico</legend>
        ${campo('titulo', 'Título del proyecto', d.titulo, { requerido: true })}
        ${nuevo ? `
          <div class="campo">
            <label for="f-id">Nombre en la dirección web</label>
            <input id="f-id" name="direccion" pattern="[a-z0-9-]+" spellcheck="false" aria-describedby="vista-direccion">
            <p class="ayuda" id="vista-direccion">Se crea solo con el título. Solo letras minúsculas, números y guiones. Después no se puede cambiar.</p>
          </div>` : ''}
        <div class="campo">
          <label for="f-carrera">Carrera</label>
          <select id="f-carrera" name="carrera">
            ${estado.carreras.map(c => `<option value="${escapar(c.id)}" ${c.id === carreraActual ? 'selected' : ''}>${escapar(c.datos.nombre)}</option>`).join('')}
          </select>
        </div>
        <fieldset class="campo opciones-tipo">
          <legend>Tipo de experiencia</legend>
          ${Object.entries(TIPOS).map(([id, t]) => {
            // Una maqueta puede pasar a escenario y al revés; un video no (su AR es otra)
            const bloqueado = !nuevo && ((tipo === 'video') !== (id === 'video'));
            return `
            <label class="opcion ${bloqueado ? 'bloqueada' : ''}">
              <input type="radio" name="tipo" value="${id}" ${id === tipo ? 'checked' : ''} ${bloqueado ? 'disabled' : ''}>
              <span><strong>${t.nombre}</strong><small>${t.ayuda}</small></span>
            </label>`;
          }).join('')}
        </fieldset>
        ${campo('estudiante', 'Estudiante(s)', d.estudiante, { ayuda: 'Si son varios, sepáralos con comas.' })}
        ${campo('materia', 'Materia', d.materia)}
        <div class="campo">
          <label for="f-periodo">Periodo</label>
          <div class="campo-con-boton">
            <input id="f-periodo" name="periodo" value="${escapar(d.periodo ?? '')}">
            <button type="button" class="boton-panel" id="usar-periodo">Usar el periodo actual</button>
          </div>
        </div>
        ${campo('ubicacion', 'Ubicación (opcional)', d.ubicacion, { ayuda: 'Por ejemplo: Campus Samborondón.' })}
        ${campo('descripcion', 'Descripción', d.descripcion, { area: true, ayuda: 'Dos o tres frases: qué es y qué lo hace especial.' })}
      </fieldset>

      <fieldset class="bloque">
        <legend>Cómo se muestra</legend>
        ${interruptor('ejemplo', 'Mostrar la etiqueta «PROYECTO DE EJEMPLO»', !!d.ejemplo, 'Úsala si el proyecto no es de un estudiante real o tiene datos de ejemplo.')}
        ${interruptor('publicado', 'Publicado (se ve en la vitrina)', fila?.publicado ?? false, nuevo ? 'Un proyecto nuevo empieza oculto: publícalo cuando tenga su imagen y su modelo o video.' : '')}
      </fieldset>

      <fieldset class="bloque">
        <legend>Créditos</legend>
        <p class="ayuda">Quién hizo qué. Por ejemplo: «Desarrollo» → «Modelado en Blender».</p>
        <div class="filas" id="filas-creditos">${creditos.map(filaCredito).join('')}</div>
        <button type="button" class="boton-panel" data-agregar="credito">+ Agregar crédito</button>
      </fieldset>

      <fieldset class="bloque">
        <legend>Modelo 3D de otra persona (licencia)</legend>
        ${interruptor('usa-modelo-ajeno', 'Este proyecto usa un modelo 3D de otra persona', !!cm, 'Las licencias como CC BY piden nombrar al autor y la licencia.')}
        <div id="campos-licencia" ${cm ? '' : 'hidden'}>
          ${campo('cm-titulo', 'Nombre del modelo original', cm?.titulo)}
          ${campo('cm-autor', 'Autor original', cm?.autor)}
          ${campo('cm-plataforma', 'Sitio de donde se descargó', cm?.plataforma, { ayuda: 'Por ejemplo: Sketchfab.' })}
          ${campo('cm-url', 'Enlace al modelo original', cm?.url, { tipo: 'url' })}
          <div class="campo">
            <label for="f-cm-licencia">Licencia</label>
            <select id="f-cm-licencia" name="cm-licencia">
              ${[...Object.keys(LICENCIAS), 'Otra'].map(l => `<option ${l === licenciaElegida(cm) ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div id="licencia-otra" ${licenciaElegida(cm) === 'Otra' ? '' : 'hidden'}>
            ${campo('cm-licencia-otra', 'Nombre de la licencia', licenciaElegida(cm) === 'Otra' ? cm.licencia : '')}
            ${campo('cm-licencia-url', 'Enlace a la licencia', cm?.licenciaUrl, { tipo: 'url' })}
          </div>
          ${campo('cm-adaptacion', 'Adaptación (quién lo modificó)', cm?.adaptacion)}
          ${campo('cm-cambios', 'Qué se cambió', cm?.cambios, { area: true })}
        </div>
      </fieldset>

      <fieldset class="bloque" data-solo="maqueta escenario">
        <legend>Realidad aumentada</legend>
        ${campo('escala', 'Escala', d.ar?.escala, { ayuda: 'Por ejemplo: 1:25 (la maqueta es 25 veces más chica que la obra real).' })}
        ${campo('alt', 'Descripción breve del modelo', d.ar?.alt, { area: true, ayuda: 'Una frase que cuente qué se ve. La escuchan las personas con discapacidad visual.' })}
        <h3 class="subtitulo">Botón «Ver interior»</h3>
        <p class="ayuda">Cada toque al botón corta el modelo a una altura (por ejemplo, para quitar el techo). La altura se mide en centímetros desde la base de la maqueta. Si no agregas ninguno, el botón no aparece.</p>
        ${campo('texto-completa', 'Texto del botón con el modelo completo', d.ar?.textoCompleta ?? 'Completa')}
        <div class="filas" id="filas-cortes">${(d.ar?.cortes ?? []).map(filaCorte).join('')}</div>
        <button type="button" class="boton-panel" data-agregar="corte">+ Agregar corte</button>
      </fieldset>

      <fieldset class="bloque" data-solo="video">
        <legend>Video en realidad aumentada</legend>
        ${campo('escala-video', 'Tamaño de la pantalla', d.ar?.escala ?? '60 cm de ancho')}
        ${campo('alt-video', 'Descripción breve de la pantalla', d.ar?.alt ?? 'Televisor retro con una pantalla de cine que reproduce el video del proyecto', { area: true, ayuda: 'La escuchan las personas con discapacidad visual.' })}
        <fieldset class="campo">
          <legend>Modos que puede elegir el visitante</legend>
          ${Object.entries(MODOS_VIDEO).map(([id, nombre]) => `
            <label class="casilla"><input type="checkbox" name="modos" value="${id}" ${(d.ar?.modos ?? Object.keys(MODOS_VIDEO)).includes(id) ? 'checked' : ''}> ${nombre}</label>`).join('')}
        </fieldset>
        <fieldset class="campo">
          <legend>Modo con el que empieza</legend>
          ${['televisor', 'sin-televisor'].map(id => `
            <label class="casilla"><input type="radio" name="modo-inicial" value="${id}" ${(d.ar?.modoInicial ?? 'televisor') === id ? 'checked' : ''}> ${MODOS_VIDEO[id]}</label>`).join('')}
        </fieldset>
      </fieldset>

      <fieldset class="bloque" data-solo="video">
        <legend>Letra de la canción</legend>
        <p class="ayuda">Aparece completa en la ficha. Escribe cada sección (Verso 1, Coro…) con una línea de la letra por renglón.</p>
        <div class="filas" id="filas-letra">${(d.letra ?? []).map(filaLetra).join('')}</div>
        <button type="button" class="boton-panel" data-agregar="letra">+ Agregar sección</button>
      </fieldset>

      <fieldset class="bloque">
        <legend>Archivos</legend>
        <p class="ayuda">Las imágenes, el modelo 3D, el video y los subtítulos se van a subir desde aquí en la próxima actualización del panel. Por ahora se muestran los que ya tiene:</p>
        <ul class="archivos-actuales">${listaArchivos(d)}</ul>
      </fieldset>

      <div class="editor-pie">
        <button type="button" class="boton-panel" id="cancelar-edicion">Cancelar</button>
        <button type="submit" class="boton-panel principal">${nuevo ? 'Crear proyecto' : 'Guardar cambios'}</button>
      </div>
    </form>`;

  const form = $('#editor', raiz);
  mostrarSegunTipo(form);
  form.addEventListener('input', () => { sucio = true; });
  form.addEventListener('change', (e) => {
    sucio = true;
    if (e.target.name === 'tipo') mostrarSegunTipo(form);
    if (e.target.name === 'usa-modelo-ajeno') $('#campos-licencia', form).hidden = !e.target.checked;
    if (e.target.name === 'cm-licencia') $('#licencia-otra', form).hidden = e.target.value !== 'Otra';
  });
  if (nuevo) {
    // La dirección se arma sola con el título, hasta que la persona la cambie a mano
    let idAMano = false;
    $('#f-id', form).addEventListener('input', () => { idAMano = true; });
    const mostrarDireccion = () => { $('#vista-direccion', form).textContent = `Quedará así: …/proyecto.html?id=${$('#f-id', form).value || '…'}. Se crea solo con el título; usa solo letras minúsculas, números y guiones. Después no se puede cambiar.`; };
    $('#f-titulo', form).addEventListener('input', (e) => { if (!idAMano) $('#f-id', form).value = idLibre(slug(e.target.value)); mostrarDireccion(); });
    $('#f-id', form).addEventListener('input', mostrarDireccion);
  }
  $('#usar-periodo', form).addEventListener('click', () => { $('#f-periodo', form).value = estado.ajustes.periodoActual ?? ''; sucio = true; });
  form.addEventListener('click', (e) => {
    const agregar = e.target.closest('[data-agregar]')?.dataset.agregar;
    if (agregar) {
      const destino = { credito: ['#filas-creditos', filaCredito, { etiqueta: '', texto: '' }], corte: ['#filas-cortes', filaCorte, { nombre: '', altura: '' }], letra: ['#filas-letra', filaLetra, { seccion: '', lineas: [] }] }[agregar];
      $(destino[0], form).insertAdjacentHTML('beforeend', destino[1](destino[2]));
      $(destino[0], form).lastElementChild.querySelector('input, textarea')?.focus();
      sucio = true;
    }
    const filaBoton = e.target.closest('[data-fila]');
    if (filaBoton) {
      const filaEl = filaBoton.closest('.fila');
      if (filaBoton.dataset.fila === 'quitar') filaEl.remove();
      if (filaBoton.dataset.fila === 'subir') filaEl.previousElementSibling?.before(filaEl);
      if (filaBoton.dataset.fila === 'bajar') filaEl.nextElementSibling?.after(filaEl);
      filaBoton.focus();
      sucio = true;
    }
  });
  const salir = async () => {
    if (sucio && !await confirmar({ titulo: '¿Salir sin guardar?', texto: 'Los cambios que hiciste se perderán.', boton: 'Salir sin guardar', peligro: true })) return;
    sucio = false;
    mostrarLista();
  };
  $('#volver-lista', form).addEventListener('click', salir);
  $('#cancelar-edicion', form).addEventListener('click', salir);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await guardar(form);
  });
  $('#f-titulo', form).focus();
  window.scrollTo({ top: 0 });
}

async function guardar(form) {
  const { fila, nuevo } = editando;
  const datos = leerFormulario(form, editando.datos);
  const carrera = form.elements.carrera.value;
  const publicado = form.elements.publicado.checked;
  // Validación con mensajes claros, junto al campo
  $$('.error-campo', form).forEach(el => el.remove());
  const errores = [];
  if (!datos.titulo) errores.push(['titulo', 'Escribe el título del proyecto.']);
  const id = nuevo ? form.elements.direccion.value.trim() : fila.id;
  if (nuevo && !/^[a-z0-9-]+$/.test(id)) errores.push(['direccion', 'Usa solo letras minúsculas, números y guiones.']);
  if (nuevo && estado.proyectos.some(p => p.id === id)) errores.push(['direccion', 'Ya hay un proyecto con esta dirección. Cambia una palabra.']);
  $$('#filas-cortes .fila', form).forEach((f, i) => {
    if (!$('[name="corte-nombre"]', f).value.trim() || !(Number($('[name="corte-altura"]', f).value) > 0)) errores.push([null, `Al corte ${i + 1} le falta el nombre o la altura.`]);
  });
  if (publicado) faltaParaPublicar(datos, carrera).forEach(f => errores.push([null, `Para publicarlo falta ${f} (o desmarca «Publicado»).`]));
  if (errores.length) {
    for (const [nombre, texto] of errores) {
      const destino = nombre ? form.elements[nombre]?.closest('.campo') : $('.editor-pie', form);
      destino.insertAdjacentHTML(nombre ? 'beforeend' : 'beforebegin', `<p class="error-campo" role="alert">${escapar(texto)}</p>`);
    }
    $('.error-campo', form).scrollIntoView({ block: 'center', behavior: 'smooth' });
    form.elements[errores[0][0]]?.focus();
    return;
  }

  const boton = $('button[type="submit"]', form);
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    if (nuevo) await crearProyecto({ id, carrera, publicado, datos });
    else await guardarProyecto(fila.id, { carrera, publicado, datos });
    sucio = false;
    avisar(nuevo ? 'Proyecto creado. Ahora súbele su imagen y su modelo o video.' : 'Cambios guardados: ya se ven en la vitrina');
    mostrarLista();
  } catch (error) {
    console.error(error);
    avisar(errorAlGuardar(error), 'error');
    boton.disabled = false;
    boton.textContent = nuevo ? 'Crear proyecto' : 'Guardar cambios';
  }
}

/** Arma los datos del proyecto con lo del formulario. Los campos que el formulario no toca se conservan. */
function leerFormulario(form, original) {
  const v = (nombre) => form.elements[nombre]?.value.trim() ?? '';
  const tipo = form.elements.tipo.value;
  const d = structuredClone(original);
  Object.assign(d, {
    tipo, titulo: v('titulo'), estudiante: v('estudiante'), materia: v('materia'), periodo: v('periodo'),
    ubicacion: v('ubicacion'), descripcion: v('descripcion')
  });
  d.imagenes ??= [];
  d.portada ??= '';
  if (form.elements.ejemplo.checked) d.ejemplo = true; else delete d.ejemplo;

  const creditos = $$('#filas-creditos .fila', form)
    .map(f => ({ etiqueta: $('[name="credito-etiqueta"]', f).value.trim(), texto: $('[name="credito-texto"]', f).value.trim() }))
    .filter(c => c.etiqueta || c.texto);
  if (creditos.length) d.creditos = creditos; else delete d.creditos;

  if (form.elements['usa-modelo-ajeno'].checked) {
    const licencia = v('cm-licencia') === 'Otra' ? v('cm-licencia-otra') : v('cm-licencia');
    d.creditoModelo = {
      titulo: v('cm-titulo'), autor: v('cm-autor'), plataforma: v('cm-plataforma'), url: v('cm-url'),
      licencia, licenciaUrl: LICENCIAS[licencia] ?? v('cm-licencia-url'),
      adaptacion: v('cm-adaptacion'), cambios: v('cm-cambios')
    };
  } else delete d.creditoModelo;

  d.ar ??= { puntos: [] };
  d.ar.puntos ??= [];
  d.ar.modeloIOS ??= '';
  if (tipo === 'video') {
    d.ar.modelo ||= 'modelos/pantalla-cine.glb';     // el televisor del cine es el mismo para todos los videos
    d.ar.escala = v('escala-video');
    d.ar.alt = v('alt-video');
    d.ar.modos = $$('[name="modos"]:checked', form).map(c => c.value);
    if (!d.ar.modos.length) d.ar.modos = ['televisor'];
    d.ar.modoInicial = form.elements['modo-inicial'].value;
    const letra = $$('#filas-letra .fila', form).map(f => ({
      seccion: $('[name="letra-seccion"]', f).value.trim(),
      lineas: $('[name="letra-lineas"]', f).value.split('\n').map(l => l.trim()).filter(Boolean)
    })).filter(b => b.seccion || b.lineas.length);
    d.letra = letra;
    d.video ??= '';
    d.poster ??= '';
  } else {
    d.ar.modelo ??= '';
    d.ar.escala = v('escala');
    d.ar.alt = v('alt');
    d.ar.cortes = $$('#filas-cortes .fila', form).map(f => ({
      nombre: $('[name="corte-nombre"]', f).value.trim(),
      altura: Math.round(Number($('[name="corte-altura"]', f).value) * 10) / 1000     // cm → metros
    }));
    const completa = v('texto-completa');
    if (completa && completa !== 'Completa') d.ar.textoCompleta = completa; else delete d.ar.textoCompleta;
  }
  return d;
}

// ---------- Piezas del formulario ----------
function campo(nombre, etiqueta, valor = '', { requerido = false, area = false, ayuda = '', tipo = 'text' } = {}) {
  const id = `f-${nombre}`;
  const control = area
    ? `<textarea id="${id}" name="${nombre}" rows="3">${escapar(valor ?? '')}</textarea>`
    : `<input id="${id}" name="${nombre}" type="${tipo}" value="${escapar(valor ?? '')}" ${requerido ? 'required aria-required="true"' : ''}>`;
  return `<div class="campo"><label for="${id}">${etiqueta}${requerido ? ' <span class="requerido">(obligatorio)</span>' : ''}</label>${control}${ayuda ? `<p class="ayuda">${ayuda}</p>` : ''}</div>`;
}

function interruptor(nombre, etiqueta, activo, ayuda = '') {
  return `<div class="campo"><label class="interruptor"><input type="checkbox" role="switch" name="${nombre}" ${activo ? 'checked' : ''}><span class="interruptor-pista" aria-hidden="true"></span> ${etiqueta}</label>${ayuda ? `<p class="ayuda">${ayuda}</p>` : ''}</div>`;
}

const botonesFila = (que) => `
  <span class="fila-botones">
    <button type="button" class="boton-icono" data-fila="subir" aria-label="Subir ${que}">↑</button>
    <button type="button" class="boton-icono" data-fila="bajar" aria-label="Bajar ${que}">↓</button>
    <button type="button" class="boton-icono quitar" data-fila="quitar" aria-label="Quitar ${que}">✕</button>
  </span>`;

function filaCredito(c) {
  return `<div class="fila">
    <label>Qué hizo <input name="credito-etiqueta" value="${escapar(c.etiqueta)}" placeholder="Desarrollo"></label>
    <label class="ancha">Quién o cómo <input name="credito-texto" value="${escapar(c.texto)}" placeholder="Modelado en Blender"></label>
    ${botonesFila('este crédito')}</div>`;
}

function filaCorte(c) {
  const cm = c.altura === '' ? '' : Math.round(c.altura * 1000) / 10;
  return `<div class="fila">
    <label class="ancha">Texto del botón <input name="corte-nombre" value="${escapar(c.nombre)}" placeholder="Sin techo"></label>
    <label>Altura (cm) <input name="corte-altura" type="number" min="0.1" step="0.1" inputmode="decimal" value="${cm}"></label>
    ${botonesFila('este corte')}</div>`;
}

function filaLetra(b) {
  return `<div class="fila fila-letra">
    <label>Sección <input name="letra-seccion" value="${escapar(b.seccion)}" placeholder="Coro"></label>
    <label class="ancha">Letra (una línea por renglón) <textarea name="letra-lineas" rows="4">${escapar(b.lineas.join('\n'))}</textarea></label>
    ${botonesFila('esta sección')}</div>`;
}

function listaArchivos(d) {
  const filas = [
    ['Imagen de portada', d.portada],
    d.tipo === 'video' || d.video ? ['Video', d.video] : ['Modelo 3D', d.ar?.modelo],
    d.tipo === 'video' || d.video ? ['Póster del video', d.poster] : ['Modelo liviano del carrusel', d.ar?.modeloHero],
    d.subtitulos ? ['Subtítulos (.vtt)', d.subtitulos] : null,
    d.galeria?.imagenes?.length ? [d.galeria.titulo ?? 'Galería', `${d.galeria.imagenes.length} imágenes`] : null
  ].filter(Boolean);
  // El modelo liviano es opcional: sin él, el carrusel usa el modelo normal
  const opcional = { 'Modelo liviano del carrusel': 'no tiene (el carrusel usa el modelo normal)' };
  return filas.map(([nombre, valor]) => `<li><span>${escapar(nombre)}</span> ${valor ? `<code>${escapar(valor)}</code>` : opcional[nombre] ? escapar(opcional[nombre]) : '<em>falta</em>'}</li>`).join('');
}

/** Los créditos de la canción (formato antiguo) se pasan a la lista de «qué hizo / quién» */
function creditosComoLista(c) {
  if (!c) return [];
  if (Array.isArray(c)) return c;
  const nombres = { letra: 'Letra', musica: 'Música', origen: 'Origen', animacion: 'Animación' };
  return Object.entries(c).filter(([, v]) => v).map(([k, v]) => ({ etiqueta: nombres[k] ?? k, texto: v }));
}

function mostrarSegunTipo(form) {
  const tipo = form.elements.tipo.value;
  $$('[data-solo]', form).forEach(b => {
    b.hidden = !b.dataset.solo.split(' ').includes(tipo);
    $$('input, textarea, select', b).forEach(c => { c.disabled = b.hidden; });
  });
}

/** Licencia que aparece elegida: una de la lista, «Otra» o, si es nuevo, CC BY 4.0 */
function licenciaElegida(cm) {
  if (!cm?.licencia) return 'CC BY 4.0';
  return cm.licencia in LICENCIAS ? cm.licencia : 'Otra';
}

function idLibre(base) {
  let id = base, n = 2;
  while (estado.proyectos.some(p => p.id === id)) id = `${base}-${n++}`;
  return id;
}
