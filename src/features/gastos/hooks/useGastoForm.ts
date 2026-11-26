import { useEffect, useState, useMemo, useRef } from 'react';
import { Alert, Platform, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import {
  CatalogoItem,
  SubcategoriaItem,
  ProveedorItem,
  Usuario,
  AuthService,
  Vehiculo,
  VehiculoService,
  SucursalCliente,
  GastoHelper,
  supabase,
} from '@/services/supabase';
import { CatalogService } from '@/services/catalogService';
import { SyncService } from '@/services/sync';
import { isCombustibleExpense } from '@/utils/helpers';
import { optimizeImage } from '@/utils/imageOptimizer';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { gastosApi } from '../api/gastosApi';
import {
  GastoFormRole,
  GastoFormMode,
  TicketFileItem,
  FacturaPdfItem,
  SplitGastoItem,
  MetodoPagoGasto,
  TipoTarjetaGasto,
  TipoServicioProyectoGasto,
  FacturaStatusGasto,
} from '../types';

export const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(title + '\n\n' + message);
  } else {
    Alert.alert(title, message);
  }
};

const cleanJustificacion = (text: string | null | undefined): string => {
  if (!text) return '';
  let cleaned = text;
  // Strip ALERTA IA prefix
  cleaned = cleaned.replace(/^\[ALERTA IA:[^\]]*\]\s*/i, '');
  // Strip Consumo compartido
  cleaned = cleaned.replace(/\s*\[Consumo compartido con:[^\]]*\]/gi, '');
  // Strip Propina incluida
  cleaned = cleaned.replace(/\s*\[Propina incluida en ticket:[^\]]*\]/gi, '');
  // Strip Monto de propina dejado aparte
  cleaned = cleaned.replace(/\s*\[Monto de propina dejado aparte:[^\]]*\]/gi, '');
  // Strip Proveedor a agregar
  cleaned = cleaned.replace(/\s*\[Proveedor a agregar:[^\]]*\]/gi, '');
  // Strip Proyecto a agregar
  cleaned = cleaned.replace(/\s*\[Proyecto a agregar:[^\]]*\]/gi, '');
  // Strip Sucursal a agregar
  cleaned = cleaned.replace(/\s*\[Sucursal a agregar:[^\]]*\]/gi, '');
  return cleaned.trim();
};

export interface UseGastoFormOptions {
  role: GastoFormRole;
  mode: GastoFormMode;
  gastoId?: string;
}

export type TipoGastoDestino = 'PROYECTO' | 'OPERATIVO';
export type BloqueProyectoCategoria = 'ALIMENTOS' | 'HOSPEDAJE' | 'MATERIAL' | 'EQUIPO' | 'TRANSPORTE';
export type SubtipoTransporte = 'COMBUSTIBLE' | 'TRASLADOS';
export type SubtipoTraslado = 'CASETAS' | 'ESTACIONAMIENTOS' | 'MULTAS' | 'UBER' | 'VUELOS' | 'OTRO';

export interface ProyectoCatalogoItem {
  id: string;
  nombre: string;
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  sucursal_id?: string | null;
  sucursal_nombre?: string | null;
  status: 'ACTIVO' | 'CERRADO';
  notas?: string | null;
}

export interface HospedajeDiaPreview {
  fecha: string; // YYYY-MM-DD
  fechaFriendly: string; // DD/MM/YYYY
  monto_diario: number;
}

