// =========================================================
// Prueba de la carga de datos (Fase 5 · parte 1): Supabase y Plan B
// Se finge un Supabase (no hace falta el real):
//   - responde → el sitio muestra lo de Supabase (y guarda una copia local);
//   - caído (503) o lento (> 4 s) → usa la copia local o data/proyectos.json.
// Correr: cd pruebas → npm test
// =========================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { levantarServidor } from './servidor.mjs';

let servidor, navegador;
const FALSO = 'https://falso.supabase.co';
const json = JSON.parse(await readFile(new URL('../data/proyectos.json', import.meta.url), 'utf8'));

before(async () => {
  servidor = await levantarServidor();
  navegador = await chromium.launch({ channel: 'chrome' });
});
after(async () => { await navegador?.close(); servidor?.cerrar(); });

/** Página con config.js apuntando al Supabase falso; «responder» decide qué devuelve. */
async function pagina(responder) {
  const contexto = await navegador.newContext();
  const p = await contexto.newPage();
  const original = await readFile(new URL('../js/config.js', import.meta.url), 'utf8');
  await p.route('**/js/config.js', r => r.fulfill({
    contentType: 'text/javascript',
    body: original.replace(/SUPABASE_URL = '[^']*'/, `SUPABASE_URL = '${FALSO}'`).replace(/SUPABASE_CLAVE_PUBLICA = '[^']*'/, "SUPABASE_CLAVE_PUBLICA = 'sb_publishable_prueba'")
  }));
  const pedidos = [];
  await p.route(`${FALSO}/**`, (r) => { pedidos.push(r.request()); return responder(r); });
  return { p, contexto, pedidos };
}

const filasSupabase = {
  ajustes: [{ clave: 'periodoActual', valor: 'Semestre 1 - 2027' }, { clave: 'configuracion', valor: { arPropia: true } }],
  carreras: json.carreras.map(({ id, orden, ...datos }) => ({ id, orden, datos })),
  proyectos: json.proyectos.map(({ id, carrera, ...datos }) => ({ id, carrera, datos: { ...datos, titulo: datos.titulo + ' (Supabase)' } }))
};
const responderBien = (r) => {
  const tabla = new URL(r.request().url()).pathname.split('/').pop();
  return r.fulfill({ contentType: 'application/json', body: JSON.stringify(filasSupabase[tabla]) });
};

test('con Supabase: el sitio muestra lo que dice la base de datos', async () => {
  const { p, contexto, pedidos } = await pagina(responderBien);
  await p.goto(servidor.url + 'carrera.html?c=arquitectura');
  await p.waitForSelector('text=Casa Moderna (Supabase)', { timeout: 20000 });
  assert.equal(pedidos[0].headers().apikey, 'sb_publishable_prueba');
  assert.ok(pedidos.every(q => q.url().includes('publicado=eq.true') || q.url().includes('/ajustes')));
  await p.goto(servidor.url + 'index.html');
  await p.waitForSelector('text=Semestre 1 - 2027', { timeout: 20000 });
  await contexto.close();
});

test('Supabase caído (503) y sin copia: Plan B con data/proyectos.json', async () => {
  const { p, contexto } = await pagina(r => r.fulfill({ status: 503, body: 'pausado' }));
  await p.goto(servidor.url + 'carrera.html?c=arquitectura');
  await p.waitForSelector('text=Casa Moderna', { timeout: 20000 });
  assert.equal(await p.locator('text=(Supabase)').count(), 0);
  await contexto.close();
});

test('Supabase caído pero con copia local: usa la última copia buena', async () => {
  const { p, contexto } = await pagina(responderBien);
  await p.goto(servidor.url + 'carrera.html?c=arquitectura');
  await p.waitForSelector('text=Casa Moderna (Supabase)', { timeout: 20000 });
  await p.unroute(`${FALSO}/**`);
  await p.route(`${FALSO}/**`, r => r.abort('internetdisconnected'));
  await p.reload();
  await p.waitForSelector('text=Casa Moderna (Supabase)', { timeout: 20000 });
  await contexto.close();
});

test('Supabase lento (más de 4 s): no espera para siempre', async () => {
  const { p, contexto } = await pagina(() => new Promise(() => {}));   // nunca contesta
  const inicio = Date.now();
  await p.goto(servidor.url + 'carrera.html?c=arquitectura');
  await p.waitForSelector('text=Casa Moderna', { timeout: 20000 });
  assert.ok(Date.now() - inicio < 9000, 'el Plan B debería entrar a los ~4 s');
  await contexto.close();
});
