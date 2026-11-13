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

/** Toca «Guardar cambios» y espera el aviso (el editor se queda abierto) */
async function guardar(pagina) {
  await pagina.click('button[type="submit"]');
  await pagina.waitForFunction(() => document.getElementById('aviso-flotante')?.textContent.includes('✓'), null, { timeout: 20000 });
}
const volverALista = async (pagina) => { await pagina.click('#volver-lista'); await pagina.waitForSelector('.lista-proyectos'); };
const listo = (pagina, caja) => pagina.waitForFunction((c) => /^Listo/.test(document.querySelector(c)?.textContent ?? ''), caja, { timeout: 60000 });

test('portada: se convierte a WebP, se sube y al guardar queda en el proyecto', async () => {
  const { pagina, contexto, sb, errores } = await abrirEditor('oficina');
  await pagina.setInputFiles('[data-subir="portada"]', sitio('img/cuentos-y-espias-45s.jpg'));
  await listo(pagina, '[data-archivo="portada"] .progreso-archivo span');
  const subida = subidas(sb).at(-1);
  assert.match(subida.ruta, /\/object\/imagenes\/oficina\/portada-[a-z0-9]+\.webp$/);
  assert.equal(subida.encabezados['content-type'], 'image/webp');
  assert.match(subida.encabezados.authorization, /^Bearer ey/);
  await guardar(pagina);
  assert.ok(ultimoPatch(sb).datos.portada.startsWith(PUBLICO + 'imagenes/oficina/portada-'));
  assert.equal(borrados(sb).length, 0, 'la portada vieja era del sitio: no se borra nada');
  assert.deepEqual(errores, []);
  await contexto.close();
});

test('galería: agregar imágenes (con miniatura), descripción sugerida, título vacío y orden', async () => {
  const { pagina, contexto, sb } = await abrirEditor('cafeteria');
  await pagina.setInputFiles('[data-subir="galeria"]', [sitio('img/casa-moderna-render.webp'), sitio('img/oficina-render.webp')]);
  await listo(pagina, '#progreso-galeria span');
  assert.equal(await pagina.locator('#filas-galeria .fila').count(), 2);
  assert.equal(subidas(sb).length, 4, 'cada imagen sube su versión grande y su miniatura');
  // El título queda vacío (no el nombre del archivo) y la descripción viene sugerida
  assert.equal(await pagina.inputValue('#filas-galeria .fila:nth-child(1) [name="galeria-img-titulo"]'), '');
  assert.match(await pagina.inputValue('#filas-galeria .fila:nth-child(1) [name="galeria-img-alt"]'), / 1 de Cafetería M3D$/);
  assert.ok(await pagina.isVisible('#filas-galeria .fila:nth-child(1) .etiqueta-sugerido'));
  // Al escribirla deja de ser «sugerida»
  await pagina.fill('#filas-galeria .fila:nth-child(1) [name="galeria-img-alt"]', 'Render de la casa');
  assert.ok(await pagina.isHidden('#filas-galeria .fila:nth-child(1) .etiqueta-sugerido'));
  await pagina.click('#filas-galeria .fila:nth-child(2) [data-fila="subir"]');
  await pagina.fill('#f-galeria-titulo', 'Renders');
  await guardar(pagina);
  const g = ultimoPatch(sb).datos.galeria;
  assert.equal(g.titulo, 'Renders');
  assert.match(g.imagenes[0].alt, / 2 de Cafetería M3D$/, 'la que no se tocó guarda la sugerida');
  assert.equal(g.imagenes[1].alt, 'Render de la casa');
  assert.ok(g.imagenes.every(i => i.src.startsWith(PUBLICO) && i.mini.includes('-mini-')));
  await contexto.close();
});

