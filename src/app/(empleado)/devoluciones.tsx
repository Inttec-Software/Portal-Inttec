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
import { AuthService, supabase } from '@/services/supabase';
import { getApiHeaders, getApiUrl } from '@/services/apiHelper';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';

import CustomButton from '@/components/CustomButton';

type InventarioItem = {
  id: string;
  producto_id: string;
  cantidad_disponible: number;
  producto: {
    nombre_oficial: string;
    sku_interno: string;
  };
};

type MaterialDevolucion = {
  productoId: string;
  nombre: string;
  sku: string;
  maximo: number;
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
        throw new Error('Error al cargar inventario');
      }
      const json = await res.json();
      const data = json.inventario;

      setInventario((data as any) || []);
      
      // Inicializar el arreglo de devolución
      if (data) {
        const initial = data.map((item: any) => ({
          productoId: item.producto_id,
          nombre: Array.isArray(item.producto) ? item.producto[0]?.nombre_oficial : (item.producto?.nombre_oficial || 'Desconocido'),
          sku: Array.isArray(item.producto) ? item.producto[0]?.sku_interno : (item.producto?.sku_interno || ''),
          maximo: item.cantidad_disponible,
          devolver: 0
        }));
        setMaterialesDevolver(initial);
      }
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', 'No se pudo cargar el inventario personal.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateDevolver = (idx: number, val: string) => {
    const num = parseInt(val, 10);
    const safeNum = isNaN(num) || num < 0 ? 0 : num;
    
    setMaterialesDevolver(prev => {
      const nuevo = [...prev];
      nuevo[idx].devolver = Math.min(safeNum, nuevo[idx].maximo);
      return nuevo;
    });
  };

  const handleEnviarDevolucion = async () => {
    const aDevolver = materialesDevolver.filter(m => m.devolver > 0);
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

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.text }]}>Devolución de Material</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            Indica qué materiales sobrantes vas a regresar al almacén. El administrador deberá aprobar la devolución para descontarlos de tu inventario.
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
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.text, marginBottom: Spacing.three }}>
              Material Disponible
            </Text>

            {materialesDevolver.map((m, idx) => (
              <View key={m.productoId} style={[styles.itemRow, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}>
                <View style={{ flex: 1, paddingRight: Spacing.two }}>
                  <Text style={{ color: themeColors.text, fontWeight: '600', marginBottom: 4 }}>{m.nombre}</Text>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>SKU: {m.sku} • Tienes: <Text style={{fontWeight: 'bold', color: themeColors.primary}}>{m.maximo}</Text></Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: themeColors.textSecondary, marginRight: 8, fontSize: 13 }}>Devolver:</Text>
                  <TextInput
                    style={[styles.input, { borderColor: themeColors.border, color: themeColors.text }]}
                    keyboardType="numeric"
                    value={m.devolver === 0 ? '' : m.devolver.toString()}
                    placeholder="0"
                    placeholderTextColor={themeColors.textSecondary}
                    onChangeText={(val) => handleUpdateDevolver(idx, val)}
                  />
                </View>
              </View>
            ))}

            <Text style={{ color: themeColors.text, fontWeight: '600', marginTop: Spacing.four, marginBottom: Spacing.two }}>
              Observaciones (Opcional)
            </Text>
            <TextInput
              style={[styles.textArea, { borderColor: themeColors.border, color: themeColors.text, backgroundColor: themeColors.background }]}
              multiline
              numberOfLines={3}
              placeholder="Ej: Regreso 2 cables extra porque..."
              placeholderTextColor={themeColors.textSecondary}
              value={observaciones}
              onChangeText={setObservaciones}
            />

            <CustomButton
              title="Solicitar Devolución"
              variant="primary"
              onPress={handleEnviarDevolucion}
              loading={isSubmitting}
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
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    marginBottom: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: 60,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  textArea: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: Spacing.three,
    minHeight: 80,
    textAlignVertical: 'top',
  }
});
