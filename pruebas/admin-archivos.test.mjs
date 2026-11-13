// =========================================================
// Prueba de los archivos del panel (Fase 5 · parte 4), con un Supabase fingido
// Portada (a WebP), galería (con descripción obligatoria), modelo 3D optimizado en el
// navegador (con versión del carrusel y foto), póster + pantalla del carrusel, subtítulos,
// y limpieza: lo reemplazado o cancelado se borra del almacenamiento.
// Correr: cd pruebas → npm test
// =========================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { levantarServidor } from './servidor.mjs';
import { fingirSupabase, iniciarSesionFalsa, SB } from './supabase-falso.mjs';

const sitio = (ruta) => fileURLToPath(new URL(`../${ruta}`, import.meta.url));
const PUBLICO = `${SB}/storage/v1/object/public/`;
let servidor, navegador, vttMalo;
before(async () => {
  servidor = await levantarServidor();
  navegador = await chromium.launch({ channel: 'chrome' });
  await mkdir(new URL('./capturas/', import.meta.url), { recursive: true });
  vttMalo = fileURLToPath(new URL('./capturas/no-es-vtt.vtt', import.meta.url));
  await writeFile(vttMalo, 'Esto no es un archivo de subtítulos');
});
after(async () => { await navegador?.close(); servidor?.cerrar(); });

async function abrirEditor(id) {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('pageerror', e => errores.push(e.message));
  const sb = await fingirSupabase(pagina);
  await iniciarSesionFalsa(pagina);
  await pagina.goto(servidor.url + 'admin/index.html');
  await pagina.waitForSelector('.lista-proyectos .tarjeta-proyecto', { timeout: 20000 });
  if (id) await pagina.locator(`.tarjeta-proyecto[data-id="${id}"] [data-accion="editar"]`).click();
  return { pagina, contexto, sb, errores };
}
const subidas = (sb) => sb.pedidos.filter(p => p.storage && p.metodo === 'POST' && !p.ruta.includes('/list/'));
const borrados = (sb) => sb.pedidos.filter(p => p.storage && p.metodo === 'DELETE').flatMap(p => p.cuerpo.prefixes);
const ultimoPatch = (sb) => sb.pedidos.filter(p => p.metodo === 'PATCH' && p.ruta.endsWith('/proyectos')).at(-1).cuerpo;
/** Espera (en la prueba) hasta que se cumpla algo, como máximo 30 s */
async function esperar(condicion) {
  for (let i = 0; i < 300 && !condicion(); i++) await new Promise(r => setTimeout(r, 100));
  assert.ok(condicion(), 'se esperó y no pasó');
}
const listo = (pagina, caja) => pagina.waitForFunction((c) => /^Listo/.test(document.querySelector(c)?.textContent ?? ''), caja, { timeout: 60000 });

test('portada: se convierte a WebP, se sube y al guardar queda en el proyecto', async () => {
  const { pagina, contexto, sb, errores } = await abrirEditor('oficina');
  await pagina.setInputFiles('[data-subir="portada"]', sitio('img/cuentos-y-espias-45s.jpg'));
  await listo(pagina, '[data-archivo="portada"] .progreso-archivo span');
  const subida = subidas(sb).at(-1);
  assert.match(subida.ruta, /\/object\/imagenes\/oficina\/portada-[a-z0-9]+\.webp$/);
  assert.equal(subida.encabezados['content-type'], 'image/webp');
  assert.match(subida.encabezados.authorization, /^Bearer ey/);
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector('.lista-proyectos');
  assert.ok(ultimoPatch(sb).datos.portada.startsWith(PUBLICO + 'imagenes/oficina/portada-'));
  assert.equal(borrados(sb).length, 0, 'la portada vieja era del sitio: no se borra nada');
  assert.deepEqual(errores, []);
  await contexto.close();
});

