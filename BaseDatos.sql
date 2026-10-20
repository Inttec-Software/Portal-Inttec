-- DROP SCHEMA public;

CREATE SCHEMA public AUTHORIZATION pg_database_owner;

COMMENT ON SCHEMA public IS 'standard public schema';

-- DROP TYPE public.estado_gasto;

CREATE TYPE public.estado_gasto AS ENUM (
	'pendiente',
	'aprobado',
	'rechazado',
	'devuelto');

-- DROP TYPE public.metodo_pago;

CREATE TYPE public.metodo_pago AS ENUM (
	'efectivo',
	'tarjeta');

-- DROP TYPE public.user_role;

CREATE TYPE public.user_role AS ENUM (
	'admin',
	'empleado');
-- public.app_settings definition

-- Drop table

-- DROP TABLE public.app_settings;

CREATE TABLE public.app_settings (
	id int4 DEFAULT 1 NOT NULL,
	min_version_code int4 DEFAULT 1 NOT NULL,
	updated_at timestamptz DEFAULT now() NULL,
	CONSTRAINT app_settings_pkey PRIMARY KEY (id)
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY "Permitir lectura publica" ON public.app_settings
 AS PERMISSIVE
 FOR SELECT
 USING (true);

-- Permissions

ALTER TABLE public.app_settings OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.app_settings TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.app_settings TO inttec_admin;


-- public.audit_logs definition

-- Drop table

-- DROP TABLE public.audit_logs;

CREATE TABLE public.audit_logs (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamptz DEFAULT now() NULL,
	"action" text NULL,
	actor_id uuid NULL,
	target_id text NOT NULL,
	details text NULL,
	CONSTRAINT audit_logs_action_check CHECK ((action = ANY (ARRAY['CREATE'::text, 'APPROVE'::text, 'REJECT'::text, 'UPDATE'::text]))),
	CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY "Lectura y escritura global de auditoria" ON public.audit_logs
 AS PERMISSIVE
 FOR ALL
 USING (true);

-- Permissions

ALTER TABLE public.audit_logs OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.audit_logs TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.audit_logs TO inttec_admin;


-- public.categorias definition

-- Drop table

-- DROP TABLE public.categorias;

CREATE TABLE public.categorias (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	nombre text NOT NULL,
	CONSTRAINT categorias_nombre_key UNIQUE (nombre),
	CONSTRAINT categorias_pkey PRIMARY KEY (id)
);
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;

-- Permissions

ALTER TABLE public.categorias OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.categorias TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.categorias TO inttec_admin;


-- public.categorias_productos definition

-- Drop table

-- DROP TABLE public.categorias_productos;

CREATE TABLE public.categorias_productos (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	nombre text NOT NULL,
	descripcion text NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT categorias_productos_nombre_key UNIQUE (nombre),
	CONSTRAINT categorias_productos_pkey PRIMARY KEY (id)
);
ALTER TABLE public.categorias_productos ENABLE ROW LEVEL SECURITY;

-- Permissions

ALTER TABLE public.categorias_productos OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.categorias_productos TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.categorias_productos TO inttec_admin;


-- public.clientes definition

-- Drop table

-- DROP TABLE public.clientes;

CREATE TABLE public.clientes (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	nombre text NOT NULL,
	rfc text NULL,
	correo_electronico text NULL,
	direccion text NULL,
	codigo_postal text NULL,
	razon_social text NULL,
	regimen_fiscal varchar(3) NULL,
	uso_cfdi varchar(3) NULL,
	CONSTRAINT clientes_nombre_key UNIQUE (nombre),
	CONSTRAINT clientes_pkey PRIMARY KEY (id)
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- Permissions

ALTER TABLE public.clientes OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.clientes TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.clientes TO inttec_admin;


-- public.complementos_pago definition

-- Drop table

-- DROP TABLE public.complementos_pago;

CREATE TABLE public.complementos_pago (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	serie varchar(10) DEFAULT 'P'::character varying NOT NULL,
	folio varchar(20) NOT NULL,
	cliente_id uuid NULL,
	cliente_nombre text NOT NULL,
	cliente_rfc varchar(15) NOT NULL,
	cliente_cp varchar(10) NULL,
	cliente_regimen varchar(10) NULL,
	monto_total numeric(12, 2) NOT NULL,
	fecha_pago timestamptz NOT NULL,
	forma_pago_sat varchar(5) DEFAULT '03'::character varying NOT NULL,
	moneda varchar(5) DEFAULT 'MXN'::character varying NOT NULL,
	num_operacion text NULL,
	cfdi_uuid varchar(50) NULL,
	cfdi_xml_url text NULL,
	cfdi_estado varchar(20) DEFAULT 'TIMBRADA'::character varying NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT complementos_pago_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_comp_pago_cliente ON public.complementos_pago USING btree (cliente_id);
CREATE INDEX idx_comp_pago_folio ON public.complementos_pago USING btree (folio);
CREATE INDEX idx_comp_pago_uuid ON public.complementos_pago USING btree (cfdi_uuid);

-- Permissions

ALTER TABLE public.complementos_pago OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.complementos_pago TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.complementos_pago TO inttec_admin;


-- public.cotizaciones definition

-- Drop table

-- DROP TABLE public.cotizaciones;

CREATE TABLE public.cotizaciones (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	folio text NOT NULL,
	cliente_nombre text NULL,
	vendedor text NULL,
	moneda text NULL,
	fecha_creacion text NULL,
	subtotal numeric NULL,
	iva numeric NULL,
	total numeric NULL,
	lineas jsonb NULL,
	terminos_condiciones text NULL,
	estado text DEFAULT 'Borrador'::text NULL,
	creado_en timestamptz DEFAULT now() NULL,
	CONSTRAINT cotizaciones_folio_key UNIQUE (folio),
	CONSTRAINT cotizaciones_pkey PRIMARY KEY (id)
);
ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;

-- Permissions

ALTER TABLE public.cotizaciones OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.cotizaciones TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.cotizaciones TO inttec_admin;


-- public.herramientas definition

-- Drop table

-- DROP TABLE public.herramientas;

CREATE TABLE public.herramientas (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	codigo text NOT NULL,
	nombre text NOT NULL,
	categoria text DEFAULT 'Manual'::text NULL,
	descripcion text NULL,
	numero_serie text NULL,
	foto_url text NULL,
	estado text DEFAULT 'NUEVO'::text NULL,
	activo bool DEFAULT true NULL,
	created_at timestamptz DEFAULT now() NULL,
	cantidad int4 DEFAULT 1 NULL,
	unidades_estado jsonb DEFAULT '{"BUENO": 1}'::jsonb NULL,
	CONSTRAINT herramientas_codigo_key UNIQUE (codigo),
	CONSTRAINT herramientas_estado_check CHECK ((estado = ANY (ARRAY['NUEVO'::text, 'BUENO'::text, 'REGULAR'::text, 'INCOMPLETO'::text, 'DANADO'::text, 'EN_REPARACION'::text, 'BAJA'::text]))),
	CONSTRAINT herramientas_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_herramientas_categoria ON public.herramientas USING btree (categoria);
CREATE INDEX idx_herramientas_codigo ON public.herramientas USING btree (codigo);

-- Permissions

ALTER TABLE public.herramientas OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.herramientas TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.herramientas TO inttec_admin;


-- public.perfiles definition

-- Drop table

-- DROP TABLE public.perfiles;

CREATE TABLE public.perfiles (
	id uuid NOT NULL,
	nombre text NOT NULL,
	email text NOT NULL,
	rol text NULL,
	telefono text NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT perfiles_email_key UNIQUE (email),
	CONSTRAINT perfiles_pkey PRIMARY KEY (id),
	CONSTRAINT perfiles_rol_check CHECK ((rol = ANY (ARRAY['ADMIN'::text, 'EMPLEADO'::text])))
);
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY "Lectura global de perfiles" ON public.perfiles
 AS PERMISSIVE
 FOR SELECT
 USING (true);

-- Permissions

ALTER TABLE public.perfiles OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.perfiles TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.perfiles TO inttec_admin;


-- public.proveedores definition

-- Drop table

-- DROP TABLE public.proveedores;

CREATE TABLE public.proveedores (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	nombre text NOT NULL,
	rfc varchar(13) NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT proveedores_pkey PRIMARY KEY (id),
	CONSTRAINT proveedores_rfc_key UNIQUE (rfc)
);
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

-- Permissions

ALTER TABLE public.proveedores OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.proveedores TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.proveedores TO inttec_admin;


-- public.sat_descarga_solicitudes definition

-- Drop table

-- DROP TABLE public.sat_descarga_solicitudes;

CREATE TABLE public.sat_descarga_solicitudes (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	id_solicitud text NOT NULL,
	rfc text NOT NULL,
	fecha_inicio timestamptz NOT NULL,
	fecha_fin timestamptz NOT NULL,
	tipo_solicitud text DEFAULT 'RECIBIDOS'::text NULL,
	estado_sat text DEFAULT 'PENDIENTE'::text NULL,
	codigo_estatus text NULL,
	mensaje_sat text NULL,
	paquetes_ids _text DEFAULT '{}'::text[] NULL,
	paquetes_descargados _text DEFAULT '{}'::text[] NULL,
	total_facturas_procesadas int4 DEFAULT 0 NULL,
	created_at timestamptz DEFAULT now() NULL,
	updated_at timestamptz DEFAULT now() NULL,
	CONSTRAINT sat_descarga_solicitudes_id_solicitud_key UNIQUE (id_solicitud),
	CONSTRAINT sat_descarga_solicitudes_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_sat_solicitudes_estado ON public.sat_descarga_solicitudes USING btree (estado_sat);
CREATE INDEX idx_sat_solicitudes_id_solicitud ON public.sat_descarga_solicitudes USING btree (id_solicitud);
CREATE INDEX idx_sat_solicitudes_rfc ON public.sat_descarga_solicitudes USING btree (rfc);
ALTER TABLE public.sat_descarga_solicitudes ENABLE ROW LEVEL SECURITY;

-- Permissions

ALTER TABLE public.sat_descarga_solicitudes OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.sat_descarga_solicitudes TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.sat_descarga_solicitudes TO inttec_admin;


-- public.usuarios definition

-- Drop table

-- DROP TABLE public.usuarios;

CREATE TABLE public.usuarios (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	nombre text NOT NULL,
	email text NOT NULL,
	"password" text NOT NULL,
	rol text NOT NULL,
	telefono text NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT usuarios_email_key UNIQUE (email),
	CONSTRAINT usuarios_pkey PRIMARY KEY (id),
	CONSTRAINT usuarios_rol_check CHECK ((rol = ANY (ARRAY['ADMIN'::text, 'EMPLEADO'::text, 'DEV'::text])))
);

-- Table Triggers

create trigger trigger_hash_user_password before
insert
    or
update
    on
    public.usuarios for each row execute function hash_user_password();
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY "Acceso total a usuarios" ON public.usuarios
 AS PERMISSIVE
 FOR ALL
 USING (true);

-- Permissions

ALTER TABLE public.usuarios OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.usuarios TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.usuarios TO inttec_admin;


-- public.vehiculos definition

-- Drop table

-- DROP TABLE public.vehiculos;

CREATE TABLE public.vehiculos (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	marca text NOT NULL,
	modelo text NOT NULL,
	anio int4 NOT NULL,
	placas text NOT NULL,
	numero_economico text NULL,
	activo bool DEFAULT true NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT vehiculos_pkey PRIMARY KEY (id),
	CONSTRAINT vehiculos_placas_key UNIQUE (placas)
);
ALTER TABLE public.vehiculos ENABLE ROW LEVEL SECURITY;

-- Permissions

ALTER TABLE public.vehiculos OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.vehiculos TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.vehiculos TO inttec_admin;


-- public.asistencias definition

-- Drop table

-- DROP TABLE public.asistencias;

CREATE TABLE public.asistencias (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	empleado_id uuid NOT NULL,
	fecha date DEFAULT CURRENT_DATE NOT NULL,
	hora_entrada timetz NULL,
	foto_entrada_url text NULL,
	latitud_entrada numeric NULL,
	longitud_entrada numeric NULL,
	hora_salida timetz NULL,
	foto_salida_url text NULL,
	latitud_salida numeric NULL,
	longitud_salida numeric NULL,
	creado_en timestamptz DEFAULT now() NULL,
	direccion_entrada text NULL,
	direccion_salida text NULL,
	CONSTRAINT asistencias_pkey PRIMARY KEY (id),
	CONSTRAINT asistencias_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id)
);
CREATE INDEX idx_asistencias_empleado_fecha ON public.asistencias USING btree (empleado_id, fecha);
ALTER TABLE public.asistencias ENABLE ROW LEVEL SECURITY;

-- Permissions

ALTER TABLE public.asistencias OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.asistencias TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.asistencias TO inttec_admin;


-- public.auditorias_tarjeta definition

-- Drop table

-- DROP TABLE public.auditorias_tarjeta;

CREATE TABLE public.auditorias_tarjeta (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tarjeta text NOT NULL,
	metodo_pago text NOT NULL,
	titular text NULL,
	periodo_inicio date NULL,
	periodo_fin date NULL,
	total_cargos numeric NOT NULL,
	total_conciliado numeric NOT NULL,
	total_faltante numeric NOT NULL,
	resultado_json jsonb NOT NULL,
	creado_por uuid NULL,
	creado_por_nombre text NULL,
	creado_en timestamptz DEFAULT now() NULL,
	CONSTRAINT auditorias_tarjeta_pkey PRIMARY KEY (id),
	CONSTRAINT auditorias_tarjeta_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL
);

-- Permissions

ALTER TABLE public.auditorias_tarjeta OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.auditorias_tarjeta TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.auditorias_tarjeta TO inttec_admin;


-- public.checklists_vehiculo_herramientas definition

-- Drop table

-- DROP TABLE public.checklists_vehiculo_herramientas;

CREATE TABLE public.checklists_vehiculo_herramientas (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	vehiculo_id uuid NOT NULL,
	empleado_id uuid NOT NULL,
	fecha date DEFAULT CURRENT_DATE NOT NULL,
	hora timetz DEFAULT now() NULL,
	items jsonb DEFAULT '[]'::jsonb NOT NULL,
	total_herramientas int4 DEFAULT 0 NULL,
	total_presentes int4 DEFAULT 0 NULL,
	total_faltantes int4 DEFAULT 0 NULL,
	total_danadas int4 DEFAULT 0 NULL,
	observaciones_generales text NULL,
	ubicacion_gps text NULL,
	foto_evidencia_url text NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT checklists_vehiculo_herramientas_pkey PRIMARY KEY (id),
	CONSTRAINT checklists_vehiculo_herramientas_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id) ON DELETE CASCADE,
	CONSTRAINT checklists_vehiculo_herramientas_vehiculo_id_fkey FOREIGN KEY (vehiculo_id) REFERENCES public.vehiculos(id) ON DELETE CASCADE
);
CREATE INDEX idx_checklists_empleado ON public.checklists_vehiculo_herramientas USING btree (empleado_id);
CREATE INDEX idx_checklists_fecha ON public.checklists_vehiculo_herramientas USING btree (fecha DESC);
CREATE INDEX idx_checklists_vehiculo ON public.checklists_vehiculo_herramientas USING btree (vehiculo_id);

-- Permissions

ALTER TABLE public.checklists_vehiculo_herramientas OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.checklists_vehiculo_herramientas TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.checklists_vehiculo_herramientas TO inttec_admin;


-- public.complementos_pago_doctos definition

-- Drop table

-- DROP TABLE public.complementos_pago_doctos;

CREATE TABLE public.complementos_pago_doctos (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	complemento_pago_id uuid NOT NULL,
	venta_id int8 NULL,
	uuid_documento varchar(50) NOT NULL,
	serie varchar(10) NULL,
	folio varchar(20) NULL,
	moneda_dr varchar(5) DEFAULT 'MXN'::character varying NULL,
	num_parcialidad int4 DEFAULT 1 NOT NULL,
	saldo_anterior numeric(12, 2) NOT NULL,
	importe_pagado numeric(12, 2) NOT NULL,
	saldo_insoluto numeric(12, 2) NOT NULL,
	objeto_imp_dr varchar(5) DEFAULT '02'::character varying NULL,
	base_iva numeric(12, 2) NOT NULL,
	importe_iva numeric(12, 2) NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT complementos_pago_doctos_pkey PRIMARY KEY (id),
	CONSTRAINT complementos_pago_doctos_complemento_pago_id_fkey FOREIGN KEY (complemento_pago_id) REFERENCES public.complementos_pago(id) ON DELETE CASCADE
);
CREATE INDEX idx_comp_doctos_pago ON public.complementos_pago_doctos USING btree (complemento_pago_id);
CREATE INDEX idx_comp_doctos_uuid ON public.complementos_pago_doctos USING btree (uuid_documento);

-- Permissions

ALTER TABLE public.complementos_pago_doctos OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.complementos_pago_doctos TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.complementos_pago_doctos TO inttec_admin;


-- public.devoluciones_empleado definition

-- Drop table

-- DROP TABLE public.devoluciones_empleado;

CREATE TABLE public.devoluciones_empleado (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	empleado_id uuid NOT NULL,
	empleado_nombre text NOT NULL,
	estado varchar DEFAULT 'PENDIENTE'::character varying NOT NULL,
	materiales jsonb NOT NULL,
	observaciones text NULL,
	creado_en timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	actualizado_en timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	revisado_por uuid NULL,
	CONSTRAINT devoluciones_empleado_estado_check CHECK (((estado)::text = ANY (ARRAY[('PENDIENTE'::character varying)::text, ('APROBADO'::character varying)::text, ('RECHAZADO'::character varying)::text]))),
	CONSTRAINT devoluciones_empleado_pkey PRIMARY KEY (id),
	CONSTRAINT devoluciones_empleado_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id),
	CONSTRAINT devoluciones_empleado_revisado_por_fkey FOREIGN KEY (revisado_por) REFERENCES public.usuarios(id)
);

-- Permissions

ALTER TABLE public.devoluciones_empleado OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.devoluciones_empleado TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.devoluciones_empleado TO inttec_admin;


-- public.documentos definition

-- Drop table

-- DROP TABLE public.documentos;

CREATE TABLE public.documentos (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	titulo text NOT NULL,
	descripcion text NULL,
	contenido_html text NOT NULL,
	creador_id uuid NULL,
	creador_nombre text NOT NULL,
	requiere_todos bool DEFAULT true NULL,
	estado text DEFAULT 'PUBLICADO'::text NOT NULL,
	created_at timestamptz DEFAULT now() NULL,
	updated_at timestamptz DEFAULT now() NULL,
	archivo_pdf_url text NULL,
	tipo_documento text DEFAULT 'TEXTO'::text NULL,
	posicion_firma text DEFAULT 'AL_FINAL'::text NULL,
	CONSTRAINT documentos_estado_check CHECK ((estado = ANY (ARRAY['BORRADOR'::text, 'PUBLICADO'::text, 'ARCHIVADO'::text]))),
	CONSTRAINT documentos_pkey PRIMARY KEY (id),
	CONSTRAINT documentos_creador_id_fkey FOREIGN KEY (creador_id) REFERENCES public.usuarios(id) ON DELETE SET NULL
);
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY "Acceso total documentos" ON public.documentos
 AS PERMISSIVE
 FOR ALL
 USING (true)
 WITH CHECK (true);

-- Permissions

ALTER TABLE public.documentos OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.documentos TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.documentos TO inttec_admin;


-- public.documentos_firmados definition

-- Drop table

-- DROP TABLE public.documentos_firmados;

CREATE TABLE public.documentos_firmados (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	documento_id uuid NOT NULL,
	empleado_id uuid NOT NULL,
	empleado_nombre text NOT NULL,
	empleado_email text NULL,
	estado text DEFAULT 'PENDIENTE'::text NOT NULL,
	firma_base64 text NULL,
	firma_url text NULL,
	pdf_firmado_url text NULL,
	ip_registro text NULL,
	ubicacion_gps text NULL,
	dispositivo_info text NULL,
	hash_sha256 text NULL,
	motivo_rechazo text NULL,
	firmado_at timestamptz NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT documentos_firmados_estado_check CHECK ((estado = ANY (ARRAY['PENDIENTE'::text, 'FIRMADO'::text, 'RECHAZADO'::text]))),
	CONSTRAINT documentos_firmados_pkey PRIMARY KEY (id),
	CONSTRAINT uq_documento_empleado UNIQUE (documento_id, empleado_id),
	CONSTRAINT documentos_firmados_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES public.documentos(id) ON DELETE CASCADE,
	CONSTRAINT documentos_firmados_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id) ON DELETE CASCADE
);
ALTER TABLE public.documentos_firmados ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY "Acceso total documentos_firmados" ON public.documentos_firmados
 AS PERMISSIVE
 FOR ALL
 USING (true)
 WITH CHECK (true);

-- Permissions

ALTER TABLE public.documentos_firmados OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.documentos_firmados TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.documentos_firmados TO inttec_admin;


-- public.evidencias definition

-- Drop table

-- DROP TABLE public.evidencias;

CREATE TABLE public.evidencias (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	empleado_id uuid NOT NULL,
	empleado_nombre text NULL,
	cliente text NOT NULL,
	descripcion_trabajo text NOT NULL,
	observaciones text NULL,
	foto_antes_url text NULL,
	foto_despues_url text NULL,
	resumen_ia text NULL,
	created_at timestamptz DEFAULT now() NULL,
	materiales_usados text NULL,
	fotos_adicionales_urls _text NULL,
	sobrantes_verificados bool DEFAULT false NOT NULL,
	CONSTRAINT evidencias_pkey PRIMARY KEY (id),
	CONSTRAINT evidencias_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id)
);
ALTER TABLE public.evidencias ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY "Admins pueden ver todas las evidencias" ON public.evidencias
 AS PERMISSIVE
 FOR SELECT
 USING ((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = 'ADMIN'::text)))));
