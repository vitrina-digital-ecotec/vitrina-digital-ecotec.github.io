# Configurar Supabase (paso a paso)

Supabase es el «servidor» de la vitrina: guarda los proyectos que se editan en el panel `/admin/`, los archivos (imágenes, modelos 3D, videos) y las visitas anónimas. Plan gratuito.

> **Regla de oro:** la **contraseña** del administrador **solo se escribe en Supabase** (paso 4). Nunca en un archivo, en el chat ni en el repositorio. La **clave secreta** (`secret` / `service_role`) tampoco se copia nunca a ningún lado.

---

## 1. Proyecto (ya hecho)

- Organización: **Vitrina Digital Ecotec** (plan Free).
- Proyecto: **vitrina-digital-ecotec**.
- Región: la más cercana a Ecuador es **South America (São Paulo)**. *East US (North Virginia)* también sirve: desde Ecuador el internet suele pasar por Miami y la diferencia es mínima. La región no se puede cambiar después, pero cualquiera de las dos está bien.

## 2. Copiar la dirección y la clave pública

1. Entra al proyecto en <https://supabase.com/dashboard>.
2. Arriba, toca el botón **Connect** (Conectar). Ahí aparecen las dos cosas. Si no lo ves:
   - **Project URL:** menú de la izquierda → ⚙️ **Project Settings** → **Data API** → *Project URL*. Se ve así: `https://abcdefghijkl.supabase.co`.
   - **Clave pública:** ⚙️ **Project Settings** → **API Keys** → **Publishable key** (empieza con `sb_publishable_…`). Si en tu pantalla solo aparece la pestaña *Legacy API Keys*, usa la que dice **`anon` `public`** (empieza con `eyJ…`).
3. Pégalas en `js/config.js`:
   ```js
   export const SUPABASE_URL = 'https://abcdefghijkl.supabase.co';
   export const SUPABASE_CLAVE_PUBLICA = 'sb_publishable_…';
   ```
   La clave **pública** puede ir en el código: solo deja leer lo publicado y registrar visitas (lo controla RLS, paso 5). La que **NO** se copia es la **Secret key** (`sb_secret_…`) ni la **`service_role`**.

## 3. Cerrar el registro y poner la dirección del sitio

**3a. Que nadie más pueda crear cuenta**
⚙️ Menú izquierdo → **Authentication** → **Sign In / Providers** (en algunas versiones: *Providers* o *Settings*) →
- **Allow new users to sign up** → **apagado** (gris). → **Save**.
- Deja **Email** activado (es con lo que entra el admin).

**3b. Direcciones**
**Authentication** → **URL Configuration**:
- **Site URL:** `https://vitrina-digital-ecotec.github.io/` → **Save**.
- **Redirect URLs** → **Add URL**, una por una:
  - `https://vitrina-digital-ecotec.github.io/**`
  - `http://localhost:*/**` (solo para probar en la compu)
  - `http://127.0.0.1:*/**` (ídem)

  Sirven para el correo de «olvidé mi contraseña»: Supabase solo manda a la gente a estas direcciones.

## 4. Crear el usuario administrador

**Authentication** → **Users** → botón **Add user** → **Create new user**:
- **Email:** `dianapaolaespinoza2002@gmail.com`
- **Password:** escríbela tú aquí. Usa una fuerte (12 caracteres o más, con letras, números y algún símbolo) y guárdala en un lugar seguro.
- ✅ **Auto Confirm User** marcado (así no hace falta confirmar por correo).
- **Create user**.

> Funciona aunque el registro esté cerrado: el registro cerrado solo impide que se creen cuentas **desde el sitio**.
> Para sumar a otro docente más adelante: créale el usuario aquí y agrega su correo a la tabla `administradores` (Table Editor → administradores → Insert row). Si no está en esa tabla, puede entrar pero **no puede editar nada**.

## 5. Crear las tablas, la seguridad y los buckets (SQL)

1. Menú izquierdo → **SQL Editor** → **+ New query** (o *New SQL snippet*).
2. Abre `supabase/01-esquema.sql`, copia **todo** y pégalo. → **Run** (o Ctrl + Enter).
   - Debe decir **Success. No rows returned**.
   - Si aparece un aviso de «operación destructiva» (por los `drop policy if exists`), confirma: solo reemplaza reglas de seguridad por las mismas.
3. **+ New query** otra vez → pega todo `supabase/02-semilla.sql` → **Run**.
   - Abajo debe salir una tablita: **carreras 2** y **proyectos 6**.

Qué crearon:
| | |
|---|---|
| **Table Editor** | `administradores` (tu correo), `ajustes` (periodo y arPropia), `carreras` (2), `proyectos` (6), `eventos` (vacía) |
| **Storage** | 3 buckets públicos: `imagenes` (≤ 2 MB), `modelos` (≤ 15 MB), `videos` (≤ 50 MB, también los `.vtt`) |
| **RLS** | El público lee solo lo publicado y registra eventos. Solo el admin edita, sube archivos y ve las métricas. |

Los buckets se crean con el SQL (no hace falta crearlos a mano). Para revisarlos: menú izquierdo → **Storage**: deben aparecer los 3 con la etiqueta *Public*.

## 6. Comprobar la seguridad

Con la clave pública ya en `js/config.js`, desde la carpeta `vitrina-digital/pruebas`:

```
node seguridad-supabase.mjs
```

Revisa, con la clave pública (como un visitante cualquiera), que:
- ✅ se leen los proyectos publicados y se registra un evento;
- 🚫 NO se pueden leer los eventos, ni la lista de administradores;
- 🚫 NO se puede crear, editar ni borrar un proyecto;
- 🚫 NO se puede subir un archivo;
- 🚫 NO se puede registrar un evento con un tipo inventado.

## 7. Si Supabase se «duerme» (proyecto pausado)

En el plan gratuito, **un proyecto sin uso por 7 días se pausa**. Mientras está pausado, la vitrina **sigue funcionando** con el Plan B (`data/proyectos.json` o la última copia que guardó el navegador), pero el panel no abre y las visitas no se cuentan.

**Para reactivarlo:** <https://supabase.com/dashboard> → el proyecto → botón **Restore project** (Restaurar). Tarda unos minutos.
**Antes de la prueba con usuarios:** entra al dashboard de Supabase 1–2 días antes para confirmar que dice *Active* (o *Healthy*), y si dice *Paused*, restáuralo. Usar el sitio y el panel ayuda a que no se pause, pero no confíes solo en eso: revísalo.

Límites del plan gratuito que importan aquí: 500 MB de base de datos (sobra), 1 GB de archivos en Storage, 5 GB de descarga al mes y 50 MB por archivo. El video de Multimedia (9 MB) y los modelos (≤ 8 MB) caben de sobra; si se suben muchos videos, conviene que sigan viviendo en GitHub Pages.

## 8. Después de la presentación

- Cambia la contraseña del admin: **Authentication** → **Users** → tu usuario → **⋯** → *Send password recovery* (o bórralo y créalo de nuevo con otra contraseña).
