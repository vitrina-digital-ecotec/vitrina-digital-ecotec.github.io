// =========================================================
// Prueba del aviso «Ábrelo en Chrome» (Fase 5 · parte 0)
// Se simula un Android con Brave, con el navegador interno de Instagram y con Chrome
// en un celular sin AR. Se revisa que el aviso aparezca, que «Abrir en Chrome» lleve
// a la misma página y que se registre «navegador_no_compatible».
// Correr: cd pruebas → npm test
// =========================================================
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { levantarServidor } from './servidor.mjs';

let servidor, navegador;
before(async () => {
  servidor = await levantarServidor();
  navegador = await chromium.launch({ channel: 'chrome' });
});
after(async () => { await navegador?.close(); servidor?.cerrar(); });

const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 15; X6886) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

/** Abre ar.html como un Android con el navegador indicado (sin WebXR) y junta las métricas. */
async function abrir({ ua = UA_ANDROID, brave = false, id = 'casa-moderna' }) {
  const contexto = await navegador.newContext({ userAgent: ua, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pagina = await contexto.newPage();
  const metricas = [];
  pagina.on('console', m => { if (m.text().startsWith('[métrica]')) metricas.push(m.text()); });
  await pagina.addInitScript((esBrave) => {
    if (esBrave) Object.defineProperty(navigator, 'brave', { value: { isBrave: async () => true } });
    // Ningún navegador de esta prueba tiene WebXR
    Object.defineProperty(navigator, 'xr', { value: undefined });
  }, brave);
  await pagina.goto(`${servidor.url}ar.html?id=${id}`);
  return { pagina, contexto, metricas };
}

test('Brave: Scene Viewer no abre → aviso con «Abrir en Chrome»', async () => {
  const { pagina, contexto, metricas } = await abrir({ brave: true });
  await pagina.waitForSelector('#entrar-ar:not([hidden])', { timeout: 60000 });
  await pagina.click('#ver-en-mi-espacio');
  // Primero se intenta Scene Viewer; en la prueba no abre nada, así que a los 3 s aparece el aviso
  await pagina.waitForSelector('#aviso-navegador:not([hidden])', { timeout: 6000 });
  const href = await pagina.getAttribute('#aviso-navegador-chrome', 'href');
  assert.match(href, /^intent:\/\/127\.0\.0\.1:\d+\/ar\.html\?id=casa-moderna#Intent;scheme=https;package=com\.android\.chrome;end$/);
  assert.ok(metricas.some(m => m.includes('navegador_no_compatible')), 'debe registrar navegador_no_compatible');
  assert.ok(await pagina.isVisible('#aviso-navegador-copiar'));
  await pagina.click('#aviso-navegador-seguir');
  assert.ok(await pagina.isHidden('#aviso-navegador'));
  await contexto.close();
});

test('Instagram: el aviso aparece al instante (no se intenta Scene Viewer)', async () => {
  const { pagina, contexto } = await abrir({ ua: UA_ANDROID.replace('Mobile Safari/537.36', 'Mobile Safari/537.36 Instagram 350.0.0.0 Android') });
  await pagina.waitForSelector('#entrar-ar:not([hidden])', { timeout: 60000 });
  await pagina.click('#ver-en-mi-espacio');
  await pagina.waitForSelector('#aviso-navegador:not([hidden])', { timeout: 1000 });
  await contexto.close();
});

test('Video en Brave: el aviso aparece al cargar y deja ver el video aquí', async () => {
  const { pagina, contexto } = await abrir({ brave: true, id: 'cuentos-y-espias' });
  await pagina.waitForSelector('#aviso-navegador:not([hidden])', { timeout: 60000 });
  assert.equal(await pagina.textContent('#aviso-navegador-seguir'), 'Ver el video aquí');
  await pagina.click('#aviso-navegador-seguir');
  assert.ok(await pagina.isVisible('#abrir-cine'));
  await contexto.close();
});

test('Chrome en un celular sin AR: no ofrece «Abrir en Chrome»', async () => {
  const { pagina, contexto } = await abrir({});
  await pagina.waitForSelector('#entrar-ar:not([hidden])', { timeout: 60000 });
  await pagina.click('#ver-en-mi-espacio');
  await pagina.waitForSelector('#aviso-navegador:not([hidden])', { timeout: 6000 });
  assert.equal(await pagina.textContent('#aviso-navegador-titulo'), 'Este celular no tiene AR');
  assert.ok(await pagina.isHidden('#aviso-navegador-chrome'));
  await contexto.close();
});

test('Computadora: sin aviso, sigue el QR', async () => {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  const pagina = await contexto.newPage();
  await pagina.goto(`${servidor.url}ar.html?id=casa-moderna`);
  await pagina.waitForSelector('#ar-qr:not([hidden])', { timeout: 60000 });
  assert.ok(await pagina.isHidden('#aviso-navegador'));
  assert.ok(await pagina.isHidden('#entrar-ar'));
  await contexto.close();
});
