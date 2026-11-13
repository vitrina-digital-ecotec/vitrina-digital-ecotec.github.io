// =========================================================
// admin/js/ajustes.js — pestaña «Ajustes»: periodo actual, AR propia y respaldo (Plan B)
// =========================================================
import { $, avisar, errorAlGuardar } from './util.js';
import { estado, guardarAjuste, respaldoJSON } from './datos-panel.js';

export function iniciarAjustes(raiz) {
  const configuracion = estado.ajustes.configuracion ?? {};
  raiz.innerHTML = `
    <h2>Ajustes</h2>

    <form class="tarjeta-panel" id="form-periodo" novalidate>
      <h3>Periodo actual</h3>
      <p class="ayuda">Aparece en la tarjeta blanca del inicio (por ejemplo «SEMESTRE 2 - 2026»). Cámbialo cada semestre.</p>
      <div class="campo">
        <label for="f-periodo-actual">Periodo</label>
        <input id="f-periodo-actual" name="periodo" value="" placeholder="Semestre 1 - 2027">
      </div>
      <button type="submit" class="boton-panel principal">Guardar periodo</button>
    </form>

    <form class="tarjeta-panel" id="form-ar" novalidate>
      <h3>Realidad aumentada de las maquetas</h3>
      <div class="campo">
        <label class="interruptor"><input type="checkbox" role="switch" name="arPropia" ${configuracion.arPropia !== false ? 'checked' : ''}><span class="interruptor-pista" aria-hidden="true"></span> Usar la realidad aumentada completa de la vitrina (recomendado)</label>
        <p class="ayuda">Encendida: tutorial, botones para girar y cambiar el tamaño, «Ver interior» y «Colocar aquí». Apagada: la realidad aumentada básica de Google, más simple. Apágala solo si la completa da problemas en algún celular.</p>
      </div>
      <button type="submit" class="boton-panel principal">Guardar</button>
    </form>

    <section class="tarjeta-panel">
      <h3>Copia de respaldo</h3>
      <p class="ayuda">Si la base de datos no responde (sin internet o en pausa), la vitrina muestra una copia guardada en el sitio para no quedar en blanco. Para que esa copia tenga tus últimos cambios:</p>
      <ol class="ayuda pasos">
        <li>Descarga la copia con el botón de abajo.</li>
        <li>En GitHub, entra a la carpeta <code>data</code> del repositorio → <strong>Add file</strong> → <strong>Upload files</strong>.</li>
        <li>Sube el archivo descargado (se llama <code>proyectos.json</code> y reemplaza al anterior) → <strong>Commit changes</strong>.</li>
      </ol>
      <button type="button" class="boton-panel" id="descargar-respaldo">Descargar la copia de respaldo</button>
    </section>`;

  // Se pone con .value (no en el HTML) para no tener que escapar nada
  $('#f-periodo-actual', raiz).value = estado.ajustes.periodoActual ?? '';

  $('#form-periodo', raiz).addEventListener('submit', async (e) => {
    e.preventDefault();
    const periodo = e.target.elements.periodo.value.trim();
    if (!periodo) { avisar('Escribe el periodo.', 'error'); return; }
    try { await guardarAjuste('periodoActual', periodo); avisar('Periodo guardado: ya se ve en el inicio'); }
    catch (error) { avisar(errorAlGuardar(error), 'error'); }
  });

  $('#form-ar', raiz).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await guardarAjuste('configuracion', { ...(estado.ajustes.configuracion ?? {}), arPropia: e.target.elements.arPropia.checked });
      avisar('Guardado');
    } catch (error) { avisar(errorAlGuardar(error), 'error'); }
  });

  $('#descargar-respaldo', raiz).addEventListener('click', () => {
    const texto = JSON.stringify(respaldoJSON(), null, 2) + '\n';
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
    enlace.download = 'proyectos.json';
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
    avisar('Copia descargada. Súbela a GitHub siguiendo los pasos.');
  });
}