CREATE POLICY "Empleados pueden consultar sus propias evidencias" ON public.evidencias
 AS PERMISSIVE
 FOR SELECT
 USING ((auth.uid() = empleado_id));
CREATE POLICY "Empleados pueden insertar sus propias evidencias" ON public.evidencias
 AS PERMISSIVE
 FOR INSERT
 WITH CHECK ((auth.uid() = empleado_id));

-- Permissions

ALTER TABLE public.evidencias OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.evidencias TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.evidencias TO inttec_admin;


-- public.inventario_herramientas_empleado definition

-- Drop table

-- DROP TABLE public.inventario_herramientas_empleado;

CREATE TABLE public.inventario_herramientas_empleado (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	empleado_id uuid NOT NULL,
	herramienta_id uuid NOT NULL,
	cantidad int4 DEFAULT 1 NOT NULL,
	condicion text DEFAULT 'BUENO'::text NULL,
	notas text NULL,
	fecha_asignacion timestamptz DEFAULT now() NULL,
	asignado_por uuid NULL,
	updated_at timestamptz DEFAULT now() NULL,
	CONSTRAINT inventario_herramientas_empleado_cantidad_check CHECK ((cantidad > 0)),
	CONSTRAINT inventario_herramientas_empleado_condicion_check CHECK ((condicion = ANY (ARRAY['NUEVO'::text, 'BUENO'::text, 'REGULAR'::text, 'DANADO'::text]))),
	CONSTRAINT inventario_herramientas_empleado_pkey PRIMARY KEY (id),
	CONSTRAINT uq_herramienta_empleado UNIQUE (empleado_id, herramienta_id),
	CONSTRAINT inventario_herramientas_empleado_asignado_por_fkey FOREIGN KEY (asignado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL,
	CONSTRAINT inventario_herramientas_empleado_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id) ON DELETE CASCADE,
	CONSTRAINT inventario_herramientas_empleado_herramienta_id_fkey FOREIGN KEY (herramienta_id) REFERENCES public.herramientas(id) ON DELETE CASCADE
);
CREATE INDEX idx_inv_herramientas_emp_empleado ON public.inventario_herramientas_empleado USING btree (empleado_id);

