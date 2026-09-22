import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
  useWindowDimensions,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AuthService } from '@/services/supabase';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';

import CustomButton from '@/components/CustomButton';

type InventarioItem = {
  id: string;
  producto_id: string;
  cantidad_disponible: number;
  producto: {
    id?: string;
    nombre_oficial: string;
    sku_interno: string;
    unidad?: string;
    stock_actual?: number;
    stock_nuevo?: number;
    stock_usado?: number;
    stock_por_revisar?: number;
  };
};

type MaterialDevolucion = {
  productoId: string;
  nombre: string;
  sku: string;
  unidad: string;
  maximo: number;
  stock_nuevo: number;
  stock_usado: number;
  stock_por_revisar: number;
  hasUsedOrDamaged: boolean;
  devolver_nuevo: number | '';
  devolver_usado: number | '';
  devolver_por_revisar: number | '';
  devolver: number;
};

export default function DevolucionesEmpleadoScreen() {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [inventario, setInventario] = useState<InventarioItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Lista de materiales a devolver
  const [materialesDevolver, setMaterialesDevolver] = useState<MaterialDevolucion[]>([]);
  
  // Estado para controlar menús de cascada colapsables (inicialmente cerrados)
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [observaciones, setObservaciones] = useState('');

  useEffect(() => {
    const init = async () => {
      const user = await AuthService.getCurrentUser();
      if (!user) {
        router.replace('/');
        return;
      }
      setCurrentUser(user);
      await loadInventario(user.id);
    };
    init();
  }, []);

  const loadInventario = async (userId: string) => {
    try {
      setIsLoading(true);
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/devoluciones/inventario?userId=${userId}`, { headers });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[loadInventario Error]', res.status, errorText);
        throw new Error(errorText || 'Error al cargar inventario');
      }
      const json = await res.json();
      const data = json.inventario;

      setInventario((data as any) || []);
      
      // Inicializar el arreglo de devolución con detección de existencias en usado/dañado
      if (data) {
        const initial: MaterialDevolucion[] = data.map((item: any) => {
          const prodObj = Array.isArray(item.producto) ? item.producto[0] : item.producto;
          const sNuevo = Number(prodObj?.stock_nuevo) || 0;
          const sUsado = Number(prodObj?.stock_usado) || 0;
          const sPorRev = Number(prodObj?.stock_por_revisar) || 0;
          const hasUsedOrDamaged = sUsado > 0 || sPorRev > 0;

          return {
            productoId: item.producto_id,
            nombre: prodObj?.nombre_oficial || 'Desconocido',
            sku: prodObj?.sku_interno || '',
            unidad: prodObj?.unidad || 'pza',
            maximo: Number(item.cantidad_disponible) || 0,
            stock_nuevo: sNuevo,
            stock_usado: sUsado,
            stock_por_revisar: sPorRev,
            hasUsedOrDamaged,
            devolver_nuevo: '',
            devolver_usado: '',
            devolver_por_revisar: '',
            devolver: 0
          };
        });
        setMaterialesDevolver(initial);
      }
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', 'No se pudo cargar el inventario personal.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDirectQtyChange = (idx: number, textOrNum: number | string) => {
    setMaterialesDevolver(prev => {
      const copy = [...prev];
      const item = { ...copy[idx] };
      
      let val: number = 0;
      if (typeof textOrNum === 'number') {
        val = textOrNum;
      } else {
        if (textOrNum.trim() === '') val = 0;
        else {
          const parsed = parseFloat(textOrNum.replace(/[^0-9.]/g, ''));
          val = isNaN(parsed) ? 0 : parsed;
        }
      }

      val = Math.max(0, val);
      if (val > item.maximo) {
        Alert.alert('Límite Superado', `No puedes devolver más de los ${item.maximo} ${item.unidad} disponibles.`);
        val = item.maximo;
      }

      const nUsado = typeof item.devolver_usado === 'number' ? item.devolver_usado : 0;
      const nPorRev = typeof item.devolver_por_revisar === 'number' ? item.devolver_por_revisar : 0;

      if (nUsado === 0 && nPorRev === 0) {
        item.devolver_nuevo = val > 0 ? val : '';
        item.devolver = val;
      } else {
        const rem = Math.max(0, val - (nUsado + nPorRev));
        item.devolver_nuevo = rem > 0 ? rem : '';
        item.devolver = val;
      }

      copy[idx] = item;
      return copy;
    });
  };

  const handleUpdateCondition = (
    idx: number, 
    field: 'devolver_nuevo' | 'devolver_usado' | 'devolver_por_revisar', 
    val: number | ''
  ) => {
    setMaterialesDevolver(prev => {
      const copy = [...prev];
      const item = { ...copy[idx] };

      let numVal: number | '' = val;
      if (typeof val === 'number') {
        if (val < 0) numVal = 0;
      }

      item[field] = numVal;

      const nNuevo = typeof item.devolver_nuevo === 'number' ? item.devolver_nuevo : 0;
      const nUsado = typeof item.devolver_usado === 'number' ? item.devolver_usado : 0;
      const nPorRev = typeof item.devolver_por_revisar === 'number' ? item.devolver_por_revisar : 0;
      const sum = Math.round((nNuevo + nUsado + nPorRev) * 100) / 100;

      if (sum > item.maximo) {
        Alert.alert(
          'Límite Superado', 
          `No puedes devolver más de los ${item.maximo} ${item.unidad} que tienes disponibles en tu inventario.`
        );
        return prev;
      }

      item.devolver = sum;
      copy[idx] = item;
      return copy;
    });
  };

  const handleSetAllCondition = (
    idx: number, 
    field: 'devolver_nuevo' | 'devolver_usado' | 'devolver_por_revisar'
  ) => {
    setMaterialesDevolver(prev => {
      const copy = [...prev];
      const item = { ...copy[idx] };
      item.devolver_nuevo = '';
      item.devolver_usado = '';
      item.devolver_por_revisar = '';
      item[field] = item.maximo;
      item.devolver = item.maximo;
      copy[idx] = item;
      return copy;
    });
  };

  const handleClearItem = (idx: number) => {
    setMaterialesDevolver(prev => {
      const copy = [...prev];
      const item = { ...copy[idx] };
      item.devolver_nuevo = '';
      item.devolver_usado = '';
      item.devolver_por_revisar = '';
      item.devolver = 0;
      copy[idx] = item;
      return copy;
    });
  };

  const handleEnviarDevolucion = async () => {
    const aDevolver = materialesDevolver
      .filter(m => m.devolver > 0)
      .map(m => {
        const nNuevo = typeof m.devolver_nuevo === 'number' ? m.devolver_nuevo : 0;
        const nUsado = typeof m.devolver_usado === 'number' ? m.devolver_usado : 0;
        const nPorRev = typeof m.devolver_por_revisar === 'number' ? m.devolver_por_revisar : 0;

        // Si no se desglosó por condición, todo el valor devuelto se asigna por defecto a nuevo
        const finalNuevo = (nNuevo === 0 && nUsado === 0 && nPorRev === 0) ? m.devolver : nNuevo;

        return {
          productoId: m.productoId,
          nombre: m.nombre,
          sku: m.sku,
          unidad: m.unidad,
          maximo: m.maximo,
          devolver: m.devolver,
          devolver_nuevo: finalNuevo,
          devolver_usado: nUsado,
          devolver_por_revisar: nPorRev,
        };
      });

    if (aDevolver.length === 0) {
      Alert.alert('Validación', 'Debes indicar al menos un material con cantidad mayor a 0 para devolver.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        empleado_id: currentUser.id,
        empleado_nombre: currentUser.nombre,
        materiales: JSON.stringify(aDevolver),
        observaciones: observaciones.trim(),
        estado: 'PENDIENTE'
      };

      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/devoluciones/solicitar`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          payload,
          materiales: aDevolver
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Error al enviar la solicitud');
      }

      Alert.alert('Éxito', 'Tu solicitud de devolución ha sido enviada al administrador.');
      router.replace('/(empleado)/gastos');
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'No se pudo enviar la solicitud.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  const totalDevolverGeneral = materialesDevolver.reduce((acc, curr) => acc + (curr.devolver || 0), 0);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.text }]}>Devolución de Material</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            Indica los materiales que regresas al almacén. Si un producto cuenta con existencias usadas o dañadas, puedes desplegar el menú en cascada para desglosarlo.
          </Text>
        </View>

        {inventario.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <Ionicons name="cube-outline" size={48} color={themeColors.textSecondary} />
            <Text style={{ color: themeColors.textSecondary, marginTop: Spacing.two, textAlign: 'center' }}>
              No tienes material en tu inventario personal.
            </Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.three }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.text }}>
                Material en Camioneta ({inventario.length})
              </Text>
              {totalDevolverGeneral > 0 && (
                <View style={{ backgroundColor: themeColors.primary + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.primary }}>
                    Total a regresar: {totalDevolverGeneral}
                  </Text>
                </View>
              )}
            </View>

            {materialesDevolver.map((m, idx) => {
              const qNuevo = typeof m.devolver_nuevo === 'number' ? m.devolver_nuevo : 0;
              const qUsado = typeof m.devolver_usado === 'number' ? m.devolver_usado : 0;
              const qPorRev = typeof m.devolver_por_revisar === 'number' ? m.devolver_por_revisar : 0;
              const currentTotal = m.devolver || 0;
              const remainingToDevolve = Math.max(0, m.maximo - currentTotal);
              const isExpanded = !!expandedItems[m.productoId];

              return (
                <View 
                  key={m.productoId} 
                  style={[
                    styles.itemCard, 
                    { 
                      borderColor: currentTotal > 0 ? themeColors.primary : themeColors.border, 
                      backgroundColor: themeColors.background,
                      borderWidth: currentTotal > 0 ? 1.5 : 1
                    }
                  ]}
                >
                  {/* Encabezado del Producto */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 15 }}>{m.nombre}</Text>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginTop: 2 }}>
                        SKU: {m.sku || '-'} • En posesión: <Text style={{ fontWeight: 'bold', color: themeColors.primary }}>{m.maximo} {m.unidad}</Text>
                      </Text>
                    </View>

                    {currentTotal > 0 && (
                      <TouchableOpacity 
                        onPress={() => handleClearItem(idx)}
                        style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: themeColors.danger + '15' }}
                      >
                        <Text style={{ fontSize: 11, color: themeColors.danger, fontWeight: '700' }}>Limpiar</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Fila de Control Directo (Stepper Rápido y Limpio) */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: m.hasUsedOrDamaged ? 8 : 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: themeColors.text }}>
                      Cantidad a devolver:
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {currentTotal === 0 && (
                        <TouchableOpacity
                          style={[styles.quickAllChip, { borderColor: themeColors.primary, backgroundColor: themeColors.primary + '15' }]}
                          onPress={() => handleDirectQtyChange(idx, m.maximo)}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.primary }}>Todo ({m.maximo})</Text>
                        </TouchableOpacity>
                      )}

                      <View style={[styles.stepperContainer, { backgroundColor: themeColors.backgroundElement, borderColor: currentTotal > 0 ? themeColors.primary : themeColors.border }]}>
                        <TouchableOpacity
                          style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                          onPress={() => handleDirectQtyChange(idx, Math.max(0, currentTotal - 1))}
                          disabled={currentTotal <= 0}
                        >
                          <Ionicons name="remove" size={14} color={currentTotal > 0 ? themeColors.danger : themeColors.textSecondary} />
                        </TouchableOpacity>
                        
                        <TextInput
                          style={[styles.stepperInput, { color: themeColors.text }]}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                          value={currentTotal === 0 ? '' : String(currentTotal)}
                          placeholder="0"
                          placeholderTextColor={themeColors.textSecondary}
                          onChangeText={(val) => handleDirectQtyChange(idx, val)}
                        />

                        <TouchableOpacity
                          style={[styles.stepperBtn, { backgroundColor: themeColors.primary + '18' }]}
                          onPress={() => handleDirectQtyChange(idx, Math.min(m.maximo, currentTotal + 1))}
                          disabled={currentTotal >= m.maximo}
                        >
                          <Ionicons name="add" size={14} color={currentTotal < m.maximo ? themeColors.primary : themeColors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Menú de Cascada Desplegable para Desglose de Estado (Inicialmente Cerrado) */}
                  <View style={{ marginTop: 6 }}>
                    <TouchableOpacity
                      style={[
                        styles.cascadeHeaderBtn,
                        {
                          backgroundColor: isExpanded ? themeColors.primary + '12' : themeColors.backgroundElement,
                          borderColor: isExpanded ? themeColors.primary : themeColors.border,
                        }
                      ]}
                      onPress={() => setExpandedItems(prev => ({ ...prev, [m.productoId]: !prev[m.productoId] }))}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Ionicons
                          name={isExpanded ? "layers" : "layers-outline"}
                          size={14}
                          color={isExpanded ? themeColors.primary : themeColors.textSecondary}
                        />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: isExpanded ? themeColors.primary : themeColors.text }}>
                          Desglose por condición (Nuevas, Usadas, Dañadas)
                        </Text>
                      </View>

                      {(qUsado > 0 || qPorRev > 0) && (
                        <View style={{ backgroundColor: '#D9770620', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 6 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#D97706' }}>
                            {qUsado > 0 ? `Usadas: ${qUsado}` : ''} {qPorRev > 0 ? `Dañadas: ${qPorRev}` : ''}
                          </Text>
                        </View>
                      )}

                      <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={14}
                        color={isExpanded ? themeColors.primary : themeColors.textSecondary}
                      />
                    </TouchableOpacity>

                    {/* Contenido en Cascada cuando está Desplegado */}
                    {isExpanded && (
                      <View style={[styles.cascadeBody, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                        {/* Botones de selección rápida */}
                        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                          <TouchableOpacity
                            onPress={() => handleSetAllCondition(idx, 'devolver_nuevo')}
                            style={[styles.quickPresetBtn, { borderColor: '#10B981', backgroundColor: '#10B98115' }]}
                          >
                            <Ionicons name="sparkles-outline" size={12} color="#10B981" />
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#10B981' }}>Todo Nuevo ({m.maximo})</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleSetAllCondition(idx, 'devolver_usado')}
                            style={[styles.quickPresetBtn, { borderColor: '#D97706', backgroundColor: '#D9770615' }]}
                          >
                            <Ionicons name="refresh-outline" size={12} color="#D97706" />
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#D97706' }}>Todo Usado ({m.maximo})</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleSetAllCondition(idx, 'devolver_por_revisar')}
                            style={[styles.quickPresetBtn, { borderColor: '#DC2626', backgroundColor: '#DC262615' }]}
                          >
                            <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#DC2626' }}>Todo Dañado/Incompleto ({m.maximo})</Text>
                          </TouchableOpacity>
                        </View>

                        {/* 1. Nuevas */}
                        <View style={styles.conditionRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                            <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }}>Nuevas (Intactas)</Text>
                          </View>
                          <View style={[styles.stepperContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                            <TouchableOpacity
                              style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                              onPress={() => handleUpdateCondition(idx, 'devolver_nuevo', Math.max(0, qNuevo - 1))}
                              disabled={qNuevo <= 0}
                            >
                              <Ionicons name="remove" size={14} color={qNuevo > 0 ? themeColors.danger : themeColors.textSecondary} />
                            </TouchableOpacity>
                            <TextInput
                              style={[styles.stepperInput, { color: themeColors.text }]}
                              keyboardType="decimal-pad"
                              selectTextOnFocus
                              value={m.devolver_nuevo === '' ? '' : String(m.devolver_nuevo)}
                              placeholder="0"
                              placeholderTextColor={themeColors.textSecondary}
                              onChangeText={(val) => {
                                if (val.trim() === '') handleUpdateCondition(idx, 'devolver_nuevo', '');
                                else {
                                  const num = parseFloat(val.replace(/[^0-9.]/g, ''));
                                  handleUpdateCondition(idx, 'devolver_nuevo', isNaN(num) ? '' : num);
                                }
                              }}
                            />
                            <TouchableOpacity
                              style={[styles.stepperBtn, { backgroundColor: themeColors.primary + '18' }]}
                              onPress={() => handleUpdateCondition(idx, 'devolver_nuevo', qNuevo + 1)}
                              disabled={remainingToDevolve <= 0}
                            >
                              <Ionicons name="add" size={14} color={remainingToDevolve > 0 ? themeColors.primary : themeColors.textSecondary} />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* 2. Usadas */}
                        <View style={[styles.conditionRow, { marginTop: 8 }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#D97706' }} />
                            <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }}>Usadas (Buen estado)</Text>
                          </View>
                          <View style={[styles.stepperContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                            <TouchableOpacity
                              style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                              onPress={() => handleUpdateCondition(idx, 'devolver_usado', Math.max(0, qUsado - 1))}
                              disabled={qUsado <= 0}
                            >
                              <Ionicons name="remove" size={14} color={qUsado > 0 ? themeColors.danger : themeColors.textSecondary} />
                            </TouchableOpacity>
                            <TextInput
                              style={[styles.stepperInput, { color: themeColors.text }]}
                              keyboardType="decimal-pad"
                              selectTextOnFocus
                              value={m.devolver_usado === '' ? '' : String(m.devolver_usado)}
                              placeholder="0"
                              placeholderTextColor={themeColors.textSecondary}
                              onChangeText={(val) => {
                                if (val.trim() === '') handleUpdateCondition(idx, 'devolver_usado', '');
                                else {
                                  const num = parseFloat(val.replace(/[^0-9.]/g, ''));
                                  handleUpdateCondition(idx, 'devolver_usado', isNaN(num) ? '' : num);
                                }
                              }}
                            />
                            <TouchableOpacity
                              style={[styles.stepperBtn, { backgroundColor: themeColors.primary + '18' }]}
                              onPress={() => handleUpdateCondition(idx, 'devolver_usado', qUsado + 1)}
                              disabled={remainingToDevolve <= 0}
                            >
                              <Ionicons name="add" size={14} color={remainingToDevolve > 0 ? themeColors.primary : themeColors.textSecondary} />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* 3. Dañado / Incompleto */}
                        <View style={[styles.conditionRow, { marginTop: 8 }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#DC2626' }} />
                            <Text style={{ fontSize: 12, fontWeight: '600', color: themeColors.text }}>Dañado / Incompleto</Text>
                          </View>
                          <View style={[styles.stepperContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                            <TouchableOpacity
                              style={[styles.stepperBtn, { backgroundColor: themeColors.danger + '18' }]}
                              onPress={() => handleUpdateCondition(idx, 'devolver_por_revisar', Math.max(0, qPorRev - 1))}
                              disabled={qPorRev <= 0}
                            >
                              <Ionicons name="remove" size={14} color={qPorRev > 0 ? themeColors.danger : themeColors.textSecondary} />
                            </TouchableOpacity>
                            <TextInput
                              style={[styles.stepperInput, { color: themeColors.text }]}
                              keyboardType="decimal-pad"
                              selectTextOnFocus
                              value={m.devolver_por_revisar === '' ? '' : String(m.devolver_por_revisar)}
                              placeholder="0"
                              placeholderTextColor={themeColors.textSecondary}
                              onChangeText={(val) => {
                                if (val.trim() === '') handleUpdateCondition(idx, 'devolver_por_revisar', '');
                                else {
                                  const num = parseFloat(val.replace(/[^0-9.]/g, ''));
                                  handleUpdateCondition(idx, 'devolver_por_revisar', isNaN(num) ? '' : num);
                                }
                              }}
                            />
                            <TouchableOpacity
                              style={[styles.stepperBtn, { backgroundColor: themeColors.primary + '18' }]}
                              onPress={() => handleUpdateCondition(idx, 'devolver_por_revisar', qPorRev + 1)}
                              disabled={remainingToDevolve <= 0}
                            >
                              <Ionicons name="add" size={14} color={remainingToDevolve > 0 ? themeColors.primary : themeColors.textSecondary} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Resumen del Item */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                    <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                      Te quedarás con: <Text style={{ fontWeight: 'bold', color: themeColors.text }}>{Math.max(0, m.maximo - currentTotal)} {m.unidad}</Text>
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: currentTotal > 0 ? themeColors.primary : themeColors.textSecondary }}>
                      Devolviendo: {currentTotal} {m.unidad}
                    </Text>
                  </View>
                </View>
              );
            })}

            <Text style={{ color: themeColors.text, fontWeight: '600', marginTop: Spacing.four, marginBottom: Spacing.two }}>
              Observaciones o Motivo (Opcional)
            </Text>
            <TextInput
              style={[styles.textArea, { borderColor: themeColors.border, color: themeColors.text, backgroundColor: themeColors.background }]}
              multiline
              numberOfLines={3}
              placeholder="Ej: Material sobrante del servicio en sucursal X..."
              placeholderTextColor={themeColors.textSecondary}
              value={observaciones}
              onChangeText={setObservaciones}
            />

            <CustomButton
              title={totalDevolverGeneral > 0 ? `Solicitar Devolución (${totalDevolverGeneral} unidades)` : "Solicitar Devolución"}
              variant="primary"
              onPress={handleEnviarDevolucion}
              loading={isSubmitting}
              disabled={totalDevolverGeneral === 0}
              style={{ marginTop: Spacing.four }}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: 60,
  },
  header: {
    marginBottom: Spacing.four,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: Spacing.one,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  emptyContainer: {
    padding: Spacing.five,
    borderRadius: BorderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  card: {
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  itemCard: {
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.three,
  },
  quickAllChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  cascadeHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  cascadeBody: {
    marginTop: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  quickPresetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    height: 32,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperInput: {
    width: 44,
    height: 32,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 13,
    padding: 0,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: Spacing.three,
    minHeight: 80,
    textAlignVertical: 'top',
  }
});
