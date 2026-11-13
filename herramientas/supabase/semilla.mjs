// =========================================================
// semilla.mjs — convierte data/proyectos.json en supabase/02-semilla.sql
//
// Correr (desde la carpeta vitrina-digital):  node herramientas/supabase/semilla.mjs
//
// El SQL carga en Supabase los ajustes, las carreras y los proyectos tal como están
// en el JSON. Si un proyecto ya existe en Supabase NO lo pisa («on conflict do nothing»):
// así, correrlo otra vez no borra lo que el admin cambió en el panel.
// =========================================================
import { readFile, writeFile } from 'node:fs/promises';

const RAIZ = new URL('../../', import.meta.url);
const json = JSON.parse(await readFile(new URL('data/proyectos.json', RAIZ), 'utf8'));

// Texto jsonb a prueba de comillas: $vitrina$…$vitrina$ no necesita escapar nada
const jsonb = (valor) => {
  const texto = JSON.stringify(valor);
  if (texto.includes('$vitrina$')) throw new Error('El JSON contiene «$vitrina$»');
  return `$vitrina$${texto}$vitrina$::jsonb`;
};
const texto = (t) => `'${String(t).replaceAll("'", "''")}'`;

const lineas = [
  '-- =========================================================',
  '-- 02-semilla.sql — contenido inicial (copia de data/proyectos.json)',
  '-- Generado con: node herramientas/supabase/semilla.mjs  (no lo edites a mano)',
  '-- Cómo usarlo: Supabase → SQL Editor → New query → pega TODO → Run.',
  '-- Correr 01-esquema.sql ANTES. Si un proyecto ya existe, no se pisa.',
  '-- =========================================================',
  '',
  'insert into public.ajustes (clave, valor) values',
  `  ('periodoActual', ${jsonb(json.periodoActual)}),`,
  `  ('configuracion', ${jsonb(json.configuracion ?? {})})`,
  'on conflict (clave) do nothing;',
  '',
  'insert into public.carreras (id, orden, publicado, datos) values'
];

lineas.push(json.carreras.map(({ id, orden, ...datos }) =>
  `  (${texto(id)}, ${orden ?? 99}, true, ${jsonb(datos)})`).join(',\n'));
lineas.push('on conflict (id) do nothing;', '');

// El orden del JSON es el del carrusel: se guarda de 10 en 10 para poder meter uno en medio
lineas.push('insert into public.proyectos (id, carrera, orden, publicado, datos) values');
lineas.push(json.proyectos.map(({ id, carrera, ...datos }, i) =>
  `  (${texto(id)}, ${texto(carrera)}, ${(i + 1) * 10}, true,\n   ${jsonb(datos)})`).join(',\n'));
lineas.push('on conflict (id) do nothing;', '');

lineas.push(
  '-- Revisión: deberían salir 2 carreras y 6 proyectos',
  "select 'carreras' as tabla, count(*) from public.carreras",
  "union all select 'proyectos', count(*) from public.proyectos;",
  ''
);

await writeFile(new URL('supabase/02-semilla.sql', RAIZ), lineas.join('\n'));
console.log(`Listo: supabase/02-semilla.sql (${json.carreras.length} carreras, ${json.proyectos.length} proyectos)`);