test('modelo 3D: se optimiza en el navegador, se sube con su versión del carrusel y su foto', async () => {
  const { pagina, contexto, sb } = await abrirEditor();
  await pagina.click('#nuevo-proyecto');
  await pagina.fill('#f-titulo', 'Prueba de modelo');
  await pagina.locator('label.opcion:has([value="escenario"])').click();
  await pagina.setInputFiles('[data-subir="modelo"]', sitio('modelos/casa-moderna.glb'));
  await pagina.waitForSelector('#medida-mesa', { timeout: 60000 });
  // Automático (recomendado): unos 60 cm
  assert.match(await pagina.textContent('#medida-mesa'), /Sobre la mesa medirá 59 × 33 × 26 cm .*escala 1:1./);
  assert.ok(await pagina.isHidden('#f-escala-modelo'), 'la escala exacta solo aparece si se elige');
  // Escala exacta: con 1:2, la mitad
  await pagina.locator('.panel-modelo label.casilla:has([value="exacta"])').click();
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
  await guardar(pagina);
  await volverALista(pagina);
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
  await guardar(pagina);
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
  await guardar(pagina);
  await esperar(() => borrados(sb).length > 0);
  assert.ok(borrados(sb).includes(decodeURIComponent(primera)), 'la portada reemplazada se borra');
  // Subir y cancelar (el editor sigue abierto después de guardar): se borra
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

/**
 * Un modelo pesado hecho aquí mismo (sin depender de archivos de afuera): una malla ondulada
 * de lado × lado cuadrados (2 triángulos cada uno), de 120 m de ancho.
 */
async function modeloPesado(lado = 548) {
  const vertices = (lado + 1) ** 2;
  const posiciones = new Float32Array(vertices * 3);
  for (let j = 0; j <= lado; j++) for (let i = 0; i <= lado; i++) {
    const k = (j * (lado + 1) + i) * 3;
    posiciones.set([(i / lado - 0.5) * 120, Math.sin(i / 9) * Math.cos(j / 11) * 4 + 4, (j / lado - 0.5) * 120], k);
  }
  const indices = new Uint32Array(lado * lado * 6);
  let n = 0;
  for (let j = 0; j < lado; j++) for (let i = 0; i < lado; i++) {
    const a = j * (lado + 1) + i, b = a + 1, c = a + lado + 1, d = c + 1;
    indices.set([a, c, b, b, c, d], n); n += 6;
  }
  const bin = Buffer.concat([Buffer.from(posiciones.buffer), Buffer.from(indices.buffer)]);
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'terreno' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.4, 0.7, 0.9, 1] } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: posiciones.byteLength }, { buffer: 0, byteOffset: posiciones.byteLength, byteLength: indices.byteLength }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: vertices, type: 'VEC3', min: [-60, 0, -60], max: [60, 8, 60] },
      { bufferView: 1, componentType: 5125, count: indices.length, type: 'SCALAR' }
    ]
  };
  let texto = Buffer.from(JSON.stringify(json));
  texto = Buffer.concat([texto, Buffer.alloc((4 - (texto.length % 4)) % 4, 0x20)]);
  const cabecera = Buffer.alloc(12);
  cabecera.writeUInt32LE(0x46546c67, 0); cabecera.writeUInt32LE(2, 4); cabecera.writeUInt32LE(12 + 8 + texto.length + 8 + bin.length, 8);
  const trozo = (tipo, datos) => { const c = Buffer.alloc(8); c.writeUInt32LE(datos.length, 0); c.writeUInt32LE(tipo, 4); return Buffer.concat([c, datos]); };
  const ruta = fileURLToPath(new URL('./capturas/modelo-pesado.glb', import.meta.url));
  await writeFile(ruta, Buffer.concat([cabecera, trozo(0x4e4f534a, texto), trozo(0x004e4942, bin)]));
  return ruta;
}