-- Permissions

ALTER TABLE public.inventario_herramientas_empleado OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.inventario_herramientas_empleado TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.inventario_herramientas_empleado TO inttec_admin;


-- public.inventario_herramientas_vehiculo definition

-- Drop table

-- DROP TABLE public.inventario_herramientas_vehiculo;

CREATE TABLE public.inventario_herramientas_vehiculo (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	vehiculo_id uuid NOT NULL,
	herramienta_id uuid NOT NULL,
	cantidad int4 DEFAULT 1 NOT NULL,
	condicion text DEFAULT 'BUENO'::text NULL,
	notas text NULL,
	fecha_asignacion timestamptz DEFAULT now() NULL,
	asignado_por uuid NULL,
	updated_at timestamptz DEFAULT now() NULL,
	CONSTRAINT inventario_herramientas_vehiculo_cantidad_check CHECK ((cantidad > 0)),
	CONSTRAINT inventario_herramientas_vehiculo_condicion_check CHECK ((condicion = ANY (ARRAY['NUEVO'::text, 'BUENO'::text, 'REGULAR'::text, 'DANADO'::text]))),
	CONSTRAINT inventario_herramientas_vehiculo_pkey PRIMARY KEY (id),
	CONSTRAINT uq_herramienta_vehiculo UNIQUE (vehiculo_id, herramienta_id),
	CONSTRAINT inventario_herramientas_vehiculo_asignado_por_fkey FOREIGN KEY (asignado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL,
	CONSTRAINT inventario_herramientas_vehiculo_herramienta_id_fkey FOREIGN KEY (herramienta_id) REFERENCES public.herramientas(id) ON DELETE CASCADE,
	CONSTRAINT inventario_herramientas_vehiculo_vehiculo_id_fkey FOREIGN KEY (vehiculo_id) REFERENCES public.vehiculos(id) ON DELETE CASCADE
);
CREATE INDEX idx_inv_herramientas_veh_vehiculo ON public.inventario_herramientas_vehiculo USING btree (vehiculo_id);

-- Permissions

ALTER TABLE public.inventario_herramientas_vehiculo OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.inventario_herramientas_vehiculo TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.inventario_herramientas_vehiculo TO inttec_admin;


-- public.notificaciones definition

-- Drop table

-- DROP TABLE public.notificaciones;

CREATE TABLE public.notificaciones (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	usuario_id uuid NOT NULL,
	titulo text NOT NULL,
	mensaje text NOT NULL,
	tipo text NOT NULL,
	referencia_id text NULL,
	leido bool DEFAULT false NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT notificaciones_pkey PRIMARY KEY (id),
	CONSTRAINT notificaciones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE
);

-- Permissions

ALTER TABLE public.notificaciones OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.notificaciones TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.notificaciones TO inttec_admin;


-- public.productos definition

-- Drop table

-- DROP TABLE public.productos;

CREATE TABLE public.productos (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	sku_interno varchar(100) NOT NULL,
	nombre_oficial text NOT NULL,
	categoria_id uuid NOT NULL,
	stock_actual numeric DEFAULT 0 NOT NULL,
	activo bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	precio_unitario numeric DEFAULT 0 NULL,
	impuesto_porcentaje numeric DEFAULT 16 NULL,
	clave_facturacion text NULL,
	proveedor_id uuid NULL,
	unidad text DEFAULT 'pza'::text NULL,
	stock_nuevo numeric DEFAULT 0 NULL,
	stock_usado numeric DEFAULT 0 NULL,
	stock_por_revisar numeric DEFAULT 0 NULL,
	CONSTRAINT productos_pkey PRIMARY KEY (id),
	CONSTRAINT productos_sku_interno_key UNIQUE (sku_interno),
	CONSTRAINT productos_stock_actual_check CHECK ((stock_actual >= (0)::numeric)),
	CONSTRAINT productos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias_productos(id) ON DELETE RESTRICT,
	CONSTRAINT productos_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id)
);
CREATE INDEX idx_productos_categoria ON public.productos USING btree (categoria_id);
CREATE INDEX idx_productos_sku ON public.productos USING btree (sku_interno);
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

