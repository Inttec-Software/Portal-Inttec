# Propuesta de Rework: Módulo de Gastos por Proyecto

Este documento resume la propuesta para rediseñar el módulo de gastos. Está pensado tanto para **Administración** (cómo se va a operar y revisar la información) como para el **Equipo de Desarrollo** (qué cambia en el sistema sin perder lo que ya funciona).

---

## 1. La idea central: "Cajitas por Proyecto"

Hoy los empleados escriben el nombre del proyecto en texto libre, lo que genera cientos de variantes distintas para una misma obra (por ejemplo: *"Pana obregon"*, *"Pana Obregon"*, *"Panamericano / camaras"*).

Con el rework:
1. **Administración crea el Proyecto** (la "cajita" vacía) con:
   - Nombre del proyecto
   - Cliente
   - Sucursal
   - Estado (Activo / Cerrado)
2. **Los empleados ya no escriben el nombre del proyecto a mano**: simplemente seleccionan el proyecto de la lista y suben su gasto dentro de la categoría correspondiente.
3. **Administración entra a cualquier proyecto** y ve de inmediato cuánto se ha gastado en total y desglosado por sección, junto con cada gasto individual que subieron los empleados.

---

## 2. Cómo lo verá Administración (Panel por Proyecto)

Al abrir un proyecto, se mostrarán **5 bloques principales** con su total acumulado. Al entrar en cualquiera de ellos, se desplegarán todos los **gastos individuales** que subieron los empleados en esa categoría:

1. **Alimentos**
   - Incluye el detalle de si fue consumo compartido y el manejo de propina.
2. **Hospedaje**
   - Muestra el total gastado en hotel y el **desglose automático día por día** *(ver sección 4)*.
3. **Material**
   - Material eléctrico, ferretería, etc.
4. **Equipo**
   - Equipo de seguridad, paneles, refrigeración, venta directa, etc.
5. **Transporte** (subdividido en dos):
   - **Combustible:** Cargas de gasolina/diésel (sigue conectado con el control de vehículos y kilometraje).
   - **Traslados:** Subdividido en:
     - Casetas
     - Estacionamientos
     - Multas
     - Uber / Taxis
     - Vuelos
     - Otros

> **¿Y los gastos que NO son de un proyecto?**  
> Pagos como IMSS, ISN, Telmex, JMAS, nómina, software o papelería seguirán existiendo bajo una opción de **"Gasto Operativo / General"** (sin proyecto), para no mezclarlos con las obras ni obligar a inventar proyectos falsos.

---

## 3. Cómo lo usarán los Empleados (Formulario de 1 sola pantalla)

En lugar de llenar un formulario genérico de 3 pasos para todo, el empleado verá **una sola pantalla dinámica** que se adapta a lo que elija:

1. **¿Es gasto de Proyecto u Operativo?**
   - Si es de **Proyecto**, elige el proyecto activo de la lista.
   - **¿Y si Administración aún no ha creado el proyecto?** Funciona bajo la misma lógica que hoy existe para *Proveedor*: el empleado deja el selector en blanco, escribe el nombre en **"Proyecto a agregar \*"** (indicando Cliente y Sucursal), y al revisarlo en Administración aparece un botón rápido para **Crear y Asignar ese proyecto en 1 clic** (o ligarlo a uno que ya existía) antes de aprobarlo.
2. **¿Qué tipo de gasto es?**
   - Elige una de las 5 categorías (**Alimentos, Hospedaje, Material, Equipo o Transporte**).
   - Si elige *Transporte*, selecciona si es *Combustible* o *Traslados* (y el subtipo: Caseta, Uber, Vuelo, etc.).
3. **Campos específicos (solo lo necesario):**
   - **Alimentos:** Monto, método de pago, ¿fue compartido?, propina y comprobante.
   - **Hospedaje:** Fecha de entrada y salida, monto total, hotel y comprobante (con vista previa de cuánto cuesta por noche).
   - **Material / Equipo:** Subcategoría, proveedor, descripción, monto y comprobante.
   - **Combustible:** Vehículo, kilometraje, litros, monto y comprobante.
   - **Traslados:** Subtipo (Caseta, Uber, etc.), descripción, monto y comprobante.

---

## 4. ¿Cómo funciona el Hospedaje por rango de fechas y qué pasa si se quedan un día más?

Para evitar que una sola factura del hotel se convierta en un problema para el SAT o para las aprobaciones de Administración, funcionará así:

- **1 solo gasto principal + desglose diario automático:**
  - Si un empleado paga **$5,000** por **5 noches** (del 10 al 15 de noviembre), sube **1 solo gasto** con su ticket/factura de $5,000 y selecciona el rango de fechas.
  - Administración solo tiene que **aprobar y conciliar con el SAT 1 sola vez** ese gasto de $5,000.
  - Al mismo tiempo, el sistema genera automáticamente el **desglose de los 5 días ($1,000 por día)** dentro de la sección de Hospedaje del proyecto, visible desde que se registra.