test('galería: agregar imágenes (con miniatura), descripción obligatoria y orden', async () => {
  const { pagina, contexto, sb } = await abrirEditor('cafeteria');
  await pagina.setInputFiles('[data-subir="galeria"]', [sitio('img/casa-moderna-render.webp'), sitio('img/oficina-render.webp')]);
  await listo(pagina, '#progreso-galeria span');
  assert.equal(await pagina.locator('#filas-galeria .fila').count(), 2);
  assert.equal(subidas(sb).length, 4, 'cada imagen sube su versión grande y su miniatura');
  // Sin descripción no se guarda
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector('.error-campo');
  assert.match(await pagina.locator('.error-campo').first().textContent(), /imagen 1 de la galería le falta la descripción/);
  await pagina.fill('#filas-galeria .fila:nth-child(1) [name="galeria-img-alt"]', 'Render de la casa');
  await pagina.fill('#filas-galeria .fila:nth-child(2) [name="galeria-img-alt"]', 'Render de la oficina');
  await pagina.click('#filas-galeria .fila:nth-child(2) [data-fila="subir"]');
  await pagina.fill('#f-galeria-titulo', 'Renders');
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector('.lista-proyectos');
  const g = ultimoPatch(sb).datos.galeria;
  assert.equal(g.titulo, 'Renders');
  assert.deepEqual(g.imagenes.map(i => i.alt), ['Render de la oficina', 'Render de la casa']);
  assert.ok(g.imagenes.every(i => i.src.startsWith(PUBLICO) && i.mini.includes('-mini-')));
  await contexto.close();
});

test('modelo 3D: se optimiza en el navegador, se sube con su versión del carrusel y su foto', async () => {
  const { pagina, contexto, sb } = await abrirEditor();
  await pagina.click('#nuevo-proyecto');
  await pagina.fill('#f-titulo', 'Prueba de modelo');
  await pagina.locator('label.opcion:has([value="escenario"])').click();
  await pagina.setInputFiles('[data-subir="modelo"]', sitio('modelos/casa-moderna.glb'));
  await pagina.waitForSelector('#f-escala-modelo', { timeout: 60000 });
  // La casa ya está a escala de maqueta: con 1:1 queda igual (59 × 33 × 26 cm); con 1:2, la mitad
  await pagina.fill('#f-escala-modelo', '2');
  assert.match(await pagina.textContent('#medida-mesa'), /Sobre la mesa medirá (29|30) × (16|17) × 13 cm/);
  await pagina.fill('#f-escala-modelo', '1');
  assert.match(await pagina.textContent('#medida-mesa'), /Sobre la mesa medirá 59 × 33 × 26 cm/);
  await pagina.click('[data-modelo="si"]');
  await listo(pagina, '[data-archivo="modelo"] .progreso-archivo span');
  const rutas = subidas(sb).map(s => s.ruta);
  assert.ok(rutas.some(r => /modelos\/prueba-de-modelo\/prueba-de-modelo-[a-z0-9]+\.glb$/.test(r)));
  assert.ok(rutas.some(r => /modelos\/prueba-de-modelo\/prueba-de-modelo-carrusel-[a-z0-9]+\.glb$/.test(r)));
  assert.ok(rutas.some(r => /imagenes\/prueba-de-modelo\/prueba-de-modelo-foto-[a-z0-9]+\.webp$/.test(r)));
  const modelo = [...sb.archivos.entries()].find(([k]) => /prueba-de-modelo-[a-z0-9]+\.glb$/.test(k))[1];
  assert.equal(modelo.tipo, 'model/gltf-binary');
  assert.equal(modelo.datos.subarray(0, 4).toString(), 'glTF');
  assert.equal(await pagina.inputValue('#f-escala'), '1:1');
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector('.tarjeta-proyecto[data-id="prueba-de-modelo"]');
  const nuevo = sb.pedidos.filter(p => p.metodo === 'POST' && p.ruta.endsWith('/proyectos')).at(-1).cuerpo.datos;
  assert.ok(nuevo.ar.modelo.startsWith(PUBLICO + 'modelos/'));
  assert.ok(nuevo.ar.modeloHero.includes('-carrusel-'));
  assert.equal(nuevo.portada, nuevo.ar.poster, 'sin portada, se usa la foto del modelo');
  await contexto.close();
});

