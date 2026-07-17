import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  TextInput,
  useWindowDimensions,
  Pressable,
  Keyboard,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase, CatalogoItem } from '@/services/supabase';
import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { GeminiService } from '@/services/gemini';

// Interfaces locales para concordar con la base de datos
interface Categoria {
  id: string;
  nombre: string;
}

interface Proveedor {
  id: string;
  nombre: string;
  rfc: string;
}

interface Producto {
  id: string;
  sku_interno: string;
  nombre_oficial: string;
  categoria_id: string;
  stock_actual: number;
  activo: boolean;
}

interface FacturaItemStaging {
  id: string; // ID temporal en UI
  nombreFactura: string; // Nombre del producto según el proveedor
  cantidad: number;
  precioUnitario: number;
  productoIdSugerido?: string; // ID del producto asociado en catálogo
  esNuevoProducto: boolean;
  categoriaSeleccionadaId?: string; // Si es nuevo, categoría asignada
}

interface ConsumoItem {
  id: string;
  productoId: string;
  cantidad: number;
}

export default function InventarioDashboard() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 600;
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  // Tab activa: 'catalogo' | 'ia-import' | 'consumo' | 'categorias'
  const [activeTab, setActiveTab] = useState<'catalogo' | 'ia-import' | 'consumo' | 'categorias'>('catalogo');
  
  // Datos maestros de la DB
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros de búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('');

  // Selector Centralizado
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorTitle, setSelectorTitle] = useState('');
  const [selectorOptions, setSelectorOptions] = useState<{ id: string; label: string }[]>([]);
  const [onSelectOption, setOnSelectOption] = useState<(id: string) => void>(() => {});
  const [selectorSearch, setSelectorSearch] = useState('');

  // Modales CRUD manual
  const [crudModalVisible, setCrudModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Producto | null>(null);
  const [formSku, setFormSku] = useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formCategoriaId, setFormCategoriaId] = useState('');
  const [formStock, setFormStock] = useState('0');
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  // Creador de Categorías y Proveedores
  const [newCatNombre, setNewCatNombre] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [isSavingNewCat, setIsSavingNewCat] = useState(false);

  const [newProvNombre, setNewProvNombre] = useState('');
  const [newProvRfc, setNewProvRfc] = useState('');
  const [isSavingNewProv, setIsSavingNewProv] = useState(false);

  // Modales de Creador de Categorías y Proveedores
  const [newCatModalVisible, setNewCatModalVisible] = useState(false);
  const [newProvModalVisible, setNewProvModalVisible] = useState(false);

  // ID del ítem de staging seleccionado para asociar producto
  const [activeStagingItemId, setActiveStagingItemId] = useState<string | null>(null);

  // Ajuste rápido de stock por producto
  const [quickStockAdjustments, setQuickStockAdjustments] = useState<Record<string, string>>({});

  // Flujo Consumo / Salidas de Materiales
  const [consumoCliente, setConsumoCliente] = useState('');
  const [clientes, setClientes] = useState<CatalogoItem[]>([]);
  const [showCliDropdown, setShowCliDropdown] = useState(false);
  const [clienteSearch, setClienteSearch] = useState('');
  const [consumoItems, setConsumoItems] = useState<ConsumoItem[]>([]);
  const [isSavingConsumo, setIsSavingConsumo] = useState(false);
  const [historialConsumo, setHistorialConsumo] = useState<any[]>([]);



  // Flujo IA (Staging)
  const [selectedProveedorId, setSelectedProveedorId] = useState('');
  const [folioFactura, setFolioFactura] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stagingItems, setStagingItems] = useState<FacturaItemStaging[]>([]);
  const [isSavingAIImport, setIsSavingAIImport] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    setIsLoading(true);
    try {
      // Cargar categorías, proveedores, productos, historial de consumo y clientes
      const [catRes, provRes, prodRes, histRes, cliRes] = await Promise.all([
        supabase.from('categorias_productos').select('*').order('nombre'),
        supabase.from('proveedores').select('*').order('nombre'),
        supabase.from('productos').select('*').order('nombre_oficial'),
        supabase
          .from('movimientos_inventario')
          .select('*, producto:productos(nombre_oficial)')
          .eq('tipo', 'SALIDA')
          .order('fecha', { ascending: false })
          .limit(50),
        supabase.from('clientes').select('*').order('nombre'),
      ]);

      if (catRes.error) throw catRes.error;
      if (provRes.error) throw provRes.error;
      if (prodRes.error) throw prodRes.error;
      if (cliRes.error) throw cliRes.error;

      setCategorias(catRes.data || []);
      setProveedores(provRes.data || []);
      setProductos(prodRes.data || []);
      setHistorialConsumo(histRes.data || []);
      setClientes(cliRes.data || []);
    } catch (err: any) {
      console.error('Error al cargar datos de inventario:', err);
      Alert.alert('Error', err.message || 'No se pudieron recuperar los datos de inventario.');
    } finally {
      setIsLoading(false);
    }
  }

  // --- Centralized Selectors ---
  const openCategoryFilter = () => {
    setSelectorTitle('Filtrar por Categoría');
    setSelectorSearch('');
    setSelectorOptions([
      { id: '', label: 'Todas las Categorías' },
      ...categorias.map(c => ({ id: c.id, label: c.nombre })),
    ]);
    setOnSelectOption(() => (id: string) => {
      setSelectedCategoryFilter(id);
    });
    setSelectorVisible(true);
  };

  const openProveedorSelector = () => {
    setSelectorTitle('Seleccionar Proveedor');
    setSelectorSearch('');
    setSelectorOptions(
      proveedores.map(p => ({ id: p.id, label: `${p.nombre} (${p.rfc})` }))
    );
    setOnSelectOption(() => (id: string) => {
      setSelectedProveedorId(id);
    });
    setSelectorVisible(true);
  };

  const openProductSelectorForStaging = (itemId: string) => {
    setActiveStagingItemId(itemId);
    setSelectorTitle('Buscar Producto del Catálogo');
    setSelectorSearch('');
    setSelectorOptions(
      productos
        .filter(p => p.activo)
        .map(p => ({ id: p.id, label: `${p.nombre_oficial} (${p.sku_interno})` }))
    );
    setOnSelectOption(() => (id: string) => {
      handleUpdateStagingItem(itemId, { productoIdSugerido: id, esNuevoProducto: false });
    });
    setSelectorVisible(true);
  };



  const openFormCatSelector = () => {
    setSelectorTitle('Seleccionar Categoría');
    setSelectorSearch('');
    setSelectorOptions(
      categorias.map(c => ({ id: c.id, label: c.nombre }))
    );
    setOnSelectOption(() => (id: string) => {
      setFormCategoriaId(id);
    });
    setSelectorVisible(true);
  };

  const filteredSelectorOptions = selectorOptions.filter(opt =>
    opt.label.toLowerCase().includes(selectorSearch.toLowerCase())
  );

  // --- CRUD Manual ---
  const handleOpenCreateModal = () => {
    setEditingProduct(null);
    setFormSku('');
    setFormNombre('');
    setFormCategoriaId(categorias[0]?.id || '');
    setFormStock('0');
    setCrudModalVisible(true);
  };

  const handleOpenEditModal = (p: Producto) => {
    setEditingProduct(p);
    setFormSku(p.sku_interno);
    setFormNombre(p.nombre_oficial);
    setFormCategoriaId(p.categoria_id);
    setFormStock(p.stock_actual.toString());
    setCrudModalVisible(true);
  };

  const handleSaveProduct = async () => {
    if (!formSku.trim() || !formNombre.trim() || !formCategoriaId) {
      Alert.alert('Validación', 'Por favor llena todos los campos obligatorios.');
      return;
    }

    const stockNum = parseInt(formStock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      Alert.alert('Validación', 'El stock debe ser un número entero mayor o igual a 0.');
      return;
    }

    setIsSavingProduct(true);
    try {
      if (editingProduct) {
        // Editar
        const { error } = await supabase
          .from('productos')
          .update({
            sku_interno: formSku.trim(),
            nombre_oficial: formNombre.trim(),
            categoria_id: formCategoriaId,
            stock_actual: stockNum,
          })
          .eq('id', editingProduct.id);

        if (error) throw error;
        Alert.alert('Éxito', 'Producto actualizado correctamente.');
      } else {
        // Crear
        const { error } = await supabase.from('productos').insert([
          {
            sku_interno: formSku.trim().toUpperCase(),
            nombre_oficial: formNombre.trim(),
            categoria_id: formCategoriaId,
            stock_actual: stockNum,
            activo: true,
          },
        ]);

        if (error) throw error;
        Alert.alert('Éxito', 'Producto agregado correctamente.');
      }

      setCrudModalVisible(false);
      await loadAllData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar el producto.');
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleSoftDeleteProduct = (p: Producto) => {
    const performDelete = async () => {
      setIsLoading(true);
      try {
        const { error } = await supabase
          .from('productos')
          .update({ activo: false })
          .eq('id', p.id);

        if (error) throw error;
        if (Platform.OS === 'web') {
          window.alert('Producto desactivado.');
        } else {
          Alert.alert('Éxito', 'Producto desactivado.');
        }
        await loadAllData();
      } catch (err: any) {
        if (Platform.OS === 'web') {
          window.alert(err.message || 'No se pudo desactivar el producto.');
        } else {
          Alert.alert('Error', err.message || 'No se pudo desactivar el producto.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirm = window.confirm(`¿Estás seguro de que deseas desactivar el producto "${p.nombre_oficial}" del catálogo activo?`);
      if (confirm) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Confirmar Desactivación',
        `¿Estás seguro de que deseas desactivar el producto "${p.nombre_oficial}" del catálogo activo?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Desactivar',
            style: 'destructive',
            onPress: performDelete,
          },
        ]
      );
    }
  };

  const handleQuickAddStock = async (product: Producto) => {
    const valueStr = quickStockAdjustments[product.id] || '';
    const toAdd = parseInt(valueStr, 10);

    if (isNaN(toAdd) || toAdd <= 0) {
      Alert.alert('Validación', 'Por favor ingresa un número entero mayor a 0 para añadir al stock.');
      return;
    }

    setIsLoading(true);
    try {
      const newStock = product.stock_actual + toAdd;

      // 1. Actualizar el producto en Supabase
      const { error: updateErr } = await supabase
        .from('productos')
        .update({ stock_actual: newStock })
        .eq('id', product.id);

      if (updateErr) throw updateErr;

      // 2. Registrar movimiento de entrada en el historial
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData?.user?.id || null;

      const { error: moveErr } = await supabase
        .from('movimientos_inventario')
        .insert([
          {
            producto_id: product.id,
            tipo: 'ENTRADA',
            cantidad: toAdd,
            folio_factura: 'AJUSTE_RAPIDO',
            creado_por: currentUserId,
          },
        ]);

      if (moveErr) {
        console.warn('Ajuste de stock realizado, pero no se pudo registrar el movimiento:', moveErr.message);
      }

      // Limpiar el input de este producto
      setQuickStockAdjustments(prev => ({ ...prev, [product.id]: '' }));

      Alert.alert('Éxito', `Se añadieron ${toAdd} unidades a "${product.nombre_oficial}". Stock actual: ${newStock}`);
      await loadAllData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo actualizar el stock del producto.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Crear Categorías y Proveedores de Forma Manual ---
  const handleCreateCategory = async () => {
    if (!newCatNombre.trim()) {
      Alert.alert('Validación', 'Por favor ingresa el nombre de la categoría.');
      return;
    }

    setIsSavingNewCat(true);
    try {
      const { error } = await supabase.from('categorias_productos').insert([
        {
          nombre: newCatNombre.trim(),
          descripcion: newCatDesc.trim() || null,
        },
      ]);

      if (error) throw error;

      Alert.alert('Éxito', 'Categoría agregada correctamente.');
      setNewCatNombre('');
      setNewCatDesc('');
      setNewCatModalVisible(false);
      await loadAllData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar la categoría.');
    } finally {
      setIsSavingNewCat(false);
    }
  };

  const handleCreateProveedor = async () => {
    if (!newProvNombre.trim()) {
      Alert.alert('Validación', 'Por favor ingresa el nombre del proveedor.');
      return;
    }

    const cleanRfc = newProvRfc.trim().toUpperCase();
    if (cleanRfc && cleanRfc.length !== 12 && cleanRfc.length !== 13) {
      Alert.alert('Validación', 'El RFC debe tener exactamente 12 o 13 caracteres.');
      return;
    }

    setIsSavingNewProv(true);
    try {
      const { error } = await supabase.from('proveedores').insert([
        {
          nombre: newProvNombre.trim(),
          rfc: cleanRfc || null,
        },
      ]);

      if (error) throw error;

      Alert.alert('Éxito', 'Proveedor agregado correctamente.');
      setNewProvNombre('');
      setNewProvRfc('');
      setNewProvModalVisible(false);
      await loadAllData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar el proveedor.');
    } finally {
      setIsSavingNewProv(false);
    }
  };

  const handleAddNewCliente = async (nombre: string) => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert([{ nombre: nombre.trim() }])
        .select();
      if (error) throw error;
      if (data && data.length > 0) {
        const newCli = data[0];
        setClientes(prev => [...prev, newCli].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        setConsumoCliente(newCli.nombre);
      } else {
        const { data: allCli } = await supabase.from('clientes').select('*').order('nombre');
        if (allCli) {
          setClientes(allCli);
          setConsumoCliente(nombre.trim());
        }
      }
      setClienteSearch('');
      setShowCliDropdown(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo agregar el cliente.');
    }
  };

  // --- Registrar Consumo de Materiales ---
  const openProductSelectorForConsumo = () => {
    setSelectorTitle('Seleccionar Producto para Consumo');
    setSelectorSearch('');
    setSelectorOptions(
      productos
        .filter(p => p.activo)
        .map(p => ({
          id: p.id,
          label: `${p.nombre_oficial} (${p.sku_interno}) - Stock: ${p.stock_actual}`,
        }))
    );
    setOnSelectOption(() => (id: string) => {
      setConsumoItems(prev => {
        const exists = prev.some(item => item.productoId === id);
        if (exists) {
          Alert.alert('Información', 'Este producto ya ha sido agregado a la lista de consumo.');
          return prev;
        }
        return [
          ...prev,
          {
            id: `consumo-${Date.now()}-${Math.random().toString(36).substring(3, 8)}`,
            productoId: id,
            cantidad: 1,
          },
        ];
      });
    });
    setSelectorVisible(true);
  };

  const handleRemoveConsumoItem = (id: string) => {
    setConsumoItems(prev => prev.filter(item => item.id !== id));
  };

  const handleUpdateConsumoItemQty = (id: string, qty: number) => {
    setConsumoItems(prev =>
      prev.map(item => (item.id === id ? { ...item, cantidad: qty } : item))
    );
  };

  const handleSaveConsumo = async () => {
    if (!consumoCliente.trim()) {
      Alert.alert('Validación', 'Por favor ingresa el Cliente o Referencia del Trabajo.');
      return;
    }

    if (consumoItems.length === 0) {
      Alert.alert('Validación', 'Agrega al menos un producto a descontar.');
      return;
    }

    // Validar stock antes de enviar
    for (const item of consumoItems) {
      const prod = productos.find(p => p.id === item.productoId);
      if (!prod) continue;

      if (item.cantidad <= 0) {
        Alert.alert('Validación', `La cantidad a consumir para "${prod.nombre_oficial}" debe ser mayor a 0.`);
        return;
      }

      if (item.cantidad > prod.stock_actual) {
        Alert.alert(
          'Stock Insuficiente',
          `No puedes consumir ${item.cantidad} unidades de "${prod.nombre_oficial}" porque solo hay ${prod.stock_actual} disponibles.`
        );
        return;
      }
    }

    setIsSavingConsumo(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData?.user?.id || null;

      // Restar stock y registrar movimientos
      for (const item of consumoItems) {
        const prod = productos.find(p => p.id === item.productoId)!;
        const newStock = prod.stock_actual - item.cantidad;

        // 1. Descontar del inventario
        const { error: stockErr } = await supabase
          .from('productos')
          .update({ stock_actual: newStock })
          .eq('id', item.productoId);

        if (stockErr) throw stockErr;

        // 2. Registrar movimiento de salida
        const { error: moveErr } = await supabase
          .from('movimientos_inventario')
          .insert([
            {
              producto_id: item.productoId,
              tipo: 'SALIDA',
              cantidad: item.cantidad,
              folio_factura: consumoCliente.trim(),
              creado_por: currentUserId,
            },
          ]);

        if (moveErr) {
          console.warn('Ajuste de consumo realizado pero falló el registro histórico:', moveErr.message);
        }
      }

      Alert.alert('Éxito', 'Consumo registrado. Se actualizaron los niveles de stock.');
      setConsumoItems([]);
      setConsumoCliente('');
      setActiveTab('catalogo');
      await loadAllData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar la nota de consumo.');
    } finally {
      setIsSavingConsumo(false);
    }
  };



  // --- Carga de Factura PDF/Imagen e IA ---
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: false, // Obtener URI content:// original para resolver permisos correctos
      });

      if (result.canceled || !result.assets?.[0]) return;

      const fileAsset = result.assets[0];
      const uri = fileAsset.uri;
      const mimeType = fileAsset.mimeType || '';

      const isPdf = mimeType.includes('pdf') || uri.endsWith('.pdf') || fileAsset.name?.endsWith('.pdf');
      const isImage = mimeType.startsWith('image/') || uri.endsWith('.jpg') || uri.endsWith('.jpeg') || uri.endsWith('.png') || uri.endsWith('.webp');

      if (!isPdf && !isImage) {
        Alert.alert('Validación', 'Por favor selecciona únicamente archivos PDF o imágenes (JPG, PNG, WEBP).');
        return;
      }

      const resolvedMime = mimeType || (uri.endsWith('.pdf') || fileAsset.name?.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

      setIsAnalyzing(true);

      // 1. Obtener base64 compatible con Web y Móvil
      let base64Data = '';
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        const blob = await response.blob();
        base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const resultStr = reader.result as string;
            const data = resultStr.split(',')[1] || resultStr;
            resolve(data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        const FileSystem = require('expo-file-system/legacy');
        
        // Copiar archivo temporal a la sandbox para evitar restricciones de lectura nativas en Android
        const tempFileName = `temp_inv_${Date.now()}_${fileAsset.name || 'factura.pdf'}`;
        const targetUri = `${FileSystem.cacheDirectory}${tempFileName}`;
        
        await FileSystem.copyAsync({
          from: uri,
          to: targetUri,
        });

        base64Data = await FileSystem.readAsStringAsync(targetUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        base64Data = base64Data.replace(/^data:[a-zA-Z0-9/\-+.]+;base64,/, ''); // Safety cleanup

        // Limpiar el archivo temporal
        try {
          await FileSystem.deleteAsync(targetUri, { idempotent: true });
        } catch (cleanErr) {
          console.log('Error cleaning inventory temp file:', cleanErr);
        }
      }

      // 2. Compilar catálogo maestro JSON
      const catalogoMaestro = categorias.map(cat => ({
        categoria: cat.nombre,
        productos: productos
          .filter(p => p.categoria_id === cat.id && p.activo)
          .map(p => ({
            sku: p.sku_interno,
            nombre: p.nombre_oficial,
          })),
      }));
      const catalogoMaestroJson = JSON.stringify(catalogoMaestro, null, 2);

      // 3. Invocar servicio Gemini real con la estructura solicitada
      const extraction = await GeminiService.extractInvoiceProducts(
        base64Data,
        resolvedMime,
        catalogoMaestroJson
      );

      // 4. Procesar y mapear resultados en base al catálogo y metadatos
      if (extraction && extraction.partidas_extraidas) {
        // Mapear metadatos de factura a la UI
        if (extraction.factura_metadata) {
          const meta = extraction.factura_metadata;
          if (meta.folio_factura) {
            setFolioFactura(meta.folio_factura);
          }
          if (meta.proveedor_original) {
            const provName = meta.proveedor_original.toLowerCase();
            const rfcClean = meta.rfc_emisor?.replace(/[^A-Z0-9]/ig, '') || '';
            const matchingProv = proveedores.find(p => {
              const pRfcClean = p.rfc?.replace(/[^A-Z0-9]/ig, '') || '';
              return (rfcClean && pRfcClean === rfcClean) || p.nombre.toLowerCase().includes(provName);
            });
            if (matchingProv) {
              setSelectedProveedorId(matchingProv.id);
            }
          }
        }

        // Mapear partidas extraídas al Staging del inventario
        const mappedItems: FacturaItemStaging[] = extraction.partidas_extraidas.map((item, idx) => {
          const iaClass = item.clasificacion_ia;
          
          // Buscar coincidencia exacta o lógica por nombre oficial
          let suggestedProd = null;
          if (iaClass.producto_normalizado) {
            suggestedProd = productos.find(p => 
              p.activo && p.nombre_oficial.toLowerCase().trim() === iaClass.producto_normalizado?.toLowerCase().trim()
            );
          }

          // Si no hay coincidencia exacta de nombre, intentar coincidir parcialmente
          if (!suggestedProd && iaClass.producto_normalizado) {
            suggestedProd = productos.find(p => 
              p.activo && p.nombre_oficial.toLowerCase().includes(iaClass.producto_normalizado!.toLowerCase())
            );
          }

          const esNuevo = !suggestedProd || iaClass.requiere_revision || iaClass.confianza_mapeo < 0.80;

          // Buscar coincidencia lógica de categoría
          const suggestedCat = categorias.find(c => 
            c.nombre.toLowerCase().trim() === iaClass.categoria_maestra?.toLowerCase().trim()
          );

          return {
            id: `item-${idx}-${Date.now()}`,
            nombreFactura: item.descripcion_proveedor,
            cantidad: item.cantidad,
            precioUnitario: item.precio_unitario,
            productoIdSugerido: suggestedProd?.id,
            esNuevoProducto: esNuevo,
            categoriaSeleccionadaId: suggestedCat?.id || categorias[0]?.id,
          };
        });

        setStagingItems(mappedItems);
      } else {
        throw new Error('La respuesta del servicio de IA no contiene partidas extraídas.');
      }
    } catch (err: any) {
      console.error('Error al procesar factura con IA:', err);
      Alert.alert('Error de Extracción', err.message || 'No se pudo procesar la factura con Inteligencia Artificial.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpdateStagingItem = (id: string, updates: Partial<FacturaItemStaging>) => {
    setStagingItems(prev =>
      prev.map(item => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const handleSaveAIImport = async () => {
    if (!selectedProveedorId) {
      Alert.alert('Validación', 'Por favor selecciona un Proveedor.');
      return;
    }
    if (!folioFactura.trim()) {
      Alert.alert('Validación', 'Por favor ingresa el Folio de la Factura.');
      return;
    }
    if (stagingItems.length === 0) {
      Alert.alert('Validación', 'No hay ítems para procesar.');
      return;
    }

    setIsSavingAIImport(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData?.user?.id || null;

      // Procesar cada ítem del staging
      for (const item of stagingItems) {
        let finalProductoId = item.productoIdSugerido;

        if (item.esNuevoProducto) {
          // 1. Crear nuevo producto en DB
          const generatedSku = 'SKU-AI-' + Math.random().toString(36).substring(3, 8).toUpperCase();
          const { data: newProd, error: newProdErr } = await supabase
            .from('productos')
            .insert([
              {
                sku_interno: generatedSku,
                nombre_oficial: item.nombreFactura,
                categoria_id: item.categoriaSeleccionadaId || categorias[0]?.id,
                stock_actual: item.cantidad,
                activo: true,
              },
            ])
            .select()
            .single();

          if (newProdErr) throw newProdErr;
          finalProductoId = newProd.id;

          // 2. Registrar alias proveedor
          await supabase.from('alias_proveedor_producto').insert([
            {
              proveedor_id: selectedProveedorId,
              producto_id: finalProductoId,
              nombre_segun_proveedor: item.nombreFactura,
            },
          ]);
        } else if (finalProductoId) {
          // 1. Actualizar el stock del producto existente
          const prodObj = productos.find(p => p.id === finalProductoId);
          const currentStock = prodObj ? prodObj.stock_actual : 0;

          const { error: stockErr } = await supabase
            .from('productos')
            .update({ stock_actual: currentStock + item.cantidad })
            .eq('id', finalProductoId);

          if (stockErr) throw stockErr;

          // 2. Registrar alias (si no existe ya)
          const { data: aliasExists } = await supabase
            .from('alias_proveedor_producto')
            .select('id')
            .eq('proveedor_id', selectedProveedorId)
            .eq('nombre_segun_proveedor', item.nombreFactura)
            .maybeSingle();

          if (!aliasExists) {
            await supabase.from('alias_proveedor_producto').insert([
              {
                proveedor_id: selectedProveedorId,
                producto_id: finalProductoId,
                nombre_segun_proveedor: item.nombreFactura,
              },
            ]);
          }
        }

        // 3. Crear movimiento de inventario (ENTRADA)
        if (finalProductoId) {
          await supabase.from('movimientos_inventario').insert([
            {
              producto_id: finalProductoId,
              tipo: 'ENTRADA',
              cantidad: item.cantidad,
              folio_factura: folioFactura.trim(),
              proveedor_id: selectedProveedorId,
              creado_por: currentUserId,
            },
          ]);
        }
      }

      Alert.alert('Éxito', 'Inventario actualizado correctamente.');
      setStagingItems([]);
      setFolioFactura('');
      setSelectedProveedorId('');
      setActiveTab('catalogo');
      await loadAllData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar la importación.');
    } finally {
      setIsSavingAIImport(false);
    }
  };

  // Filtrado de catálogo
  const filteredProducts = productos.filter(p => {
    if (!p.activo) return false;
    const matchesSearch =
      p.nombre_oficial.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku_interno.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategoryFilter ? p.categoria_id === selectedCategoryFilter : true;
    return matchesSearch && matchesCat;
  });

  const activeCategoryName = categorias.find(c => c.id === selectedCategoryFilter)?.nombre;
  const activeFormCategoryName = categorias.find(c => c.id === formCategoriaId)?.nombre;
  const activeProveedorName = proveedores.find(p => p.id === selectedProveedorId)?.nombre;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(admin)/dashboard')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Control de Inventario</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={[
        styles.selectorsContainer,
        {
          paddingHorizontal: isMobile ? Spacing.two : Spacing.four,
          gap: isMobile ? 6 : Spacing.one,
        }
      ]}>
        <TouchableOpacity
          onPress={() => setActiveTab('catalogo')}
          style={[
            styles.selectorBtn,
            activeTab === 'catalogo'
              ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
              : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
          ]}
        >
          <Text
            style={[
              styles.selectorText,
              {
                color: activeTab === 'catalogo' ? '#ffffff' : themeColors.textSecondary,
                fontSize: isMobile ? 9.5 : 11,
              }
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            Catálogo
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('ia-import')}
          style={[
            styles.selectorBtn,
            activeTab === 'ia-import'
              ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
              : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
          ]}
        >
          <Text
            style={[
              styles.selectorText,
              {
                color: activeTab === 'ia-import' ? '#ffffff' : themeColors.textSecondary,
                fontSize: isMobile ? 9.5 : 11,
              }
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            Importación IA
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('consumo')}
          style={[
            styles.selectorBtn,
            activeTab === 'consumo'
              ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
              : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
          ]}
        >
          <Text
            style={[
              styles.selectorText,
              {
                color: activeTab === 'consumo' ? '#ffffff' : themeColors.textSecondary,
                fontSize: isMobile ? 9.5 : 11,
              }
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            Consumo
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('categorias')}
          style={[
            styles.selectorBtn,
            activeTab === 'categorias'
              ? { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
              : { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
          ]}
        >
          <Text
            style={[
              styles.selectorText,
              {
                color: activeTab === 'categorias' ? '#ffffff' : themeColors.textSecondary,
                fontSize: isMobile ? 9.5 : 11,
              }
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            Categorías
          </Text>
        </TouchableOpacity>
      </View>

      {/* VISTA 1: CATÁLOGO */}
      {activeTab === 'catalogo' && (
        <View style={{ flex: 1 }}>
          <View style={styles.filterSection}>
            <CustomInput
              placeholder="Buscar por nombre o SKU..."
              value={searchTerm}
              onChangeText={setSearchTerm}
              iconName="search-outline"
              style={{ marginBottom: Spacing.one }}
            />

            {/* Selector de Categoría */}
            <View style={styles.customDropdownContainer}>
              <TouchableOpacity
                style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                onPress={openCategoryFilter}
              >
                <Text style={{ color: selectedCategoryFilter ? themeColors.text : themeColors.textSecondary }}>
                  {activeCategoryName || 'Filtrar por Categoría'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={themeColors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {isLoading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={themeColors.accent} />
              <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.one }}>Cargando catálogo...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredProducts}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const cat = categorias.find(c => c.id === item.categoria_id);
                return (
                  <View style={[styles.listItem, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.skuText}>{item.sku_interno}</Text>
                      <Text style={[styles.itemText, { color: themeColors.text }]}>{item.nombre_oficial}</Text>
                      <Text style={[styles.itemSubtext, { color: themeColors.textSecondary }]}>
                        {cat ? cat.nombre : 'Sin Categoría'}
                      </Text>
                      <Text
                        style={[
                          styles.stockText,
                          { color: item.stock_actual < 10 ? themeColors.danger : themeColors.success },
                        ]}
                      >
                        Stock: {item.stock_actual} piezas
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'center' }}>
                      {/* Ajuste rápido de stock */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4, gap: 4 }}>
                        <TextInput
                          style={[
                            styles.quickStockInput,
                            { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background },
                          ]}
                          placeholder="+"
                          placeholderTextColor={themeColors.textSecondary}
                          keyboardType="numeric"
                          value={quickStockAdjustments[item.id] || ''}
                          onChangeText={txt => setQuickStockAdjustments(prev => ({ ...prev, [item.id]: txt }))}
                        />
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => handleQuickAddStock(item)}
                          style={[styles.quickStockBtn, { backgroundColor: themeColors.success }]}
                        >
                          <Ionicons name="add" size={14} color="#ffffff" />
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity onPress={() => handleOpenEditModal(item)}>
                        <Ionicons name="create-outline" size={20} color={themeColors.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleSoftDeleteProduct(item)}>
                        <Ionicons name="trash-outline" size={20} color={themeColors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="cube-outline" size={48} color={themeColors.textSecondary} />
                  <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                    No hay productos en inventario que coincidan.
                  </Text>
                </View>
              }
              refreshing={isLoading}
              onRefresh={loadAllData}
            />
          )}

          {/* FAB agregar */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleOpenCreateModal}
            style={[styles.fab, { backgroundColor: themeColors.accent }]}
          >
            <Ionicons name="add" size={28} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}

      {/* VISTA 2: IMPORTACIÓN POR IA */}
       {activeTab === 'ia-import' && (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Extraer Factura con IA</Text>
          <Text style={[styles.description, { color: themeColors.textSecondary }]}>
            Sube un PDF de factura o imagen de recibo para extraer los productos, su cantidad y mapear su SKU en tu catálogo oficial mediante IA.
          </Text>

          {isAnalyzing ? (
            <View style={styles.analyzingCard}>
              <ActivityIndicator size="large" color={themeColors.warning} />
              <Text style={[styles.analyzingText, { color: themeColors.text }]}>
                Analizando archivo mediante IA...
              </Text>
            </View>
          ) : stagingItems.length === 0 ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handlePickDocument}
              style={[styles.dropzone, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}
            >
              <Ionicons name="document-attach-outline" size={42} color={themeColors.accent} />
              <Text style={[styles.dropzoneText, { color: themeColors.text }]}>Seleccionar Factura (PDF o Imagen)</Text>
              <Text style={[styles.dropzoneSub, { color: themeColors.textSecondary }]}>
                Formatos soportados: PDF, JPEG, PNG, WEBP
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ gap: Spacing.two }}>
              <View style={[styles.metadataCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                {/* Seleccionar Proveedor */}
                <View style={styles.customDropdownContainer}>
                  <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Proveedor *</Text>
                  <TouchableOpacity
                    style={[styles.dropdownTrigger, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                    onPress={openProveedorSelector}
                  >
                    <Text style={{ color: selectedProveedorId ? themeColors.text : themeColors.textSecondary }}>
                      {activeProveedorName || 'Selecciona el emisor'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={themeColors.text} />
                  </TouchableOpacity>
                </View>

                {/* Folio Factura */}
                <CustomInput
                  label="Folio de Factura *"
                  placeholder="Ej. FACT-2023"
                  value={folioFactura}
                  onChangeText={setFolioFactura}
                />
              </View>

              <Text style={[styles.subTitle, { color: themeColors.text }]}>Borrador de Staging Extraído:</Text>

              {stagingItems.map(item => (
                <View
                  key={item.id}
                  style={[styles.stagingItemCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                >
                  <Text style={[styles.stagingName, { color: themeColors.text }]}>{item.nombreFactura}</Text>
                  
                  <View style={styles.stagingFieldsRow}>
                    <View style={{ flex: 1 }}>
                      <CustomInput
                        label="Cantidad"
                        keyboardType="numeric"
                        value={item.cantidad.toString()}
                        onChangeText={txt => handleUpdateStagingItem(item.id, { cantidad: parseInt(txt, 10) || 0 })}
                      />
                    </View>
                    <View style={{ flex: 1.2 }}>
                      <CustomInput
                        label="Precio Unit."
                        keyboardType="numeric"
                        value={item.precioUnitario.toString()}
                        onChangeText={txt => handleUpdateStagingItem(item.id, { precioUnitario: parseFloat(txt) || 0 })}
                      />
                    </View>
                  </View>

                  <View style={{ marginTop: Spacing.one }}>
                    {item.esNuevoProducto ? (
                      <View style={styles.newProductContainer}>
                        <View style={styles.badgeNew}>
                          <Text style={styles.badgeNewText}>NUEVO PRODUCTO</Text>
                        </View>
                        {/* Dropdown de Categoría */}
                        <View style={{ marginTop: Spacing.one }}>
                          <Text style={[styles.dropdownLabel, { color: themeColors.text, fontSize: 11 }]}>Categoría Asignada</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
                            {categorias.map(cat => {
                              const isSelected = item.categoriaSeleccionadaId === cat.id;
                              return (
                                <TouchableOpacity
                                  key={cat.id}
                                  onPress={() => handleUpdateStagingItem(item.id, { categoriaSeleccionadaId: cat.id })}
                                  style={[
                                    styles.catChip,
                                    isSelected
                                      ? { backgroundColor: themeColors.accent }
                                      : { backgroundColor: themeColors.background, borderColor: themeColors.border },
                                  ]}
                                >
                                  <Text style={[styles.catChipText, { color: isSelected ? '#fff' : themeColors.text }]}>
                                    {cat.nombre.substring(0, 15)}...
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.mappingContainer}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text style={[styles.dropdownLabel, { color: themeColors.text, fontSize: 11 }]}>Mapear con Catálogo:</Text>
                          <TouchableOpacity
                            onPress={() => openProductSelectorForStaging(item.id)}
                            style={{ padding: 4 }}
                          >
                            <Ionicons name="search" size={16} color={themeColors.accent} />
                          </TouchableOpacity>
                        </View>

                        {item.productoIdSugerido ? (
                          (() => {
                            const selectedProd = productos.find(p => p.id === item.productoIdSugerido);
                            return (
                              <View style={[styles.mappedProductRow, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}>
                                <View style={{ flex: 1, paddingRight: 8 }}>
                                  <Text style={[styles.mappedProductTitle, { color: themeColors.text }]} numberOfLines={1}>
                                    {selectedProd ? selectedProd.nombre_oficial : 'Producto No Encontrado'}
                                  </Text>
                                  <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>
                                    SKU: {selectedProd ? selectedProd.sku_interno : '-'}
                                  </Text>
                                </View>
                                <TouchableOpacity
                                  onPress={() => handleUpdateStagingItem(item.id, { productoIdSugerido: undefined })}
                                >
                                  <Ionicons name="close-circle" size={18} color={themeColors.danger} />
                                </TouchableOpacity>
                              </View>
                            );
                          })()
                        ) : (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            style={[styles.searchPlaceholderBtn, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}
                            onPress={() => openProductSelectorForStaging(item.id)}
                          >
                            <Ionicons name="search-outline" size={15} color={themeColors.textSecondary} />
                            <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginLeft: 6 }}>
                              Buscar producto en el catálogo...
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    onPress={() => handleUpdateStagingItem(item.id, { esNuevoProducto: !item.esNuevoProducto })}
                    style={styles.toggleStagingBtn}
                  >
                    <Text style={{ color: themeColors.accent, fontWeight: '700', fontSize: 12 }}>
                      {item.esNuevoProducto ? 'Asociar a Producto Existente' : 'Registrar como Nuevo Producto'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}

              <View style={styles.stagingActions}>
                <CustomButton
                  title="Cancelar y Descartar"
                  variant="danger"
                  onPress={() => setStagingItems([])}
                  style={{ flex: 1 }}
                />
                <CustomButton
                  title="Procesar y Guardar"
                  variant="success"
                  loading={isSavingAIImport}
                  onPress={handleSaveAIImport}
                  style={{ flex: 1.5 }}
                />
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* VISTA 3: CATEGORÍAS */}
      {activeTab === 'categorias' && (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 80 }]} keyboardShouldPersistTaps="handled">
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Categorías de Productos</Text>
            <Text style={[styles.description, { color: themeColors.textSecondary }]}>
              Visualiza el catálogo de categorías de productos y el volumen total de artículos asociados a cada una.
            </Text>

            {/* Listado de Categorías */}
            <Text style={[styles.subTitle, { color: themeColors.text, marginTop: Spacing.one }]}>
              Categorías y Volúmenes de Productos:
            </Text>
            {categorias.map(cat => {
              const count = productos.filter(p => p.categoria_id === cat.id && p.activo).length;
              return (
                <View
                  key={cat.id}
                  style={[styles.categoryInfoRow, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                >
                  <Text style={[styles.categoryName, { color: themeColors.text }]}>{cat.nombre}</Text>
                  <View style={[styles.countBadge, { backgroundColor: themeColors.accent + '20' }]}>
                    <Text style={{ color: themeColors.accent, fontSize: 12, fontWeight: '800' }}>
                      {count} {count === 1 ? 'producto' : 'productos'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Botones de Acción Rápida Flotantes */}
          <View style={styles.floatingActionRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setNewCatModalVisible(true)}
              style={[styles.floatingActionBtn, { backgroundColor: themeColors.accent }]}
            >
              <Text style={styles.floatingActionBtnText}>➕ Categoría</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setNewProvModalVisible(true)}
              style={[styles.floatingActionBtn, { backgroundColor: themeColors.accent }]}
            >
              <Text style={styles.floatingActionBtnText}>➕ Proveedor</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* VISTA 4: REGISTRAR CONSUMO */}
      {activeTab === 'consumo' && (
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => { setShowCliDropdown(false); setClienteSearch(''); }} style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Registrar Consumo de Materiales</Text>
            <Text style={[styles.description, { color: themeColors.textSecondary }]}>
              Genera un ticket de consumo para restar del inventario los productos y cantidades utilizados en un trabajo o servicio.
            </Text>

            {/* Formulario de Metadatos */}
            <View style={[styles.innerCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, marginBottom: Spacing.two, padding: Spacing.two }]}>
              <View style={styles.customDropdownContainer}>
                <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Cliente o Referencia del Trabajo *</Text>
                <TouchableOpacity
                  style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowCliDropdown(!showCliDropdown);
                  }}
                >
                  <Text style={{ color: consumoCliente ? themeColors.text : themeColors.textSecondary }}>
                    {consumoCliente || 'Selecciona o escribe un cliente'}
                  </Text>
                  <Ionicons name={showCliDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
                </TouchableOpacity>

                {showCliDropdown && (
                  <Pressable onPress={(e: any) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000 }}>
                    <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                      <CustomInput
                        placeholder="Buscar o agregar cliente..."
                        value={clienteSearch}
                        onChangeText={setClienteSearch}
                        iconName="search-outline"
                        style={{ margin: Spacing.one, height: 40 }}
                      />
                      <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                        {clienteSearch.trim().length > 0 && !clientes.some(c => c.nombre && c.nombre.toLowerCase() === clienteSearch.trim().toLowerCase()) && (
                          <TouchableOpacity
                            style={[styles.dropdownItem, { backgroundColor: themeColors.accent + '15', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
                            onPress={() => handleAddNewCliente(clienteSearch)}
                          >
                            <Ionicons name="add-circle-outline" size={24} color={themeColors.accent} />
                            <Text style={{ color: themeColors.accent, fontWeight: '600', flex: 1 }}>
                              {`Agregar "${clienteSearch.trim()}"`}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {clientes
                          .filter(cli => cli.nombre && cli.nombre.toLowerCase().includes(clienteSearch.toLowerCase()))
                          .map((cli, index, array) => (
                            <TouchableOpacity
                              key={cli.id}
                              style={[
                                styles.dropdownItem,
                                index === array.length - 1 && { borderBottomWidth: 0 },
                                  { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }
                              ]}
                              onPress={() => {
                                setConsumoCliente(cli.nombre);
                                setClienteSearch('');
                                setShowCliDropdown(false);
                              }}
                            >
                              <Ionicons name="person-circle-outline" size={24} color={themeColors.primary} />
                              <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{cli.nombre}</Text>
                            </TouchableOpacity>
                          ))}
                      </ScrollView>
                    </View>
                  </Pressable>
                )}
              </View>
            </View>

          {/* Botón para agregar producto */}
          <CustomButton
            title="➕ Seleccionar Producto"
            onPress={openProductSelectorForConsumo}
            style={{ marginBottom: Spacing.two }}
          />

          <Text style={[styles.subTitle, { color: themeColors.text, marginBottom: Spacing.one }]}>
            Artículos a Descontar del Inventario:
          </Text>

          {consumoItems.length === 0 ? (
            <View style={[styles.emptyContainer, { paddingVertical: Spacing.four }]}>
              <Ionicons name="cart-outline" size={48} color={themeColors.textSecondary} />
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                No has agregado productos a la lista de consumo.
              </Text>
            </View>
          ) : (
            <View style={{ gap: Spacing.two }}>
              {consumoItems.map(item => {
                const prod = productos.find(p => p.id === item.productoId);
                return (
                  <View
                    key={item.id}
                    style={[styles.stagingItemCard, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={[styles.stagingName, { color: themeColors.text }]}>
                          {prod ? prod.nombre_oficial : 'Producto desconocido'}
                        </Text>
                        <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}>
                          SKU: {prod ? prod.sku_interno : '-'} | Disponible: {prod ? prod.stock_actual : 0} pzas
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => handleRemoveConsumoItem(item.id)}>
                        <Ionicons name="trash-outline" size={20} color={themeColors.danger} />
                      </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: Spacing.one, gap: Spacing.two }}>
                      <View style={{ flex: 1 }}>
                        <CustomInput
                          label="Cantidad a consumir"
                          keyboardType="numeric"
                          value={item.cantidad > 0 ? item.cantidad.toString() : ''}
                          onChangeText={txt => handleUpdateConsumoItemQty(item.id, parseInt(txt, 10) || 0)}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}

              <CustomButton
                title="Procesar y Descontar Inventario"
                variant="success"
                loading={isSavingConsumo}
                onPress={handleSaveConsumo}
                style={{ marginTop: Spacing.two }}
              />
            </View>
          )}

          {/* Historial de Consumos Recientes */}
          <View style={{ marginTop: Spacing.four, borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: Spacing.three }}>
            <Text style={[styles.subTitle, { color: themeColors.text, marginBottom: Spacing.two }]}>
              Historial de Consumos Recientes
            </Text>

            {historialConsumo.length === 0 ? (
              <View style={[styles.emptyContainer, { paddingVertical: Spacing.three, backgroundColor: themeColors.backgroundElement, borderRadius: BorderRadius.medium }]}>
                <Ionicons name="time-outline" size={32} color={themeColors.textSecondary} />
                <Text style={[styles.emptyText, { color: themeColors.textSecondary, fontSize: 13, marginTop: 4 }]}>
                  No hay registros de consumo anteriores.
                </Text>
              </View>
            ) : (
              <View style={{ gap: Spacing.one }}>
                {historialConsumo.map(item => {
                  const dateStr = item.fecha ? item.fecha.split('T')[0] : '';
                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.listItem,
                        {
                          backgroundColor: themeColors.backgroundElement,
                          borderColor: themeColors.border,
                          padding: Spacing.two,
                          marginBottom: 0,
                        }
                      ]}
                    >
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }} numberOfLines={1}>
                          {item.producto ? item.producto.nombre_oficial : 'Producto Eliminado'}
                        </Text>
                        <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 4 }}>
                          Ref: {item.folio_factura || 'N/A'} | Fecha: {dateStr}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: themeColors.danger + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.small }}>
                        <Text style={{ color: themeColors.danger, fontSize: 12, fontWeight: '800' }}>
                          -{item.cantidad} pzas
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </Pressable>
      </ScrollView>
    )}

      {/* ========== MODAL CRUD MANUAL ========== */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={crudModalVisible}
        onRequestClose={() => setCrudModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '70%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                {editingProduct ? 'Modificar Producto' : 'Nuevo Producto'}
              </Text>
              <TouchableOpacity onPress={() => setCrudModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.two }} keyboardShouldPersistTaps="handled">
              <CustomInput
                label="SKU Interno *"
                placeholder="Ej. SOL-REN-640W"
                value={formSku}
                onChangeText={setFormSku}
                autoCapitalize="characters"
              />

              <CustomInput
                label="Nombre Oficial *"
                placeholder="Ej. Panel Solar Renesola N-Type..."
                value={formNombre}
                onChangeText={setFormNombre}
              />

              {/* Selector de Categoría en Formulario */}
              <View style={styles.customDropdownContainer}>
                <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Categoría *</Text>
                <TouchableOpacity
                  style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
                  onPress={openFormCatSelector}
                >
                  <Text style={{ color: formCategoriaId ? themeColors.text : themeColors.textSecondary }}>
                    {activeFormCategoryName || 'Selecciona la categoría'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={themeColors.text} />
                </TouchableOpacity>
              </View>

              <CustomInput
                label="Stock Inicial *"
                keyboardType="numeric"
                value={formStock}
                onChangeText={setFormStock}
              />

              <CustomButton
                title={editingProduct ? 'Guardar Cambios' : 'Dar de Alta'}
                onPress={handleSaveProduct}
                loading={isSavingProduct}
                style={{ marginTop: Spacing.two }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========== CENTRALIZED SELECTOR MODAL ========== */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={selectorVisible}
        onRequestClose={() => setSelectorVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '60%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>{selectorTitle}</Text>
              <TouchableOpacity onPress={() => setSelectorVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <CustomInput
              placeholder="Buscar..."
              value={selectorSearch}
              onChangeText={setSelectorSearch}
              iconName="search-outline"
              style={{ marginBottom: Spacing.two }}
            />

            <FlatList
              data={filteredSelectorOptions}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: Spacing.four }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.dropdownItem, { borderBottomColor: themeColors.border }]}
                  onPress={() => {
                    onSelectOption(item.id);
                    setSelectorVisible(false);
                  }}
                >
                  <Text style={{ color: themeColors.text, fontSize: 14, paddingVertical: 4 }}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', padding: Spacing.four }}>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>
                    No se encontraron opciones.
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* ========== MODAL NUEVA CATEGORÍA ========== */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={newCatModalVisible}
        onRequestClose={() => setNewCatModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '55%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Nueva Categoría</Text>
              <TouchableOpacity onPress={() => setNewCatModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.two }} keyboardShouldPersistTaps="handled">
              <CustomInput
                label="Nombre de Categoría *"
                placeholder="Ej. Conexiones Especiales"
                value={newCatNombre}
                onChangeText={setNewCatNombre}
              />
              <CustomInput
                label="Descripción (Opcional)"
                placeholder="Ej. Coples, reducciones y sellos"
                value={newCatDesc}
                onChangeText={setNewCatDesc}
              />

              <CustomButton
                title="Guardar Categoría"
                onPress={handleCreateCategory}
                loading={isSavingNewCat}
                style={{ marginTop: Spacing.two }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ========== MODAL NUEVO PROVEEDOR ========== */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={newProvModalVisible}
        onRequestClose={() => setNewProvModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: '55%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Nuevo Proveedor</Text>
              <TouchableOpacity onPress={() => setNewProvModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.two }} keyboardShouldPersistTaps="handled">
              <CustomInput
                label="Nombre o Razón Social *"
                placeholder="Ej. Materiales Eléctricos del Norte S.A."
                value={newProvNombre}
                onChangeText={setNewProvNombre}
              />
              <CustomInput
                label="RFC (Opcional)"
                placeholder="Ej. MEN120415XYZ"
                value={newProvRfc}
                onChangeText={setNewProvRfc}
                autoCapitalize="characters"
              />

              <CustomButton
                title="Guardar Proveedor"
                onPress={handleCreateProveedor}
                loading={isSavingNewProv}
                style={{ marginTop: Spacing.two }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  backBtn: {
    padding: Spacing.one,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  selectorsContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  selectorBtn: {
    flex: 1,
    height: 40,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectorText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  filterSection: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    zIndex: 20,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.seven,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.two,
  },
  skuText: {
    fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace', web: 'monospace' }),
    fontSize: 11,
    fontWeight: '700',
    color: '#ffc107',
    textTransform: 'uppercase',
  },
  itemText: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemSubtext: {
    fontSize: 11,
    marginTop: 1,
  },
  stockText: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.seven,
    gap: Spacing.two,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: Spacing.four,
    right: Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  floatingActionRow: {
    position: 'absolute',
    bottom: Spacing.four,
    left: Spacing.four,
    right: Spacing.four,
    flexDirection: 'row',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  floatingActionBtn: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.medium,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  floatingActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  mappedProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    marginTop: Spacing.one,
  },
  mappedProductTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  searchPlaceholderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: Spacing.one,
  },
  quickStockInput: {
    width: 45,
    height: 32,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 4,
    textAlign: 'center',
    fontSize: 12,
  },
  quickStockBtn: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.small,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.three,
  },
  dropzone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.medium,
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  dropzoneText: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
  },
  dropzoneSub: {
    fontSize: 12,
  },
  analyzingCard: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  analyzingText: {
    fontSize: 14,
    fontWeight: '700',
  },
  metadataCard: {
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    gap: Spacing.two,
    zIndex: 30,
  },
  subTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: Spacing.one,
  },
  stagingItemCard: {
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.two,
    gap: Spacing.one,
  },
  stagingName: {
    fontSize: 13,
    fontWeight: '800',
  },
  stagingFieldsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: 4,
  },
  newProductContainer: {
    backgroundColor: 'rgba(255, 193, 7, 0.05)',
    padding: Spacing.two,
    borderRadius: BorderRadius.small,
    borderWidth: 0.5,
    borderColor: '#ffc107',
  },
  badgeNew: {
    backgroundColor: '#ffc107',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.small,
    alignSelf: 'flex-start',
  },
  badgeNewText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '900',
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  catChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  mappingContainer: {
    backgroundColor: 'rgba(76, 175, 80, 0.05)',
    padding: Spacing.two,
    borderRadius: BorderRadius.small,
    borderWidth: 0.5,
    borderColor: '#4caf50',
  },
  toggleStagingBtn: {
    marginTop: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  stagingActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  innerCard: {
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    zIndex: 10,
  },
  innerCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: Spacing.two,
  },
  categoryInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.one,
  },
  categoryName: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
  },
  // Modal de Dropdowns y selectores
  customDropdownContainer: {
    position: 'relative',
    zIndex: 5,
  },
  dropdownLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: Spacing.half,
  },
  dropdownTrigger: {
    height: 48,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  dropdownList: {
    position: 'relative',
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  dropdownItem: {
    padding: Spacing.two,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.large,
    borderTopRightRadius: BorderRadius.large,
    padding: Spacing.four,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
});