export function useGastoForm({ role, mode, gastoId }: UseGastoFormOptions) {
  const router = useRouter();
  const redirectRoute = role === 'admin' ? '/(admin)/gastos' : '/(empleado)/gastos';

  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [isLoadingGasto, setIsLoadingGasto] = useState(mode === 'edit');

  // Catálogos desde Supabase
  const [categorias, setCategorias] = useState<CatalogoItem[]>([]);
  const [subcategorias, setSubcategorias] = useState<SubcategoriaItem[]>([]);
  const [clientes, setClientes] = useState<CatalogoItem[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorItem[]>([]);
  const [proveedorSearch, setProveedorSearch] = useState('');
  const [showProvDropdown, setShowProvDropdown] = useState(false);
  const [modalNuevoProveedorVisible, setModalNuevoProveedorVisible] = useState(false);
  const [nuevoProvNombre, setNuevoProvNombre] = useState('');
  const [nuevoProvRfc, setNuevoProvRfc] = useState('');
  const [isSavingProv, setIsSavingProv] = useState(false);

  // Paso 1: Evidencia (Soporte multi-fotos)
  const [ticketFiles, setTicketFiles] = useState<TicketFileItem[]>([]);
  const [activeTicketIndex, setActiveTicketIndex] = useState<number>(0);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageExt, setImageExt] = useState<string>('jpg');
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);

  // Estados para compartir consumo con otros empleados
  const [allUsers, setAllUsers] = useState<Usuario[]>([]);
  const [selectedEmpleados, setSelectedEmpleados] = useState<Usuario[]>([]);
  const [showEmpList, setShowEmpList] = useState(false);

  // Paso 2: Detalles
  const [monto, setMonto] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [comentarioProveedor, setComentarioProveedor] = useState('');
  const [comentarioSucursal, setComentarioSucursal] = useState('');
  const [facturado, setFacturado] = useState<boolean | null>(null);
  const [facturaStatus, setFacturaStatus] = useState<FacturaStatusGasto>(null);
  const [comentarioPendiente, setComentarioPendiente] = useState('');
  const [facturaPdf, setFacturaPdf] = useState<FacturaPdfItem | null>(null);
  const [motivoSinFactura, setMotivoSinFactura] = useState('');
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);

  const getTodayFriendly = () => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const [fechaComprobante, setFechaComprobante] = useState(getTodayFriendly());
  const [tipoServicioProyecto, setTipoServicioProyecto] = useState<TipoServicioProyectoGasto>(null);
  const [detalleServicioProyecto, setDetalleServicioProyecto] = useState('');
  const [sucursal, setSucursal] = useState('');
  const [metodoPago, setMetodoPago] = useState<MetodoPagoGasto>('efectivo');
  const [tipoTarjeta, setTipoTarjeta] = useState<TipoTarjetaGasto>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateValue, setDateValue] = useState(new Date());
  const [alertaPolitica, setAlertaPolitica] = useState<string | null>(null);

  const [incluyePropina, setIncluyePropina] = useState<boolean | null>(null);
  const [montoPropina, setMontoPropina] = useState<string>('');
  const [esComida, setEsComida] = useState<boolean>(false);

  const formatFriendlyToDb = (friendlyStr: string) => {
    if (!friendlyStr) return '';
    const parts = friendlyStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
    }
    return friendlyStr;
  };

  const onChangeDate = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setDateValue(selectedDate);
      const dd = String(selectedDate.getDate()).padStart(2, '0');
      const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const yyyy = selectedDate.getFullYear();
      setFechaComprobante(`${dd}/${mm}/${yyyy}`);
    }
  };

  // Paso 3: Categorización
  const [selectedCategoria, setSelectedCategoria] = useState<string>('');
  const [selectedSubcategoria, setSelectedSubcategoria] = useState<string>('');
  const [selectedCliente, setSelectedCliente] = useState<string>('');
  const [clienteSearch, setClienteSearch] = useState('');
  const [justificacion, setJustificacion] = useState('');
  const [sucursalesCliente, setSucursalesCliente] = useState<SucursalCliente[]>([]);
  const [showSucursalDropdown, setShowSucursalDropdown] = useState(false);
  const [sucursalSearch, setSucursalSearch] = useState('');

  // Vehículos y Gasolina
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [selectedVehiculoId, setSelectedVehiculoId] = useState<string>('');
  const [kilometrajeActual, setKilometrajeActual] = useState<string>('');
  const [litrosGasolina, setLitrosGasolina] = useState<string>('');
  const [showVehiculoDropdown, setShowVehiculoDropdown] = useState(false);

  // División de Gasto
  const [isSplit, setIsSplit] = useState(false);
  const [splits, setSplits] = useState<SplitGastoItem[]>([]);

  // Dropdown list visibility toggles
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [showSubDropdown, setShowSubDropdown] = useState(false);
  const [showCliDropdown, setShowCliDropdown] = useState(false);

  // Modal para agregar división de gasto
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [newSplitClienteId, setNewSplitClienteId] = useState('');
  const [newSplitSucursalNombre, setNewSplitSucursalNombre] = useState('');
  const [newSplitComentarioSucursal, setNewSplitComentarioSucursal] = useState('');
  const [newSplitMonto, setNewSplitMonto] = useState('');
  const [showNewSplitCliDropdown, setShowNewSplitCliDropdown] = useState(false);
  const [showNewSplitSucDropdown, setShowNewSplitSucDropdown] = useState(false);
  const [splitClienteSearch, setSplitClienteSearch] = useState('');
  const [splitSucursalSearch, setSplitSucursalSearch] = useState('');

  // === REWORK GASTOS POR PROYECTO (Dev 2) ===
  const [proyectos, setProyectos] = useState<ProyectoCatalogoItem[]>([]);
  const [selectedProyectoId, setSelectedProyectoId] = useState<string | null>(null);
  const [comentarioProyecto, setComentarioProyecto] = useState('');
  const [proyectoSearch, setProyectoSearch] = useState('');
  const [showProyectoDropdown, setShowProyectoDropdown] = useState(false);
  const [tipoGasto, setTipoGasto] = useState<TipoGastoDestino>('PROYECTO');
  const [bloqueProyecto, setBloqueProyecto] = useState<BloqueProyectoCategoria | null>(null);
  const [subtipoTransporte, setSubtipoTransporte] = useState<SubtipoTransporte | null>(null);
  const [subtipoTraslado, setSubtipoTraslado] = useState<SubtipoTraslado | null>(null);

  const getTodayIso = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getTomorrowIso = () => {
    const tmrw = new Date(Date.now() + 86400000);
    const yyyy = tmrw.getFullYear();
    const mm = String(tmrw.getMonth() + 1).padStart(2, '0');
    const dd = String(tmrw.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const [fechaHospedajeInicio, setFechaHospedajeInicio] = useState<string>(getTodayIso());
  const [fechaHospedajeFin, setFechaHospedajeFin] = useState<string>(getTomorrowIso());
  const [showHospedajeInicioPicker, setShowHospedajeInicioPicker] = useState(false);
  const [showHospedajeFinPicker, setShowHospedajeFinPicker] = useState(false);
  const [isHistoricoSinProyecto, setIsHistoricoSinProyecto] = useState(false);
  const [hospedajeRecienteAviso, setHospedajeRecienteAviso] = useState<string | null>(null);
  const [mostrarSugerenciaProyecto, setMostrarSugerenciaProyecto] = useState(false);

  const normMatch = (val?: string | null): string =>
    String(val || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const selectedProyectoObj = useMemo(
    () => proyectos.find((p) => String(p.id) === String(selectedProyectoId)) || null,
    [proyectos, selectedProyectoId]
  );

  const selectedClienteObj = useMemo(
    () =>
      clientes.find(
        (c) =>
          normMatch(c.nombre) === normMatch(selectedCliente) ||
          String(c.id) === String(selectedCliente)
      ) || null,
    [clientes, selectedCliente]
  );

  const sucursalesDelCliente = useMemo(
    () =>
      selectedClienteObj
        ? sucursalesCliente.filter((s) => String(s.cliente_id) === String(selectedClienteObj.id))
        : [],
    [sucursalesCliente, selectedClienteObj]
  );

  const selectedSucursalObj = useMemo(
    () =>
      sucursalesDelCliente.find(
        (s) =>
          normMatch(s.nombre) === normMatch(sucursal) ||
          String(s.id) === String(sucursal)
      ) || null,
    [sucursalesDelCliente, sucursal]
  );

  const hasSucursalParaProyecto = useMemo(
    () =>
      Boolean(
        selectedCliente.trim() &&
          (sucursal.trim() || (role === 'empleado' && comentarioSucursal.trim()))
      ),
    [selectedCliente, sucursal, comentarioSucursal, role]
  );

  const proyectosDisponibles = useMemo(() => {
    if (!selectedCliente.trim() || !hasSucursalParaProyecto) return [];

    const clienteIdTarget = selectedClienteObj?.id ? String(selectedClienteObj.id) : null;
    const clienteNombreTarget = normMatch(selectedClienteObj?.nombre || selectedCliente);
    const sucursalIdTarget = selectedSucursalObj?.id ? String(selectedSucursalObj.id) : null;
    const sucursalNombreTarget = normMatch(selectedSucursalObj?.nombre || sucursal);
    const usandoSucursalNueva = !sucursal.trim() && Boolean(comentarioSucursal.trim());

    return proyectos.filter((p) => {
      // Siempre conservar visible el proyecto ya asignado en modo edición si coincide o si vino legado
      if (mode === 'edit' && selectedProyectoId && String(p.id) === String(selectedProyectoId)) {
        const matchEditCli =
          (clienteIdTarget && p.cliente_id && String(p.cliente_id) === clienteIdTarget) ||
          (!p.cliente_id && !p.cliente_nombre) ||
          normMatch(p.cliente_nombre) === clienteNombreTarget;
        if (matchEditCli) return true;
      }

      const matchCliente = clienteIdTarget
        ? (p.cliente_id ? String(p.cliente_id) === clienteIdTarget : normMatch(p.cliente_nombre) === clienteNombreTarget)
        : normMatch(p.cliente_nombre) === clienteNombreTarget;

      if (!matchCliente) return false;

      if (usandoSucursalNueva) {
        return !p.sucursal_id && !p.sucursal_nombre;
      }

      if (sucursalIdTarget && p.sucursal_id) {
        return String(p.sucursal_id) === sucursalIdTarget;
      }
      if (p.sucursal_nombre && sucursalNombreTarget) {
        return normMatch(p.sucursal_nombre) === sucursalNombreTarget;
      }
      return !p.sucursal_id && !p.sucursal_nombre;
    });
  }, [
    proyectos,
    selectedCliente,
    selectedClienteObj,
    hasSucursalParaProyecto,
    sucursal,
    selectedSucursalObj,
    comentarioSucursal,
    mode,
    selectedProyectoId,
  ]);

  const findCatName = (cats: CatalogoItem[], keywords: string[]): string => {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const found = cats.find((c) => c.nombre && keywords.some((k) => norm(c.nombre).includes(norm(k))));
    return found?.nombre || '';
  };

  const findSubName = (subs: SubcategoriaItem[], catId: string | undefined, keywords: string[]): string => {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const pool = catId ? subs.filter((s) => s.categoria_id === catId) : subs;
    const found = pool.find((s) => s.nombre && keywords.some((k) => norm(s.nombre).includes(norm(k))));
    return found?.nombre || (pool[0]?.nombre || '');
  };

  const handleSelectTipoGasto = (nuevoTipo: TipoGastoDestino) => {
    setTipoGasto(nuevoTipo);
    setShowProyectoDropdown(false);
    if (nuevoTipo !== 'OPERATIVO') {
      setIsSplit(false);
      setSplits([]);
    }
    if (nuevoTipo === 'OPERATIVO') {
      setSelectedProyectoId(null);
      setComentarioProyecto('');
      setBloqueProyecto(null);
      setSubtipoTransporte(null);
      setSubtipoTraslado(null);
      setEsComida(false);
      setTipoServicioProyecto('Operativo');
      if (!detalleServicioProyecto.trim()) {
        setDetalleServicioProyecto('Gasto Operativo / General');
      }
      const opCat = findCatName(categorias, ['oficina', 'administracion', 'operativo']);
      if (opCat) {
        setSelectedCategoria(opCat);
        const catObj = categorias.find((c) => c.nombre === opCat);
        setSelectedSubcategoria(findSubName(subcategorias, catObj?.id, ['general', 'oficina', 'papeleri', 'servicio']));
      }
    } else {
      setTipoServicioProyecto('Proyecto');
      if (selectedProyectoObj) {
        setDetalleServicioProyecto(selectedProyectoObj.nombre);
      }
    }
  };

  const handleSelectClienteProyecto = (cli: CatalogoItem) => {
    setSelectedCliente(cli.nombre);
    const cliSucs = sucursalesCliente.filter((s) => String(s.cliente_id) === String(cli.id));
    setSucursal(cliSucs.length === 1 ? cliSucs[0].nombre : '');
    setComentarioSucursal('');
    setSelectedProyectoId(null);
    setComentarioProyecto('');
    setMostrarSugerenciaProyecto(false);
    setHospedajeRecienteAviso(null);
    setShowProyectoDropdown(false);
    setClienteSearch('');
    setShowCliDropdown(false);
  };

  const handleSelectSucursalProyecto = (sucNombre: string) => {
    setSucursal(sucNombre);
    setComentarioSucursal('');
    setSelectedProyectoId(null);
    setComentarioProyecto('');
    setMostrarSugerenciaProyecto(false);
    setHospedajeRecienteAviso(null);
    setShowProyectoDropdown(false);
    setSucursalSearch('');
    setShowSucursalDropdown(false);
  };

  const handleSelectProyecto = async (proj: ProyectoCatalogoItem | null, enableSuggestion = false) => {
    setShowProyectoDropdown(false);
    setProyectoSearch('');
    if (!proj) {
      setSelectedProyectoId(null);
      setHospedajeRecienteAviso(null);
      setMostrarSugerenciaProyecto(enableSuggestion);
      return;
    }
    setSelectedProyectoId(proj.id);
    setComentarioProyecto('');
    setMostrarSugerenciaProyecto(false);
    setTipoGasto('PROYECTO');
    setIsHistoricoSinProyecto(false);
    setTipoServicioProyecto('Proyecto');
    setDetalleServicioProyecto(proj.nombre);

    if (proj.cliente_nombre) {
      setSelectedCliente(proj.cliente_nombre);
    } else if (proj.cliente_id) {
      const cli = clientes.find((c) => String(c.id) === String(proj.cliente_id));
      if (cli?.nombre) setSelectedCliente(cli.nombre);
    }

    if (proj.sucursal_nombre) {
      setSucursal(proj.sucursal_nombre);
    } else if (proj.sucursal_id) {
      const suc = sucursalesCliente.find((s) => String(s.id) === String(proj.sucursal_id));
      if (suc?.nombre) setSucursal(suc.nombre);
    }

    // Consultar si hay hospedajes recientes en este proyecto para mostrar recordatorio amigable
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/proyectos/${proj.id}`, { headers });
      if (res.ok) {
        const json = await res.json();
        const gastosProj: any[] = json?.gastos || [];
        const hospPrevio = gastosProj.find(
          (g) =>
            String(g.id) !== String(gastoId || '') &&
            g.status !== 'REJECTED' &&
            (g.fecha_hospedaje_inicio ||
              (g.subcategoria_rel?.nombre || '').toLowerCase().includes('hospedaje'))
        );
        if (hospPrevio) {
          const rangoPrevio =
            hospPrevio.fecha_hospedaje_inicio && hospPrevio.fecha_hospedaje_fin
              ? ` (${hospPrevio.fecha_hospedaje_inicio} al ${hospPrevio.fecha_hospedaje_fin})`
              : '';
          setHospedajeRecienteAviso(
            `Existe un gasto de hospedaje registrado en este proyecto${rangoPrevio}. Si te quedaste días extra con un nuevo ticket/factura, regístralo aquí con las nuevas fechas; si es el mismo cobro aún pendiente, puedes editar el gasto original.`
          );
        } else {
          setHospedajeRecienteAviso(null);
        }
      }
    } catch (_) {
      // Silencioso si el endpoint aún no está disponible
    }
  };

  const handleSelectBloqueProyecto = (bloque: BloqueProyectoCategoria) => {
    setBloqueProyecto(bloque);
    setShowCatDropdown(false);
    setShowSubDropdown(false);

    if (bloque === 'ALIMENTOS') {
      setEsComida(true);
      setSubtipoTransporte(null);
      setSubtipoTraslado(null);
      const cat = findCatName(categorias, ['viaje', 'alimento', 'viatico']);
      const catObj = categorias.find((c) => c.nombre === cat);
      const sub = findSubName(subcategorias, catObj?.id, ['alimento', 'comida', 'consumo']);
      if (cat) setSelectedCategoria(cat);
      if (sub) setSelectedSubcategoria(sub);
    } else if (bloque === 'HOSPEDAJE') {
      setEsComida(false);
      setIncluyePropina(null);
      setMontoPropina('');
      setSelectedEmpleados([]);
      setSubtipoTransporte(null);
      setSubtipoTraslado(null);
      if (!fechaHospedajeInicio) setFechaHospedajeInicio(getTodayIso());
      if (!fechaHospedajeFin) setFechaHospedajeFin(getTomorrowIso());
      const cat = findCatName(categorias, ['viaje', 'hospedaje', 'viatico']);
      const catObj = categorias.find((c) => c.nombre === cat);
      const sub = findSubName(subcategorias, catObj?.id, ['hospedaje', 'hotel', 'alojamiento']);
      if (cat) setSelectedCategoria(cat);
      if (sub) setSelectedSubcategoria(sub);
    } else if (bloque === 'MATERIAL') {
      setEsComida(false);
      setIncluyePropina(null);
      setMontoPropina('');
      setSelectedEmpleados([]);
      setSubtipoTransporte(null);
      setSubtipoTraslado(null);
      const cat = findCatName(categorias, ['material']);
      const catObj = categorias.find((c) => c.nombre === cat);
      const sub = findSubName(subcategorias, catObj?.id, ['electrico', 'ferreteria', 'material']);
      if (cat) setSelectedCategoria(cat);
      if (sub) setSelectedSubcategoria(sub);
    } else if (bloque === 'EQUIPO') {
      setEsComida(false);
      setIncluyePropina(null);
      setMontoPropina('');
      setSelectedEmpleados([]);
      setSubtipoTransporte(null);
      setSubtipoTraslado(null);
      const cat = findCatName(categorias, ['equipo']);
      const catObj = categorias.find((c) => c.nombre === cat);
      const sub = findSubName(subcategorias, catObj?.id, ['seguridad', 'panel', 'refrigeracion', 'venta', 'equipo']);
      if (cat) setSelectedCategoria(cat);
      if (sub) setSelectedSubcategoria(sub);
    } else if (bloque === 'TRANSPORTE') {
      setEsComida(false);
      setIncluyePropina(null);
      setMontoPropina('');
      setSelectedEmpleados([]);
      const nextSub = subtipoTransporte || 'COMBUSTIBLE';
      handleSelectSubtipoTransporte(nextSub);
    }
  };

  const handleSelectSubtipoTransporte = (sub: SubtipoTransporte) => {
    setBloqueProyecto('TRANSPORTE');
    setSubtipoTransporte(sub);
    if (sub === 'COMBUSTIBLE') {
      setSubtipoTraslado(null);
      const cat = findCatName(categorias, ['vehiculo', 'transporte']);
      const catObj = categorias.find((c) => c.nombre === cat);
      const subName = findSubName(subcategorias, catObj?.id, ['combustible', 'gasolina', 'diesel']);
      if (cat) setSelectedCategoria(cat);
      if (subName) setSelectedSubcategoria(subName);
    } else {
      const defaultTraslado: SubtipoTraslado = subtipoTraslado || 'CASETAS';
      setSubtipoTraslado(defaultTraslado);
      const cat = findCatName(categorias, ['viaje', 'traslado', 'transporte']);
      const catObj = categorias.find((c) => c.nombre === cat);
      const subName = findSubName(subcategorias, catObj?.id, ['traslado', 'caseta', 'uber', 'taxi', 'peaje', 'vuelo']);
      if (cat) setSelectedCategoria(cat);
      if (subName) setSelectedSubcategoria(subName);
    }
  };

  const handleSelectSubtipoTraslado = (st: SubtipoTraslado) => {
    setSubtipoTraslado(st);
    const cat = findCatName(categorias, ['viaje', 'traslado', 'transporte']);
    const catObj = categorias.find((c) => c.nombre === cat);
    if (st === 'VUELOS') {
      const subVuelo = findSubName(subcategorias, catObj?.id, ['vuelo', 'avion', 'boleto', 'traslado']);
      if (subVuelo) setSelectedSubcategoria(subVuelo);
    } else {
      const subTras = findSubName(subcategorias, catObj?.id, ['traslado', 'caseta', 'uber', 'taxi']);
      if (subTras) setSelectedSubcategoria(subTras);
    }
  };

  const hospedajePreview = useMemo(() => {
    const startStr = (fechaHospedajeInicio || '').trim();
    const endStr = (fechaHospedajeFin || '').trim();
    const rx = /^\d{4}-\d{2}-\d{2}$/;
    if (!rx.test(startStr) || !rx.test(endStr)) {
      return { diasCount: 0, costoPorDia: 0, dias: [] as HospedajeDiaPreview[], error: 'Formato de fecha inválido (AAAA-MM-DD)' };
    }
    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return { diasCount: 0, costoPorDia: 0, dias: [] as HospedajeDiaPreview[], error: 'Fecha inválida' };
    }
    if (endDate < startDate) {
      return { diasCount: 0, costoPorDia: 0, dias: [] as HospedajeDiaPreview[], error: 'La fecha de salida no puede ser anterior a la entrada' };
    }
    const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
    const diasCount = Math.max(1, diffDays);
    const totalNum = Number(monto) || 0;
    const costoPorDia = diasCount > 0 ? Math.round((totalNum / diasCount) * 100) / 100 : 0;

    const dias: HospedajeDiaPreview[] = [];
    for (let i = 0; i < diasCount; i++) {
      const d = new Date(sy, sm - 1, sd + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const isLast = i === diasCount - 1;
      const montoDia = isLast && totalNum > 0
        ? Math.max(0, Math.round((totalNum - costoPorDia * (diasCount - 1)) * 100) / 100)
        : costoPorDia;
      dias.push({
        fecha: `${yyyy}-${mm}-${dd}`,
        fechaFriendly: `${dd}/${mm}/${yyyy}`,
        monto_diario: montoDia,
      });
    }
    return { diasCount, costoPorDia, dias, error: null as string | null };
  }, [fechaHospedajeInicio, fechaHospedajeFin, monto]);

  const alertaLocal = useMemo(() => {
    const alerts: string[] = [];

    if (mode === 'create') {
      if (esComida) {
        let totalGasto = Number(monto) || 0;
        if (isSplit && splits.length > 0) {
          totalGasto = splits.reduce((sum, s) => sum + (Number(s.monto) || 0), 0);
        }

        const propinaExtra = (incluyePropina === false && montoPropina && !isNaN(Number(montoPropina)))
          ? Number(montoPropina)
          : 0;
        totalGasto += propinaExtra;

        const cantidadPersonas = 1 + selectedEmpleados.length;
        const limiteCalculado = 280 * cantidadPersonas;

        if (totalGasto > limiteCalculado) {
          const labelTotal = propinaExtra > 0
            ? `(Total con Propina/División: $${totalGasto.toFixed(2)} MXN)`
            : incluyePropina === true
              ? `(Total con Propina Incluida/División: $${totalGasto.toFixed(2)} MXN)`
              : `(Total/División: $${totalGasto.toFixed(2)} MXN)`;
          alerts.push(`Límite de alimentos excedido: el límite general por comida es de $${limiteCalculado} MXN para ${cantidadPersonas} persona(s) ${labelTotal}`);
        }
      }
    } else {
      const valMonto = Number(monto);
      if (valMonto && !isNaN(valMonto) && selectedCategoria) {
        const isAlimentos = esComida;
        const cantidadPersonas = 1 + selectedEmpleados.length;
        const limiteCalculado = 280 * cantidadPersonas;
        const propinaExtra = (esComida && incluyePropina === false && montoPropina && !isNaN(Number(montoPropina)))
          ? Number(montoPropina)
          : 0;
        const totalGasto = valMonto + propinaExtra;

        if (isAlimentos && totalGasto > limiteCalculado) {
          const labelTotal = propinaExtra > 0
            ? `(Total con Propina: $${totalGasto} MXN)`
            : incluyePropina === true
              ? `(Total con Propina Incluida: $${totalGasto} MXN)`
              : `(Total: $${totalGasto} MXN)`;
          alerts.push(`Límite de alimentos excedido: el límite general por comida es de $${limiteCalculado} MXN para ${cantidadPersonas} personas ${labelTotal}`);
        }
      }
    }

    const keywordsInfraccion = [
      'cigarro', 'tabaco', 'papita', 'galleta', 'chucheria', 'dulce', 'fritura', 'chocolate',
      'gansito', 'sabritas', 'barcel', 'marinela', 'alcohol', 'cerveza'
    ];
    const textToCheck = `${justificacion} ${proveedor}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const infraccionesDetectadas = keywordsInfraccion.filter(keyword => textToCheck.includes(keyword));

    if (infraccionesDetectadas.length > 0) {
      alerts.push(`Artículos no permitidos detectados (${infraccionesDetectadas.join(', ')})`);
    }

    return alerts.length > 0 ? alerts.join(' | ') : null;
  }, [mode, monto, isSplit, splits, selectedCategoria, justificacion, proveedor, selectedEmpleados, esComida, incluyePropina, montoPropina]);

  const loadCatalogos = async () => {
    try {
      const data: any = await gastosApi.fetchFormCatalogs();
      if (data.categorias) setCategorias(data.categorias);
      if (data.subcategorias) setSubcategorias(data.subcategorias);
      if (data.clientes) setClientes(data.clientes);
      if (data.usuarios) setAllUsers(data.usuarios);
      if (data.sucursales) setSucursalesCliente(data.sucursales);
      if (data.proveedores) setProveedores(data.proveedores);

      let loadedProyectos: ProyectoCatalogoItem[] = [];
      if (Array.isArray(data.proyectos) && data.proyectos.length > 0) {
        loadedProyectos = data.proyectos;
      } else {
        try {
          const headers = await getApiHeaders();
          const pRes = await fetch(`${getApiUrl()}/api/proyectos?status=ACTIVO`, { headers });
          if (pRes.ok) {
            const pJson = await pRes.json();
            if (Array.isArray(pJson?.proyectos)) {
              loadedProyectos = pJson.proyectos;
            }
          }
        } catch (_) {
          // Si Dev 1 aún no expone /api/proyectos, mantiene lista vacía sin tronar
        }
      }
      setProyectos(loadedProyectos);

      if (data?.vehiculos && data.vehiculos.length > 0) {
        setVehiculos(data.vehiculos);
      } else {
        try {
          const vehList = await VehiculoService.getVehiculos(true);
          if (vehList) setVehiculos(vehList);
        } catch (vehErr) {
          console.warn('Error al obtener vehículos:', vehErr);
        }
      }
      return { ...data, proyectos: loadedProyectos };
    } catch (err) {
      console.error('Error loading catalogs:', err);
      return null;
    }
  };

  useEffect(() => {
    const init = async () => {
      const user = await AuthService.getCurrentUser();
      if (!user) {
        router.replace('/');
        return;
      }
      setCurrentUser(user);
      const catalogs = await loadCatalogos();

      if (mode === 'edit' && gastoId) {
        try {
          const data = await gastosApi.fetchGastoById(gastoId);
          if (data) {
            const existingUrls = GastoHelper.getFotoUrls(data);
            if (existingUrls.length > 0) {
              setTicketFiles(existingUrls.map(u => ({ uri: u, ext: u.toLowerCase().endsWith('.pdf') ? 'pdf' : 'jpg', isRemote: true })));
              setImageUri(existingUrls[0]);
            } else if (data.foto_url) {
              setImageUri(data.foto_url);
              setTicketFiles([{ uri: data.foto_url, ext: 'jpg', isRemote: true }]);
            }
            if (data.monto !== undefined && data.monto !== null) setMonto(data.monto.toString());

            if (data.fecha_comprobante) {
              const cleanStr = String(data.fecha_comprobante).split('T')[0].split(' ')[0].trim();
              const parts = cleanStr.split('-'); // YYYY-MM-DD
              if (parts.length === 3 && parts[0].length === 4) {
                const dd = parts[2].padStart(2, '0');
                const mm = parts[1].padStart(2, '0');
                const yyyy = parts[0];
                setFechaComprobante(`${dd}/${mm}/${yyyy}`);
                const parsedDate = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
                setDateValue(parsedDate);
              }
            }

            const resolvedProveedor = GastoHelper.getProveedor(data);
            setProveedor(resolvedProveedor);
            if (!resolvedProveedor && data.justificacion) {
              const provMatch = data.justificacion.match(/\[Proveedor a agregar:\s*([^\]]+)\]/);
              if (provMatch) {
                setComentarioProveedor(provMatch[1].trim());
              }
            }
            setTipoServicioProyecto(data.tipo_servicio_proyecto as any || null);
            setDetalleServicioProyecto(data.detalle_servicio_proyecto || '');

            const resolvedCliente = GastoHelper.getCliente(data) || (data as any).proyecto_rel?.cliente_nombre || '';
            setSelectedCliente(resolvedCliente);

            const resolvedSucursal = GastoHelper.getSucursal(data) || (data as any).proyecto_rel?.sucursal_nombre || '';
            setSucursal(resolvedSucursal);
            if (!resolvedSucursal && data.justificacion) {
              const sucMatch = data.justificacion.match(/\[Sucursal a agregar:\s*([^\]]+)\]/i);
              if (sucMatch) {
                setComentarioSucursal(sucMatch[1].trim());
              }
            }

            setMetodoPago(data.metodo_pago as any || 'efectivo');
            setTipoTarjeta(data.tipo_tarjeta as any || null);
            setJustificacion(cleanJustificacion(data.justificacion));

            let resolvedCat = GastoHelper.getCategoria(data);
            let resolvedSub = GastoHelper.getSubcategoria(data);

            if ((!resolvedCat || !resolvedSub) && data.subcategoria_id && catalogs?.subcategorias) {
              const foundSub = catalogs.subcategorias.find((s: any) => s.id === data.subcategoria_id);
              if (foundSub) {
                if (!resolvedSub) resolvedSub = foundSub.nombre;
                if (!resolvedCat && catalogs.categorias) {
                  const foundCat = catalogs.categorias.find((c: any) => c.id === foundSub.categoria_id);
                  if (foundCat) resolvedCat = foundCat.nombre;
                }
              }
            }

            if (resolvedCat) setSelectedCategoria(resolvedCat);
            if (resolvedSub) setSelectedSubcategoria(resolvedSub);

            // Hidratar campos nuevos del Rework por Proyecto y compatibilidad con gastos históricos
            const rawData: any = data;
            const projSugMatch = data.justificacion?.match(/\[Proyecto a agregar:\s*([^\]]+)\]/i);
            if (rawData.proyecto_id) {
              setSelectedProyectoId(String(rawData.proyecto_id));
              setComentarioProyecto('');
              setMostrarSugerenciaProyecto(false);
              setTipoGasto('PROYECTO');
              setIsHistoricoSinProyecto(false);
              if (rawData.proyecto_rel && ! (catalogs?.proyectos || []).some((p: any) => String(p.id) === String(rawData.proyecto_id))) {
                setProyectos((prev) => [
                  {
                    id: String(rawData.proyecto_id),
                    nombre: rawData.proyecto_rel.nombre || rawData.detalle_servicio_proyecto || 'Proyecto asignado',
                    cliente_id: rawData.proyecto_rel.cliente_id || rawData.cliente_id || null,
                    cliente_nombre: rawData.proyecto_rel.cliente_nombre || resolvedCliente || null,
                    sucursal_id: rawData.proyecto_rel.sucursal_id || rawData.sucursal_id || null,
                    sucursal_nombre: rawData.proyecto_rel.sucursal_nombre || resolvedSucursal || null,
                    status: rawData.proyecto_rel.status || 'ACTIVO',
                  },
                  ...prev,
                ]);
              }
            } else if (projSugMatch) {
              setSelectedProyectoId(null);
              setComentarioProyecto(projSugMatch[1].trim());
              setMostrarSugerenciaProyecto(true);
              setTipoGasto('PROYECTO');
              setIsHistoricoSinProyecto(false);
            } else if (rawData.tipo_gasto === 'OPERATIVO' || data.tipo_servicio_proyecto === 'Operativo') {
              setSelectedProyectoId(null);
              setComentarioProyecto('');
              setMostrarSugerenciaProyecto(false);
              setTipoGasto('OPERATIVO');
              setIsHistoricoSinProyecto(false);
            } else if (rawData.tipo_gasto === 'PROYECTO') {
              setSelectedProyectoId(null);
              setComentarioProyecto(data.detalle_servicio_proyecto || '');
              setMostrarSugerenciaProyecto(Boolean(data.detalle_servicio_proyecto));
              setTipoGasto('PROYECTO');
              setIsHistoricoSinProyecto(false);
            } else {
              // Gasto histórico sin proyecto_id
              setSelectedProyectoId(null);
              setComentarioProyecto('');
              setMostrarSugerenciaProyecto(false);
              setTipoGasto('PROYECTO');
              setIsHistoricoSinProyecto(true);
            }

            if (rawData.subtipo_traslado) {
              setSubtipoTraslado(rawData.subtipo_traslado as SubtipoTraslado);
            }
            if (rawData.fecha_hospedaje_inicio) {
              setFechaHospedajeInicio(String(rawData.fecha_hospedaje_inicio).split('T')[0]);
            }
            if (rawData.fecha_hospedaje_fin) {
              setFechaHospedajeFin(String(rawData.fecha_hospedaje_fin).split('T')[0]);
            }

            // Inferir bloque de proyecto según categoría/subcategoría
            const normCat = (resolvedCat || '').toLowerCase();
            const normSub = (resolvedSub || '').toLowerCase();
            if (normSub.includes('alimento') || normSub.includes('comida') || normCat.includes('alimento')) {
              setBloqueProyecto('ALIMENTOS');
            } else if (normSub.includes('hospedaje') || normSub.includes('hotel') || rawData.fecha_hospedaje_inicio) {
              setBloqueProyecto('HOSPEDAJE');
            } else if (normCat.includes('material') || normSub.includes('material') || normSub.includes('ferreteria')) {
              setBloqueProyecto('MATERIAL');
            } else if (normCat.includes('equipo') || normSub.includes('equipo')) {
              setBloqueProyecto('EQUIPO');
            } else if (isCombustibleExpense(resolvedCat, resolvedSub)) {
              setBloqueProyecto('TRANSPORTE');
              setSubtipoTransporte('COMBUSTIBLE');
            } else if (
              rawData.subtipo_traslado ||
              normSub.includes('traslado') ||
              normSub.includes('vuelo') ||
              normSub.includes('caseta') ||
              normSub.includes('uber') ||
              normSub.includes('taxi')
            ) {
              setBloqueProyecto('TRANSPORTE');
              setSubtipoTransporte('TRASLADOS');
            }

            if (data.motivo_sin_factura?.startsWith('PENDIENTE_ENTREGA')) {
              setFacturado(false);
              setFacturaStatus('PENDIENTE');
              const partes = data.motivo_sin_factura.split('PENDIENTE_ENTREGA:');
              if (partes.length > 1 && partes[1].trim() !== '') {
                setComentarioPendiente(partes[1].trim());
              }
            } else if (data.facturado === false) {
              setFacturado(false);
              setFacturaStatus('NO');
              setMotivoSinFactura(data.motivo_sin_factura || '');
            } else if (data.facturado === true) {
              setFacturado(true);
              setFacturaStatus('SI');
            } else {
              setFacturado(null);
            }

            setMotivoSinFactura(data.motivo_sin_factura || '');
            if (data.factura_url) {
              const urls = data.factura_url.split(',').filter(Boolean);
              if (urls.length > 0) {
                const firstUrl = urls[0].trim();
                const rawName = firstUrl.split('/').pop() || 'factura.pdf';
                const cleanName = rawName.includes('?') ? rawName.split('?')[0] : rawName;
                setFacturaPdf({
                  uri: firstUrl,
                  name: cleanName,
                  base64: '',
                  isRemote: true,
                });
              }
            }

            const hasShared = data.justificacion && (
              data.justificacion.includes('[Consumo compartido con:') ||
              data.justificacion.includes('[Propina incluida')
            );
            const isMeal = (resolvedCat && (
              resolvedCat.toLowerCase().includes('alimento') ||
              resolvedCat.toLowerCase().includes('comida') ||
              resolvedCat.toLowerCase().includes('consumo')
            )) || hasShared;
            setEsComida(!!isMeal);

            if (data.justificacion) {
              const sharedMatch = data.justificacion.match(/\[Consumo compartido con:\s*([^\]\(\n]+)/);
              if (sharedMatch) {
                const names = sharedMatch[1].split(',').map((n: string) => n.trim().toLowerCase());
                const usersList = catalogs?.usuarios || [];
                const matchedUsers = usersList.filter((u: any) => names.some((n: string) => u.nombre?.toLowerCase().includes(n) || n.includes(u.nombre?.toLowerCase())));
                if (matchedUsers.length > 0) {
                  setSelectedEmpleados(matchedUsers);
                }
              }
              const propinaMatch = data.justificacion.match(/\[Propina incluida en ticket:\s*(Sí|Si|No)\]/i);
              if (propinaMatch) {
                setIncluyePropina(propinaMatch[1].toLowerCase().startsWith('s'));
              } else if (isMeal) {
                setIncluyePropina(null);
              }
              const montoPropinaMatch = data.justificacion.match(/\[Monto de propina dejado aparte:\s*\$?([0-9.]+)/i);
              if (montoPropinaMatch) {
                setMontoPropina(montoPropinaMatch[1]);
              }
            } else if (isMeal) {
              setIncluyePropina(null);
            }
          }
        } catch (err: any) {
          console.error('Error al cargar gasto:', err);
          showAlert('Error', 'No se pudo cargar el gasto a editar.');
          router.replace(redirectRoute as any);
        } finally {
          setIsLoadingGasto(false);
        }
      } else {
        setIsLoadingGasto(false);
      }
    };
    init();
  }, [router, gastoId, mode]);

  const requestCameraPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;
    const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
    if (cameraStatus.status !== 'granted') {
      showAlert(
        'Permiso de cámara requerido',
        'Necesitamos permiso de la cámara para capturar la evidencia del ticket.'
      );
      return false;
    }
    return true;
  };

  const requestLibraryPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;
    const libraryStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (libraryStatus.status !== 'granted') {
      showAlert(
        'Permiso de galería requerido',
        'Necesitamos permiso de la galería para seleccionar la imagen del ticket.'
      );
      return false;
    }
    return true;
  };

  const handleCapturePhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: Platform.OS !== 'web',
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const optimized = await optimizeImage(asset.uri);
        const newFile: TicketFileItem = {
          uri: optimized.uri,
          base64: optimized.base64 || asset.base64 || '',
          ext: 'jpg',
          isRemote: false,
        };
        setTicketFiles(prev => {
          const updated = [...prev, newFile];
          setActiveTicketIndex(updated.length - 1);
          return updated;
        });
        setImageUri(newFile.uri);
        setImageBase64(newFile.base64 || null);
        setImageExt('jpg');
        setAlertaPolitica(null);
      }
    } catch (err) {
      console.error('Camera capture error:', err);
      if (Platform.OS === 'web') {
        await handleSelectGallery();
      } else {
        showAlert('Error', 'No se pudo abrir la cámara.');
      }
    }
  };

  const handleSelectGallery = async () => {
    const hasPermission = await requestLibraryPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newFiles: TicketFileItem[] = [];
        for (const asset of result.assets) {
          try {
            const optimized = await optimizeImage(asset.uri);
            newFiles.push({
              uri: optimized.uri,
              base64: optimized.base64 || asset.base64 || '',
              ext: 'jpg',
              isRemote: false,
            });
          } catch (e) {
            newFiles.push({
              uri: asset.uri,
              base64: asset.base64 || '',
              ext: 'jpg',
              isRemote: false,
            });
          }
        }
        if (newFiles.length > 0) {
          setTicketFiles(prev => {
            const updated = [...prev, ...newFiles];
            setActiveTicketIndex(updated.length - 1);
            return updated;
          });
          const lastFile = newFiles[newFiles.length - 1];
          setImageUri(lastFile.uri);
          setImageBase64(lastFile.base64 || null);
          setImageExt(lastFile.ext);
          setAlertaPolitica(null);
        }
      }
    } catch (err) {
      console.error('Gallery select error:', err);
      showAlert('Error', 'No se pudo abrir la galería.');
    }
  };

  const handleRemoveTicket = (indexToRemove: number) => {
    setTicketFiles(prev => {
      const updated = prev.filter((_, idx) => idx !== indexToRemove);
      if (updated.length === 0) {
        setImageUri(null);
        setImageBase64(null);
        setActiveTicketIndex(0);
      } else {
        const nextIdx = Math.min(activeTicketIndex, updated.length - 1);
        setActiveTicketIndex(nextIdx);
        setImageUri(updated[nextIdx].uri);
        setImageBase64(updated[nextIdx].base64 || null);
        setImageExt(updated[nextIdx].ext);
      }
      return updated;
    });
  };

  const handleClearAllTickets = () => {
    setTicketFiles([]);
    setImageUri(null);
    setImageBase64(null);
    setActiveTicketIndex(0);
    setAlertaPolitica(null);
    setIncluyePropina(null);
    setMontoPropina('');
  };

  const handleSelectDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: mode === 'edit' ? ['application/pdf', 'image/*'] : ['image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const ext = file.name ? file.name.split('.').pop()?.toLowerCase() || 'jpg' : 'jpg';

        let base64Str = '';
        if (Platform.OS === 'web') {
          const res = await fetch(file.uri);
          const blob = await res.blob();
          base64Str = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const b64 = reader.result as string;
              resolve(b64.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } else {
          base64Str = await new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.onload = () => {
              try {
                const b64 = require('buffer').Buffer.from(xhr.response).toString('base64');
                resolve(b64);
              } catch (e) {
                reject(e);
              }
            };
            xhr.onerror = reject;
            xhr.responseType = 'arraybuffer';
            xhr.open('GET', file.uri, true);
            xhr.send(null);
          });
        }

        const newDocFile: TicketFileItem = {
          uri: file.uri,
          base64: base64Str,
          ext: ext === 'pdf' ? 'pdf' : 'jpg',
          isRemote: false,
        };
        setTicketFiles(prev => {
          const updated = [...prev, newDocFile];
          setActiveTicketIndex(updated.length - 1);
          return updated;
        });
        setImageUri(file.uri);
        setImageExt(newDocFile.ext);
        setImageBase64(base64Str);
        setAlertaPolitica(null);
      }
    } catch (err) {
      console.error('Document select error:', err);
      showAlert('Error', 'No se pudo seleccionar el archivo.');
    }
  };

  const handleSelectFacturaPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const isPdf = (file.name ? file.name.toLowerCase().endsWith('.pdf') : false) || file.mimeType === 'application/pdf';
        if (!isPdf) {
          showAlert('Formato inválido', 'Por favor selecciona únicamente un archivo en formato PDF (.pdf).');
          return;
        }

        let base64Str = '';
        if (Platform.OS === 'web') {
          const res = await fetch(file.uri);
          const blob = await res.blob();
          base64Str = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1] || '');
              } else {
                resolve('');
              }
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } else {
          base64Str = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
        }

        setFacturaPdf({
          uri: file.uri,
          name: file.name || 'factura.pdf',
          base64: base64Str,
          isRemote: false,
        });
      }
    } catch (err) {
      console.error('Invoice document select error:', err);
      showAlert('Error', 'No se pudo abrir el selector de documentos.');
    }
  };

  const handlePreviewPdf = async () => {
    if (!facturaPdf?.uri) return;
    try {
      if (Platform.OS === 'web') {
        window.open(facturaPdf.uri, '_blank');
      } else {
        await Linking.openURL(facturaPdf.uri);
      }
    } catch {
      showAlert('Aviso', 'No se pudo abrir la previsualización del PDF en este dispositivo.');
    }
  };

  const handleRemoveFacturaPdf = () => {
    setFacturaPdf(null);
  };

  const activeCategoriaId = categorias.find((c) => c.nombre === selectedCategoria)?.id;
  const filteredSubcategorias = subcategorias.filter(
    (s) => s.categoria_id === activeCategoriaId
  );

  const handleAddNewCliente = async (nombre: string) => {
    try {
      const newCli = await CatalogService.crearCliente({ nombre: nombre.trim() });
      setClientes(prev => [...prev, newCli].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setSelectedCliente(newCli.nombre);
      setSucursal('');
      setComentarioSucursal('');
      setSelectedProyectoId(null);
      setComentarioProyecto('');
      setMostrarSugerenciaProyecto(false);
      setHospedajeRecienteAviso(null);
      setClienteSearch('');
      setShowCliDropdown(false);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo agregar el cliente.');
    }
  };

  const handleAddNewSucursal = async (nombre: string) => {
    if (!nombre.trim()) return;
    const currentCliente = clientes.find(c => c.nombre?.trim().toLowerCase() === selectedCliente?.trim().toLowerCase() || c.id === selectedCliente);
    if (!currentCliente) {
      showAlert('Validación', 'Primero debes seleccionar un cliente para vincular la sucursal.');
      return;
    }

    try {
      const newSuc = await CatalogService.crearSucursal({
        cliente_id: currentCliente.id,
        nombre: nombre.trim().toUpperCase(),
      });
      setSucursalesCliente(prev => [...prev, newSuc].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setSucursal(newSuc.nombre);
      setComentarioSucursal('');
      setSelectedProyectoId(null);
      setComentarioProyecto('');
      setMostrarSugerenciaProyecto(false);
      setHospedajeRecienteAviso(null);
      setSucursalSearch('');
      setShowSucursalDropdown(false);
      showAlert('Éxito', `Sucursal "${newSuc.nombre}" agregada y vinculada a ${currentCliente.nombre}.`);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo agregar la sucursal.');
    }
  };

  const handleAddNewClienteForSplit = async (nombre: string) => {
    try {
      const newCli = await CatalogService.crearCliente({ nombre: nombre.trim() });
      setClientes(prev => [...prev, newCli].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setNewSplitClienteId(newCli.nombre);
      setNewSplitSucursalNombre('');
      setSplitClienteSearch('');
      setShowNewSplitCliDropdown(false);
      showAlert('Éxito', `Cliente "${nombre.trim()}" agregado correctamente.`);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo agregar el cliente.');
    }
  };

  const handleAddNewSucursalForSplit = async (nombre: string) => {
    if (!nombre.trim()) return;
    const currentCliente = clientes.find(c => c.nombre?.trim().toLowerCase() === newSplitClienteId?.trim().toLowerCase());
    if (!currentCliente) {
      showAlert('Validación', 'Primero debes seleccionar un cliente para vincular la sucursal.');
      return;
    }

    try {
      const newSuc = await CatalogService.crearSucursal({
        cliente_id: currentCliente.id,
        nombre: nombre.trim().toUpperCase(),
      });
      setSucursalesCliente(prev => [...prev, newSuc].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setNewSplitSucursalNombre(newSuc.nombre);
      setSplitSucursalSearch('');
      setShowNewSplitSucDropdown(false);
      showAlert('Éxito', `Sucursal "${newSuc.nombre}" agregada y vinculada a ${currentCliente.nombre}.`);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo agregar la sucursal.');
    }
  };

  const handleCrearNuevoProveedor = async () => {
    if (!nuevoProvNombre.trim()) {
      showAlert('Validación', 'El nombre o razón social del proveedor es obligatorio.');
      return;
    }

    const cleanRfc = nuevoProvRfc.trim().toUpperCase();
    if (cleanRfc && cleanRfc.length !== 12 && cleanRfc.length !== 13) {
      showAlert('Validación', 'El RFC debe tener exactamente 12 o 13 caracteres.');
      return;
    }

    setIsSavingProv(true);
    try {
      const created = await CatalogService.crearProveedor({
        nombre: nuevoProvNombre.trim(),
        rfc: cleanRfc || null,
      });

      setProveedores(prev => [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setProveedor(created.nombre);
      setComentarioProveedor('');
      setProveedorSearch('');
      setNuevoProvNombre('');
      setNuevoProvRfc('');
      setModalNuevoProveedorVisible(false);
      showAlert('Éxito', `Proveedor "${created.nombre}" agregado y seleccionado.`);
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo registrar el proveedor.');
    } finally {
      setIsSavingProv(false);
    }
  };

  const isLocalDeviceUri = (uri?: string | null): boolean => {
    if (!uri) return false;
    const lower = uri.trim().toLowerCase();
    return (
      lower.startsWith('file://') ||
      lower.startsWith('content://') ||
      lower.startsWith('/data/') ||
      lower.startsWith('ph://') ||
      lower.startsWith('assets-library://')
    );
  };

  const uploadTicketFilesForGasto = async (userId: string): Promise<string | null> => {
    const publicTicketUrls: string[] = [];

    const uploadSingleBase64 = async (b64: string, ext: string, indexLabel: string): Promise<string> => {
      const contentType = ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
      const fileName = `${userId}/${Date.now()}_${indexLabel}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('tickets')
        .upload(fileName, b64, { contentType, upsert: true });

      if (uploadError) {
        const msg = typeof uploadError === 'string' ? uploadError : (uploadError as any)?.message;
        throw new Error(msg || 'No se pudo subir la fotografía del ticket al servidor.');
      }

      const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
      if (!urlData?.publicUrl || isLocalDeviceUri(urlData.publicUrl)) {
        throw new Error('No se pudo obtener la URL pública del ticket subido.');
      }
      return urlData.publicUrl;
    };

    const resolveLocalBase64 = async (uri: string, existingB64?: string): Promise<string> => {
      if (existingB64 && existingB64.trim().length > 0) return existingB64;
      if (Platform.OS !== 'web' && uri && (uri.startsWith('file://') || uri.startsWith('content://'))) {
        try {
          const readB64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          if (readB64 && readB64.trim().length > 0) return readB64;
        } catch (readErr) {
          console.warn('Fallback readAsStringAsync failed:', readErr);
        }
      }
      return '';
    };

    if (ticketFiles.length > 0) {
      for (let i = 0; i < ticketFiles.length; i++) {
        const tf = ticketFiles[i];
        if (tf.uri && (tf.uri.startsWith('http://') || tf.uri.startsWith('https://'))) {
          publicTicketUrls.push(tf.uri);
          continue;
        }
        const b64 = await resolveLocalBase64(tf.uri, tf.base64);
        if (!b64) {
          throw new Error('No se pudo procesar la fotografía local del ticket. Vuelve a seleccionarla e intenta de nuevo.');
        }
        const uploadedUrl = await uploadSingleBase64(b64, tf.ext || 'jpg', `ticket_${i}`);
        publicTicketUrls.push(uploadedUrl);
      }
    } else if (imageUri) {
      if (imageUri.startsWith('http://') || imageUri.startsWith('https://')) {
        publicTicketUrls.push(imageUri);
      } else {
        const b64 = await resolveLocalBase64(imageUri, imageBase64 || undefined);
        if (!b64) {
          throw new Error('No se pudo procesar la fotografía local del ticket. Vuelve a seleccionarla e intenta de nuevo.');
        }
        const uploadedUrl = await uploadSingleBase64(b64, imageExt || 'jpg', 'ticket_0');
        publicTicketUrls.push(uploadedUrl);
      }
    }

    return publicTicketUrls.join(',') || null;
  };

  const handleSaveGasto = async () => {
    if (!currentUser) return;
    if (isSubmittingRef.current || isSubmitting) return;

    if (mode === 'create') {
      // 1. Validar Foto de comprobante
      if (ticketFiles.length === 0 && !imageUri) {
        showAlert('Validación', 'Por favor toma o selecciona una foto del comprobante/ticket.');
        setCurrentStep(1);
        return;
      }

      // 2. Validar Monto
      if (!monto || isNaN(Number(monto)) || Number(monto) <= 0) {
        showAlert('Validación', 'Por favor ingresa un monto válido mayor a 0.');
        setCurrentStep(2);
        return;
      }

      // 3. Validar Fecha
      const fechaRegex = /^\d{2}\/\d{2}\/\d{4}$/;
      if (!fechaRegex.test(fechaComprobante)) {
        showAlert('Validación', 'Por favor ingresa la fecha en formato DD/MM/AAAA (ej. 09/06/2026).');
        setCurrentStep(2);
        return;
      }

      // 4. Validar Proveedor a agregar si no se seleccionó proveedor
      if (!proveedor.trim() && !comentarioProveedor.trim()) {
        showAlert(
          'Validación',
          role === 'admin'
            ? 'Por favor indica en el campo "Proveedor a agregar" el nombre del proveedor para registrarlo y asociarlo.'
            : 'Por favor indica en el campo "Proveedor a agregar" el nombre del proveedor para que el administrador pueda registrarlo.'
        );
        setCurrentStep(2);
        return;
      }

      // 5. Validar Método de Pago y Tarjeta
      if (!metodoPago) {
        showAlert('Validación', 'Por favor selecciona el método de pago.');
        setCurrentStep(2);
        return;
      }

      if (metodoPago !== 'efectivo' && metodoPago !== 'transferencia' && metodoPago !== 'monedero_electronico' && (!tipoTarjeta || !tipoTarjeta.trim())) {
        showAlert('Validación', 'Por favor especifica la tarjeta o tipo de pago.');
        setCurrentStep(2);
        return;
      }

      // 7. Validar Factura / Motivo Sin Factura
      if (facturado === null) {
        showAlert('Validación', 'Por favor especifica si el gasto está facturado.');
        setCurrentStep(2);
        return;
      }

      if (facturado === false && facturaStatus === 'PENDIENTE' && !comentarioPendiente.trim()) {
        showAlert('Validación', 'Por favor explica por qué la factura está pendiente.');
        setCurrentStep(2);
        return;
      }

      if (facturado === false && facturaStatus === 'NO' && (!motivoSinFactura || !motivoSinFactura.trim())) {
        showAlert('Validación', 'Por favor especifica el motivo por el cual no se cuenta con factura.');
        setCurrentStep(2);
        return;
      }

      // 8. Validar Destino (Cliente -> Sucursal -> Proyecto) y Categoría
      if (tipoGasto === 'PROYECTO' && !isSplit) {
        if (!selectedCliente || !selectedCliente.trim()) {
          showAlert('Validación', 'Por favor selecciona primero el Cliente al que va dirigido el gasto.');
          return;
        }
        if (role === 'admin') {
          if (!sucursal || !sucursal.trim()) {
            showAlert('Validación', 'Por favor selecciona la Sucursal del cliente.');
            return;
          }
        } else {
          if (!sucursal.trim() && !comentarioSucursal.trim()) {
            showAlert('Validación', 'Por favor selecciona la Sucursal del cliente o indica una en "Sucursal a agregar".');
            return;
          }
        }
        if (!selectedProyectoId && !comentarioProyecto.trim()) {
          showAlert(
            'Validación',
            role === 'admin'
              ? 'Por favor selecciona el Proyecto activo o escribe el nombre en "Proyecto a agregar" para registrarlo.'
              : 'Por favor selecciona un Proyecto disponible o indica el nombre en "Proyecto a agregar" para sugerirlo a Administración.'
          );
          return;
        }
      }

      if (tipoGasto === 'PROYECTO' && !bloqueProyecto && (!selectedCategoria || !selectedSubcategoria)) {
        showAlert('Validación', 'Por favor selecciona el tipo de gasto del proyecto (Alimentos, Hospedaje, Material, Equipo o Transporte).');
        return;
      }

      if (!selectedCategoria) {
        showAlert('Validación', 'Por favor selecciona una categoría.');
        setCurrentStep(3);
        return;
      }

      if (!selectedSubcategoria) {
        showAlert('Validación', 'Por favor selecciona una subcategoría.');
        setCurrentStep(3);
        return;
      }

      if (tipoGasto === 'PROYECTO' && bloqueProyecto === 'HOSPEDAJE') {
        if (!fechaHospedajeInicio || !fechaHospedajeFin || hospedajePreview.error) {
          showAlert('Validación de Hospedaje', hospedajePreview.error || 'Por favor selecciona las fechas de entrada y salida del hotel.');
          return;
        }
      }

      if (tipoGasto === 'PROYECTO' && bloqueProyecto === 'TRANSPORTE') {
        if (!subtipoTransporte) {
          showAlert('Validación', 'Por favor indica si el gasto de transporte es Combustible o Traslados.');
          return;
        }
        if (subtipoTransporte === 'TRASLADOS' && !subtipoTraslado) {
          showAlert('Validación', 'Por favor selecciona el subtipo de traslado (Casetas, Estacionamientos, Multas, Uber, Vuelos u Otro).');
          return;
        }
      }

      if (esComida && incluyePropina === null) {
        showAlert('Validación', 'Por favor especifica si el ticket de alimentos incluye propina.');
        return;
      }

      // 10. Validar Vehículos / Gasolina / Combustible
      const esGasolina =
        (tipoGasto === 'PROYECTO' && bloqueProyecto === 'TRANSPORTE' && subtipoTransporte === 'COMBUSTIBLE') ||
        isCombustibleExpense(selectedCategoria, selectedSubcategoria);
      if (esGasolina) {
        if (!selectedVehiculoId) {
          showAlert('Validación', 'Por favor selecciona el vehículo.');
          setCurrentStep(3);
          return;
        }
        if (!kilometrajeActual || isNaN(Number(kilometrajeActual)) || Number(kilometrajeActual) <= 0) {
          showAlert('Validación', 'Por favor ingresa un kilometraje (odómetro) válido.');
          setCurrentStep(3);
          return;
        }
        if (!litrosGasolina || isNaN(Number(litrosGasolina)) || Number(litrosGasolina) <= 0) {
          showAlert('Validación', 'Por favor ingresa los litros cargados de forma válida.');
          setCurrentStep(3);
          return;
        }
      }

      const effectiveTipoServicio =
        tipoServicioProyecto || (tipoGasto === 'OPERATIVO' ? 'Operativo' : 'Proyecto');
      const effectiveDetalleProyecto =
        (tipoGasto === 'PROYECTO' && !selectedProyectoId && comentarioProyecto.trim()
          ? comentarioProyecto.trim()
          : '') ||
        detalleServicioProyecto.trim() ||
        selectedProyectoObj?.nombre ||
        (tipoGasto === 'OPERATIVO' ? 'Gasto Operativo / General' : '');

      // 12. Validar Comentarios / Justificación (con respaldo automático en Alimentos/Hospedaje/Combustible si se dejó vacío)
      const defaultJustificacionByBloque =
        bloqueProyecto === 'ALIMENTOS'
          ? 'Consumo de alimentos'
          : bloqueProyecto === 'HOSPEDAJE'
          ? `Hospedaje del ${fechaHospedajeInicio} al ${fechaHospedajeFin} (${hospedajePreview.diasCount} noche(s))`
          : esGasolina
          ? `Carga de combustible (${litrosGasolina} L)`
          : '';
      const effectiveJustificacion = justificacion.trim() || defaultJustificacionByBloque;

      if (!effectiveJustificacion) {
        showAlert('Validación', 'Por favor escribe la descripción o justificación del gasto.');
        setCurrentStep(3);
        return;
      }

      if (!isSplit && tipoGasto === 'PROYECTO' && !selectedProyectoId) {
        if (!selectedCliente || !selectedCliente.trim()) {
          showAlert('Validación', 'Por favor selecciona el proyecto o cliente relacionado al gasto.');
          setCurrentStep(3);
          return;
        }
        if (role === 'admin') {
          if (!sucursal || !sucursal.trim()) {
            showAlert('Validación', 'Por favor selecciona la sucursal del cliente.');
            setCurrentStep(3);
            return;
          }
        } else {
          if (!sucursal.trim() && !comentarioSucursal.trim()) {
            showAlert('Validación', 'Por favor selecciona la sucursal del cliente o indica una en "Sucursal a agregar".');
            setCurrentStep(3);
            return;
          }
        }
      }

      const totalGasto = Number(monto) + (esComida && incluyePropina === false ? Number(montoPropina || 0) : 0);

      const isSplitOperativo = isSplit && tipoGasto === 'OPERATIVO';
      if (isSplitOperativo) {
        if (splits.length === 0) {
          showAlert('Validación', 'Por favor agrega al menos una división o desactiva la opción de dividir gasto.');
          setCurrentStep(3);
          return;
        }
        let sum = 0;
        for (const s of splits) {
          if (!s.clienteId || !s.clienteId.trim()) {
            showAlert('Validación', 'Por favor selecciona un cliente para todas las divisiones del gasto.');
            setCurrentStep(3);
            return;
          }
          if (role === 'admin') {
            if (!s.sucursalNombre || !s.sucursalNombre.trim()) {
              showAlert('Validación', `Por favor selecciona la sucursal para la división del cliente "${s.clienteId}".`);
              setCurrentStep(3);
              return;
            }
          } else {
            if (!s.sucursalNombre?.trim() && !s.comentarioSucursal?.trim()) {
              showAlert('Validación', `Por favor selecciona la sucursal para la división del cliente "${s.clienteId}" o indica una en "Sucursal a agregar".`);
              setCurrentStep(3);
              return;
            }
          }
          if (!s.monto || isNaN(Number(s.monto)) || Number(s.monto) <= 0) {
            showAlert('Validación', 'Por favor ingresa un monto válido mayor a 0 para todas las divisiones.');
            setCurrentStep(3);
            return;
          }
          sum += Number(s.monto);
        }
        if (Math.abs(sum - totalGasto) > 0.05) {
          showAlert(
            'Validación de Monto',
            `La suma de las divisiones ($${sum.toFixed(2)}) debe coincidir con el total del ticket ($${totalGasto.toFixed(2)}).\n\n${
              sum < totalGasto
                ? `Falta por asignar: $${(totalGasto - sum).toFixed(2)}`
                : `Exceso de asignación: $${(sum - totalGasto).toFixed(2)}`
            }`
          );
          setCurrentStep(3);
          return;
        }
      }

      isSubmittingRef.current = true;
      setIsSubmitting(true);

      const dbFecha = formatFriendlyToDb(fechaComprobante);

      let finalJustificacion = effectiveJustificacion;
      if (currentUser?.rol === 'DEV') {
        finalJustificacion = `[PRUEBA] ${finalJustificacion}`;
      }
      if (tipoGasto === 'PROYECTO' && !selectedProyectoId && comentarioProyecto.trim()) {
        finalJustificacion = `[Proyecto a agregar: ${comentarioProyecto.trim()}]\n\n${finalJustificacion}`;
      }
      if (!proveedor.trim() && comentarioProveedor.trim()) {
        finalJustificacion = `[Proveedor a agregar: ${comentarioProveedor.trim()}]\n\n${finalJustificacion}`;
      }
      if (role === 'empleado' && !isSplit && !sucursal.trim() && comentarioSucursal.trim()) {
        finalJustificacion = `[Sucursal a agregar: ${comentarioSucursal.trim()}]\n\n${finalJustificacion}`;
      }
      if (esComida && selectedEmpleados.length > 0) {
        const nombresShared = selectedEmpleados.map(e => e.nombre).join(', ');
        finalJustificacion = `${finalJustificacion}\n\n[Consumo compartido con: ${nombresShared} (Total: ${1 + selectedEmpleados.length} personas)]`;
      }
      if (esComida && incluyePropina !== null) {
        finalJustificacion = `${finalJustificacion}\n\n[Propina incluida en ticket: ${incluyePropina ? 'Sí' : 'No'}]`;
        const numMontoPropina = Number(montoPropina || 0);
        if (incluyePropina === false && numMontoPropina > 0) {
          finalJustificacion = `${finalJustificacion}\n\n[Monto de propina dejado aparte: $${numMontoPropina} MXN]`;
        }
      }
      const combinedAlert = [alertaPolitica, alertaLocal].filter(Boolean).join(' | ');
      if (combinedAlert) {
        finalJustificacion = `[ALERTA IA: ${combinedAlert}]\n\n${finalJustificacion}`;
      }

      const activeCatObj = categorias.find(c => c.nombre && c.nombre.trim().toLowerCase() === selectedCategoria.trim().toLowerCase());
      const activeSubObj = subcategorias.find(s => s.nombre && s.nombre.trim().toLowerCase() === selectedSubcategoria.trim().toLowerCase() && (!activeCatObj || s.categoria_id === activeCatObj.id));
      const activeProvObj = proveedores.find(p => p.nombre && p.nombre.trim().toLowerCase() === proveedor.trim().toLowerCase());
      const activeCliObj = clientes.find(c => c.nombre && c.nombre.trim().toLowerCase() === selectedCliente.trim().toLowerCase());
      const activeSucObj = sucursalesCliente.find(s => s.nombre && s.nombre.trim().toLowerCase() === sucursal.trim().toLowerCase() && (!activeCliObj || s.cliente_id === activeCliObj.id));

      const resolvedClienteId = selectedProyectoObj?.cliente_id || activeCliObj?.id || null;
      const resolvedSucursalId = selectedProyectoObj?.sucursal_id || activeSucObj?.id || null;
      const isHospedaje = tipoGasto === 'PROYECTO' && bloqueProyecto === 'HOSPEDAJE';
      const isTraslado = tipoGasto === 'PROYECTO' && bloqueProyecto === 'TRANSPORTE' && subtipoTransporte === 'TRASLADOS';

      const gastoPayload = {
        empleado_id: currentUser.id,
        empleado_nombre: currentUser.nombre,
        monto: totalGasto,
        subcategoria_id: activeSubObj?.id || null,
        metodo_pago: metodoPago,
        justificacion: finalJustificacion,
        fecha_comprobante: dbFecha,
        proveedor_id: activeProvObj?.id || null,
        cliente_id: resolvedClienteId,
        sucursal_id: resolvedSucursalId,
        tipo_tarjeta: (metodoPago === 'efectivo' || metodoPago === 'transferencia' || metodoPago === 'monedero_electronico') ? null : tipoTarjeta,
        ubicacion_registro: 'Móvil',
        facturado: facturado,
        motivo_sin_factura: facturado === true
          ? null
          : (facturaStatus === 'PENDIENTE')
              ? (comentarioPendiente.trim() ? `PENDIENTE_ENTREGA: ${comentarioPendiente.trim()}` : 'PENDIENTE_ENTREGA')
              : (motivoSinFactura.trim() || null),
        tipo_servicio_proyecto: effectiveTipoServicio,
        detalle_servicio_proyecto: effectiveDetalleProyecto,
        proyecto_id: tipoGasto === 'PROYECTO' ? (selectedProyectoId || null) : null,
        tipo_gasto: tipoGasto,
        subtipo_traslado: isTraslado ? (subtipoTraslado || 'OTRO') : null,
        fecha_hospedaje_inicio: isHospedaje ? (fechaHospedajeInicio || null) : null,
        fecha_hospedaje_fin: isHospedaje ? (fechaHospedajeFin || null) : null,
      };

      isSubmittingRef.current = true;
      setIsSubmitting(true);

      try {
        const netState = await NetInfo.fetch();

        if (netState.isConnected) {
          const publicUrl = await uploadTicketFilesForGasto(currentUser.id);

          let publicInvoiceUrl = '';
          if (facturado && facturaPdf?.base64) {
            try {
              const fileName = `${currentUser.id}/factura_${Date.now()}.pdf`;
              const { error: uploadError } = await supabase.storage
                .from('tickets')
                .upload(fileName, facturaPdf.base64, { contentType: 'application/pdf', upsert: true });

              if (!uploadError) {
                const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
                if (urlData?.publicUrl) {
                  publicInvoiceUrl = urlData.publicUrl;
                }
              } else {
                console.warn('Invoice storage upload skipped or failed:', uploadError);
              }
            } catch (invErr) {
              console.warn('Invoice storage upload exception (continuing):', invErr);
            }
          }

          const splitLabelPrefix = 'Gasto operativo dividido';
          const payloadsToInsert = isSplitOperativo ? splits.map((s, index) => {
            const splitCliObj = clientes.find(c => c.nombre && c.nombre.trim().toLowerCase() === (s.clienteId || '').trim().toLowerCase());
            const splitSucObj = sucursalesCliente.find(suc => suc.nombre && suc.nombre.trim().toLowerCase() === (s.sucursalNombre || '').trim().toLowerCase() && (!splitCliObj || suc.cliente_id === splitCliObj.id));
            const justifSplit = role === 'empleado'
              ? `[${splitLabelPrefix} del ticket total de $${totalGasto.toFixed(2)}] - División ${index + 1}/${splits.length} (Cliente: ${s.clienteId} | Sucursal: ${s.sucursalNombre || s.comentarioSucursal})${s.comentarioSucursal ? `\n[Sucursal a agregar: ${s.comentarioSucursal}]` : ''}\n\n${gastoPayload.justificacion}`
              : `[${splitLabelPrefix} del ticket total de $${totalGasto.toFixed(2)}] - División ${index + 1}/${splits.length} (Cliente: ${s.clienteId} | Sucursal: ${s.sucursalNombre})\n\n${gastoPayload.justificacion}`;
            return {
              ...gastoPayload,
              monto: Number(s.monto),
              cliente_id: splitCliObj?.id || null,
              sucursal_id: splitSucObj?.id || null,
              justificacion: justifSplit,
              foto_url: publicUrl || null,
              factura_url: publicInvoiceUrl || null,
              status: 'PENDING',
            };
          }) : [
            {
              ...gastoPayload,
              foto_url: publicUrl || null,
              factura_url: publicInvoiceUrl || null,
              status: 'PENDING',
            }
          ];

          const esGasolina =
            (tipoGasto === 'PROYECTO' && bloqueProyecto === 'TRANSPORTE' && subtipoTransporte === 'COMBUSTIBLE') ||
            isCombustibleExpense(selectedCategoria, selectedSubcategoria);
          let gasolinaPayload = null;

          if (esGasolina) {
            gasolinaPayload = {
              vehiculo_id: selectedVehiculoId,
              empleado_id: currentUser.id,
              fecha: dbFecha,
              kilometraje_actual: Number(kilometrajeActual),
              litros: Number(litrosGasolina),
              costo_total: Number(totalGasto),
              ticket_foto_url: publicUrl || null,
              ...(role === 'empleado' ? { observaciones: `Registro automático desde formulario de gastos. Proveedor: ${proveedor || 'N/A'}` } : {}),
            };
          }

          await gastosApi.createGasto({
            payloadsToInsert,
            gasolinaPayload,
            ...(role === 'empleado' ? {
              createNotifications: true,
              employeeName: currentUser.nombre,
              totalGasto: totalGasto,
              categoriaNombre: selectedCategoria,
            } : {}),
          });

          if (esGasolina && role === 'admin') {
            const vehiculoObj = vehiculos.find((v) => v.id === selectedVehiculoId);
            if (vehiculoObj?.placas) {
              await VehiculoService.syncVehiculoKilometraje(vehiculoObj.placas, Number(kilometrajeActual));
            }
          }

          showAlert('Éxito', 'Gasto registrado correctamente en el servidor.');
        } else {
          // Fuera de línea: Guardar localmente
          const ticketPhotosToSync = ticketFiles.length > 0
            ? ticketFiles.filter(f => !!f.base64).map(f => ({ base64: f.base64!, ext: f.ext }))
            : (imageBase64 ? [{ base64: imageBase64, ext: imageExt }] : []);

          const esGasolina =
            (tipoGasto === 'PROYECTO' && bloqueProyecto === 'TRANSPORTE' && subtipoTransporte === 'COMBUSTIBLE') ||
            isCombustibleExpense(selectedCategoria, selectedSubcategoria);
          const isSplitOperativo = isSplit && tipoGasto === 'OPERATIVO';
      if (isSplitOperativo) {
            for (let i = 0; i < splits.length; i++) {
              const s = splits[i];
              const splitCliObj = clientes.find(c => c.nombre && c.nombre.trim().toLowerCase() === (s.clienteId || '').trim().toLowerCase());
              const splitSucObj = sucursalesCliente.find(suc => suc.nombre && suc.nombre.trim().toLowerCase() === (s.sucursalNombre || '').trim().toLowerCase() && (!splitCliObj || suc.cliente_id === splitCliObj.id));
              const justifSplit = role === 'empleado'
                ? `[Gasto dividido del ticket total de $${totalGasto.toFixed(2)}] - División ${i + 1}/${splits.length} (Cliente: ${s.clienteId} | Sucursal: ${s.sucursalNombre || s.comentarioSucursal})${s.comentarioSucursal ? `\n[Sucursal a agregar: ${s.comentarioSucursal}]` : ''}\n\n${gastoPayload.justificacion}`
                : `[Gasto dividido del ticket total de $${totalGasto.toFixed(2)}] - División ${i + 1}/${splits.length} (Cliente: ${s.clienteId} | Sucursal: ${s.sucursalNombre})\n\n${gastoPayload.justificacion}`;
              await SyncService.enqueueGasto({
                ...gastoPayload,
                monto: Number(s.monto),
                cliente: s.clienteId || null,
                cliente_id: splitCliObj?.id || null,
                sucursal: s.sucursalNombre || null,
                sucursal_id: splitSucObj?.id || null,
                justificacion: justifSplit,
                base64Foto: ticketPhotosToSync.length > 0 ? ticketPhotosToSync[0].base64 : (imageBase64 || undefined),
                fotoExt: ticketPhotosToSync.length > 0 ? ticketPhotosToSync[0].ext : imageExt,
                base64Fotos: ticketPhotosToSync.length > 0 ? ticketPhotosToSync : undefined,
                base64Factura: facturaPdf?.base64 || undefined,
                facturaExt: facturaPdf?.base64 ? "pdf" : undefined,
                vehiculo_id: esGasolina ? selectedVehiculoId : undefined,
                kilometraje_actual: esGasolina ? Number(kilometrajeActual) : undefined,
                litros: esGasolina ? Number(litrosGasolina) : undefined,
              });
            }
          } else {
            await SyncService.enqueueGasto({
              ...gastoPayload,
              base64Foto: ticketPhotosToSync.length > 0 ? ticketPhotosToSync[0].base64 : (imageBase64 || undefined),
              fotoExt: ticketPhotosToSync.length > 0 ? ticketPhotosToSync[0].ext : imageExt,
              base64Fotos: ticketPhotosToSync.length > 0 ? ticketPhotosToSync : undefined,
              base64Factura: facturaPdf?.base64 || undefined,
              facturaExt: facturaPdf?.base64 ? "pdf" : undefined,
              vehiculo_id: esGasolina ? selectedVehiculoId : undefined,
              kilometraje_actual: esGasolina ? Number(kilometrajeActual) : undefined,
              litros: esGasolina ? Number(litrosGasolina) : undefined,
            });
          }
          showAlert(
            'Guardado sin conexión',
            'No tienes red. El gasto ha sido encolado en tu dispositivo y se sincronizará automáticamente al recuperar conexión.'
          );
        }

        router.replace(redirectRoute as any);
      } catch (err: any) {
        const errorDetails = err?.message || err?.details || err?.hint || (typeof err === 'object' ? JSON.stringify(err) : String(err));
        console.error('Error al guardar gasto:', errorDetails);
        if (errorDetails.includes('Ya existe un gasto idéntico')) {
          showAlert('Gasto Ya Registrado', errorDetails);
          router.replace(redirectRoute as any);
        } else {
          showAlert('Error al guardar', errorDetails || 'No se pudo guardar el gasto.');
        }
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    } else {
      // MODO EDITAR
      if (!monto || isNaN(Number(monto))) {
        showAlert('Validación', 'Por favor ingresa un monto válido.');
        setCurrentStep(2);
        return;
      }

      const fechaRegex = /^\d{2}\/\d{2}\/\d{4}$/;
      if (!fechaRegex.test(fechaComprobante)) {
        showAlert('Validación', 'Por favor ingresa la fecha en formato DD/MM/AAAA (ej. 09/06/2026).');
        setCurrentStep(2);
        return;
      }

      if (!proveedor.trim() && !comentarioProveedor.trim()) {
        showAlert(
          'Validación',
          role === 'admin'
            ? 'Por favor indica en el campo "Proveedor a agregar" el nombre del proveedor para registrarlo.'
            : 'Por favor indica en el campo "Proveedor a agregar" el nombre del proveedor para que el administrador pueda registrarlo.'
        );
        setCurrentStep(2);
        return;
      }

      if (!selectedCategoria) {
        showAlert('Validación', 'Por favor selecciona una categoría.');
        return;
      }

      if (!selectedSubcategoria) {
        showAlert('Validación', 'Por favor selecciona una subcategoría.');
        return;
      }

      if (tipoGasto === 'PROYECTO' && bloqueProyecto === 'HOSPEDAJE') {
        if (!fechaHospedajeInicio || !fechaHospedajeFin || hospedajePreview.error) {
          showAlert('Validación de Hospedaje', hospedajePreview.error || 'Por favor selecciona las fechas de entrada y salida del hotel.');
          return;
        }
      }

      if (tipoGasto === 'PROYECTO' && !isHistoricoSinProyecto) {
        if (!selectedCliente || !selectedCliente.trim()) {
          showAlert('Validación', 'Por favor selecciona el Cliente relacionado al proyecto.');
          return;
        }
        if (role === 'admin' ? !sucursal.trim() : (!sucursal.trim() && !comentarioSucursal.trim())) {
          showAlert('Validación', 'Por favor selecciona la Sucursal del cliente.');
          return;
        }
        if (!selectedProyectoId && !comentarioProyecto.trim()) {
          showAlert(
            'Validación',
            'Por favor selecciona un proyecto activo, escribe uno en "Proyecto a agregar", o marca el gasto como Operativo.'
          );
          return;
        }
      }

      const esGasolinaEdit =
        (tipoGasto === 'PROYECTO' && bloqueProyecto === 'TRANSPORTE' && subtipoTransporte === 'COMBUSTIBLE') ||
        isCombustibleExpense(selectedCategoria, selectedSubcategoria);
      const defaultJustEdit =
        bloqueProyecto === 'ALIMENTOS'
          ? 'Consumo de alimentos'
          : bloqueProyecto === 'HOSPEDAJE'
          ? `Hospedaje del ${fechaHospedajeInicio} al ${fechaHospedajeFin} (${hospedajePreview.diasCount} noche(s))`
          : esGasolinaEdit
          ? `Carga de combustible`
          : '';
      const effectiveJustEdit = justificacion.trim() || defaultJustEdit;

      if (!effectiveJustEdit) {
        showAlert('Validación', 'Por favor escribe una justificación o descripción del gasto.');
        return;
      }

      if (facturado === null) {
        showAlert('Validación', 'Por favor especifica si el gasto está facturado.');
        setCurrentStep(2);
        return;
      }

      if (facturado === false) {
        if (facturaStatus === 'PENDIENTE' && !comentarioPendiente.trim()) {
          showAlert('Validación', 'Por favor explica por qué la factura está pendiente.');
          if (role === 'admin') setCurrentStep(2);
          return;
        }
        if (facturaStatus === 'NO' && (!motivoSinFactura || !motivoSinFactura.trim())) {
          showAlert('Validación', role === 'admin' ? 'Por favor explica el motivo por el cual no se cuenta con factura.' : 'Por favor explica por qué no hay factura.');
          if (role === 'admin') setCurrentStep(2);
          return;
        }
      }

      setIsSubmitting(false);

      const dbFecha = formatFriendlyToDb(fechaComprobante);

      const extraPropina = (esComida && incluyePropina === false && montoPropina && !isNaN(Number(montoPropina)))
        ? Number(montoPropina)
        : 0;
      const totalGasto = Number(monto) + extraPropina;

      let finalJustificacion = effectiveJustEdit;
      if (tipoGasto === 'PROYECTO' && !selectedProyectoId && comentarioProyecto.trim()) {
        finalJustificacion = `[Proyecto a agregar: ${comentarioProyecto.trim()}]\n\n${finalJustificacion}`;
      }
      if (!proveedor.trim() && comentarioProveedor.trim()) {
        finalJustificacion = `[Proveedor a agregar: ${comentarioProveedor.trim()}]\n\n${finalJustificacion}`;
      }
      if (esComida && selectedEmpleados.length > 0) {
        const nombresShared = selectedEmpleados.map(e => e.nombre).join(', ');
        finalJustificacion = `${finalJustificacion}\n\n[Consumo compartido con: ${nombresShared} (Total: ${1 + selectedEmpleados.length} personas)]`;
      }
      if (esComida && incluyePropina !== null) {
        finalJustificacion = `${finalJustificacion}\n\n[Propina incluida en ticket: ${incluyePropina ? 'Sí' : 'No'}]`;
        const numMontoPropina = Number(montoPropina || 0);
        if (incluyePropina === false && numMontoPropina > 0) {
          finalJustificacion = `${finalJustificacion}\n\n[Monto de propina dejado aparte: $${numMontoPropina} MXN]`;
        }
      }
      const combinedAlert = [alertaPolitica, alertaLocal].filter(Boolean).join(' | ');
      if (combinedAlert) {
        finalJustificacion = `[ALERTA IA: ${combinedAlert}]\n\n${finalJustificacion}`;
      }

      const activeCatObj = categorias.find(c => c.nombre && c.nombre.trim().toLowerCase() === selectedCategoria.trim().toLowerCase());
      const activeSubObj = subcategorias.find(s => s.nombre && s.nombre.trim().toLowerCase() === selectedSubcategoria.trim().toLowerCase() && (!activeCatObj || s.categoria_id === activeCatObj.id));
      const activeProvObj = proveedores.find(p => p.nombre && p.nombre.trim().toLowerCase() === proveedor.trim().toLowerCase());
      const activeCliObj = clientes.find(c => c.nombre && c.nombre.trim().toLowerCase() === selectedCliente.trim().toLowerCase());
      const activeSucObj = sucursalesCliente.find(s => s.nombre && s.nombre.trim().toLowerCase() === sucursal.trim().toLowerCase() && (!activeCliObj || s.cliente_id === activeCliObj.id));

      const resolvedClienteId = selectedProyectoObj?.cliente_id || activeCliObj?.id || null;
      const resolvedSucursalId = selectedProyectoObj?.sucursal_id || activeSucObj?.id || null;
      const isHospedaje = tipoGasto === 'PROYECTO' && bloqueProyecto === 'HOSPEDAJE';
      const isTraslado = tipoGasto === 'PROYECTO' && bloqueProyecto === 'TRANSPORTE' && subtipoTransporte === 'TRASLADOS';
      const effectiveTipoServicioEdit =
        tipoServicioProyecto || (tipoGasto === 'OPERATIVO' ? 'Operativo' : 'Proyecto');
      const effectiveDetalleEdit =
        (tipoGasto === 'PROYECTO' && !selectedProyectoId && comentarioProyecto.trim()
          ? comentarioProyecto.trim()
          : '') ||
        detalleServicioProyecto.trim() ||
        selectedProyectoObj?.nombre ||
        (tipoGasto === 'OPERATIVO' ? 'Gasto Operativo / General' : '');

      const gastoPayload: any = {
        ...(role === 'empleado' ? { empleado_id: currentUser.id, empleado_nombre: currentUser.nombre } : {}),
        monto: totalGasto,
        subcategoria_id: activeSubObj?.id || null,
        metodo_pago: metodoPago,
        justificacion: finalJustificacion,
        fecha_comprobante: dbFecha,
        proveedor_id: activeProvObj?.id || null,
        cliente_id: resolvedClienteId,
        sucursal_id: resolvedSucursalId,
        tipo_tarjeta: (metodoPago === 'efectivo' || metodoPago === 'transferencia' || metodoPago === 'monedero_electronico') ? null : tipoTarjeta,
        ubicacion_registro: 'Móvil',
        facturado: facturado,
        motivo_sin_factura: facturado ? null : (facturaStatus === 'PENDIENTE' ? `PENDIENTE_ENTREGA: ${comentarioPendiente}` : motivoSinFactura.trim() || null),
        tipo_servicio_proyecto: effectiveTipoServicioEdit,
        detalle_servicio_proyecto: effectiveDetalleEdit,
        proyecto_id: tipoGasto === 'PROYECTO' ? (selectedProyectoId || null) : null,
        tipo_gasto: isHistoricoSinProyecto && !selectedProyectoId && !comentarioProyecto.trim() && tipoGasto === 'PROYECTO' ? null : tipoGasto,
        subtipo_traslado: isTraslado ? (subtipoTraslado || 'OTRO') : null,
        fecha_hospedaje_inicio: isHospedaje ? (fechaHospedajeInicio || null) : null,
        fecha_hospedaje_fin: isHospedaje ? (fechaHospedajeFin || null) : null,
      };

      isSubmittingRef.current = true;
      setIsSubmitting(true);

      try {
        const netState = await NetInfo.fetch();

        if (!netState.isConnected) {
          showAlert('Sin conexión', 'Necesitas conexión a internet para editar un gasto devuelto.');
          setIsSubmitting(false);
          return;
        }

        const finalFotoUrl = await uploadTicketFilesForGasto(currentUser.id);

        let publicInvoiceUrl: string | null = null;
        if (facturado && facturaPdf) {
          if (facturaPdf.isRemote && facturaPdf.uri) {
            publicInvoiceUrl = facturaPdf.uri;
          } else if (facturaPdf.base64) {
            try {
              const fileName = `${currentUser.id}/factura_${Date.now()}.pdf`;
              const { error: uploadError } = await supabase.storage
                .from('tickets')
                .upload(fileName, facturaPdf.base64, { contentType: 'application/pdf', upsert: true });

              if (!uploadError) {
                const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
                if (urlData?.publicUrl) {
                  publicInvoiceUrl = urlData.publicUrl;
                }
              } else {
                console.warn('Invoice storage upload failed:', uploadError);
              }
            } catch (invErr) {
              console.warn('Error al subir factura en editar-gasto:', invErr);
            }
          }
        }

        const updateData: any = {
          ...gastoPayload,
          status: 'PENDING',
          rejection_feedback: null,
          foto_url: finalFotoUrl,
          factura_url: facturado ? (publicInvoiceUrl || null) : null,
        };

        if (gastoId) {
          await gastosApi.updateGasto(gastoId, updateData);
        }

        showAlert('Éxito', 'Gasto modificado correctamente y enviado a revisión.');
        router.replace(redirectRoute as any);
      } catch (err: any) {
        showAlert('Error al guardar', err.message || 'No se pudo guardar el gasto.');
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    }
  };

  const nextStep = () => {
    if (currentStep === 1) {
      if (mode === 'edit' && !imageUri) {
        showAlert('Evidencia requerida', 'Por favor toma una fotografía o selecciona un ticket.');
        return;
      }
      if (esComida) {
        if (incluyePropina === null) {
          showAlert('Validación', 'Por favor especifica si el ticket incluye propina.');
          return;
        }
        if (incluyePropina === false && montoPropina && montoPropina.trim() && (isNaN(Number(montoPropina)) || Number(montoPropina) < 0)) {
          showAlert('Validación', 'Por favor ingresa un monto de propina válido (o 0 si no se dejó propina).');
          return;
        }
      }
    }
    if (currentStep === 2) {
      if (!monto || isNaN(Number(monto))) {
        showAlert('Validación', 'Por favor ingresa un monto válido.');
        return;
      }
      const fechaRegex = /^\d{2}\/\d{2}\/\d{4}$/;
      if (!fechaRegex.test(fechaComprobante)) {
        showAlert('Validación', 'Por favor ingresa la fecha en formato DD/MM/AAAA (ej. 09/06/2026).');
        return;
      }

      if (metodoPago !== 'efectivo' && metodoPago !== 'transferencia' && metodoPago !== 'monedero_electronico' && !tipoTarjeta) {
        showAlert('Validación', 'Por favor selecciona la tarjeta utilizada (BBVA, AMEX, MARRIOT, BANORTE, INVEX, Mercado Pago, Hilton).');
        return;
      }
      if (facturado === null) {
        showAlert('Validación', 'Por favor especifica si el gasto está facturado.');
        return;
      }
      if (mode === 'edit') {
        if (facturado === false && facturaStatus === 'PENDIENTE' && !comentarioPendiente.trim()) {
          showAlert('Validación', 'Por favor explica por qué la factura está pendiente.');
          return;
        }
        if (facturado === false && facturaStatus === 'NO' && (!motivoSinFactura || !motivoSinFactura.trim())) {
          showAlert('Validación', 'Por favor explica el motivo por el cual no se cuenta con factura.');
          return;
        }
      } else {
        if (facturado === false && !motivoSinFactura.trim()) {
          showAlert('Validación', 'Por favor especifica el motivo por el cual no se cuenta con factura.');
          return;
        }
      }
      if (!proveedor.trim() && !comentarioProveedor.trim()) {
        showAlert(
          'Validación',
          role === 'admin'
            ? 'Por favor indica en el campo "Proveedor a agregar" el nombre del proveedor.'
            : 'Por favor indica en el campo "Proveedor a agregar" el nombre del proveedor para que el administrador pueda registrarlo.'
        );
        return;
      }
    }
    setCurrentStep((prev) => prev + 1);
  };

  const prevStep = () => {
    setCurrentStep((prev) => prev - 1);
  };

  const closeAllDropdowns = () => {
    setShowEmpList(false);
    setShowCatDropdown(false);
    setShowSubDropdown(false);
    setShowCliDropdown(false);
    setShowProvDropdown(false);
    setShowProyectoDropdown(false);
    setShowVehiculoDropdown(false);
    setShowSucursalDropdown(false);
  };

  return {
    role,
    mode,
    gastoId,
    currentUser,
    currentStep,
    setCurrentStep,
    isSubmitting,
    isLoadingGasto,
    proyectos,
    selectedProyectoId,
    setSelectedProyectoId,
    selectedProyectoObj,
    comentarioProyecto,
    setComentarioProyecto,
    proyectoSearch,
    setProyectoSearch,
    showProyectoDropdown,
    setShowProyectoDropdown,
    tipoGasto,
    setTipoGasto,
    bloqueProyecto,
    setBloqueProyecto,
    subtipoTransporte,
    setSubtipoTransporte,
    subtipoTraslado,
    setSubtipoTraslado,
    fechaHospedajeInicio,
    setFechaHospedajeInicio,
    fechaHospedajeFin,
    setFechaHospedajeFin,
    showHospedajeInicioPicker,
    setShowHospedajeInicioPicker,
    showHospedajeFinPicker,
    setShowHospedajeFinPicker,
    isHistoricoSinProyecto,
    setIsHistoricoSinProyecto,
    hospedajeRecienteAviso,
    hospedajePreview,
    proyectosDisponibles,
    hasSucursalParaProyecto,
    sucursalesDelCliente,
    mostrarSugerenciaProyecto,
    setMostrarSugerenciaProyecto,
    handleSelectTipoGasto,
    handleSelectClienteProyecto,
    handleSelectSucursalProyecto,
    handleSelectProyecto,
    handleSelectBloqueProyecto,
    handleSelectSubtipoTransporte,
    handleSelectSubtipoTraslado,
    categorias,
    subcategorias,
    filteredSubcategorias,
    clientes,
    proveedores,
    proveedorSearch,
    setProveedorSearch,
    showProvDropdown,
    setShowProvDropdown,
    modalNuevoProveedorVisible,
    setModalNuevoProveedorVisible,
    nuevoProvNombre,
    setNuevoProvNombre,
    nuevoProvRfc,
    setNuevoProvRfc,
    isSavingProv,
    ticketFiles,
    activeTicketIndex,
    setActiveTicketIndex,
    imageUri,
    setImageUri,
    imageBase64,
    setImageBase64,
    imageExt,
    setImageExt,
    viewerVisible,
    setViewerVisible,
    viewerInitialIndex,
    setViewerInitialIndex,
    allUsers,
    selectedEmpleados,
    setSelectedEmpleados,
    showEmpList,
    setShowEmpList,
    monto,
    setMonto,
    proveedor,
    setProveedor,
    comentarioProveedor,
    setComentarioProveedor,
    comentarioSucursal,
    setComentarioSucursal,
    facturado,
    setFacturado,
    facturaStatus,
    setFacturaStatus,
    comentarioPendiente,
    setComentarioPendiente,
    facturaPdf,
    setFacturaPdf,
    motivoSinFactura,
    setMotivoSinFactura,
    activePreviewUrl,
    setActivePreviewUrl,
    fechaComprobante,
    setFechaComprobante,
    tipoServicioProyecto,
    setTipoServicioProyecto,
    detalleServicioProyecto,
    setDetalleServicioProyecto,
    sucursal,
    setSucursal,
    metodoPago,
    setMetodoPago,
    tipoTarjeta,
    setTipoTarjeta,
    showDatePicker,
    setShowDatePicker,
    dateValue,
    setDateValue,
    onChangeDate,
    alertaPolitica,
    setAlertaPolitica,
    alertaLocal,
    incluyePropina,
    setIncluyePropina,
    montoPropina,
    setMontoPropina,
    esComida,
    setEsComida,
    selectedCategoria,
    setSelectedCategoria,
    selectedSubcategoria,
    setSelectedSubcategoria,
    selectedCliente,
    setSelectedCliente,
    clienteSearch,
    setClienteSearch,
    justificacion,
    setJustificacion,
    sucursalesCliente,
    showSucursalDropdown,
    setShowSucursalDropdown,
    sucursalSearch,
    setSucursalSearch,
    vehiculos,
    selectedVehiculoId,
    setSelectedVehiculoId,
    kilometrajeActual,
    setKilometrajeActual,
    litrosGasolina,
    setLitrosGasolina,
    showVehiculoDropdown,
    setShowVehiculoDropdown,
    isSplit,
    setIsSplit,
    splits,
    setSplits,
    showCatDropdown,
    setShowCatDropdown,
    showSubDropdown,
    setShowSubDropdown,
    showCliDropdown,
    setShowCliDropdown,
    showSplitModal,
    setShowSplitModal,
    newSplitClienteId,
    setNewSplitClienteId,
    newSplitSucursalNombre,
    setNewSplitSucursalNombre,
    newSplitComentarioSucursal,
    setNewSplitComentarioSucursal,
    newSplitMonto,
    setNewSplitMonto,
    showNewSplitCliDropdown,
    setShowNewSplitCliDropdown,
    showNewSplitSucDropdown,
    setShowNewSplitSucDropdown,
    splitClienteSearch,
    setSplitClienteSearch,
    splitSucursalSearch,
    setSplitSucursalSearch,
    handleCapturePhoto,
    handleSelectGallery,
    handleRemoveTicket,
    handleClearAllTickets,
    handleSelectDocument,
    handleSelectFacturaPdf,
    handlePreviewPdf,
    handleRemoveFacturaPdf,
    handleAddNewCliente,
    handleAddNewSucursal,
    handleAddNewClienteForSplit,
    handleAddNewSucursalForSplit,
    handleCrearNuevoProveedor,
    handleSaveGasto,
    nextStep,
    prevStep,
    closeAllDropdowns,
  };
}
