-- =========================================================================
-- MÓDULO DE TAREAS PENDIENTES
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.tareas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descripcion text,
  creado_por uuid NOT NULL,
  responsable_id uuid NOT NULL,
  fecha_compromiso date NOT NULL,
  status text NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente', 'Completada', 'Cancelada')),
  vinculo_tipo text CHECK (vinculo_tipo IN ('Venta', 'Cliente', 'Interna')),
  vinculo_id uuid, -- Referencia opcional (depende del vinculo_tipo)
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT tareas_pkey PRIMARY KEY (id),
  CONSTRAINT tareas_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id),
  CONSTRAINT tareas_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES public.usuarios(id)
);

CREATE TABLE IF NOT EXISTS public.tarea_corresponsables (
  tarea_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT tarea_corresponsables_pkey PRIMARY KEY (tarea_id, usuario_id),
  CONSTRAINT tarea_corresponsables_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES public.tareas(id) ON DELETE CASCADE,
  CONSTRAINT tarea_corresponsables_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.tarea_notas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  comentario text NOT NULL,
  adjunto_url text,
  created_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT tarea_notas_pkey PRIMARY KEY (id),
  CONSTRAINT tarea_notas_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES public.tareas(id) ON DELETE CASCADE,
  CONSTRAINT tarea_notas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id)
);

CREATE TABLE IF NOT EXISTS public.tarea_reprogramaciones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  fecha_original date NOT NULL,
  nueva_fecha date NOT NULL,
  motivo_cambio text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT tarea_reprogramaciones_pkey PRIMARY KEY (id),
  CONSTRAINT tarea_reprogramaciones_tarea_id_fkey FOREIGN KEY (tarea_id) REFERENCES public.tareas(id) ON DELETE CASCADE,
  CONSTRAINT tarea_reprogramaciones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id)
);

-- Políticas RLS opcionales (Si tienen RLS activado)
-- Para asegurar el acceso y modificación
