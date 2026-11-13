// =========================================================
// Prueba del login del panel (Fase 5 · parte 2)
// - Sin sesión, /admin/ manda al login.
// - Contraseña incorrecta → mensaje claro (contra el Supabase REAL: un solo intento).
// - Con un Supabase fingido: entra un admin; una cuenta que no es admin no puede entrar;
//   «Salir» cierra la sesión. La contraseña real nunca se usa en las pruebas.
// Correr: cd pruebas → npm test
// =========================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { levantarServidor } from './servidor.mjs';

let servidor, navegador;
const config = await readFile(new URL('../js/config.js', import.meta.url), 'utf8');
const SB = config.match(/SUPABASE_URL = '([^']*)'/)[1];

before(async () => {
  servidor = await levantarServidor();
  navegador = await chromium.launch({ channel: 'chrome' });
});
after(async () => { await navegador?.close(); servidor?.cerrar(); });

/** Token con forma de JWT (sin firma real: solo lo lee el navegador en la prueba) */
function tokenFalso(email) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '00000000-0000-0000-0000-000000000001', email, role: 'authenticated', aud: 'authenticated', exp })}.firma`;
}

/** Supabase fingido: «clave-buena» entra; es_admin responde según el correo */
async function fingirSupabase(pagina, { admins = ['dianapaolaespinoza2002@gmail.com'] } = {}) {
  const registro = { logout: 0 };
  let correoActual = null;
  await pagina.route(`${SB}/**`, async (r) => {
    const url = new URL(r.request().url());
    const json = (cuerpo, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) });
    if (url.pathname === '/auth/v1/token') {
      const { email, password } = r.request().postDataJSON();
      if (password !== 'clave-buena') return json({ code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      correoActual = email;
      return json({
        access_token: tokenFalso(email), token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresco',
        user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
      });
    }
    if (url.pathname === '/auth/v1/logout') { registro.logout++; return r.fulfill({ status: 204 }); }
    if (url.pathname === '/rest/v1/rpc/es_admin') return json(admins.includes(correoActual));
    if (url.pathname === '/rest/v1/proyectos') {
      return json([
        { id: 'casa-moderna', carrera: 'arquitectura', orden: 10, publicado: true, actualizado: '2026-11-13T15:00:00Z', datos: { titulo: 'Casa Moderna', tipo: 'maqueta' } },
        { id: 'oculto', carrera: 'arquitectura', orden: 20, publicado: false, actualizado: '2026-11-12T15:00:00Z', datos: { titulo: 'Oculto', tipo: 'maqueta' } }]);
    }
    if (url.pathname === '/rest/v1/carreras') {
      return json([{ id: 'arquitectura', orden: 1, publicado: true, datos: { nombre: 'Arquitectura', nombreCorto: 'Arquitectura', icono: 'arquitectura' } }]);
    }
    return json([]);
  });
  return registro;
}

test('sin sesión, el panel manda al login', async () => {
  const pagina = await navegador.newPage();
  await pagina.goto(servidor.url + 'admin/index.html');
  await pagina.waitForURL(/admin\/login\.html/, { timeout: 15000 });
  assert.ok(await pagina.isVisible('#form-ingresar'));
  assert.ok(await pagina.isHidden('.panel-cuerpo'), 'el panel no debe verse');
  await pagina.close();
});

test('contraseña incorrecta (Supabase real): mensaje claro', async () => {
  const pagina = await navegador.newPage();
  await pagina.goto(servidor.url + 'admin/login.html');
  await pagina.fill('#correo', 'dianapaolaespinoza2002@gmail.com');
  await pagina.fill('#clave', 'no-es-la-clave-' + Date.now());
  await pagina.click('#form-ingresar button[type="submit"]');
  await pagina.waitForSelector('#aviso:not([hidden])', { timeout: 15000 });
  assert.equal(await pagina.textContent('#aviso'), 'Correo o contraseña incorrectos.');
  await pagina.close();
});

for (const ancho of [390, 1280]) {
  test(`admin entra, ve el panel y sale (${ancho} px)`, async () => {
    const contexto = await navegador.newContext({ viewport: { width: ancho, height: 800 } });
    const pagina = await contexto.newPage();
    const errores = [];
    pagina.on('pageerror', e => errores.push(e.message));
    const registro = await fingirSupabase(pagina);
    await pagina.goto(servidor.url + 'admin/login.html');
    await pagina.fill('#correo', 'DianaPaolaEspinoza2002@gmail.com');
    await pagina.fill('#clave', 'clave-buena');
    await pagina.click('#form-ingresar button[type="submit"]');
    await pagina.waitForURL(/admin\/index\.html/, { timeout: 15000 });
    await pagina.waitForSelector('#resumen .estado-conexion.ok', { timeout: 15000 });
    assert.ok((await pagina.textContent('#resumen')).startsWith('Conectado · 2 proyectos (1 publicado)'));
    assert.equal(await pagina.textContent('#salir'), 'Cerrar sesión');
    assert.equal(await pagina.textContent('#correo-admin'), 'dianapaolaespinoza2002@gmail.com');
    // Sin scroll horizontal
    assert.ok(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no debe haber scroll horizontal');
    // Pestañas
    await pagina.click('#tab-metricas');
    assert.ok(await pagina.isVisible('#seccion-metricas'));
    assert.ok(await pagina.isHidden('#seccion-proyectos'));
    // Si vuelve al login con la sesión abierta, pasa directo al panel
    await pagina.goto(servidor.url + 'admin/login.html', { waitUntil: 'commit' });
    await pagina.waitForURL(/admin\/index\.html/, { timeout: 15000 });
    // Salir
    await pagina.click('#salir');
    await pagina.waitForURL(/login\.html\?motivo=salio/, { timeout: 15000 });
    assert.equal(registro.logout, 1);
    await pagina.goto(servidor.url + 'admin/index.html', { waitUntil: 'commit' });
    await pagina.waitForURL(/admin\/login\.html/, { timeout: 15000 });
    assert.deepEqual(errores, []);
    await contexto.close();
  });
}

test('una cuenta que no es admin no puede entrar', async () => {
  const pagina = await navegador.newPage();
  const registro = await fingirSupabase(pagina);
  await pagina.goto(servidor.url + 'admin/login.html');
  await pagina.fill('#correo', 'otra.persona@gmail.com');
  await pagina.fill('#clave', 'clave-buena');
  await pagina.click('#form-ingresar button[type="submit"]');
  await pagina.waitForSelector('#aviso:not([hidden])', { timeout: 15000 });
  assert.match(await pagina.textContent('#aviso'), /no tiene permiso/);
  assert.match(pagina.url(), /login\.html/);
  assert.equal(registro.logout, 1, 'debe cerrar la sesión de esa cuenta');
  await pagina.close();
});

test('ojo de la contraseña: ícono de línea que se tacha al mostrarla', async () => {
  const pagina = await navegador.newPage();
  await pagina.goto(servidor.url + 'admin/login.html');
  const ojo = pagina.locator('.ver-clave[data-para="clave"]');
  assert.equal(await ojo.getAttribute('aria-label'), 'Mostrar contraseña');
  assert.equal(await ojo.locator('svg').count(), 1);
  assert.ok(await ojo.locator('.ojo-tachado').isHidden());
  await ojo.click();
  assert.equal(await pagina.getAttribute('#clave', 'type'), 'text');
  assert.equal(await ojo.getAttribute('aria-label'), 'Ocultar contraseña');
  assert.ok(await ojo.locator('.ojo-tachado').isVisible());
  // «Volver a la vitrina» sin subrayado hasta pasar el mouse
  const volver = pagina.locator('.login-pie .enlace');
  assert.match(await volver.evaluate(e => getComputedStyle(e).textDecorationLine), /none/);
  await volver.hover();
  assert.match(await volver.evaluate(e => getComputedStyle(e).textDecorationLine), /underline/);
  await pagina.close();
});
