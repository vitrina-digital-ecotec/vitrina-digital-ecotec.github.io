// =========================================================
// supabase-falso.mjs — un Supabase de mentira para probar el panel sin tocar el real
//
// Guarda las tablas en memoria (con el contenido de data/proyectos.json) y responde
// lo mismo que la API REST de Supabase para lo que usa el panel: leer, crear, editar,
// borrar y «upsert». Anota cada pedido para revisar qué se mandó.
//   const sb = await fingirSupabase(pagina);   → sb.tablas, sb.pedidos
//   await iniciarSesionFalsa(pagina, servidor.url)
// =========================================================
import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../js/config.js', import.meta.url), 'utf8');
export const SB = config.match(/SUPABASE_URL = '([^']*)'/)[1];
const json = JSON.parse(await readFile(new URL('../data/proyectos.json', import.meta.url), 'utf8'));

export function tablasIniciales() {
  return {
    ajustes: [{ clave: 'periodoActual', valor: json.periodoActual }, { clave: 'configuracion', valor: json.configuracion }],
    carreras: json.carreras.map(({ id, orden, ...datos }) => ({ id, orden, publicado: true, datos })),
    proyectos: json.proyectos.map(({ id, carrera, ...datos }, i) => ({ id, carrera, orden: (i + 1) * 10, publicado: true, datos, actualizado: '2026-11-13T15:00:00Z' })),
    eventos: []
  };
}

const CLAVES = { ajustes: 'clave' };

export async function fingirSupabase(pagina, { admin = true, tablas = tablasIniciales() } = {}) {
  const pedidos = [];
  const archivos = new Map();     // Storage: «bucket/ruta» → { tipo, datos }
  await pagina.route(`${SB}/**`, async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    const metodo = req.method();
    const responder = (datos, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(datos) });
    // ---------- Storage ----------
    if (url.pathname.startsWith('/storage/v1/')) {
      const ruta = decodeURIComponent(url.pathname.replace('/storage/v1/object/', ''));
      pedidos.push({ metodo, ruta: url.pathname, storage: true, encabezados: req.headers(), cuerpo: metodo === 'DELETE' || ruta.startsWith('list/') ? JSON.parse(req.postData() || '{}') : null });
      if (ruta.startsWith('public/') && metodo === 'GET') {
        const a = archivos.get(ruta.slice(7));
        return a ? r.fulfill({ status: 200, contentType: a.tipo, body: a.datos }) : r.fulfill({ status: 404 });
      }
      if (ruta.startsWith('list/')) {
        const bucket = ruta.slice(5); const { prefix = '' } = JSON.parse(req.postData() || '{}');
        const lista = [...archivos.keys()].filter(k => k.startsWith(`${bucket}/${prefix}/`)).map(k => ({ name: k.split('/').pop() }));
        return responder(lista);
      }
      if (metodo === 'POST' || metodo === 'PUT') {
        if (!admin) return responder({ statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }, 400);
        archivos.set(ruta, { tipo: req.headers()['content-type'], datos: req.postDataBuffer() });
        return responder({ Key: ruta });
      }
      if (metodo === 'DELETE') {
        const { prefixes = [] } = JSON.parse(req.postData() || '{}');
        prefixes.forEach(p => archivos.delete(`${ruta}/${p}`));
        return responder(prefixes.map(name => ({ name })));
      }
      return responder({});
    }
    const cuerpo = req.postData() ? JSON.parse(req.postData()) : null;
    pedidos.push({ metodo, ruta: url.pathname, query: url.search, cuerpo, encabezados: req.headers() });
    if (url.pathname.startsWith('/auth/v1/logout')) return r.fulfill({ status: 204 });
    if (url.pathname === '/rest/v1/rpc/es_admin') return responder(admin);
    const tabla = url.pathname.replace('/rest/v1/', '');
    const filas = tablas[tabla];
    if (!filas) return responder([]);
    const clave = CLAVES[tabla] ?? 'id';
    // Filtros simples: columna=eq.valor
    const filtros = [...url.searchParams].filter(([k, v]) => !['select', 'order', 'on_conflict', 'columns'].includes(k) && v.startsWith('eq.'))
      .map(([k, v]) => [k, v.slice(3)]);
    const coincide = (f) => filtros.every(([k, v]) => String(f[k]) === v);
    const unaSola = (req.headers().accept ?? '').includes('vnd.pgrst.object');
    const salida = (lista) => (unaSola ? responder(lista[0] ?? null, lista.length ? 200 : 406) : responder(lista));
    if (metodo === 'GET') {
      let lista = filas.filter(coincide);
      if (url.searchParams.get('order')?.startsWith('orden')) lista = [...lista].sort((a, b) => a.orden - b.orden);
      return salida(lista);
    }
    if (metodo === 'POST') {
      const nuevas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map(f => ({ actualizado: new Date().toISOString(), ...f }));
      const upsert = (req.headers().prefer ?? '').includes('merge-duplicates');
      for (const f of nuevas) {
        const i = filas.findIndex(x => x[clave] === f[clave]);
        if (i >= 0 && !upsert) return responder({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
        if (i >= 0) filas[i] = { ...filas[i], ...f }; else filas.push(f);
      }
      return salida(nuevas);
    }
    if (metodo === 'PATCH') {
      const cambiadas = [];
      filas.forEach((f, i) => { if (coincide(f)) { filas[i] = { ...f, ...cuerpo, actualizado: new Date().toISOString() }; cambiadas.push(filas[i]); } });
      return salida(cambiadas);
    }
    if (metodo === 'DELETE') {
      for (let i = filas.length - 1; i >= 0; i--) if (coincide(filas[i])) filas.splice(i, 1);
      return r.fulfill({ status: 204 });
    }
    return responder([]);
  });
  return { tablas, pedidos, archivos };
}

/** Deja guardada una sesión de admin (como la que guarda supabase-js al entrar), antes de abrir cualquier página */
export async function iniciarSesionFalsa(pagina, email = 'dianapaolaespinoza2002@gmail.com') {
  const proyecto = new URL(SB).hostname.split('.')[0];
  await pagina.addInitScript(({ proyecto, email }) => {
    const b64 = o => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ email, exp, sub: '00000000-0000-0000-0000-000000000001', role: 'authenticated', aud: 'authenticated' })}.firma`;
    localStorage.setItem(`sb-${proyecto}-auth-token`, JSON.stringify({
      access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r',
      user: { id: '00000000-0000-0000-0000-000000000001', email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
    }));
  }, { proyecto, email });
}