-- Permissions

ALTER TABLE public.productos OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.productos TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.productos TO inttec_admin;


-- public.subcategorias definition

-- Drop table

-- DROP TABLE public.subcategorias;

CREATE TABLE public.subcategorias (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	categoria_id uuid NOT NULL,
	nombre text NOT NULL,
	CONSTRAINT subcategorias_categoria_id_nombre_key UNIQUE (categoria_id, nombre),
	CONSTRAINT subcategorias_pkey PRIMARY KEY (id),
	CONSTRAINT subcat_cat_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE CASCADE
);
ALTER TABLE public.subcategorias ENABLE ROW LEVEL SECURITY;

-- Permissions

ALTER TABLE public.subcategorias OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.subcategorias TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.subcategorias TO inttec_admin;


-- public.sucursales_cliente definition

-- Drop table

-- DROP TABLE public.sucursales_cliente;

CREATE TABLE public.sucursales_cliente (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	cliente_id uuid NOT NULL,
	nombre text NOT NULL,
	CONSTRAINT sucursales_cliente_pkey PRIMARY KEY (id),
	CONSTRAINT sucursales_cliente_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE
);

-- Permissions

ALTER TABLE public.sucursales_cliente OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.sucursales_cliente TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.sucursales_cliente TO inttec_admin;


