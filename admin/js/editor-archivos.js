// =========================================================
// admin/js/editor-archivos.js — sección «Imágenes, modelo y video» del editor de proyectos
//
// Portada · Modelo 3D (se optimiza en el navegador) · Galería (planos o páginas) ·
// Video, póster y subtítulos. Cada archivo se sube apenas se elige (con barra de progreso),
// pero el proyecto cambia recién al tocar «Guardar cambios». Si se cancela, lo subido se borra.
// =========================================================
import { $, $$, escapar, avisar } from './util.js';
import { subir, aWebP, extension, ErrorAmable, LIMITES } from './archivos.js';

let ctx;   // { form, datos, id(), alCambiar(), subidos:Set }

const urlVista = (ruta) => (!ruta ? '' : /^https?:/.test(ruta) ? ruta : `../${ruta}`);
const nombreArchivo = (ruta) => decodeURIComponent((ruta ?? '').split('/').pop()).replace(/-[a-z0-9]{6,9}(\.\w+)$/, '$1');

export function htmlArchivos(d) {
  const g = d.galeria ?? { titulo: '', estilo: 'planos', imagenes: [] };
  const tituloSugerido = !g.titulo;      // sin título: se sugiere uno según el tipo (y cambia si cambia el tipo)
  return `
    <fieldset class="bloque" id="bloque-archivos">
      <legend>Imágenes, modelo y video</legend>

      <div class="archivo" data-archivo="portada">
        <div class="archivo-vista">${d.portada ? `<img src="${escapar(urlVista(d.portada))}" alt="">` : '<span>Sin imagen</span>'}</div>
        <div class="archivo-texto">
          <h3 class="subtitulo">Imagen de portada</h3>
          <p class="ayuda">Se ve en la tarjeta del proyecto y de fondo en su ficha. Se achica sola para que cargue rápido. Si subes un modelo 3D y no hay portada, se usa una foto del modelo.</p>
          <label class="boton-panel boton-archivo">Elegir imagen…<input type="file" accept="image/jpeg,image/png,image/webp" data-subir="portada" class="solo-lector"></label>
          <div class="progreso-archivo" hidden><progress max="1" value="0"></progress><span></span></div>
        </div>
      </div>

      <div class="archivo" data-archivo="modelo" data-solo="maqueta escenario">
        <div class="archivo-vista">${d.ar?.poster ? `<img src="${escapar(urlVista(d.ar.poster))}" alt="">` : '<span>Sin modelo</span>'}</div>
        <div class="archivo-texto">
          <h3 class="subtitulo">Modelo 3D</h3>
          <p class="estado-archivo">${d.ar?.modelo ? `Actual: <strong>${escapar(nombreArchivo(d.ar.modelo))}</strong>` : 'Todavía no tiene modelo 3D.'}</p>
          <p class="ayuda">Exporta desde Blender en <strong>.glb</strong> (Archivo → Exportar → glTF 2.0). El panel lo prepara para el celular: lo pone a escala, lo hace más liviano y crea la versión del carrusel. El archivo original no se sube. Con modelos muy grandes, hazlo desde una computadora.</p>
          <label class="boton-panel boton-archivo">Elegir modelo .glb…<input type="file" accept=".glb,model/gltf-binary" data-subir="modelo" class="solo-lector"></label>
          <div class="panel-modelo" hidden></div>
          <div class="progreso-archivo" hidden><progress max="1" value="0"></progress><span></span></div>
        </div>
      </div>

      <div data-solo="video">
        <div class="archivo" data-archivo="video">
          <div class="archivo-vista">${d.poster ? `<img src="${escapar(urlVista(d.poster))}" alt="">` : '<span>Sin video</span>'}</div>
          <div class="archivo-texto">
            <h3 class="subtitulo">Video</h3>
            <p class="estado-archivo">${d.video ? `Actual: <strong>${escapar(nombreArchivo(d.video))}</strong>` : 'Todavía no tiene video.'}</p>
            <p class="ayuda">MP4 de hasta 50 MB (en 720p alcanza y carga mejor en el celular).</p>
            <label class="boton-panel boton-archivo">Elegir video…<input type="file" accept="video/mp4,video/webm" data-subir="video" class="solo-lector"></label>
            <div class="panel-modelo panel-ayuda" role="status" hidden></div>
            <div class="progreso-archivo" hidden><progress max="1" value="0"></progress><span></span></div>
          </div>
        </div>
        <div class="archivo" data-archivo="poster">
          <div class="archivo-vista">${d.poster ? `<img src="${escapar(urlVista(d.poster))}" alt="">` : '<span>Sin póster</span>'}</div>
          <div class="archivo-texto">
            <h3 class="subtitulo">Imagen de espera del video (póster)</h3>
            <p class="ayuda">Se ve antes de darle «play» y en la pantalla del televisor del carrusel. Mejor una imagen horizontal (16:9).</p>
            <label class="boton-panel boton-archivo">Elegir imagen…<input type="file" accept="image/jpeg,image/png,image/webp" data-subir="poster" class="solo-lector"></label>
            <div class="progreso-archivo" hidden><progress max="1" value="0"></progress><span></span></div>
          </div>
        </div>
        <div class="archivo" data-archivo="subtitulos">
          <div class="archivo-vista"><span>CC</span></div>
          <div class="archivo-texto">
            <h3 class="subtitulo">Subtítulos de la letra (.vtt)</h3>
            <p class="estado-archivo">${d.subtitulos ? `Actual: <strong>${escapar(nombreArchivo(d.subtitulos))}</strong>` : 'Sin subtítulos.'}</p>
            <p class="ayuda">Archivo .vtt con los tiempos de cada línea. Lo usan la letra que aparece en la AR y el botón «CC» del video.</p>
            <label class="boton-panel boton-archivo">Elegir archivo .vtt…<input type="file" accept=".vtt,text/vtt" data-subir="subtitulos" class="solo-lector"></label>
            <div class="progreso-archivo" hidden><progress max="1" value="0"></progress><span></span></div>
          </div>
        </div>
      </div>

      <h3 class="subtitulo">Galería de imágenes <span class="opcional">(opcional)</span></h3>
      <p class="ayuda">Aparece en la ficha; al tocar una imagen se ve en grande con zoom. Cada imagen lleva una descripción para personas ciegas o con baja visión: el panel sugiere una y tú puedes mejorarla.</p>
      <div class="campo"><label for="f-galeria-titulo">Título de la galería <span class="opcional">(opcional)</span></label><input id="f-galeria-titulo" name="galeria-titulo" value="${escapar(g.titulo || tituloGaleria(d.tipo ?? 'maqueta', g.estilo))}" ${tituloSugerido ? 'data-sugerido="1"' : ''}></div>
      <fieldset class="campo">
        <legend>Forma de las imágenes</legend>
        <label class="casilla"><input type="radio" name="galeria-estilo" value="planos" ${g.estilo !== 'documento' ? 'checked' : ''}> Planos (verticales u horizontales)</label>
        <label class="casilla"><input type="radio" name="galeria-estilo" value="documento" ${g.estilo === 'documento' ? 'checked' : ''}> Páginas de una presentación o documento (16:9)</label>
      </fieldset>
      <div class="filas" id="filas-galeria">${(g.imagenes ?? []).map((img, i) => filaGaleria(img, i + 1)).join('')}</div>
      <label class="boton-panel boton-archivo">+ Agregar imágenes…<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-subir="galeria" class="solo-lector"></label>
      <div class="progreso-archivo" id="progreso-galeria" hidden><progress max="1" value="0"></progress><span></span></div>
    </fieldset>`;
}

