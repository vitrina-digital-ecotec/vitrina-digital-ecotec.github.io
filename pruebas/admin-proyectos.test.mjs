// =========================================================
// Prueba del panel de proyectos (Fase 5 · parte 3), con un Supabase fingido
// Editar sin perder lo que el formulario no toca (puntos, galería…), crear, publicar
// (solo si tiene lo mínimo), ocultar, ordenar, eliminar con confirmación, carreras,
// ajustes, video (modos y letra) y la vista previa de proyectos ocultos.
// Correr: cd pruebas → npm test
// =========================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { levantarServidor } from './servidor.mjs';
import { fingirSupabase, iniciarSesionFalsa } from './supabase-falso.mjs';

let servidor, navegador;
before(async () => {
  servidor = await levantarServidor();
  navegador = await chromium.launch({ channel: 'chrome' });
});
after(async () => { await navegador?.close(); servidor?.cerrar(); });

async function abrirPanel({ ancho = 1280 } = {}) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: 900 } });
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('pageerror', e => errores.push(e.message));
  const sb = await fingirSupabase(pagina);
  await iniciarSesionFalsa(pagina);
  await pagina.goto(servidor.url + 'admin/index.html');
  await pagina.waitForSelector('.lista-proyectos .tarjeta-proyecto', { timeout: 20000 });
  return { pagina, contexto, sb, errores };
}
const fila = (pagina, id) => pagina.locator(`.tarjeta-proyecto[data-id="${id}"]`);
const ultimo = (sb, metodo, tabla) => sb.pedidos.filter(p => p.metodo === metodo && p.ruta.endsWith(`/${tabla}`)).at(-1);

test('lista: 6 proyectos en el orden del carrusel y filtro por carrera', async () => {
  const { pagina, contexto, errores } = await abrirPanel();
  assert.deepEqual(await pagina.locator('.tarjeta-proyecto').evaluateAll(t => t.map(e => e.dataset.id)),
    ['casa-moderna', 'cuentos-y-espias', 'oficina', 'deliveryrush', 'london', 'cafeteria']);
  await pagina.click('[data-filtro="multimedia"]');
  assert.equal(await pagina.locator('.tarjeta-proyecto').count(), 3);
  assert.match(await pagina.textContent('#resumen'), /Conectado · 6 proyectos \(6 publicados\)/);
  assert.deepEqual(errores, []);
  await contexto.close();
});

test('editar: cambia textos, etiqueta y créditos sin perder puntos, galería ni cortes', async () => {
  const { pagina, contexto, sb } = await abrirPanel();
  await fila(pagina, 'casa-moderna').locator('[data-accion="editar"]').click();
  await pagina.fill('#f-titulo', 'Casa Moderna (editada)');
  // La etiqueta «PROYECTO DE EJEMPLO» se apaga
  await pagina.locator('label.interruptor:has([name="ejemplo"])').click();
  // Los cortes se muestran en centímetros (0,234 m → 23,4 cm)
  assert.equal(await pagina.inputValue('#filas-cortes .fila:first-child [name="corte-altura"]'), '23.4');
  await pagina.fill('#filas-cortes .fila:first-child [name="corte-nombre"]', 'Sin cubierta');
  await pagina.fill('#f-texto-completa', 'Toda la casa');
  await pagina.click('[data-agregar="credito"]');
  await pagina.fill('#filas-creditos .fila:last-child [name="credito-etiqueta"]', 'Planos');
  await pagina.fill('#filas-creditos .fila:last-child [name="credito-texto"]', 'Dibujados en AutoCAD');
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector('.lista-proyectos');
  const d = ultimo(sb, 'PATCH', 'proyectos').cuerpo.datos;
  assert.equal(d.titulo, 'Casa Moderna (editada)');
  assert.equal(d.ejemplo, undefined);
  assert.deepEqual(d.creditos, [{ etiqueta: 'Planos', texto: 'Dibujados en AutoCAD' }]);
  assert.equal(d.ar.cortes[0].nombre, 'Sin cubierta');
  assert.equal(d.ar.cortes[0].altura, 0.234);
  assert.equal(d.ar.textoCompleta, 'Toda la casa');
  assert.equal(d.ar.puntos.length, 3, 'los puntos no se pierden');
  assert.equal(d.galeria.imagenes.length, sb.tablas.proyectos.find(p => p.id === 'casa-moderna').datos.galeria.imagenes.length, 'la galería no se pierde');
  assert.ok(d.galeria.imagenes.length > 0);
  assert.equal(d.creditoModelo.licencia, 'CC BY 4.0');
  assert.match(await fila(pagina, 'casa-moderna').textContent(), /Casa Moderna \(editada\)/);
  await contexto.close();
});