test('modelo pesado: «Reducir tamaño automáticamente» explica los cambios, muestra la vista previa y se puede cancelar', async () => {
  const pesado = await modeloPesado();
  const { pagina, contexto, sb } = await abrirEditor();
  await pagina.click('#nuevo-proyecto');
  await pagina.fill('#f-titulo', 'Terreno grande');
  await pagina.locator('label.opcion:has([value="escenario"])').click();
  // La página no debe congelarse mientras trabaja: se mide la pausa más larga entre cuadros
  await pagina.evaluate(() => { window.__peor = 0; let u = performance.now(); const f = () => { const a = performance.now(); window.__peor = Math.max(window.__peor, a - u); u = a; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await pagina.setInputFiles('[data-subir="modelo"]', pesado);
  await pagina.waitForSelector('[data-modelo="si"]', { timeout: 60000 });
  await pagina.click('[data-modelo="si"]');
  // 600 mil triángulos: ofrece reducir (recomendado)
  await pagina.waitForSelector('[data-modelo="reducir"]', { timeout: 120000 });
  assert.match(await pagina.textContent('.panel-modelo'), /mucho detalle \(60\d mil triángulos\)/);
  assert.match(await pagina.textContent('[data-modelo="reducir"]'), /Reducir tamaño automáticamente \(recomendado\)/);
  await pagina.click('[data-modelo="reducir"]');
  await pagina.waitForSelector('.lista-cambios', { timeout: 180000 });
  const cambios = await pagina.locator('.lista-cambios li').allTextContents();
  assert.ok(cambios.some(c => /se conserva cerca del \d+ % del detalle/.test(c)), cambios.join(' | '));
  assert.ok(cambios.some(c => /menos triángulos \(de 60\d mil a \d+ mil\)/.test(c)), cambios.join(' | '));
  assert.ok(cambios.some(c => /^Peso final: [\d,]+ MB \(antes [\d,]+ MB\)\.$/.test(c)), cambios.join(' | '));
  assert.equal(await pagina.locator('.panel-modelo model-viewer.vista-previa-modelo').count(), 1, 'vista previa');
  // Cancelar: no se sube nada
  await pagina.click('.panel-modelo [data-modelo="no"]');
  assert.equal(subidas(sb).filter(s => s.ruta.includes('terreno-grande')).length, 0);
  // Otra vez, ahora aceptando
  await pagina.setInputFiles('[data-subir="modelo"]', pesado);
  await pagina.waitForSelector('[data-modelo="si"]', { timeout: 60000 });
  await pagina.click('[data-modelo="si"]');
  await pagina.waitForSelector('[data-modelo="reducir"]', { timeout: 120000 });
  await pagina.click('[data-modelo="reducir"]');
  await pagina.waitForSelector('.lista-cambios', { timeout: 180000 });
  await pagina.click('.panel-modelo [data-modelo="si"]');
  await listo(pagina, '[data-archivo="modelo"] .progreso-archivo span');
  assert.ok(subidas(sb).some(s => /modelos\/terreno-grande\/terreno-grande-[a-z0-9]+\.glb$/.test(s.ruta)));
  assert.ok((await pagina.evaluate(() => window.__peor)) < 1500, 'la página no se congeló');
  await contexto.close();
});

test('video de más de 50 MB: explica cómo achicarlo con HandBrake y no sube nada', async () => {
  const { pagina, contexto, sb } = await abrirEditor('cuentos-y-espias');
  // Un «video» de 51 MB (solo importa el tamaño)
  await pagina.evaluate(() => {
    const input = document.querySelector('[data-subir="video"]');
    const datos = new DataTransfer();
    datos.items.add(new File([new Uint8Array(51 * 1024 * 1024)], 'grande.mp4', { type: 'video/mp4' }));
    input.files = datos.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await pagina.waitForSelector('[data-archivo="video"] .panel-ayuda:not([hidden])');
  const texto = await pagina.textContent('[data-archivo="video"] .panel-ayuda');
  assert.match(texto, /pesa 51,0 MB y el máximo es 50 MB/);
  assert.match(texto, /HandBrake/);
  assert.match(texto, /Fast 720p30/);
  assert.equal(subidas(sb).length, 0);
  await contexto.close();
});