/** Título sugerido de la galería: «Planos» en maquetas, «Galería» en escenarios y videos, «Documento» si son páginas */
export function tituloGaleria(tipo, estilo) {
  if (estilo === 'documento') return 'Documento';
  return tipo === 'maqueta' ? 'Planos' : 'Galería';
}

/** Una imagen de la galería. sugerido: la descripción la escribió el panel (la persona puede mejorarla) */
function filaGaleria(img, n = 1, sugerido = false) {
  return `<div class="fila fila-galeria" data-src="${escapar(img.src)}" data-mini="${escapar(img.mini ?? img.src)}">
    <img class="fila-mini" src="${escapar(urlVista(img.mini ?? img.src))}" alt="">
    <div class="fila-campos">
      <label>Título <span class="opcional">(opcional)</span> <input name="galeria-img-titulo" value="${escapar(img.titulo ?? '')}" placeholder="Imagen ${n}"></label>
      <label>Descripción de la imagen (para personas ciegas o con baja visión) <span class="etiqueta-sugerido">Sugerida: mejórala si quieres</span>
        <textarea name="galeria-img-alt" rows="2" placeholder="Plano de la planta baja con la sala, la cocina y el garaje" ${sugerido ? 'data-sugerido="1"' : ''}>${escapar(img.alt ?? '')}</textarea></label>
    </div>
    <span class="fila-botones">
      <button type="button" class="boton-icono" data-fila="subir" aria-label="Subir esta imagen">↑</button>
      <button type="button" class="boton-icono" data-fila="bajar" aria-label="Bajar esta imagen">↓</button>
      <button type="button" class="boton-icono quitar" data-fila="quitar" aria-label="Quitar esta imagen">✕</button>
    </span></div>`;
}