-- public.tareas definition

-- Drop table

-- DROP TABLE public.tareas;

CREATE TABLE public.tareas (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	titulo text NOT NULL,
	descripcion text NULL,
	creado_por uuid NOT NULL,
	responsable_id uuid NOT NULL,
	fecha_compromiso date NOT NULL,
	status text DEFAULT 'Pendiente'::text NOT NULL,
	vinculo_tipo text NULL,
	vinculo_id uuid NULL,
	created_at timestamptz DEFAULT now() NULL,
	updated_at timestamptz DEFAULT now() NULL,
	CONSTRAINT tareas_pkey PRIMARY KEY (id),
	CONSTRAINT tareas_status_check CHECK ((status = ANY (ARRAY['Pendiente'::text, 'Completada'::text, 'Cancelada'::text]))),
	CONSTRAINT tareas_vinculo_tipo_check CHECK ((vinculo_tipo = ANY (ARRAY['Venta'::text, 'Cliente'::text, 'Interna'::text]))),
	CONSTRAINT tareas_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id),
	CONSTRAINT tareas_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES public.usuarios(id)
);

-- Permissions

ALTER TABLE public.tareas OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.tareas TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.tareas TO inttec_admin;


-- public.ventas definition

-- Drop table

-- DROP TABLE public.ventas;

CREATE TABLE public.ventas (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	registrado_por uuid NULL,
	fecha date NOT NULL,
	cliente text NOT NULL,
	factura_referencia text NULL,
	tipo_proyecto text NULL,
	proveedor text NULL,
	precio_total_facturado numeric(12, 2) DEFAULT 0 NULL,
	costo_total numeric(12, 2) DEFAULT 0 NULL,
	utilidad_bruta numeric(12, 2) DEFAULT 0 NULL,
	margen_porcentual numeric(5, 4) DEFAULT 0 NULL,
	factura_url text NULL,
	notas text NULL,
	created_at timestamptz DEFAULT now() NULL,
	descripcion text NULL,
	agregar_iva bool DEFAULT false NULL,
	cfdi_uuid uuid NULL,
	cfdi_pdf_url text NULL,
	cfdi_xml_url text NULL,
	cfdi_estado text DEFAULT 'PENDIENTE'::text NULL,
	cfdi_facturapi_id varchar(50) NULL,
	cotizacion_id uuid NULL,
	sucursal text NULL,
	total_pagado numeric DEFAULT 0 NULL,
	saldo_pendiente numeric DEFAULT 0 NULL,
	estado_pago text DEFAULT 'PENDIENTE DE PAGO'::text NULL,
	folio text NULL,
	orden_compra text NULL,
	cfdi_serie text NULL,
	cfdi_folio text NULL,
	CONSTRAINT ventas_cfdi_uuid_key UNIQUE (cfdi_uuid),
	CONSTRAINT ventas_pkey PRIMARY KEY (id),
	CONSTRAINT ventas_cotizacion_id_fkey FOREIGN KEY (cotizacion_id) REFERENCES public.cotizaciones(id),
	CONSTRAINT ventas_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id)
);
CREATE INDEX idx_ventas_cfdi_folio ON public.ventas USING btree (cfdi_folio);
CREATE INDEX idx_ventas_cfdi_uuid ON public.ventas USING btree (cfdi_uuid);
CREATE INDEX idx_ventas_cliente ON public.ventas USING btree (cliente);
CREATE INDEX idx_ventas_estado_pago ON public.ventas USING btree (estado_pago);
CREATE INDEX idx_ventas_fecha ON public.ventas USING btree (fecha DESC);
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY "Allow all for authenticated" ON public.ventas
 AS PERMISSIVE
 FOR ALL
 USING (true);

-- Permissions

ALTER TABLE public.ventas OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.ventas TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.ventas TO inttec_admin;


-- public.ventas_pagos definition

-- Drop table

-- DROP TABLE public.ventas_pagos;

CREATE TABLE public.ventas_pagos (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	venta_id uuid NOT NULL,
	monto numeric NOT NULL,
	fecha_pago date DEFAULT CURRENT_DATE NOT NULL,
	metodo_pago text DEFAULT 'Transferencia'::text NULL,
	referencia text NULL,
	registrado_por uuid NULL,
	created_at timestamptz DEFAULT now() NULL,
	complemento_pago_id uuid NULL,
	cfdi_uuid varchar(50) NULL,
	parcialidad int4 DEFAULT 1 NULL,
	saldo_anterior numeric(12, 2) NULL,
	saldo_insoluto numeric(12, 2) NULL,
	CONSTRAINT ventas_pagos_monto_check CHECK ((monto > (0)::numeric)),
	CONSTRAINT ventas_pagos_pkey PRIMARY KEY (id),
	CONSTRAINT ventas_pagos_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id),
	CONSTRAINT ventas_pagos_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE CASCADE
);
CREATE INDEX idx_ventas_pagos_venta_id ON public.ventas_pagos USING btree (venta_id);

-- Permissions

ALTER TABLE public.ventas_pagos OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.ventas_pagos TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.ventas_pagos TO inttec_admin;


-- public.ventas_partidas definition

-- Drop table

-- DROP TABLE public.ventas_partidas;

