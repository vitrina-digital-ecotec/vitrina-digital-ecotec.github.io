// =========================================================
// admin/js/editor-archivos.js — sección «Imágenes, modelo y video» del editor de proyectos
//
// Portada · Modelo 3D (se optimiza en el navegador) · Galería (planos o páginas) ·
// Video, póster y subtítulos. Cada archivo se sube apenas se elige (con barra de progreso),
// pero el proyecto cambia recién al tocar «Guardar cambios». Si se cancela, lo subido se borra.
// =========================================================
import { $, $$, escapar, avisar } from './util.js';
import { subir, aWebP, extension, ErrorAmable } from './archivos.js';

let ctx;   // { form, datos, id(), alCambiar(), subidos:Set }

const urlVista = (ruta) => (!ruta ? '' : /^https?:/.test(ruta) ? ruta : `../${ruta}`);
const nombreArchivo = (ruta) => decodeURIComponent((ruta ?? '').split('/').pop()).replace(/-[a-z0-9]{6,9}(\.\w+)$/, '$1');

export function htmlArchivos(d) {
  const g = d.galeria ?? { titulo: 'Planos', estilo: 'planos', imagenes: [] };
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

      <h3 class="subtitulo">Galería (planos o páginas de un documento)</h3>
      <p class="ayuda">Aparece en la ficha; al tocar una imagen se ve en grande con zoom. Cada imagen necesita una descripción breve (la escuchan las personas con discapacidad visual).</p>
      <div class="campo"><label for="f-galeria-titulo">Título de la galería</label><input id="f-galeria-titulo" name="galeria-titulo" value="${escapar(g.titulo ?? '')}" placeholder="Planos"></div>
      <fieldset class="campo">
        <legend>Forma de las imágenes</legend>
        <label class="casilla"><input type="radio" name="galeria-estilo" value="planos" ${g.estilo !== 'documento' ? 'checked' : ''}> Planos (verticales u horizontales)</label>
        <label class="casilla"><input type="radio" name="galeria-estilo" value="documento" ${g.estilo === 'documento' ? 'checked' : ''}> Páginas de una presentación o documento (16:9)</label>
      </fieldset>
      <div class="filas" id="filas-galeria">${(g.imagenes ?? []).map(filaGaleria).join('')}</div>
      <label class="boton-panel boton-archivo">+ Agregar imágenes…<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-subir="galeria" class="solo-lector"></label>
      <div class="progreso-archivo" id="progreso-galeria" hidden><progress max="1" value="0"></progress><span></span></div>
    </fieldset>`;
}

function filaGaleria(img) {
  return `<div class="fila fila-galeria" data-src="${escapar(img.src)}" data-mini="${escapar(img.mini ?? img.src)}">
    <img class="fila-mini" src="${escapar(urlVista(img.mini ?? img.src))}" alt="">
    <div class="fila-campos">
      <label>Título <input name="galeria-img-titulo" value="${escapar(img.titulo ?? '')}" placeholder="Planta baja"></label>
      <label>Descripción breve <textarea name="galeria-img-alt" rows="2" placeholder="Plano de la planta baja con la sala, la cocina y el garaje">${escapar(img.alt ?? '')}</textarea></label>
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
    const { medir, optimizar, fotoDelModelo } = await import('./modelo.js');
    progreso('Leyendo el modelo…');
    const info = await medir(archivo);
    $('.progreso-archivo', caja).hidden = true;
    // Panel para elegir la escala, con la medida que tendrá sobre la mesa
    const panel = $('.panel-modelo', caja);
    const escalaActual = Number((ctx.form.elements.escala?.value ?? '').split(':')[1]) || sugerirEscala(info.medidas);
    const m = info.medidas.map(v => v.toFixed(2).replace('.', ',')).join(' × ');
    panel.hidden = false;
    panel.innerHTML = `
      <p><strong>${escapar(archivo.name)}</strong> · ${info.mb.toFixed(1).replace('.', ',')} MB · medidas reales: ${m} m</p>
      <div class="campo"><label for="f-escala-modelo">Escala de la maqueta</label>
        <div class="campo-con-boton"><span class="prefijo-escala">1 :</span><input id="f-escala-modelo" type="number" min="1" max="2000" step="1" inputmode="numeric" value="${escalaActual}"></div>
        <p class="ayuda" id="medida-mesa" aria-live="polite"></p></div>
      ${ctx.datos.ar?.puntos?.length ? '<p class="aviso-suave">Este proyecto ya tiene puntos de información: con un modelo nuevo quizás haya que moverlos.</p>' : ''}
      <div class="campo-con-boton"><button type="button" class="boton-panel principal" data-modelo="si">Preparar y subir</button><button type="button" class="boton-panel" data-modelo="no">Cancelar</button></div>`;
    const entrada = $('#f-escala-modelo', panel);
    const actualizar = () => {
      const n = Math.max(1, Number(entrada.value) || 1);
      const cm = info.medidas.map(v => (v / n) * 100);
      const texto = cm.map(v => v.toFixed(v < 10 ? 1 : 0).replace('.', ',')).join(' × ');
      const mayor = Math.max(cm[0], cm[2]);
      $('#medida-mesa', panel).textContent = `Sobre la mesa medirá ${texto} cm (ancho × alto × fondo).` +
        (mayor > 120 ? ' Es muy grande para una mesa: sube el número de la escala.' : mayor < 10 ? ' Es muy chica: baja el número de la escala.' : '');
    };
    entrada.addEventListener('input', actualizar);
    actualizar();
    entrada.focus();
    const decision = await new Promise(r => panel.addEventListener('click', (e) => { const b = e.target.closest('[data-modelo]'); if (b) r(b.dataset.modelo); }));
    panel.hidden = true;
    if (decision !== 'si') return;
    const escala = Math.max(1, Number(entrada.value) || 1);
    const resultado = await optimizar(archivo, { escala, alPaso: (t) => progreso(t) });
    const kb = (b) => `${Math.round(b.size / 1024)} KB`;
    progreso('Tomando una foto del modelo…');
    let foto = null;
    try { foto = await fotoDelModelo(resultado.principal, { camara: ctx.datos.ar?.camara ?? '25deg 62deg auto' }); } catch (e) { console.warn('Sin foto del modelo', e); }
    const base = ctx.id();
    ctx.datos.ar ??= { puntos: [] };
    ctx.datos.ar.modelo = await subirYAnotar('modelos', `${base}.glb`, resultado.principal, progreso, `Subiendo el modelo (${kb(resultado.principal)})…`);
    ctx.datos.ar.modeloHero = await subirYAnotar('modelos', `${base}-carrusel.glb`, resultado.liviano, progreso, 'Subiendo la versión del carrusel…');
    if (foto) {
      ctx.datos.ar.poster = await subirYAnotar('imagenes', `${base}-foto.webp`, foto, progreso, 'Subiendo la foto…');
      ponerVista(caja, ctx.datos.ar.poster);
      if (!ctx.datos.portada) {
        ctx.datos.portada = ctx.datos.ar.poster;
        ponerVista($('[data-archivo="portada"]', ctx.form), ctx.datos.portada);
      }
    }
    // La escala elegida queda escrita en el formulario (se ve en la ficha)
    if (ctx.form.elements.escala) ctx.form.elements.escala.value = `1:${escala}`;
    const cm = resultado.medidas.map(v => Math.round(v * 100)).join(' × ');
    $('.estado-archivo', caja).innerHTML = `Nuevo: <strong>${escapar(archivo.name)}</strong> → maqueta de ${cm} cm, ${kb(resultado.principal)}`;
    progreso('Listo: modelo preparado y subido. Toca «Guardar cambios».', 1);
  },

  async video([archivo], caja, progreso) {
    if (!['video/mp4', 'video/webm'].includes(archivo.type)) throw new ErrorAmable('Usa un video MP4 (o WebM). Si tienes un .mov, expórtalo en MP4.');
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
      const titulo = archivo.name.replace(/\.\w+$/, '').replace(/[_-]+/g, ' ');
      filas.insertAdjacentHTML('beforeend', filaGaleria({ src, mini: urlMini, titulo, alt: '' }));
    }
    filas.lastElementChild?.querySelector('[name="galeria-img-alt"]')?.focus();
    progreso(`Listo: ${archivos.length === 1 ? 'imagen agregada' : `${archivos.length} imágenes agregadas`}. Escribe su descripción y toca «Guardar cambios».`, 1);
  }
};

/** Una escala que deje el modelo de unos 60 cm de lado */
function sugerirEscala([x, , z]) {
  const mayor = Math.max(x, z);
  if (mayor <= 1.2) return 1;
  return Math.max(1, Math.round(mayor / 0.6));
}