/** Galería tal como queda en el formulario (o null si no tiene imágenes) */
export function leerGaleria(form) {
  const imagenes = $$('#filas-galeria .fila', form).map(f => ({
    src: f.dataset.src, mini: f.dataset.mini,
    titulo: $('[name="galeria-img-titulo"]', f).value.trim(),
    alt: $('[name="galeria-img-alt"]', f).value.trim()
  }));
  if (!imagenes.length) return null;
  return { titulo: form.elements['galeria-titulo'].value.trim() || 'Galería', estilo: form.elements['galeria-estilo'].value, imagenes };
}

/**
 * Conecta los botones de subir.
 *   datos: los datos del proyecto que se están editando (se cambian aquí)
 *   id(): el id del proyecto (para la carpeta)
 */
export function conectarArchivos({ form, datos, id, alCambiar, subidos }) {
  ctx = { form, datos, id, alCambiar, subidos };
  // Panel del modelo: al elegir automático / exacta o cambiar el número, se muestra cuánto medirá
  const medirMesa = (panel) => {
    const info = panel.closest('.archivo')?.medidasModelo;
    if (!info || !$('#medida-mesa', panel)) return;
    const auto = panel.querySelector('[name="escala-modelo"]:checked')?.value === 'auto';
    $('#escala-exacta', panel).hidden = auto;
    const n = auto ? Math.max(1, Math.round(Math.max(info[0], info[2]) / 0.6)) : Math.max(1, Number($('#f-escala-modelo', panel).value) || 1);
    const cm = info.map(v => (v / n) * 100);
    const mayor = Math.max(cm[0], cm[2]);
    $('#medida-mesa', panel).textContent = `Sobre la mesa medirá ${cm.map(v => v.toFixed(v < 10 ? 1 : 0).replace('.', ',')).join(' × ')} cm (ancho × alto × fondo)${auto ? `, escala 1:${n}` : ''}.` +
      (mayor > 120 ? ' Es muy grande para una mesa: sube el número de la escala.' : mayor < 10 ? ' Es muy chica: baja el número de la escala.' : '');
  };
  form.addEventListener('input', (e) => { const p = e.target.closest('.panel-modelo'); if (p) medirMesa(p); });
  form.addEventListener('change', (e) => { const p = e.target.closest('.panel-modelo'); if (p) medirMesa(p); });
  // Cuando el panel cambia de contenido (no cuando cambia la medida: eso volvería a llamar sin fin)
  const panelModelo = $('[data-archivo="modelo"] .panel-modelo', form);
  if (panelModelo) new MutationObserver(() => medirMesa(panelModelo)).observe(panelModelo, { childList: true });
  $$('[data-subir]', form).forEach(input => input.addEventListener('change', async () => {
    const archivos = [...input.files];
    input.value = '';                       // para poder elegir el mismo archivo otra vez
    if (!archivos.length) return;
    if (!ctx.id()) { avisar('Primero escribe el título del proyecto.', 'error'); return; }
    const caja = input.closest('.archivo') ?? form;
    const progreso = input.dataset.subir === 'galeria' ? $('#progreso-galeria', form) : $('.progreso-archivo', caja);
    try {
      await ACCIONES[input.dataset.subir](archivos, caja, mostrarProgreso(progreso));
      alCambiar();
    } catch (e) {
      console.error(e);
      avisar(e instanceof ErrorAmable ? e.message : (e.message || 'No se pudo subir el archivo.'), 'error');
      progreso.hidden = true;
    }
  }));
}