CREATE TABLE public.ventas_partidas (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	venta_id uuid NULL,
	descripcion text NOT NULL,
	cantidad numeric(10, 2) DEFAULT 1 NULL,
	unidad text DEFAULT 'PZA'::text NULL,
	precio_unitario_venta numeric(12, 2) DEFAULT 0 NULL,
	costo_unitario_proveedor numeric(12, 2) DEFAULT 0 NULL,
	precio_total_venta numeric(12, 2) DEFAULT 0 NULL,
	costo_total_proveedor numeric(12, 2) DEFAULT 0 NULL,
	CONSTRAINT ventas_partidas_pkey PRIMARY KEY (id),
	CONSTRAINT ventas_partidas_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE CASCADE
);
CREATE INDEX idx_ventas_partidas_venta ON public.ventas_partidas USING btree (venta_id);
ALTER TABLE public.ventas_partidas ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY "Allow all for authenticated" ON public.ventas_partidas
 AS PERMISSIVE
 FOR ALL
 USING (true);

-- Permissions

ALTER TABLE public.ventas_partidas OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.ventas_partidas TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.ventas_partidas TO inttec_admin;


-- public.alias_proveedor_producto definition

-- Drop table

-- DROP TABLE public.alias_proveedor_producto;

CREATE TABLE public.alias_proveedor_producto (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	proveedor_id uuid NOT NULL,
	producto_id uuid NOT NULL,
	nombre_segun_proveedor text NOT NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT alias_proveedor_producto_pkey PRIMARY KEY (id),
	CONSTRAINT unique_alias_proveedor UNIQUE (proveedor_id, nombre_segun_proveedor),
	CONSTRAINT alias_proveedor_producto_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE,
	CONSTRAINT alias_proveedor_producto_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE CASCADE
);
CREATE INDEX idx_alias_busqueda ON public.alias_proveedor_producto USING btree (proveedor_id, nombre_segun_proveedor);
ALTER TABLE public.alias_proveedor_producto ENABLE ROW LEVEL SECURITY;

-- Permissions

ALTER TABLE public.alias_proveedor_producto OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.alias_proveedor_producto TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.alias_proveedor_producto TO inttec_admin;


-- public.facturas_emitidas definition

-- Drop table

-- DROP TABLE public.facturas_emitidas;

CREATE TABLE public.facturas_emitidas (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	serie varchar(10) DEFAULT 'A'::character varying NOT NULL,
	folio varchar(20) NOT NULL,
	cliente_id uuid NULL,
	cliente_nombre text NOT NULL,
	cliente_rfc varchar(15) NOT NULL,
	cliente_cp varchar(10) NULL,
	cliente_regimen varchar(10) NULL,
	cliente_uso_cfdi varchar(10) DEFAULT 'G03'::character varying NULL,
	forma_pago varchar(5) DEFAULT '03'::character varying NULL,
	metodo_pago varchar(5) DEFAULT 'PUE'::character varying NULL,
	moneda varchar(5) DEFAULT 'MXN'::character varying NULL,
	subtotal numeric(14, 2) DEFAULT 0 NOT NULL,
	iva numeric(14, 2) DEFAULT 0 NOT NULL,
	total numeric(14, 2) DEFAULT 0 NOT NULL,
	total_pagado numeric(14, 2) DEFAULT 0 NULL,
	saldo_pendiente numeric(14, 2) DEFAULT 0 NULL,
	estado_pago varchar(30) DEFAULT 'PENDIENTE DE PAGO'::character varying NULL,
	cfdi_uuid varchar(50) NULL,
	cfdi_estado varchar(20) DEFAULT 'BORRADOR'::character varying NOT NULL,
	cfdi_xml_url text NULL,
	cfdi_pdf_url text NULL,
	fecha_emision timestamptz DEFAULT now() NOT NULL,
	orden_compra text NULL,
	notas jsonb NULL,
	venta_id uuid NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	etiqueta text NULL,
	CONSTRAINT facturas_emitidas_cfdi_uuid_key UNIQUE (cfdi_uuid),
	CONSTRAINT facturas_emitidas_pkey PRIMARY KEY (id),
	CONSTRAINT facturas_emitidas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL,
	CONSTRAINT facturas_emitidas_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE SET NULL
);
CREATE INDEX idx_fact_emit_cliente ON public.facturas_emitidas USING btree (cliente_id);
CREATE INDEX idx_fact_emit_estado ON public.facturas_emitidas USING btree (cfdi_estado);
CREATE INDEX idx_fact_emit_folio ON public.facturas_emitidas USING btree (serie, folio);
CREATE INDEX idx_fact_emit_uuid ON public.facturas_emitidas USING btree (cfdi_uuid);
CREATE INDEX idx_facturas_emitidas_etiqueta ON public.facturas_emitidas USING btree (etiqueta);

-- Permissions

ALTER TABLE public.facturas_emitidas OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.facturas_emitidas TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.facturas_emitidas TO inttec_admin;


-- public.facturas_emitidas_partidas definition

-- Drop table

-- DROP TABLE public.facturas_emitidas_partidas;

CREATE TABLE public.facturas_emitidas_partidas (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	factura_id uuid NOT NULL,
	descripcion text NOT NULL,
	cantidad numeric(12, 4) DEFAULT 1 NOT NULL,
	precio_unitario numeric(14, 2) DEFAULT 0 NOT NULL,
	importe numeric(14, 2) DEFAULT 0 NOT NULL,
	clave_sat varchar(20) DEFAULT '01010101'::character varying NOT NULL,
	clave_unidad varchar(10) DEFAULT 'H87'::character varying NOT NULL,
	unidad varchar(30) DEFAULT 'Pieza'::character varying NULL,
	objeto_imp varchar(5) DEFAULT '02'::character varying NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	descripcion_detallada text NULL,
	CONSTRAINT facturas_emitidas_partidas_pkey PRIMARY KEY (id),
	CONSTRAINT facturas_emitidas_partidas_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES public.facturas_emitidas(id) ON DELETE CASCADE
);

-- Permissions

ALTER TABLE public.facturas_emitidas_partidas OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.facturas_emitidas_partidas TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.facturas_emitidas_partidas TO inttec_admin;


-- public.gastos definition

-- Drop table

-- DROP TABLE public.gastos;