- **¿Qué pasa si se tienen que quedar 1 o más días extra?**
  - **Si el hotel les cobra la extensión aparte (nuevo ticket o factura):** El empleado simplemente sube un **nuevo gasto de Hospedaje** en el mismo proyecto por el monto y los días adicionales (ej. del 15 al 16 de noviembre por $1,000). En el proyecto se sumarán ambos gastos ($5,000 + $1,000 = $6,000) y el calendario diario mostrará los 6 días corridos, manteniendo separada cada factura para el SAT.
  - **Si aún no cierran la cuenta ni se aprueba/factura el gasto original y solo ajustaron la reserva:** Administración o el empleado puede editar la fecha de salida y el monto total del gasto original, y los días se recalculan solos.

---

## 5. ¿Cómo aprobarán los gastos en Administración?

Para que las chicas no tengan que meterse proyecto por proyecto a buscar qué está pendiente de revisar, la pantalla de Administración mantendrá la agilidad actual con dos vistas sobre los mismos gastos:

- **Bandeja única "Por revisar / Pendientes":**
  - Muestra en un solo lugar todos los gastos pendientes de aprobación o con observación (sin importar de qué proyecto sean ni si son operativos), indicando con una etiqueta a qué proyecto pertenecen.
  - Desde ahí pueden **Aprobar**, **Rechazar** o pedir **Acción Requerida** exactamente como lo hacen hoy.
- **Aprobación directa dentro de cada Proyecto:**
  - Si un proyecto tiene gastos sin aprobar, su tarjeta mostrará un aviso (ej. *"2 pendientes"*), y también se podrán revisar y aprobar directamente desde adentro del proyecto.
- **Corrección al momento de aprobar:**
  - Si un empleado se equivocó de proyecto o de categoría, Administración podrá reasignarlo ahí mismo antes de darle **Aprobar**.
- **Totales del proyecto:**
  - El total del proyecto suma todos los gastos registrados (**Aprobados y Pendientes**); **únicamente los gastos Rechazados no suman** (y si hay pendientes, se puede indicar cuántos faltan por revisar).
  - En el caso de **Hospedaje**, se aprueba **1 sola vez** el gasto completo del hotel, no día por día.

---

## 6. ¿Qué pasa con los gastos que ya existen hoy en la base de datos?

Actualmente hay **más de 1,370 gastos registrados** que ya están conectados con facturas del SAT y registros de gasolina. **No se van a borrar ni se van a perder.**

La estrategia será de **convivencia limpia**:
- Todos los gastos anteriores se conservan intactos en una pestaña llamada **"Histórico / Sin proyecto"**.
- Sus facturas del SAT, comprobantes y registros de gasolina siguen funcionando exactamente igual.
- Las chicas de Administración tendrán un botón rápido de **"Asignar a proyecto"** en esos gastos históricos, por si desean ir moviendo los gastos de proyectos que aún siguen activos hacia sus nuevas "cajitas" sin tener que hacerlo todo de golpe.

---

## 7. Resumen de arquitectura (para el equipo de desarrollo)

Sin entrar en código, la estructura técnica se mantiene limpia y compatible con lo que ya existe:

| Elemento | Qué se hace | Por qué |
| :--- | :--- | :--- |
| **Nueva tabla `proyectos`** | Guarda `id`, `nombre`, `cliente_id`, `sucursal_id`, `status`, `venta_id` (opcional) y fechas. | Crea la entidad formal de "proyecto" administrada por Admin. |
| **Tabla `gastos` actual** | Se conserva y se le agregan `proyecto_id` (nullable), `tipo_gasto` (`PROYECTO` / `OPERATIVO`) y subtipo de traslado si aplica. | No rompe `facturas_recibidas` (conciliación SAT) ni `registro_gasolina` que ya apuntan a `gastos.id`. |
| **Nueva tabla `gastos_hospedaje_dias`** | Ligada a `gasto_id`; guarda cada fecha del rango y su `monto_diario` (`monto / noches`). | Permite mostrar el desglose diario sin duplicar filas contables en `gastos` ni romper la conciliación 1-a-1 con CFDI. |
| **Catálogos** | Ajustar/mapear las categorías y subcategorías para reflejar los 5 bloques de proyecto + rama Operativa. | Los gastos históricos ya tienen `subcategoria_id` al 100%, por lo que siguen siendo compatibles. |
| **Frontend (Empleado)** | Reemplazar el flujo de 3 pasos por 1 pantalla progresiva controlada por estado según tipo/categoría. | Reduce fricción para el empleado y evita campos innecesarios. |
| **Frontend (Admin)** | Nueva vista de **Proyectos** (tarjetas de totales + detalle de gastos hijos) + pestaña **Histórico / Sin proyecto** con acción de reasignación. | Da visibilidad inmediata por proyecto y transición gradual sin migrar 1,375 registros a mano. |