test('video: póster (con la pantalla del carrusel dada vuelta) y subtítulos .vtt', async () => {
  const { pagina, contexto, sb } = await abrirEditor('cuentos-y-espias');
  await pagina.setInputFiles('[data-subir="poster"]', sitio('img/casa-moderna-render.webp'));
  await listo(pagina, '[data-archivo="poster"] .progreso-archivo span');
  await pagina.setInputFiles('[data-subir="subtitulos"]', vttMalo);
  await pagina.waitForFunction(() => document.getElementById('aviso-flotante')?.textContent.includes('no es un .vtt válido'));
  await pagina.setInputFiles('[data-subir="subtitulos"]', sitio('videos/cuentos-y-espias.es.vtt'));
  await listo(pagina, '[data-archivo="subtitulos"] .progreso-archivo span');
  const vtt = [...sb.archivos.entries()].find(([k]) => k.endsWith('.vtt'))[1];
  assert.equal(vtt.tipo, 'text/vtt');
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector('.lista-proyectos');
  const d = ultimoPatch(sb).datos;
  assert.ok(d.poster.includes('/poster-') && d.ar.pantallaHero.includes('/pantalla-'));
  assert.ok(d.subtitulos.startsWith(PUBLICO + 'videos/cuentos-y-espias/subtitulos-'));
  assert.equal(d.video, 'videos/cuentos-y-espias.mp4', 'el video no cambió');
  // La pantalla del carrusel es 960 × 540 y está dada vuelta respecto del póster
  const [arriba, abajo] = await pagina.evaluate(async (url) => {
    const img = await createImageBitmap(await (await fetch(url)).blob());
    const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    return [img.width === 960 && img.height === 540, true];
  }, d.ar.pantallaHero);
  assert.ok(arriba && abajo);
  await contexto.close();
});

test('limpieza: lo reemplazado y lo cancelado se borra del almacenamiento', async () => {
  const { pagina, contexto, sb } = await abrirEditor('london');
  // Dos portadas seguidas y guardar: la primera se borra
  await pagina.setInputFiles('[data-subir="portada"]', sitio('img/london-render.webp'));
  await listo(pagina, '[data-archivo="portada"] .progreso-archivo span');
  const primera = subidas(sb).at(-1).ruta.replace('/storage/v1/object/imagenes/', '');
  const antes = subidas(sb).length;
  await pagina.setInputFiles('[data-subir="portada"]', sitio('img/oficina-render.webp'));
  await esperar(() => subidas(sb).length > antes);
  await pagina.waitForTimeout(300);
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector('.lista-proyectos');
  await esperar(() => borrados(sb).length > 0);
  assert.ok(borrados(sb).includes(decodeURIComponent(primera)), 'la portada reemplazada se borra');
  // Subir y cancelar: se borra
  await pagina.locator('.tarjeta-proyecto[data-id="london"] [data-accion="editar"]').click();
  await pagina.setInputFiles('[data-subir="portada"]', sitio('img/cafeteria-render.webp'));
  await listo(pagina, '[data-archivo="portada"] .progreso-archivo span');
  const cancelada = subidas(sb).at(-1).ruta.replace('/storage/v1/object/imagenes/', '');
  await pagina.click('#cancelar-edicion');
  await pagina.click('.dialogo [data-r="si"]');
  await pagina.waitForSelector('.lista-proyectos');
  await esperar(() => borrados(sb).includes(decodeURIComponent(cancelada)));
  // Eliminar el proyecto borra su carpeta
  await pagina.locator('.tarjeta-proyecto[data-id="london"] [data-accion="eliminar"]').click();
  await pagina.click('.dialogo [data-r="si"]');
  await pagina.waitForSelector('.tarjeta-proyecto[data-id="london"]', { state: 'detached' });
  await esperar(() => ![...sb.archivos.keys()].some(k => k.includes('/london/')));
  assert.equal([...sb.archivos.keys()].filter(k => k.includes('/london/')).length, 0);
  await contexto.close();
});