CREATE TABLE public.gastos (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	empleado_id uuid NOT NULL,
	empleado_nombre text NULL,
	monto numeric NOT NULL,
	metodo_pago text NULL,
	justificacion text NULL,
	foto_url text NULL,
	status text DEFAULT 'PENDING'::text NULL,
	rejection_feedback text NULL,
	created_at timestamptz DEFAULT now() NULL,
	approved_at timestamptz NULL,
	fecha_comprobante date NULL,
	tipo_tarjeta varchar(50) NULL,
	ubicacion_registro varchar(255) NULL,
	facturado bool DEFAULT false NULL,
	factura_url text NULL,
	motivo_sin_factura text NULL,
	tipo_servicio_proyecto text NULL,
	detalle_servicio_proyecto text NULL,
	venta_id uuid NULL,
	subcategoria_id uuid NULL,
	proveedor_id uuid NULL,
	cliente_id uuid NULL,
	sucursal_id uuid NULL,
	estado_reembolso text DEFAULT 'NORMAL'::text NULL,
	CONSTRAINT gastos_estado_reembolso_check CHECK ((estado_reembolso = ANY (ARRAY['NORMAL'::text, 'PENDIENTE_REEMBOLSO'::text, 'REEMBOLSADO'::text]))),
	CONSTRAINT gastos_metodo_pago_check CHECK ((metodo_pago = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'tarjeta_credito'::text, 'tarjeta_debito'::text, 'transferencia'::text]))),
	CONSTRAINT gastos_pkey PRIMARY KEY (id),
	CONSTRAINT gastos_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'ACTION_REQUIRED'::text]))),
	CONSTRAINT gastos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL,
	CONSTRAINT gastos_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id),
	CONSTRAINT gastos_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE SET NULL,
	CONSTRAINT gastos_subcategoria_id_fkey FOREIGN KEY (subcategoria_id) REFERENCES public.subcategorias(id) ON DELETE SET NULL,
	CONSTRAINT gastos_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES public.sucursales_cliente(id) ON DELETE SET NULL,
	CONSTRAINT gastos_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE SET NULL
);
CREATE INDEX idx_gastos_cliente_id ON public.gastos USING btree (cliente_id);
CREATE INDEX idx_gastos_estado_reembolso ON public.gastos USING btree (estado_reembolso);
CREATE INDEX idx_gastos_proveedor_id ON public.gastos USING btree (proveedor_id);
CREATE INDEX idx_gastos_subcategoria_id ON public.gastos USING btree (subcategoria_id);
CREATE INDEX idx_gastos_sucursal_id ON public.gastos USING btree (sucursal_id);
ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;

-- Table Policies

CREATE POLICY "Empleados pueden actualizar sus propios gastos" ON public.gastos
 AS PERMISSIVE
 FOR UPDATE
 USING ((auth.uid() = empleado_id));
CREATE POLICY "Lectura y escritura global de gastos" ON public.gastos
 AS PERMISSIVE
 FOR ALL
 USING (true);

-- Permissions

ALTER TABLE public.gastos OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.gastos TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.gastos TO inttec_admin;


-- public.inventario_empleados definition

-- Drop table

-- DROP TABLE public.inventario_empleados;

CREATE TABLE public.inventario_empleados (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	empleado_id uuid NOT NULL,
	producto_id uuid NOT NULL,
	cantidad_disponible numeric DEFAULT 0 NOT NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	cantidad_nuevo numeric DEFAULT 0 NULL,
	cantidad_usado numeric DEFAULT 0 NULL,
	cantidad_por_revisar numeric DEFAULT 0 NULL,
	CONSTRAINT inventario_empleados_pkey PRIMARY KEY (id),
	CONSTRAINT inventario_empleados_unique UNIQUE (empleado_id, producto_id),
	CONSTRAINT inventario_empleados_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id),
	CONSTRAINT inventario_empleados_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id)
);

-- Permissions

ALTER TABLE public.inventario_empleados OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.inventario_empleados TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.inventario_empleados TO inttec_admin;


-- public.movimientos_inventario definition

-- Drop table

-- DROP TABLE public.movimientos_inventario;

CREATE TABLE public.movimientos_inventario (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	producto_id uuid NOT NULL,
	tipo varchar(10) NOT NULL,
	cantidad numeric NOT NULL,
	fecha timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	folio_factura varchar(100) NULL,
	proveedor_id uuid NULL,
	creado_por uuid NULL,
	firma_base64 text NULL,
	CONSTRAINT movimientos_inventario_cantidad_check CHECK ((cantidad > (0)::numeric)),
	CONSTRAINT movimientos_inventario_pkey PRIMARY KEY (id),
	CONSTRAINT movimientos_inventario_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('ENTRADA'::character varying)::text, ('SALIDA'::character varying)::text]))),
	CONSTRAINT movimientos_inventario_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL,
	CONSTRAINT movimientos_inventario_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE RESTRICT,
	CONSTRAINT movimientos_inventario_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE SET NULL
);
CREATE INDEX idx_movimientos_producto ON public.movimientos_inventario USING btree (producto_id);
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;

-- Permissions

ALTER TABLE public.movimientos_inventario OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.movimientos_inventario TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.movimientos_inventario TO inttec_admin;


-- public.registro_gasolina definition

-- Drop table

-- DROP TABLE public.registro_gasolina;

CREATE TABLE public.registro_gasolina (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	gasto_id uuid NULL,
	vehiculo_id uuid NOT NULL,
	empleado_id uuid NOT NULL,
	fecha date DEFAULT CURRENT_DATE NOT NULL,
	kilometraje_actual int4 NOT NULL,
	litros numeric NOT NULL,
	costo_total numeric NOT NULL,
	ticket_foto_url text NULL,
	observaciones text NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT registro_gasolina_pkey PRIMARY KEY (id),
	CONSTRAINT registro_gasolina_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id) ON DELETE CASCADE,
	CONSTRAINT registro_gasolina_gasto_id_fkey FOREIGN KEY (gasto_id) REFERENCES public.gastos(id) ON DELETE CASCADE,
	CONSTRAINT registro_gasolina_vehiculo_id_fkey FOREIGN KEY (vehiculo_id) REFERENCES public.vehiculos(id) ON DELETE CASCADE
);
ALTER TABLE public.registro_gasolina ENABLE ROW LEVEL SECURITY;

-- Permissions

ALTER TABLE public.registro_gasolina OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.registro_gasolina TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.registro_gasolina TO inttec_admin;


-- public.retiros_material definition

-- Drop table

-- DROP TABLE public.retiros_material;

CREATE TABLE public.retiros_material (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	empleado_id uuid NOT NULL,
	empleado_nombre text NOT NULL,
	tipo_gasto text NULL,
	detalle_servicio_proyecto text NULL,
	proveedor text NULL,
	proveedor_id uuid NULL,
	cliente_id uuid NULL,
	cliente_nombre text NULL,
	sucursal_id uuid NULL,
	sucursal_nombre text NULL,
	is_split bool DEFAULT false NULL,
	splits_json jsonb NULL,
	materiales jsonb NOT NULL,
	motivo text NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	firma_base64 text NULL,
	responsiva_aceptada bool DEFAULT true NULL,
	firmado_en timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	dispositivo_info text NULL,
	CONSTRAINT retiros_material_pkey PRIMARY KEY (id),
	CONSTRAINT retiros_material_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL,
	CONSTRAINT retiros_material_empleado_id_fkey FOREIGN KEY (empleado_id) REFERENCES public.usuarios(id),
	CONSTRAINT retiros_material_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE SET NULL,
	CONSTRAINT retiros_material_sucursal_id_fkey FOREIGN KEY (sucursal_id) REFERENCES public.sucursales_cliente(id) ON DELETE SET NULL
);
CREATE INDEX idx_retiros_material_cliente_id ON public.retiros_material USING btree (cliente_id);
CREATE INDEX idx_retiros_material_created_at ON public.retiros_material USING btree (created_at DESC);
CREATE INDEX idx_retiros_material_empleado_id ON public.retiros_material USING btree (empleado_id);
ALTER TABLE public.retiros_material ENABLE ROW LEVEL SECURITY;

-- Permissions

ALTER TABLE public.retiros_material OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.retiros_material TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.retiros_material TO inttec_admin;


-- public.tarea_corresponsables definition

-- Drop table