test('nuevo proyecto: dirección automática, empieza oculto y no se publica sin lo mínimo', async () => {
  const { pagina, contexto, sb } = await abrirPanel({ ancho: 390 });
  await pagina.click('#nuevo-proyecto');
  await pagina.fill('#f-titulo', 'Mi Nivel Ñandú');
  assert.equal(await pagina.inputValue('#f-id'), 'mi-nivel-nandu');
  await pagina.locator('label.opcion:has([value="escenario"])').click();
  await pagina.selectOption('#f-carrera', 'multimedia');
  // Intentar publicarlo sin imagen ni modelo
  await pagina.locator('label.interruptor:has([name="publicado"])').click();
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector('.error-campo');
  assert.match(await pagina.locator('.error-campo').first().textContent(), /falta la imagen de portada/);
  assert.equal(ultimo(sb, 'POST', 'proyectos'), undefined, 'no debe guardarse');
  // Sin publicar sí se crea
  await pagina.locator('label.interruptor:has([name="publicado"])').click();
  await pagina.click('button[type="submit"]');
  await fila(pagina, 'mi-nivel-nandu').waitFor();
  const nuevo = ultimo(sb, 'POST', 'proyectos').cuerpo;
  assert.equal(nuevo.publicado, false);
  assert.equal(nuevo.carrera, 'multimedia');
  assert.equal(nuevo.orden, 70);
  assert.equal(nuevo.datos.tipo, 'escenario');
  assert.deepEqual(nuevo.datos.ar.puntos, []);
  assert.match(await fila(pagina, 'mi-nivel-nandu').textContent(), /Oculto/);
  // Publicar desde la lista también lo impide
  await fila(pagina, 'mi-nivel-nandu').locator('[data-accion="publicar"]').click();
  await pagina.waitForSelector('#aviso-flotante[data-tipo="error"]');
  assert.match(await pagina.textContent('#aviso-flotante'), /Para publicarlo falta.*discapacidad visual/);
  assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sin scroll horizontal en 390 px');
  await contexto.close();
});

test('ocultar, ordenar y eliminar (con confirmación)', async () => {
  const { pagina, contexto, sb } = await abrirPanel();
  await fila(pagina, 'london').locator('[data-accion="publicar"]').click();
  await pagina.waitForSelector('.tarjeta-proyecto[data-id="london"] .insignia.oculto');
  assert.equal(ultimo(sb, 'PATCH', 'proyectos').cuerpo.publicado, false);
  // Bajar el primero
  await fila(pagina, 'casa-moderna').locator('[data-accion="bajar"]').click();
  await pagina.waitForFunction(() => document.querySelector('.tarjeta-proyecto').dataset.id === 'cuentos-y-espias');
  // Eliminar: primero se cancela, después se confirma
  await fila(pagina, 'oficina').locator('[data-accion="eliminar"]').click();
  await pagina.click('.dialogo [data-r="no"]');
  assert.equal(sb.pedidos.filter(p => p.metodo === 'DELETE').length, 0);
  await fila(pagina, 'oficina').locator('[data-accion="eliminar"]').click();
  await pagina.click('.dialogo [data-r="si"]');
  await pagina.waitForSelector('.tarjeta-proyecto[data-id="oficina"]', { state: 'detached' });
  assert.equal(sb.tablas.proyectos.some(p => p.id === 'oficina'), false);
  await contexto.close();
});

test('video: modos, modo inicial y letra; los créditos de la canción pasan a la lista', async () => {
  const { pagina, contexto, sb } = await abrirPanel();
  await fila(pagina, 'cuentos-y-espias').locator('[data-accion="editar"]').click();
  assert.ok(await pagina.locator('[data-solo="video"]').first().isVisible());
  assert.ok(await pagina.locator('fieldset[data-solo="maqueta escenario"]').isHidden());
  assert.ok(await pagina.locator('[data-archivo="modelo"]').isHidden(), 'un video no sube modelo 3D');
  assert.equal(await pagina.locator('.opcion:has([value="maqueta"]) input').isDisabled(), true);
  await pagina.locator('.casilla:has([value="360"])').click();          // quitar 360°
  await pagina.locator('.casilla:has([value="sin-televisor"]) [name="modo-inicial"]').check();
  await pagina.fill('#filas-letra .fila:first-child [name="letra-lineas"]', 'Primera línea\nSegunda línea');
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector('.lista-proyectos');
  const d = ultimo(sb, 'PATCH', 'proyectos').cuerpo.datos;
  assert.deepEqual(d.ar.modos, ['televisor', 'sin-televisor']);
  assert.equal(d.ar.modoInicial, 'sin-televisor');
  assert.deepEqual(d.letra[0].lineas, ['Primera línea', 'Segunda línea']);
  assert.ok(Array.isArray(d.creditos) && d.creditos.some(c => c.etiqueta === 'Música'));
  assert.equal(d.video, 'videos/cuentos-y-espias.mp4');
  await contexto.close();
});

