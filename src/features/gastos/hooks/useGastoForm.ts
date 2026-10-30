import { useEffect, useState, useMemo } from 'react';
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
  return cleaned.trim();
};

export interface UseGastoFormOptions {
  role: GastoFormRole;
  mode: GastoFormMode;
  gastoId?: string;
}

export function useGastoForm({ role, mode, gastoId }: UseGastoFormOptions) {
  const router = useRouter();
  const redirectRoute = role === 'admin' ? '/(admin)/gastos' : '/(empleado)/gastos';

  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      const data = await gastosApi.fetchFormCatalogs();
      if (data.categorias) setCategorias(data.categorias);
      if (data.subcategorias) setSubcategorias(data.subcategorias);
      if (data.clientes) setClientes(data.clientes);
      if (data.usuarios) setAllUsers(data.usuarios);
      if (data.sucursales) setSucursalesCliente(data.sucursales);
      if (data.proveedores) setProveedores(data.proveedores);

      if (mode === 'create') {
        if (role === 'admin') {
          const vehList = await VehiculoService.getVehiculos(true);
          if (vehList) setVehiculos(vehList);
        } else {
          if (data.vehiculos) setVehiculos(data.vehiculos);
        }
      }
      return data;
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

            const resolvedCliente = GastoHelper.getCliente(data);
            setSelectedCliente(resolvedCliente);

            const resolvedSucursal = GastoHelper.getSucursal(data);
            setSucursal(resolvedSucursal);

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

  const handleSaveGasto = async () => {
    if (!currentUser) return;

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

      // 8. Validar Categoría y Subcategoría
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

      // 10. Validar Vehículos / Gasolina / Combustible
      const esGasolina = isCombustibleExpense(selectedCategoria, selectedSubcategoria);
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

      // 11. Validar Tipo y Detalle de Servicio/Proyecto
      if (!tipoServicioProyecto) {
        showAlert('Validación', 'Por favor selecciona si es Servicio, Proyecto, Venta u Operativo.');
        setCurrentStep(3);
        return;
      }

      if (!detalleServicioProyecto.trim()) {
        showAlert('Validación', 'Por favor ingresa el detalle del Servicio, Proyecto, Venta u Operativo.');
        setCurrentStep(3);
        return;
      }

      // 12. Validar Comentarios / Justificación
      if (!justificacion.trim()) {
        showAlert('Validación', 'Por favor escribe tus comentarios del gasto.');
        setCurrentStep(3);
        return;
      }

      if (!isSplit) {
        if (!selectedCliente || !selectedCliente.trim()) {
          showAlert('Validación', 'Por favor selecciona el cliente relacionado al gasto.');
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

      if (isSplit) {
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

      setIsSubmitting(true);

      const dbFecha = formatFriendlyToDb(fechaComprobante);

      let finalJustificacion = justificacion.trim();
      if (currentUser?.rol === 'DEV') {
        finalJustificacion = `[PRUEBA] ${finalJustificacion}`;
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

      const gastoPayload = {
        empleado_id: currentUser.id,
        empleado_nombre: currentUser.nombre,
        monto: totalGasto,
        subcategoria_id: activeSubObj?.id || null,
        metodo_pago: metodoPago,
        justificacion: finalJustificacion,
        fecha_comprobante: dbFecha,
        proveedor_id: activeProvObj?.id || null,
        cliente_id: activeCliObj?.id || null,
        sucursal_id: activeSucObj?.id || null,
        tipo_tarjeta: (metodoPago === 'efectivo' || metodoPago === 'transferencia' || metodoPago === 'monedero_electronico') ? null : tipoTarjeta,
        ubicacion_registro: 'Móvil',
        facturado: facturado,
        motivo_sin_factura: facturado === true
          ? null
          : (facturaStatus === 'PENDIENTE')
              ? (comentarioPendiente.trim() ? `PENDIENTE_ENTREGA: ${comentarioPendiente.trim()}` : 'PENDIENTE_ENTREGA')
              : (motivoSinFactura.trim() || null),
        tipo_servicio_proyecto: tipoServicioProyecto,
        detalle_servicio_proyecto: detalleServicioProyecto.trim(),
      };

      setIsSubmitting(true);

      try {
        const netState = await NetInfo.fetch();

        if (netState.isConnected) {
          let publicTicketUrls: string[] = [];
          if (ticketFiles.length > 0) {
            for (let i = 0; i < ticketFiles.length; i++) {
              const tf = ticketFiles[i];
              let fileUrl = tf.uri;
              if (tf.base64) {
                try {
                  const ext = tf.ext || 'jpg';
                  const contentType = ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
                  const fileName = `${currentUser.id}/ticket_${Date.now()}_${i}.${ext}`;
                  const { error: uploadError } = await supabase.storage
                    .from('tickets')
                    .upload(fileName, tf.base64, { contentType, upsert: true });

                  if (!uploadError) {
                    const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
                    if (urlData?.publicUrl) {
                      fileUrl = urlData.publicUrl;
                    }
                  } else {
                    console.warn(`Supabase ticket [${i}] upload failed:`, uploadError);
                  }
                } catch (stErr) {
                  console.warn(`Storage upload ticket [${i}] exception:`, stErr);
                }
              }
              if (fileUrl) {
                publicTicketUrls.push(fileUrl);
              }
            }
          } else if (imageUri) {
            if (imageBase64) {
              try {
                const contentType = imageExt === 'pdf' ? 'application/pdf' : 'image/jpeg';
                const fileName = `${currentUser.id}/${Date.now()}.${imageExt}`;
                const { error: uploadError } = await supabase.storage
                  .from('tickets')
                  .upload(fileName, imageBase64, { contentType, upsert: true });

                if (!uploadError) {
                  const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
                  if (urlData?.publicUrl) publicTicketUrls.push(urlData.publicUrl);
                } else {
                  publicTicketUrls.push(imageUri);
                }
              } catch (stErr) {
                publicTicketUrls.push(imageUri);
              }
            } else {
              publicTicketUrls.push(imageUri);
            }
          }
          const publicUrl = publicTicketUrls.join(',') || null;

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

          const payloadsToInsert = isSplit ? splits.map((s, index) => {
            const splitCliObj = clientes.find(c => c.nombre && c.nombre.trim().toLowerCase() === (s.clienteId || '').trim().toLowerCase());
            const splitSucObj = sucursalesCliente.find(suc => suc.nombre && suc.nombre.trim().toLowerCase() === (s.sucursalNombre || '').trim().toLowerCase() && (!splitCliObj || suc.cliente_id === splitCliObj.id));
            const justifSplit = role === 'empleado'
              ? `[Gasto dividido del ticket total de $${totalGasto.toFixed(2)}] - División ${index + 1}/${splits.length} (Cliente: ${s.clienteId} | Sucursal: ${s.sucursalNombre || s.comentarioSucursal})${s.comentarioSucursal ? `\n[Sucursal a agregar: ${s.comentarioSucursal}]` : ''}\n\n${gastoPayload.justificacion}`
              : `[Gasto dividido del ticket total de $${totalGasto.toFixed(2)}] - División ${index + 1}/${splits.length} (Cliente: ${s.clienteId} | Sucursal: ${s.sucursalNombre})\n\n${gastoPayload.justificacion}`;
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

          const esGasolina = isCombustibleExpense(selectedCategoria, selectedSubcategoria);
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

          const esGasolina = isCombustibleExpense(selectedCategoria, selectedSubcategoria);
          if (isSplit) {
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
        showAlert('Error al guardar', errorDetails || 'No se pudo guardar el gasto.');
      } finally {
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

      if (!selectedCliente.trim()) {
        showAlert('Validación', 'Por favor selecciona o ingresa el cliente o proyecto asignado.');
        return;
      }

      if (!sucursal || !sucursal.trim()) {
        showAlert('Validación', 'Por favor selecciona la sucursal del cliente.');
        return;
      }

      if (!tipoServicioProyecto) {
        showAlert('Validación', 'Por favor selecciona si es Servicio, Proyecto, Venta u Operativo.');
        return;
      }

      if (!detalleServicioProyecto.trim()) {
        showAlert('Validación', 'Por favor ingresa el detalle del Servicio, Proyecto, Venta u Operativo.');
        return;
      }

      if (!justificacion.trim()) {
        showAlert('Validación', 'Por favor escribe una justificación del gasto.');
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

      let finalJustificacion = justificacion.trim();
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

      const gastoPayload: any = {
        ...(role === 'empleado' ? { empleado_id: currentUser.id, empleado_nombre: currentUser.nombre } : {}),
        monto: totalGasto,
        subcategoria_id: activeSubObj?.id || null,
        metodo_pago: metodoPago,
        justificacion: finalJustificacion,
        fecha_comprobante: dbFecha,
        proveedor_id: activeProvObj?.id || null,
        cliente_id: activeCliObj?.id || null,
        sucursal_id: activeSucObj?.id || null,
        tipo_tarjeta: (metodoPago === 'efectivo' || metodoPago === 'transferencia' || metodoPago === 'monedero_electronico') ? null : tipoTarjeta,
        ubicacion_registro: 'Móvil',
        facturado: facturado,
        motivo_sin_factura: facturado ? null : (facturaStatus === 'PENDIENTE' ? `PENDIENTE_ENTREGA: ${comentarioPendiente}` : motivoSinFactura.trim() || null),
        tipo_servicio_proyecto: tipoServicioProyecto,
        detalle_servicio_proyecto: detalleServicioProyecto.trim(),
      };

      setIsSubmitting(true);

      try {
        const netState = await NetInfo.fetch();

        if (!netState.isConnected) {
          showAlert('Sin conexión', 'Necesitas conexión a internet para editar un gasto devuelto.');
          setIsSubmitting(false);
          return;
        }

        let publicTicketUrls: string[] = [];
        if (ticketFiles.length > 0) {
          for (let i = 0; i < ticketFiles.length; i++) {
            const tf = ticketFiles[i];
            if (tf.isRemote && tf.uri) {
              publicTicketUrls.push(tf.uri);
            } else if (tf.base64) {
              const ext = tf.ext || 'jpg';
              const contentType = ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
              const fileName = `${currentUser.id}/${Date.now()}_ticket_${i}.${ext}`;
              const { error: uploadError } = await supabase.storage
                .from('tickets')
                .upload(fileName, tf.base64, { contentType, upsert: true });

              if (uploadError) throw uploadError;

              const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
              if (urlData?.publicUrl) publicTicketUrls.push(urlData.publicUrl);
            } else if (tf.uri && (tf.uri.startsWith('http://') || tf.uri.startsWith('https://'))) {
              publicTicketUrls.push(tf.uri);
            }
          }
        } else if (imageUri) {
          if (imageBase64) {
            const contentType = imageExt === 'pdf' ? 'application/pdf' : 'image/jpeg';
            const fileName = `${currentUser.id}/${Date.now()}.${imageExt}`;
            const { error: uploadError } = await supabase.storage
              .from('tickets')
              .upload(fileName, imageBase64, { contentType, upsert: true });

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
            if (urlData?.publicUrl) publicTicketUrls.push(urlData.publicUrl);
          } else {
            publicTicketUrls.push(imageUri);
          }
        }

        const finalFotoUrl = publicTicketUrls.join(',') || null;

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
