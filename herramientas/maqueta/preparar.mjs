// =========================================================
// preparar.mjs — recetas de optimización de cada proyecto (usa optimizar.mjs)
//
// Uso:  cd herramientas/maqueta  →  npm install  →  node preparar.mjs deliveryrush
//       (o: cafeteria, oficina, london, todos)
// Cada receta genera dos archivos en modelos/:
//   <id>.glb        la maqueta para la ficha y «Ver en mi espacio»
//   <id>-hero.glb   versión liviana (< 1 MB) para el carrusel del inicio
// Los originales se leen de _material/ (fuera del sitio, no se publican).
// =========================================================
import { optimizar } from './optimizar.mjs';
import { reemplazarTexturasCafeteria } from './texturas-cafeteria.mjs';
import { limpiarCafeteria } from './limpiar-cafeteria.mjs';

async function prepararCafeteria(doc) {
  await reemplazarTexturasCafeteria(doc);
  limpiarCafeteria(doc);
}

const MATERIAL = '../../../_material/3_proyectos/';
const MODELOS = '../../modelos/';

const recetas = {
  // DeliveryRush (Virtual Games): mapa del nivel 1, convertido de FBX con FBX2glTF.
  // Diorama sin techo; se quitan las guías del diseño de nivel (no se ven en el juego).
  // Ronda 4: 1:12 (antes 1:24) para explorarlo como las maquetas: 1,1 m × 0,6 m sobre la mesa.
  deliveryrush: {
    entrada: MATERIAL + 'multimedia/DeliveryRush_Mapa_RamosyPonce.glb',
    escala: 12,
    quitar: /^(CEILING_|GUIDE_|MK_)/,
    simplificar: { nodos: /^(PROP_|DEC_|KIT_Props|FRIDGE_|PAC_)/, ratio: 0.15, error: 0.05, planas: true },
    meshopt: true,
    hero: { quitar: /^(CEILING_|GUIDE_|MK_|PROP_|DEC_|KEYPAD_|ARCH_Ceiling)/, simplificarTodo: { ratio: 0.5 }, maxTextura: 512 }
  },
  // Cafetería M3D (Modelado 3D): las imágenes de internet se cambian por propias (ver texturas-cafeteria.mjs).
  // Ronda 5: antes se limpia la geometría (duplicados, caras de un solo lado, materiales: ver limpiar-cafeteria.mjs)
  // y NO se simplifica (pesa poco). Texturas WebP de más calidad.
  cafeteria: {
    entrada: MATERIAL + 'multimedia/Modelo3D_ArllysRamos.glb',
    escala: 22,
    antes: prepararCafeteria,
    calidadTextura: 92,
    meshopt: true,
    hero: { maxTextura: 512, calidadTextura: 88 }
  },
  oficina: {
    entrada: MATERIAL + 'arquitectura/Ejemplo3_Oficina.glb',
    escala: 30,
    // Ronda 4: textura con 76 % de píxeles invisibles y el resto casi opaco → recorte (sin mezcla)
    recorte: /^material_9$/,
    meshopt: true,
    hero: { simplificarTodo: { ratio: 0.4 }, maxTextura: 256, soloColor: true }
  },
  london: {
    entrada: MATERIAL + 'arquitectura/london_skyscraper_ejemplo4.glb',
    escala: 400,
    maxTextura: 512,
    soloColor: true,
    // Ronda 4: las persianas tienen opacidad 0 y el destello rojo de la punta es casi invisible: se quitan.
    // Los muebles y cortinas del lobby son recortes (píxeles 100 % visibles o invisibles).
    // La fachada se probó como recorte, pero perdía las franjas de los pisos y no se ganaba
    // velocidad (pruebas/rendimiento.mjs --sw): sigue transparente, igual que los vidrios.
    quitarMateriales: /^(Interior_Blinds|Flare_Red)$/,
    recorte: /^(Furniture|Lobby_Furniture|Lobby_Curtains)$/,
    // Fachadas e interiores de los pisos: a 1:400 un error de 0,5 % (≈ 2 mm en la maqueta) no se ve
    simplificar: { nodos: /^(Building_Facade|Interior_Top|Glass_Generic|Top_Piece)/, ratio: 0.4, error: 0.005, planas: true },
    meshopt: true,
    hero: { quitar: /^(Lobby_|Furniture|Interior_Blinds|Color_Pallete)/, simplificar: undefined, simplificarTodo: { ratio: 0.2, error: 0.03, planas: true }, maxTextura: 256 }
  }
};

const pedidos = process.argv[2] === 'todos' ? Object.keys(recetas) : process.argv.slice(2);
if (!pedidos.length) console.log(`Uso: node preparar.mjs <${Object.keys(recetas).join('|')}|todos>`);
for (const id of pedidos) {
  const r = recetas[id];
  if (!r) { console.error(`No existe la receta «${id}»`); continue; }
  const { hero, ...principal } = r;
  console.log(`\n===== ${id} =====`);
  await optimizar({ ...principal, salida: `${MODELOS}${id}.glb` });
  if (hero) {
    console.log(`--- ${id} (versión liviana para el carrusel) ---`);
    await optimizar({ ...principal, ...hero, salida: `${MODELOS}${id}-hero.glb`, meshopt: true });
  }
}
