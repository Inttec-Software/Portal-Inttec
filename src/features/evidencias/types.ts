export interface MaterialUsadoItem {
  productoId: string;
  nombre: string;
  retirado: number;
  usado: number;
  sobrante: number;
  unidad?: string;
  empleadoId?: string;
  empleadoNombre?: string;
}

export interface PhotoAsset {
  uri: string;
  base64: string | null;
}

export interface TrabajoRealizado {
  id?: string;
  descripcion: string;
  usa_materiales?: boolean;
  materiales: string;
  materiales_usados?: MaterialUsadoItem[];
  solucion: string;
  antesImg?: PhotoAsset;
  despuesImg?: PhotoAsset;
  fotosAdicionales?: PhotoAsset[];
  ia_desc_run?: boolean;
  ia_sol_run?: boolean;
}

export interface ColaboradorItem {
  id: string;
  nombre: string;
  email?: string;
}

export interface EvidenciaItem {
  id: string;
  cliente: string;
  descripcion_trabajo: any;
  materiales_usados?: string | null;
  observaciones?: string | null;
  foto_antes_url?: string | null;
  foto_despues_url?: string | null;
  fotos_adicionales_urls?: string[] | null;
  colaboradores?: any;
  creado_por?: string;
  creado_por_nombre?: string;
  usuario?: {
    id: string;
    nombre: string;
    email?: string;
  };
  created_at?: string;
  fecha?: string;
}

export interface EvidenciaPayload {
  cliente: string;
  descripcion_trabajo: string;
  materiales_usados: string | null;
  observaciones: string | null;
  foto_antes_url: string | null;
  foto_despues_url: string | null;
  fotos_adicionales_urls: string[] | null;
  colaboradores?: string | null;
}

export interface EvidenciasCatalogos {
  clientes: { id: string; nombre: string; [key: string]: any }[];
  sucursales: { id: string; cliente_id: string; nombre: string; [key: string]: any }[];
  empleados: { id: string; nombre: string; email?: string; [key: string]: any }[];
  inventario: any[];
}