-- DROP TABLE public.tarea_corresponsables;

CREATE TABLE public.tarea_corresponsables (
	tarea_id uuid NOT NULL,
	usuario_id uuid NOT NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT tarea_corresponsables_pkey PRIMARY KEY (tarea_id, usuario_id),
	CONSTRAINT tarea_corresponsables_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES public.tareas(id) ON DELETE CASCADE,
	CONSTRAINT tarea_corresponsables_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE
);

-- Permissions

ALTER TABLE public.tarea_corresponsables OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.tarea_corresponsables TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.tarea_corresponsables TO inttec_admin;


-- public.tarea_notas definition

-- Drop table

-- DROP TABLE public.tarea_notas;

CREATE TABLE public.tarea_notas (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tarea_id uuid NOT NULL,
	usuario_id uuid NOT NULL,
	comentario text NOT NULL,
	adjunto_url text NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT tarea_notas_pkey PRIMARY KEY (id),
	CONSTRAINT tarea_notas_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES public.tareas(id) ON DELETE CASCADE,
	CONSTRAINT tarea_notas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id)
);

-- Permissions

ALTER TABLE public.tarea_notas OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.tarea_notas TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.tarea_notas TO inttec_admin;


-- public.tarea_reprogramaciones definition

-- Drop table

-- DROP TABLE public.tarea_reprogramaciones;

CREATE TABLE public.tarea_reprogramaciones (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	tarea_id uuid NOT NULL,
	usuario_id uuid NOT NULL,
	fecha_original date NOT NULL,
	nueva_fecha date NOT NULL,
	motivo_cambio text NOT NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT tarea_reprogramaciones_pkey PRIMARY KEY (id),
	CONSTRAINT tarea_reprogramaciones_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES public.tareas(id) ON DELETE CASCADE,
	CONSTRAINT tarea_reprogramaciones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id)
);

-- Permissions

ALTER TABLE public.tarea_reprogramaciones OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.tarea_reprogramaciones TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.tarea_reprogramaciones TO inttec_admin;


-- public.facturas_recibidas definition

-- Drop table

-- DROP TABLE public.facturas_recibidas;

CREATE TABLE public.facturas_recibidas (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	"uuid" text NOT NULL,
	rfc_emisor text NOT NULL,
	nombre_emisor text NOT NULL,
	rfc_receptor text NOT NULL,
	fecha_emision timestamptz NOT NULL,
	subtotal numeric DEFAULT 0 NULL,
	descuento numeric DEFAULT 0 NULL,
	iva numeric DEFAULT 0 NULL,
	retencion_isr numeric DEFAULT 0 NULL,
	retencion_iva numeric DEFAULT 0 NULL,
	total numeric DEFAULT 0 NULL,
	moneda text DEFAULT 'MXN'::text NULL,
	tipo_comprobante text DEFAULT 'I'::text NULL,
	estado_sat text DEFAULT 'VIGENTE'::text NULL,
	xml_url text NULL,
	pdf_url text NULL,
	conciliado_gasto_id uuid NULL,
	conceptos_json jsonb DEFAULT '[]'::jsonb NULL,
	created_at timestamptz DEFAULT now() NULL,
	updated_at timestamptz DEFAULT now() NULL,
	CONSTRAINT facturas_recibidas_pkey PRIMARY KEY (id),
	CONSTRAINT facturas_recibidas_uuid_key UNIQUE (uuid),
	CONSTRAINT facturas_recibidas_gasto_fkey FOREIGN KEY (conciliado_gasto_id) REFERENCES public.gastos(id) ON DELETE SET NULL
);
CREATE INDEX idx_facturas_recibidas_estado ON public.facturas_recibidas USING btree (estado_sat);
CREATE INDEX idx_facturas_recibidas_fecha ON public.facturas_recibidas USING btree (fecha_emision DESC);
CREATE INDEX idx_facturas_recibidas_rfc_emisor ON public.facturas_recibidas USING btree (rfc_emisor);
CREATE INDEX idx_facturas_recibidas_rfc_receptor ON public.facturas_recibidas USING btree (rfc_receptor);
CREATE INDEX idx_facturas_recibidas_uuid ON public.facturas_recibidas USING btree (uuid);
ALTER TABLE public.facturas_recibidas ENABLE ROW LEVEL SECURITY;

-- Permissions

ALTER TABLE public.facturas_recibidas OWNER TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.facturas_recibidas TO postgres;
GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLE public.facturas_recibidas TO inttec_admin;


-- public.vista_conciliacion_duplicados_ventas source

CREATE OR REPLACE VIEW public.vista_conciliacion_duplicados_ventas
AS SELECT id,
    cliente,
    fecha,
    folio,
    factura_referencia,
    tipo_proyecto,
    precio_total_facturado,
    cfdi_uuid,
    cfdi_estado,
    created_at
   FROM ventas
  WHERE tipo_proyecto = 'Factura Directa'::text AND (factura_referencia IS NULL OR factura_referencia = ''::text OR factura_referencia = folio);

-- Permissions

ALTER TABLE public.vista_conciliacion_duplicados_ventas OWNER TO postgres;
GRANT ALL ON TABLE public.vista_conciliacion_duplicados_ventas TO postgres;
GRANT ALL ON TABLE public.vista_conciliacion_duplicados_ventas TO inttec_admin;



-- DROP FUNCTION public.hash_user_password();

CREATE OR REPLACE FUNCTION public.hash_user_password()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Solo encriptar si es un registro nuevo, o si la contraseña cambió,
  -- y la contraseña no parece un hash de Bcrypt ya encriptado.
  IF (TG_OP = 'INSERT' OR NEW.password IS DISTINCT FROM OLD.password) 
     AND NOT (NEW.password LIKE '$2a$%' OR NEW.password LIKE '$2b$%') THEN
    NEW.password := crypt(NEW.password, gen_salt('bf', 8));
  END IF;
  RETURN NEW;
END;
$function$
;

-- Permissions

ALTER FUNCTION public.hash_user_password() OWNER TO postgres;
GRANT ALL ON FUNCTION public.hash_user_password() TO postgres;

-- DROP FUNCTION public.login_usuario(text, text);

CREATE OR REPLACE FUNCTION public.login_usuario(email_param text, password_param text)
 RETURNS TABLE(id uuid, nombre text, email text, rol text, telefono text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT u.id, u.nombre, u.email, u.rol, u.telefono, u.created_at
  FROM usuarios u
  WHERE u.email = lower(trim(email_param))
    AND u.password = crypt(password_param, u.password);
END;
$function$
;

-- Permissions

ALTER FUNCTION public.login_usuario(text, text) OWNER TO postgres;
GRANT ALL ON FUNCTION public.login_usuario(text, text) TO postgres;


-- Permissions

GRANT ALL ON SCHEMA public TO pg_database_owner;
GRANT USAGE ON SCHEMA public TO public;
GRANT USAGE ON SCHEMA public TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT UPDATE, SELECT, USAGE ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT INSERT, UPDATE, SELECT, TRUNCATE, TRIGGER, REFERENCES, DELETE ON TABLES TO postgres;