function mostrarProgreso(caja) {
  return (texto, fraccion = null) => {
    caja.hidden = false;
    $('span', caja).textContent = texto;
    const barra = $('progress', caja);
    if (fraccion === null) barra.removeAttribute('value'); else barra.value = fraccion;
    if (fraccion === 1 && /^Listo/.test(texto)) setTimeout(() => { caja.hidden = true; }, 4000);
  };
}

/** Sube un Blob y anota que se subió en esta edición (si se cancela, se borra) */
async function subirYAnotar(bucket, nombre, blob, progreso, texto) {
  const url = await subir(bucket, ctx.id(), nombre, blob, (f) => progreso(`${texto} ${Math.round(f * 100)} %`, f));
  ctx.subidos.add(url);
  return url;
}

function ponerVista(caja, url) {
  $('.archivo-vista', caja).innerHTML = `<img src="${escapar(url)}" alt="">`;
}

const ACCIONES = {
  async portada([archivo], caja, progreso) {
    progreso('Preparando la imagen…');
    const blob = await aWebP(archivo, { lado: 1200, calidad: 0.85 });
    ctx.datos.portada = await subirYAnotar('imagenes', `portada.${extension(blob)}`, blob, progreso, 'Subiendo');
    ponerVista(caja, ctx.datos.portada);
    progreso('Listo: portada cambiada. Toca «Guardar cambios».', 1);
  },

  async modelo([archivo], caja, progreso) {
    const m = await import('./modelo.js');
    const panel = $('.panel-modelo', caja);
    const barra = $('.progreso-archivo', caja);
    const prep = new m.Preparador();
    // Mientras trabaja se puede cancelar (detiene el trabajo en segundo plano al instante)
    const cancelar = document.createElement('button');
    cancelar.type = 'button';
    cancelar.className = 'enlace boton-cancelar-trabajo';
    cancelar.textContent = 'Cancelar';
    cancelar.addEventListener('click', () => prep.cancelar());
    barra.append(cancelar);
    // Muestra opciones en el panel y espera el botón que toque la persona
    const elegir = (html) => {
      panel.hidden = false;
      panel.innerHTML = html;
      $('button', panel)?.focus();
      return new Promise(r => panel.addEventListener('click', function al(e) {
        const b = e.target.closest('[data-modelo]');
        if (b) { panel.removeEventListener('click', al); r(b.dataset.modelo); }
      }));
    };
    const terminar = () => { panel.hidden = true; cancelar.remove(); prep.cerrar(); };
    const mb = (x) => `${x.toFixed(1).replace('.', ',')} MB`;
    try {
      const info = await prep.abrir(archivo, (t) => progreso(t));
      caja.medidasModelo = info.medidas;
      barra.hidden = true;

      // 1. Tamaño sobre la mesa
      const automatica = (ctx.form.elements['modo-escala']?.value ?? 'auto') === 'auto';
      const exacta = Number((ctx.form.elements.escala?.value ?? '').split(':')[1]) || m.escalaAutomatica(info.medidas);
      const reales = info.medidas.map(v => v.toFixed(v < 10 ? 2 : 0).replace('.', ',')).join(' × ');
      const decision = await elegir(`
        <p><strong>${escapar(archivo.name)}</strong> · ${mb(prep.mbOriginal)} · medidas reales: ${reales} m</p>
        <fieldset class="campo"><legend>Tamaño sobre la mesa</legend>
          <label class="casilla"><input type="radio" name="escala-modelo" value="auto" ${automatica ? 'checked' : ''}> Automático: que mida unos 60 cm (recomendado)</label>
          <label class="casilla"><input type="radio" name="escala-modelo" value="exacta" ${automatica ? '' : 'checked'}> Escala exacta</label>
          <div class="campo-con-boton" id="escala-exacta" ${automatica ? 'hidden' : ''}><span class="prefijo-escala">1 :</span><input id="f-escala-modelo" type="number" min="1" max="100000" step="1" inputmode="numeric" value="${exacta}" aria-label="Escala exacta, 1 a"></div>
          <p class="ayuda" id="medida-mesa" aria-live="polite"></p>
        </fieldset>
        ${ctx.datos.ar?.puntos?.length ? '<p class="aviso-suave">Este proyecto ya tiene puntos de información: con un modelo nuevo quizás haya que moverlos.</p>' : ''}
        <div class="campo-con-boton"><button type="button" class="boton-panel principal" data-modelo="si">Preparar</button><button type="button" class="boton-panel" data-modelo="no">Cancelar</button></div>`);
      if (decision !== 'si') return terminar();
      const auto = panel.querySelector('[name="escala-modelo"]:checked').value === 'auto';
      const escala = auto ? m.escalaAutomatica(info.medidas) : Math.max(1, Number($('#f-escala-modelo', panel).value) || 1);
      panel.hidden = true;

      // 2. Preparar
      let final = await prep.preparar({ escala, maxTextura: 1024, calidad: 0.9 }, (t) => progreso(t));
      barra.hidden = true;

      // 3. ¿Pesado? Ofrecer reducir
      if (m.estaPesado(final)) {
        const puedeAsi = final.mb <= m.MAXIMO_MB;
        const motivo = final.mb > m.OBJETIVO_MB
          ? `Ya preparado pesa <strong>${mb(final.mb)}</strong>. En un celular de gama media conviene menos de ${m.OBJETIVO_MB} MB${puedeAsi ? '' : ` (y el máximo permitido es ${m.MAXIMO_MB} MB)`}.`
          : `Tiene mucho detalle (${Math.round(final.triangulos / 1000)} mil triángulos): en el celular podría ir lento.`;
        const r = await elegir(`
          <p>${motivo}</p>
          <div class="campo-con-boton">
            <button type="button" class="boton-panel principal" data-modelo="reducir">Reducir tamaño automáticamente (recomendado)</button>
            ${puedeAsi ? '<button type="button" class="boton-panel" data-modelo="asi">Subir así</button>' : ''}
            <button type="button" class="boton-panel" data-modelo="no">Cancelar</button>
          </div>`);
        if (r === 'no') return terminar();
        if (r === 'reducir') {
          panel.hidden = true;
          const reduccion = await m.reducir(prep, final, { escala, alPaso: (t) => progreso(t) });
          barra.hidden = true;
          // 4. Qué cambia, en palabras simples, y vista previa para aceptar o cancelar
          await m.cargarModelViewer();
          const url = URL.createObjectURL(reduccion.resultado.blob);
          const cabe = reduccion.resultado.mb <= m.MAXIMO_MB;
          const r2 = await elegir(`
            <p><strong>Esto va a cambiar:</strong></p>
            <ul class="lista-cambios">${reduccion.cambios.map(c => `<li>${escapar(c)}</li>`).join('')}</ul>
            <model-viewer class="vista-previa-modelo" src="${url}" camera-controls auto-rotate shadow-intensity="1" touch-action="pan-y" alt="Vista previa del modelo reducido"></model-viewer>
            <p class="ayuda">Gíralo con el dedo o el mouse para revisarlo antes de aceptar.</p>
            <div class="campo-con-boton">
              ${cabe ? '<button type="button" class="boton-panel principal" data-modelo="si">Aceptar y subir</button>' : ''}
              <button type="button" class="boton-panel" data-modelo="no">Cancelar</button>
            </div>`);
          URL.revokeObjectURL(url);
          if (r2 !== 'si') return terminar();
          final = reduccion.resultado;
        }
        panel.hidden = true;
      }

      // 5. Versión del carrusel, foto y subida
      const liviano = await m.versionCarrusel(prep, { escala, alPaso: (t) => progreso(`Versión del carrusel: ${t}`) });
      progreso('Tomando una foto del modelo…');
      let foto = null;
      try { foto = await m.fotoDelModelo(final.blob, { camara: ctx.datos.ar?.camara ?? '25deg 62deg auto' }); } catch (e) { console.warn('Sin foto del modelo', e); }
      cancelar.remove();
      const base = ctx.id();
      ctx.datos.ar ??= { puntos: [] };
      ctx.datos.ar.modelo = await subirYAnotar('modelos', `${base}.glb`, final.blob, progreso, `Subiendo el modelo (${mb(final.mb)})…`);
      ctx.datos.ar.modeloHero = await subirYAnotar('modelos', `${base}-carrusel.glb`, liviano.blob, progreso, 'Subiendo la versión del carrusel…');
      if (foto) {
        ctx.datos.ar.poster = await subirYAnotar('imagenes', `${base}-foto.webp`, foto, progreso, 'Subiendo la foto…');
        ponerVista(caja, ctx.datos.ar.poster);
        if (!ctx.datos.portada) {
          ctx.datos.portada = ctx.datos.ar.poster;
          ponerVista($('[data-archivo="portada"]', ctx.form), ctx.datos.portada);
        }
      }
      // La escala elegida queda en el formulario (se ve en la ficha)
      ctx.datos.ar.escalaAutomatica = auto;
      if (ctx.form.elements.escala) ctx.form.elements.escala.value = `1:${escala}`;
      const radio = ctx.form.querySelector(`[name="modo-escala"][value="${auto ? 'auto' : 'exacta'}"]`);
      if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
      const cm = final.medidas.map(v => Math.round(v * 100)).join(' × ');
      $('.estado-archivo', caja).innerHTML = `Nuevo: <strong>${escapar(archivo.name)}</strong> → maqueta de ${cm} cm, ${mb(final.mb)}`;
      progreso('Listo: modelo preparado y subido. Toca «Guardar cambios».', 1);
      prep.cerrar();
    } catch (e) {
      terminar();
      barra.hidden = true;
      if (e instanceof m.Cancelado) { avisar('Cancelado: no se subió nada.'); return; }
      throw e;
    }
  },

  async video([archivo], caja, progreso) {
    if (!['video/mp4', 'video/webm'].includes(archivo.type)) throw new ErrorAmable('Usa un video MP4 (o WebM). Si tienes un .mov, expórtalo en MP4.');
    const pesoMB = archivo.size / 1024 / 1024;
    const ayuda = $('.panel-ayuda', caja);
    ayuda.hidden = true;
    if (pesoMB > LIMITES.videos) {
      // Muy pesado: se explica cómo achicarlo con un programa gratuito (los pasos quedan a la vista)
      ayuda.innerHTML = '<p><strong>El video pesa ' + pesoMB.toFixed(1).replace('.', ',') + ' MB y el máximo es ' + LIMITES.videos + ' MB.</strong> Para achicarlo gratis desde una computadora:</p>' +
        '<ol class="pasos"><li>Descarga <strong>HandBrake</strong> (handbrake.fr) e instálalo.</li><li>Ábrelo y arrastra el video.</li>' +
        '<li>En <strong>Preset</strong> elige <strong>General → Fast 720p30</strong>.</li><li>Toca <strong>Start</strong> (Iniciar) y espera.</li>' +
        '<li>Sube aquí el archivo nuevo: suele quedar entre 20 y 40 MB y se ve bien en el celular.</li></ol>';
      ayuda.hidden = false;
      ayuda.scrollIntoView({ block: 'nearest' });
      return;
    }
    ctx.datos.video = await subirYAnotar('videos', `video.${archivo.type === 'video/webm' ? 'webm' : 'mp4'}`, archivo, progreso, 'Subiendo el video…');
    $('.estado-archivo', caja).innerHTML = `Nuevo: <strong>${escapar(archivo.name)}</strong>`;
    progreso('Listo: video subido. Toca «Guardar cambios».', 1);
  },

  async poster([archivo], caja, progreso) {
    progreso('Preparando la imagen…');
    const poster = await aWebP(archivo, { llenar: [960, 540], calidad: 0.85 });
    // La pantalla del televisor del carrusel pide la imagen dada vuelta (así es su textura)
    const pantalla = await aWebP(archivo, { llenar: [960, 540], calidad: 0.85, voltear: true });
    ctx.datos.poster = await subirYAnotar('imagenes', `poster.${extension(poster)}`, poster, progreso, 'Subiendo…');
    ctx.datos.ar ??= { puntos: [] };
    ctx.datos.ar.pantallaHero = await subirYAnotar('imagenes', `pantalla.${extension(pantalla)}`, pantalla, progreso, 'Subiendo…');
    if (!ctx.datos.portada) {
      ctx.datos.portada = ctx.datos.poster;
      ponerVista($('[data-archivo="portada"]', ctx.form), ctx.datos.portada);
    }
    ponerVista(caja, ctx.datos.poster);
    ponerVista($('[data-archivo="video"]', ctx.form), ctx.datos.poster);
    progreso('Listo: póster cambiado. Toca «Guardar cambios».', 1);
  },

  async subtitulos([archivo], caja, progreso) {
    const texto = await archivo.text();
    if (!texto.replace(/^﻿/, '').startsWith('WEBVTT')) throw new ErrorAmable('Ese archivo no es un .vtt válido (debe empezar con la palabra WEBVTT).');
    const blob = new Blob([texto], { type: 'text/vtt' });
    ctx.datos.subtitulos = await subirYAnotar('videos', 'subtitulos.vtt', blob, progreso, 'Subiendo…');
    $('.estado-archivo', caja).innerHTML = `Nuevo: <strong>${escapar(archivo.name)}</strong>`;
    progreso('Listo: subtítulos subidos. Toca «Guardar cambios».', 1);
  },

  async galeria(archivos, caja, progreso) {
    const filas = $('#filas-galeria', ctx.form);
    for (const [i, archivo] of archivos.entries()) {
      const de = archivos.length > 1 ? ` (${i + 1} de ${archivos.length})` : '';
      progreso(`Preparando la imagen${de}…`);
      const grande = await aWebP(archivo, { lado: 2000, calidad: 0.85 });
      const mini = await aWebP(archivo, { lado: 640, calidad: 0.8 });
      const n = filas.children.length + 1;
      const src = await subirYAnotar('imagenes', `galeria-${n}.${extension(grande)}`, grande, progreso, `Subiendo${de}…`);
      const urlMini = await subirYAnotar('imagenes', `galeria-${n}-mini.${extension(mini)}`, mini, progreso, `Subiendo${de}…`);
      // Título vacío (no el nombre del archivo) y una descripción sugerida que no frena la publicación
      const proyecto = ctx.form.elements.titulo?.value.trim() || 'el proyecto';
      const tipo = (ctx.form.elements['galeria-titulo']?.value.trim() || 'Imagen').replace(/s$/, '');
      filas.insertAdjacentHTML('beforeend', filaGaleria({ src, mini: urlMini, titulo: '', alt: `${tipo} ${n} de ${proyecto}` }, n, true));
    }
    progreso(`Listo: ${archivos.length === 1 ? 'imagen agregada' : `${archivos.length} imágenes agregadas`}, con una descripción sugerida. Mejórala si quieres y toca «Guardar cambios».`, 1);
  }
};

