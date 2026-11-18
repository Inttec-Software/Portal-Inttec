# Plan de Trabajo en Paralelo (3 Devs): Rework de Gastos por Proyecto

Este documento divide el rework descrito en [PROPUESTA_REWORK_GASTOS.md](file:///C:/Users/Inttec/Documents/INTTEC/Portal-Inttec/PROPUESTA_REWORK_GASTOS.md) en **3 piezas independientes** para que 3 desarrolladores (y sus agentes) trabajen en paralelo y al final todo embone sin conflictos de merge.

> **Regla general del repo (Frontend):** Antes de escribir código en Expo / React Native, revisar la documentación exacta indicada en `AGENTS.md` (`https://docs.expo.dev/versions/v57.0.0/`).

---

## Mapa del Rompecabezas (Quién es dueño de qué)

| Pieza | Responsable | Qué construye | Carpetas / Archivos exclusivos |
| :--- | :--- | :--- | :--- |
| **Pieza 1** | **Dev 1 (Backend & BD)** | Tablas `proyectos` y `gastos_hospedaje_dias`, columnas nuevas en `gastos`, API de proyectos, desglose automático de hospedaje y endpoints de gastos actualizados. | `migrations/`, `BaseDatos.sql`, `backend/src/**` |
| **Pieza 2** | **Dev 2 (Formulario Único & Empleado)** | Nuevo formulario dinámico de 1 sola pantalla (para crear y editar gastos), captura de hospedaje por rango de fechas, árbol de 5 categorías + Operativo, y vista/detalle del empleado. | `src/features/gastos/components/GastoFormView.tsx`, `Paso*.tsx` (o nuevos subcomponentes del form), `EmpleadoGastosView.tsx`, `EmpleadoGastoDetailModal.tsx`, `useGastoForm.ts`, `useEmpleadoGastos.ts` |
| **Pieza 3** | **Dev 3 (Panel Admin: Proyectos, Aprobaciones & Histórico)** | CRUD de proyectos ("cajitas"), vista detalle de proyecto con las 5 tarjetas + desglose diario de hospedaje, bandeja única de pendientes, pestaña Operativos y pestaña Histórico con botón "Asignar a proyecto". | `src/features/proyectos/**` (nuevo), `src/features/gastos/components/AdminGastosView.tsx`, `AdminGastosMainList.tsx`, `AdminGastoReviewModal.tsx`, `AdminGastoQuickEditModals.tsx`, `useAdminGastos.ts` |

### Archivos compartidos (Cuidado al hacer merge)
Solo hay **3 archivos de tipos/API compartidos** en frontend donde podrían cruzarse Dev 2 y Dev 3:
- `src/services/supabase.ts` (interfaces `Gasto`, `Proyecto`, `GastoHospedajeDia`)
- `src/features/gastos/types.ts`
- `src/features/gastos/api/gastosApi.ts`

**Recomendación:** Antes de que los 3 empiecen en ramas separadas, **agregar primero el Contrato Compartido** (sección siguiente) en una rama base común (o que Dev 1 cree los tipos base primero y Dev 2/3 partan de ahí). Para evitar choques en `gastosApi.ts`, Dev 3 puede poner las llamadas nuevas de proyectos en su propio archivo `src/features/proyectos/api/proyectosApi.ts`.

---

## El Contrato Compartido (Lo que hace que las 3 piezas embonen)

Las 3 piezas deben respetar **exactamente** estos nombres de tablas, columnas, rutas y estructuras JSON.

### 1. Base de Datos (PostgreSQL multi-tenant: `inttec_test/prod`, `daravisa_test/prod`)

- **Nueva tabla `public.proyectos`:**
  - `id` `uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `nombre` `text NOT NULL`
  - `cliente_id` `uuid NULL REFERENCES public.clientes(id) ON DELETE SET NULL`
  - `sucursal_id` `uuid NULL REFERENCES public.sucursales_cliente(id) ON DELETE SET NULL`
  - `venta_id` `uuid NULL REFERENCES public.ventas(id) ON DELETE SET NULL` *(opcional)*
  - `status` `text NOT NULL DEFAULT 'ACTIVO'` (`CHECK (status IN ('ACTIVO', 'CERRADO'))`)
  - `notas` `text NULL`
  - `created_by` `uuid NULL REFERENCES public.usuarios(id) ON DELETE SET NULL`
  - `created_at` `timestamptz DEFAULT now()`
  - `updated_at` `timestamptz DEFAULT now()`

- **Nuevas columnas en `public.gastos`** *(todas nullable/con default para NO romper los 1,375 registros históricos)*:
  - `proyecto_id` `uuid NULL REFERENCES public.proyectos(id) ON DELETE SET NULL`
  - `tipo_gasto` `text NULL` (`CHECK (tipo_gasto IN ('PROYECTO', 'OPERATIVO'))` — en históricos queda `NULL` hasta que se clasifique o asigne)
  - `subtipo_traslado` `text NULL` (`CHECK (subtipo_traslado IN ('CASETAS', 'ESTACIONAMIENTOS', 'MULTAS', 'UBER', 'VUELOS', 'OTRO'))`)
  - `fecha_hospedaje_inicio` `date NULL`
  - `fecha_hospedaje_fin` `date NULL`

- **Nueva tabla `public.gastos_hospedaje_dias`:**
  - `id` `uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `gasto_id` `uuid NOT NULL REFERENCES public.gastos(id) ON DELETE CASCADE`
  - `fecha` `date NOT NULL`
  - `monto_diario` `numeric(12, 2) NOT NULL`
  - `created_at` `timestamptz DEFAULT now()`
  - *(Índice en `gasto_id` y `fecha`)*

### 2. Reglas de Negocio Compartidas (Muy importantes)
1. **Regla de totales del proyecto:** Suman todos los gastos con estatus **`APPROVED`**, **`PENDING`** y **`ACTION_REQUIRED`**. **Únicamente los `REJECTED` no suman.**
2. **Regla de categorías de proyecto (5 bloques):**
   - `Alimentos` → subcategoría `Gastos de Viaje > Alimentos`
   - `Hospedaje` → subcategoría `Gastos de Viaje > Hospedaje`
   - `Material` → subcategorías `Material > Material Eléctrico`, `Material Ferretería`
   - `Equipo` → subcategorías `Equipo > ...`
   - `Transporte` → se subdivide en:
     - `Combustible` → subcategoría `Vehiculos > Combustible` (sigue creando `registro_gasolina`)
     - `Traslados` → subcategoría `Gastos de Viaje > Traslados` (o `Vuelos`) + campo `subtipo_traslado` (`CASETAS`, `ESTACIONAMIENTOS`, `MULTAS`, `UBER`, `VUELOS`, `OTRO`)
   - *(Fuera de Proyecto: `tipo_gasto = 'OPERATIVO'`, usando las categorías de `Oficina y Administración`, `Vehiculos > Mantenimiento`, etc.)*
3. **Regla de Hospedaje:**
   - En `gastos` vive **1 solo gasto padre** (1 foto, 1 factura SAT, 1 aprobación).
   - El backend genera las filas en `gastos_hospedaje_dias` dividiendo el monto entre el número de días/noches del rango (`fecha_hospedaje_inicio` a `fecha_hospedaje_fin`).
   - Si se quedan días extra y pagan otro ticket/factura, suben un nuevo gasto de hospedaje en el mismo proyecto.

### 3. Endpoints API (Contrato Backend ↔ Frontend)

**Módulo nuevo `/api/proyectos`** (creado por Dev 1, consumido por Dev 2 y Dev 3):
- `GET /api/proyectos?status=ACTIVO|CERRADO|ALL`
  - Devuelve `{ proyectos: ProyectoResumen[] }`, donde cada item incluye `id, nombre, cliente_id, cliente_nombre, sucursal_id, sucursal_nombre, status, notas, created_at`, más agregados:
    - `total_general` (excluyendo `REJECTED`)
    - `totales_por_categoria`: `{ alimentos, hospedaje, material, equipo, transporte, combustible, traslados }`
    - `pendientes_count` (conteo de `PENDING` + `ACTION_REQUIRED`)
- `GET /api/proyectos/:id`
  - Devuelve `{ proyecto, resumen, gastos }` con todos los gastos del proyecto (incluyendo `hospedaje_dias[]` cuando aplique) agrupables por las 5 categorías.
- `POST /api/proyectos`
  - Body: `{ nombre, cliente_id, sucursal_id, venta_id?, notas? }` → Devuelve `{ proyecto }`.
- `PUT /api/proyectos/:id`
  - Body: `{ nombre?, cliente_id?, sucursal_id?, status?, notas? }` → Devuelve `{ proyecto }`.

**Módulo existente `/api/reportes`** (actualizado por Dev 1):
- `GET /api/reportes/form-catalogs`
  - Además de lo actual (`categorias, subcategorias, clientes, usuarios, sucursales, proveedores, vehiculos`), agrega `proyectos` (lista de proyectos con `status = 'ACTIVO'`).
- `POST /api/reportes/gastos` y `PUT /api/reportes/gastos/:id`
  - Aceptan en cada payload los campos nuevos: `proyecto_id`, `tipo_gasto`, `subtipo_traslado`, `fecha_hospedaje_inicio`, `fecha_hospedaje_fin`.
  - **Importante (Sugerencia de Proyecto):** Permitir que `tipo_gasto = 'PROYECTO'` venga con `proyecto_id = null` cuando el empleado usó **"Proyecto a agregar"** (`[Proyecto a agregar: Nombre]` en `justificacion` y en `detalle_servicio_proyecto`), para que Admin lo dé de alta o vincule al revisar.
  - Si es hospedaje con fechas, Dev 1 calcula y guarda/recalcula `gastos_hospedaje_dias` automáticamente.
- `PUT /api/reportes/gastos/:id/assign-proyecto`
  - Body: `{ proyecto_id: string | null, tipo_gasto: 'PROYECTO' | 'OPERATIVO' }`
  - Sirve tanto para asignar gastos históricos a un proyecto como para corregir el proyecto desde Admin al aprobar.
- `GET /api/reportes/admin/all`, `GET /api/reportes/empleado`, `GET /api/reportes/gastos/:id`
  - Deben devolver también `proyecto_id`, `tipo_gasto`, `subtipo_traslado`, `fecha_hospedaje_inicio`, `fecha_hospedaje_fin`, `proyecto_rel: { id, nombre, cliente_nombre, sucursal_nombre, status } | null` y `hospedaje_dias: GastoHospedajeDia[]`.

---

## Brief para Dev 1 (Backend & Base de Datos)

### Tu rol en el rompecabezas
Eres los cimientos. Construyes la base de datos y toda la API que van a consumir **Dev 2** (al crear/editar/ver gastos) y **Dev 3** (al crear proyectos, ver cajitas, aprobar y asignar históricos).

### Qué debes hacer
1. **Migración SQL y `BaseDatos.sql`:**
   - Crea el archivo de migración en `migrations/` siguiendo el estilo de `migrations/20261110_vinculacion_gastos_propina_compartida.sql` para `proyectos`, las columnas nuevas en `gastos` y `gastos_hospedaje_dias`.
   - Mantén intactas las relaciones existentes (`facturas_recibidas`, `registro_gasolina`, `ventas`). Los 1,375 gastos actuales quedan con `proyecto_id = NULL` y `tipo_gasto = NULL`.
   - Actualiza `BaseDatos.sql` con estos cambios.
2. **Nuevo módulo `backend/src/modules/proyectos/`:**
   - `proyectos.routes.ts` y `proyectos.controller.ts`, registrados en `backend/src/index.ts` bajo `/api/proyectos` con `verifyToken` y `tenantMiddleware`.
   - Implementa `GET /`, `GET /:id`, `POST /`, `PUT /:id` calculando los totales por las 5 categorías (sumando todo menos `status = 'REJECTED'`), subtotales de `combustible` vs `traslados`, y conteo de pendientes (`PENDING` / `ACTION_REQUIRED`).
3. **Actualizar `backend/src/modules/reportes/`:**
   - Actualizar `getFormCatalogs` para devolver también `proyectos` activos.
   - Actualizar `createGastos` y `updateGasto` para persistir `proyecto_id`, `tipo_gasto`, `subtipo_traslado`, `fecha_hospedaje_inicio`, `fecha_hospedaje_fin` y generar/recalcular automáticamente `gastos_hospedaje_dias` dentro de una transacción (`monto / cantidad_dias`). Si es `Combustible`, mantener intacto el insert/update en `registro_gasolina`.
   - Crear `PUT /api/reportes/gastos/:id/assign-proyecto` para asignar/mover gastos (históricos o correcciones de Admin).
   - Actualizar `getAdminReportes`, `getEmpleadoGastos` y `getGastoById` para incluir `proyecto_rel` y `hospedaje_dias`.
   - **Caché:** Asegurar que mutar un gasto invalide también el caché de `proyectos` y mutar un proyecto invalide `reportes` (`invalidateCache`).

### Cómo te complementas con los demás
- **Con Dev 2:** Le entregas los `proyectos` activos dentro de `/api/reportes/form-catalogs` y recibes los campos nuevos en `POST/PUT /api/reportes/gastos` devolviendo `hospedaje_dias` calculado.
- **Con Dev 3:** Le entregas todo `/api/proyectos` con los totales listos para pintar las 5 tarjetas sin que el frontend tenga que hacer cálculos pesados, además de `/assign-proyecto` para la pestaña Histórico y las correcciones en aprobación.

---

## Brief para Dev 2 (Frontend: Formulario Único de 1 Pantalla & Vista Empleado)

### Tu rol en el rompecabezas
Eres la puerta de entrada de los datos. Construyes la nueva experiencia de **1 sola pantalla** donde empleados (y admins cuando registran/editan) suben un gasto, además de actualizar la vista de lista/detalle del empleado.

### Qué debes hacer
1. **Rediseñar el formulario (`GastoFormView.tsx` + `useGastoForm.ts`):**
   - Sustituir el flujo genérico de 3 pasos (`Paso1Comprobantes`, `Paso2Detalles`, `Paso3Categorizacion`) por **una sola pantalla progresiva** que funcione tanto en `mode="create"` como en `mode="edit"` y para ambos roles (`empleado` y `admin`, porque `(admin)/formulario.tsx`, `(admin)/editar-gasto.tsx`, `(empleado)/formulario.tsx` y `(empleado)/editar-gasto.tsx` todos renderizan `GastoFormView`).
   - **Sección 1 — Destino del gasto:** Elegir **Proyecto** vs **Operativo / General**. Si elige Proyecto, mostrar selector/buscador de proyectos activos (cargados desde `formCatalogs.proyectos`) con opción **"Dejar en blanco (No encuentro mi proyecto)"** que despliega el campo obligatorio **`Proyecto a agregar *`** (`[Proyecto a agregar: ...]`), bajo la misma lógica que `Proveedor a agregar`.
   - **Sección 2 — Categoría:**
     - Si es Proyecto: **Alimentos**, **Hospedaje**, **Material**, **Equipo**, **Transporte** (subdividido en **Combustible** o **Traslados** → *Casetas, Estacionamientos, Multas, Uber, Vuelos, Otro*).
     - Si es Operativo: categorías operativas/oficina/mantenimiento vehicular.
   - **Sección 3 — Campos dinámicos según categoría (solo mostrar lo que aplica):**
     - **Alimentos:** consumo compartido, propina (incluida o aparte), monto, método de pago, comprobante/factura.
     - **Hospedaje:** selector de rango de fechas (`fecha_hospedaje_inicio` y `fecha_hospedaje_fin`), monto total, vista previa en vivo (`X días · $Y / día`), proveedor/hotel, comprobante/factura. *(Plus: si en edición o creación detectas otro hospedaje reciente en ese proyecto, mostrar un recordatorio amigable sin bloquear).*
     - **Material / Equipo:** subcategoría específica, proveedor, justificación/descripción, monto, comprobante/factura.
     - **Combustible:** vehículo, kilometraje, litros, costo (manteniendo el `gasolinaPayload` que hoy espera el backend).
     - **Traslados:** subtipo (`subtipo_traslado`), descripción, monto, comprobante/factura.
   - **Modo edición (`mode="edit"`):** Debe cargar correctamente gastos nuevos **y gastos históricos** (los que tienen `proyecto_id = null`), permitiendo asignarles proyecto o editarlos sin tronar.
2. **Actualizar la vista del Empleado (`EmpleadoGastosView.tsx`, `EmpleadoGastoDetailModal.tsx`, `useEmpleadoGastos.ts`):**
   - Mostrar en cada tarjeta/detalle a qué **Proyecto** pertenece el gasto (o si es *Operativo* / *Sin proyecto*).
   - Si es **Hospedaje**, mostrar el rango de fechas y su desglose día por día (`hospedaje_dias`).
3. **Modo Offline (si aplica en `useGastoForm`):**
   - Asegurar que si guardan offline, se conserven `proyecto_id`, `tipo_gasto`, `subtipo_traslado` y fechas de hospedaje.

### Cómo te complementas con los demás
- **Con Dev 1:** Consumes `proyectos` de `GET /api/reportes/form-catalogs` y mandas los campos nuevos en `POST/PUT /api/reportes/gastos`. Si Dev 1 aún no termina el backend cuando arranques, trabaja contra el Contrato Compartido usando datos mock en `fetchFormCatalogs` y luego conectas.
- **Con Dev 3:** **Dev 3 reutiliza tu `GastoFormView` cuando un Admin edita un gasto** (vía `(admin)/editar-gasto.tsx`), así que asegúrate de respetar las props actuales de `GastoFormView` (`role`, `mode`, `gastoId`). No modifiques `AdminGastosView` ni `AdminGastoReviewModal`.

---

## Brief para Dev 3 (Frontend: Panel Admin de Proyectos, Aprobaciones & Histórico)

### Tu rol en el rompecabezas
Eres la torre de control de Administración. Construyes las "cajitas" de proyectos, sus tarjetas de totales, el flujo ágil de aprobación y la bandeja para gestionar los gastos históricos.

### Qué debes hacer
1. **Nuevo feature/capa de Proyectos (`src/features/proyectos/`):**
   - Crear `proyectosApi.ts` consumiendo `/api/proyectos` (para no chocar con `gastosApi.ts`).
   - Crear modal/formulario para **Crear y Editar Proyectos** (Nombre, Cliente, Sucursal, Notas, Estado `ACTIVO / CERRADO`).
2. **Rediseño de la vista de Administración (`AdminGastosView.tsx`, `AdminGastosMainList.tsx`, `useAdminGastos.ts`):**
   Organizar la vista con **4 pestañas claras**:
   - **Pestaña 1 — "Por revisar" (Bandeja de aprobación):** Lista única con todos los gastos en `PENDING` y `ACTION_REQUIRED` (de proyectos y operativos) mostrando una etiqueta con el nombre del proyecto. Al tocar uno, abre el modal de revisión para aprobar/rechazar/observar sin tener que buscar proyecto por proyecto.
   - **Pestaña 2 — "Proyectos" (Las cajitas):**
     - Tarjetas de proyectos (filtro Activos / Cerrados) con total gastado (`APPROVED + PENDING`, sin `REJECTED`) e indicador si tiene gastos pendientes (ej. *"3 por revisar"*).
     - Al abrir un proyecto: mostrar las **5 tarjetas resumen** (**Alimentos, Hospedaje, Material, Equipo, Transporte** — este último con subtotales de *Combustible* y *Traslados*).
     - Al tocar cualquiera de las 5 tarjetas: mostrar la lista de gastos individuales de esa categoría (y en **Hospedaje**, además mostrar el **desglose día por día** usando `hospedaje_dias`). Desde aquí también se debe poder abrir el modal de revisión para aprobar/rechazar directamente.
   - **Pestaña 3 — "Operativos":** Gastos con `tipo_gasto = 'OPERATIVO'` (IMSS, Telmex, nómina, oficina, etc.).
   - **Pestaña 4 — "Histórico / Sin proyecto":** Los gastos existentes con `proyecto_id = NULL`. Cada fila/tarjeta debe tener un botón rápido **"Asignar a proyecto"** (modal selector de proyecto) que llame a `PUT /api/reportes/gastos/:id/assign-proyecto` para que las chicas puedan ir migrando gastos recientes poco a poco.
3. **Actualizar `AdminGastoReviewModal.tsx`:**
   - Mostrar el proyecto actual del gasto y permitir **cambiarlo/asignarlo antes de aprobar** (usando `/assign-proyecto` o `updateGasto`) por si el empleado se equivocó de proyecto.
   - **Sugerencia de Proyecto (`[Proyecto a agregar: ...]`):** Igual que hoy existe para `[Proveedor a agregar: ...]`, extraer `proyectoSugerido` en `parseJustificacion` (`useAdminGastos.ts`) con `/\[Proyecto a agregar:\s*([^\]]+)\]/i`. Si el gasto tiene `tipo_gasto === 'PROYECTO'` y `!proyecto_id`, mostrar banner amarillo **"Proyecto Pendiente de Dar de Alta"** con dos botones:
     1. **`⚡ Crear y Asignar "<proyectoSugerido>"`** (llama a `POST /api/proyectos` usando el nombre sugerido + `cliente_id` + `sucursal_id` del gasto y luego `PUT /api/reportes/gastos/:id/assign-proyecto`).
     2. **`Asignar`** (abre selector de proyectos activos por si ya existía con otro nombre).
   - En la **Pestaña 4 ("Histórico / Sin proyecto")**, filtrar únicamente los gastos históricos (`proyecto_id IS NULL AND tipo_gasto IS NULL`), mientras que los nuevos con `tipo_gasto = 'PROYECTO'` y `proyecto_id = NULL` se atienden en la bandeja **"Por revisar"**.
   - En gastos de **Hospedaje**, mostrar el rango de fechas y su desglose diario dentro del modal (la aprobación sigue siendo **1 sola vez** por todo el gasto).
   - **Cuidar lo existente:** Mantener funcionando intacto `SatFacturaLinker.tsx` (conciliación SAT / propinas / facturas compartidas), `AdminLinkSaleModal.tsx` y los reportes/exportaciones existentes.

### Cómo te complementas con los demás
- **Con Dev 1:** Consumes `/api/proyectos`, `/api/reportes/admin/all` y `/api/reportes/gastos/:id/assign-proyecto`. Mientras Dev 1 termina, puedes maquetar con el JSON del Contrato Compartido.
- **Con Dev 2:** Cuando en Admin presionan "Editar gasto", navega a `(admin)/editar-gasto` que renderiza el `GastoFormView` de Dev 2. Todos los gastos que suba Dev 2 aparecerán automáticamente en tu bandeja "Por revisar" y dentro de la cajita del proyecto correspondiente.

---

## Checklist de Integración (Al juntar las 3 piezas)

1. **Paso 1:** Merge de **Dev 1** (migración en BD test + endpoints activos en backend).
2. **Paso 2:** Merge de **Contrato de tipos** en `src/services/supabase.ts` y `src/features/gastos/types.ts`.
3. **Paso 3:** Merge de **Dev 2** (probar crear un gasto de cada una de las 5 categorías + 1 operativo, incluyendo un hospedaje de varios días).
4. **Paso 4:** Merge de **Dev 3** (probar crear proyecto, ver que aparezca en el form de Dev 2, aprobar desde bandeja y desde adentro del proyecto, verificar que `REJECTED` no sume y `PENDING` sí sume, probar "Asignar a proyecto" con un gasto histórico y validar que la conciliación SAT sigue funcionando).
