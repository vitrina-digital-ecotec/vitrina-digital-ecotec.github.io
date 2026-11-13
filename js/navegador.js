// =========================================================
// navegador.js — ¿este navegador puede abrir la realidad aumentada?
//
// La AR en el navegador (WebXR) solo funciona en Chrome de Android (y en algunos
// otros como Samsung Internet). Brave, Firefox y los navegadores internos de
// WhatsApp, Instagram y Facebook NO la tienen. En esos casos se muestra un aviso
// amable con dos salidas: «Abrir en Chrome» (misma página, en Chrome) y «Copiar enlace».
// En iPhone no cambia nada: ahí la AR es Quick Look de Safari.
// =========================================================

/** Qué navegador es (solo lo que importa para la AR) */
export function infoNavegador() {
  const ua = navigator.userAgent;
  const android = /Android/i.test(ua);
  const nombre =
    navigator.brave ? 'brave' :                                  // Brave se disfraza de Chrome, pero tiene navigator.brave
    /Firefox\//.test(ua) ? 'firefox' :
    /Instagram/.test(ua) ? 'instagram' :
    /FBAN|FBAV|FB_IAB/.test(ua) ? 'facebook' :
    /WhatsApp/i.test(ua) ? 'whatsapp' :
    /; wv\)/.test(ua) ? 'webview' :                              // navegador interno de alguna otra app
    /SamsungBrowser/.test(ua) ? 'samsung' :
    /EdgA\//.test(ua) ? 'edge' :
    /OPR\/|Opera/.test(ua) ? 'opera' :
    /Chrome\//.test(ua) ? 'chrome' : 'otro';
  // Los navegadores internos de las apps no abren otras apps bien (Scene Viewer queda en error)
  const interno = ['instagram', 'facebook', 'whatsapp', 'webview'].includes(nombre);
  return { android, nombre, interno };
}

/** Dirección intent:// que abre ESTA misma página en Chrome (solo Android). Si no tiene Chrome, Android ofrece instalarlo. */
export function urlEnChrome() {
  // Sin el «#…»: Scene Viewer deja «#model-viewer-no-ar-fallback» cuando falla
  const { host, pathname, search } = window.location;
  return `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`;
}

/**
 * Prepara el aviso (#aviso-navegador de ar.html) y devuelve { mostrar() }.
 *   textoSeguir: el botón para cerrar el aviso («Seguir en 3D», «Ver el video aquí»…)
 */
export function prepararAvisoNavegador({ textoSeguir = 'Seguir en 3D' } = {}) {
  const $ = (id) => document.getElementById(id);
  const aviso = $('aviso-navegador');
  const nav = infoNavegador();
  const copiado = $('aviso-navegador-copiado');

  if (nav.nombre === 'chrome') {
    // Ya está en Chrome: lo que falta es el celular (no tiene «Servicios de Google Play para RA»)
    $('aviso-navegador-titulo').textContent = 'Este celular no tiene AR';
    $('aviso-navegador-texto').textContent = 'Tu celular no permite realidad aumentada en el navegador. Puedes seguir viéndolo en 3D aquí mismo.';
    $('aviso-navegador-chrome').hidden = true;
    $('aviso-navegador-copiar').hidden = true;
  }
  if (!nav.android) $('aviso-navegador-chrome').hidden = true;
  $('aviso-navegador-chrome').href = urlEnChrome();
  $('aviso-navegador-seguir').textContent = textoSeguir;

  const cerrar = () => { aviso.hidden = true; };
  $('aviso-navegador-seguir').addEventListener('click', cerrar);
  aviso.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
  $('aviso-navegador-copiar').addEventListener('click', async () => {
    const enlace = window.location.href.split('#')[0];
    const ok = await copiar(enlace);
    copiado.textContent = ok
      ? '¡Enlace copiado! Abre Chrome y pégalo en la barra de direcciones.'
      : `Copia esta dirección y ábrela en Chrome: ${enlace}`;
  });

  return {
    mostrar() {
      copiado.textContent = '';
      aviso.hidden = false;
      (nav.nombre === 'chrome' ? $('aviso-navegador-seguir') : $('aviso-navegador-chrome')).focus();
    }
  };
}

/** Copia texto al portapapeles. Los navegadores internos a veces no tienen la API moderna: se usa el método antiguo. */
async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { /* sigue con el método antiguo */ }
  try {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch { return false; }
}