test('salir del editor con cambios pide confirmación', async () => {
  const { pagina, contexto } = await abrirPanel();
  await fila(pagina, 'cafeteria').locator('[data-accion="editar"]').click();
  await pagina.fill('#f-materia', 'Otra materia');
  await pagina.click('#volver-lista');
  await pagina.waitForSelector('.dialogo');
  await pagina.click('.dialogo [data-r="no"]');
  assert.ok(await pagina.isVisible('#editor'));
  await pagina.click('#tab-ajustes');
  await pagina.waitForSelector('.dialogo');
  await pagina.click('.dialogo [data-r="si"]');
  await pagina.waitForSelector('#form-periodo');
  await contexto.close();
});

test('ajustes y carreras', async () => {
  const { pagina, contexto, sb } = await abrirPanel();
  await pagina.click('#tab-ajustes');
  assert.equal(await pagina.inputValue('#f-periodo-actual'), 'Semestre 2 - 2026');
  await pagina.fill('#f-periodo-actual', 'Semestre 1 - 2027');
  await pagina.click('#form-periodo button[type="submit"]');
  await pagina.waitForFunction(() => document.getElementById('aviso-flotante')?.textContent.includes('Periodo guardado'));
  assert.deepEqual(ultimo(sb, 'POST', 'ajustes').cuerpo, { clave: 'periodoActual', valor: 'Semestre 1 - 2027' });
  await pagina.locator('#form-ar label.interruptor').click();
  await pagina.click('#form-ar button[type="submit"]');
  await pagina.waitForFunction(() => document.getElementById('aviso-flotante')?.textContent === 'Guardado');
  assert.deepEqual(ultimo(sb, 'POST', 'ajustes').cuerpo, { clave: 'configuracion', valor: { arPropia: false } });
  // Respaldo con la forma de proyectos.json
  const [descarga] = await Promise.all([pagina.waitForEvent('download'), pagina.click('#descargar-respaldo')]);
  const respaldo = JSON.parse(await (await import('node:fs/promises')).readFile(await descarga.path(), 'utf8'));
  assert.equal(respaldo.periodoActual, 'Semestre 1 - 2027');
  assert.equal(respaldo.proyectos.length, 6);
  assert.equal(respaldo.proyectos[0].id, 'casa-moderna');
  // Carreras
  await pagina.click('#tab-carreras');
  await pagina.fill('[data-id="arquitectura"] [name="nombreCorto"]', 'Arqui');
  await pagina.click('[data-id="arquitectura"] button[type="submit"]');
  await pagina.waitForFunction(() => document.getElementById('aviso-flotante')?.textContent === 'Carrera guardada');
  assert.equal(ultimo(sb, 'PATCH', 'carreras').cuerpo.datos.nombreCorto, 'Arqui');
  // No se puede borrar una carrera con proyectos
  await pagina.click('[data-id="multimedia"] [data-accion="eliminar"]');
  assert.match(await pagina.textContent('#aviso-flotante'), /tiene 3 proyectos/);
  await contexto.close();
});

test('vista previa: con sesión de admin se ve un proyecto oculto; sin sesión, no', async () => {
  const contexto = await navegador.newContext();
  const pagina = await contexto.newPage();
  const sb = await fingirSupabase(pagina);
  sb.tablas.proyectos.find(p => p.id === 'london').publicado = false;
  // La API real filtra por RLS; el falso deja pasar lo oculto solo si se manda el token
  await pagina.goto(servidor.url + 'proyecto.html?id=london');
  await pagina.waitForSelector('.alerta, .ficha-grid', { timeout: 15000 });
  const pidioPublicado = sb.pedidos.some(p => p.ruta.endsWith('/proyectos') && p.query.includes('publicado=eq.true'));
  assert.ok(pidioPublicado, 'sin vista previa pide solo lo publicado');
  await iniciarSesionFalsa(pagina);
  await pagina.goto(servidor.url + 'proyecto.html?id=london&vista=previa');
  await pagina.waitForSelector('.barra-previa', { timeout: 15000 });
  const pedido = sb.pedidos.filter(p => p.ruta.endsWith('/proyectos')).at(-1);
  assert.ok(!pedido.query.includes('publicado=eq.true'), 'en vista previa pide todo');
  assert.match(pedido.encabezados.authorization, /^Bearer ey/);
  await pagina.waitForSelector('.ficha-grid');
  assert.match(await pagina.textContent('#titulo'), /London/i);
  // Salir de la vista previa
  await pagina.click('.barra-previa button');
  await pagina.waitForURL(u => !u.search.includes('vista=previa'));
  await contexto.close();
});
