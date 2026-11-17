import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';
import { Gasto, GastoHelper } from '@/services/supabase';
import {
  Proyecto,
  ProyectoCategoriaKey,
  ProyectoTotalesPorCategoria,
  SubtipoTraslado,
  SUBTIPOS_TRASLADO_LABELS,
  classifyProjectGastoBlock,
  getOrComputeHospedajeDias,
} from '../types';

interface ProyectoDetailViewProps {
  proyecto: Proyecto;
  resumen: {
    total_general: number;
    totales_por_categoria: ProyectoTotalesPorCategoria;
    pendientes_count: number;
  };
  gastos: Gasto[];
  isLoading: boolean;
  isDesktop: boolean;
  themeColors: any;
  formatCurrency: (val: number) => string;
  formatFriendlyDate: (dateStr?: string | null) => string;
  onBack: () => void;
  onRefresh: () => void;
  onEditProyecto: (proyecto: Proyecto) => void;
  onToggleProyectoStatus: (proyecto: Proyecto) => void;
  onSelectGastoForReview: (gasto: Gasto) => void;
  onOpenAssignProyecto: (gasto: Gasto) => void;
}

const CATEGORIA_BLOCKS: {
  key: ProyectoCategoriaKey;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  {
    key: 'alimentos',
    title: '1. Alimentos',
    subtitle: 'Consumos, compartidos y propinas',
    icon: 'restaurant-outline',
    color: '#ea580c',
  },
  {
    key: 'hospedaje',
    title: '2. Hospedaje',
    subtitle: 'Hoteles y desglose diario por noche',
    icon: 'bed-outline',
    color: '#4f46e5',
  },
  {
    key: 'material',
    title: '3. Material',
    subtitle: 'Eléctrico, ferretería e insumos',
    icon: 'construct-outline',
    color: '#059669',
  },
  {
    key: 'equipo',
    title: '4. Equipo',
    subtitle: 'Seguridad, paneles, refrigeración y venta',
    icon: 'hardware-chip-outline',
    color: '#7c3aed',
  },
  {
    key: 'transporte',
    title: '5. Transporte',
    subtitle: 'Combustible y Traslados (Casetas, Uber, Vuelos)',
    icon: 'car-sport-outline',
    color: '#0284c7',
  },
];

export function ProyectoDetailView({
  proyecto,
  resumen,
  gastos,
  isLoading,
  isDesktop,
  themeColors,
  formatCurrency,
  formatFriendlyDate,
  onBack,
  onRefresh,
  onEditProyecto,
  onToggleProyectoStatus,
  onSelectGastoForReview,
  onOpenAssignProyecto,
}: ProyectoDetailViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<
    ProyectoCategoriaKey | 'ALL'
  >('ALL');
  const [transporteSubFilter, setTransporteSubFilter] = useState<
    'ALL' | 'COMBUSTIBLE' | 'TRASLADOS' | SubtipoTraslado
  >('ALL');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'
  >('ALL');

  // Estadísticas y conteos por bloque (excluyendo REJECTED para montos)
  const blockCounts = useMemo(() => {
    const counts: Record<
      ProyectoCategoriaKey,
      { totalItems: number; pendingItems: number; nightsCount: number }
    > = {
      alimentos: { totalItems: 0, pendingItems: 0, nightsCount: 0 },
      hospedaje: { totalItems: 0, pendingItems: 0, nightsCount: 0 },
      material: { totalItems: 0, pendingItems: 0, nightsCount: 0 },
      equipo: { totalItems: 0, pendingItems: 0, nightsCount: 0 },
      transporte: { totalItems: 0, pendingItems: 0, nightsCount: 0 },
    };

    for (const g of gastos) {
      const { block } = classifyProjectGastoBlock(g);
      counts[block].totalItems += 1;
      if (g.status === 'PENDING' || g.status === 'ACTION_REQUIRED') {
        counts[block].pendingItems += 1;
      }
      if (block === 'hospedaje' && g.status !== 'REJECTED') {
        const dias = getOrComputeHospedajeDias(g);
        counts.hospedaje.nightsCount += dias.length;
      }
    }
    return counts;
  }, [gastos]);

  const statusBreakdown = useMemo(() => {
    let totalApproved = 0;
    let totalPending = 0;
    let countRejected = 0;

    for (const g of gastos) {
      const m = Number(g.monto) || 0;
      if (g.status === 'APPROVED') {
        totalApproved += m;
      } else if (g.status === 'PENDING' || g.status === 'ACTION_REQUIRED') {
        totalPending += m;
      } else if (g.status === 'REJECTED') {
        countRejected += 1;
      }
    }
    return { totalApproved, totalPending, countRejected };
  }, [gastos]);

  // Calendario diario consolidado para Hospedaje
  const hospedajeCalendarDays = useMemo(() => {
    const hospedajeGastos = gastos.filter(
      (g) =>
        classifyProjectGastoBlock(g).block === 'hospedaje' &&
        g.status !== 'REJECTED'
    );

    const dayEntries: {
      fecha: string;
      monto_diario: number;
      gasto: Gasto;
      hotel: string;
      empleado: string;
    }[] = [];

    for (const g of hospedajeGastos) {
      const dias = getOrComputeHospedajeDias(g);
      const hotel =
        GastoHelper.getProveedor(g) ||
        g.detalle_servicio_proyecto ||
        'Hotel / Hospedaje';
      const empleado = g.empleado_nombre || 'Empleado';
      for (const d of dias) {
        dayEntries.push({
          fecha: d.fecha,
          monto_diario: Number(d.monto_diario) || 0,
          gasto: g,
          hotel,
          empleado,
        });
      }
    }

    return dayEntries.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [gastos]);

  // Gastos filtrados según el bloque y subfiltro seleccionado
  const filteredGastos = useMemo(() => {
    return gastos.filter((g) => {
      if (statusFilter === 'PENDING') {
        if (g.status !== 'PENDING' && g.status !== 'ACTION_REQUIRED')
          return false;
      } else if (statusFilter === 'APPROVED') {
        if (g.status !== 'APPROVED') return false;
      } else if (statusFilter === 'REJECTED') {
        if (g.status !== 'REJECTED') return false;
      }

      if (selectedCategory === 'ALL') return true;

      const { block, subblock } = classifyProjectGastoBlock(g);
      if (block !== selectedCategory) return false;

      if (selectedCategory === 'transporte' && transporteSubFilter !== 'ALL') {
        if (transporteSubFilter === 'COMBUSTIBLE') {
          return subblock === 'combustible';
        }
        if (transporteSubFilter === 'TRASLADOS') {
          return subblock === 'traslados';
        }
        // Filtro por subtipo específico (CASETAS, UBER, VUELOS, etc.)
        if (subblock !== 'traslados') return false;
        const subtipo = (g.subtipo_traslado || '').toUpperCase();
        const subcatNorm = (GastoHelper.getSubcategoria(g) || '').toUpperCase();
        return (
          subtipo === transporteSubFilter ||
          subcatNorm.includes(transporteSubFilter)
        );
      }

      return true;
    });
  }, [gastos, selectedCategory, transporteSubFilter, statusFilter]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: Spacing.three,
        paddingBottom: Spacing.six,
        gap: Spacing.two,
      }}
    >
      {/* Barra superior de navegación y acciones del proyecto */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: Spacing.one,
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: BorderRadius.medium,
            backgroundColor: themeColors.backgroundElement,
            borderWidth: 1,
            borderColor: themeColors.border,
          }}
        >
          <Ionicons name="arrow-back" size={18} color={themeColors.text} />
          <Text
            style={{
              fontSize: 13,
              fontWeight: '800',
              color: themeColors.text,
            }}
          >
            Volver a Proyectos
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => onEditProyecto(proyecto)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: BorderRadius.medium,
              backgroundColor: themeColors.backgroundElement,
              borderWidth: 1,
              borderColor: themeColors.border,
            }}
          >
            <Ionicons name="create-outline" size={16} color={themeColors.accent} />
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: themeColors.accent,
              }}
            >
              Editar Proyecto
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onToggleProyectoStatus(proyecto)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: BorderRadius.medium,
              backgroundColor:
                proyecto.status === 'ACTIVO'
                  ? '#64748b18'
                  : themeColors.success + '18',
              borderWidth: 1,
              borderColor:
                proyecto.status === 'ACTIVO' ? '#64748b50' : themeColors.success,
            }}
          >
            <Ionicons
              name={
                proyecto.status === 'ACTIVO'
                  ? 'lock-closed-outline'
                  : 'lock-open-outline'
              }
              size={15}
              color={
                proyecto.status === 'ACTIVO' ? '#64748b' : themeColors.success
              }
            />
            <Text
              style={{
                fontSize: 12,
                fontWeight: '800',
                color:
                  proyecto.status === 'ACTIVO'
                    ? '#64748b'
                    : themeColors.success,
              }}
            >
              {proyecto.status === 'ACTIVO'
                ? 'Cerrar Proyecto'
                : 'Reabrir Proyecto'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onRefresh}
            style={{
              padding: 8,
              borderRadius: BorderRadius.medium,
              backgroundColor: themeColors.backgroundElement,
              borderWidth: 1,
              borderColor: themeColors.border,
            }}
          >
            <Ionicons name="refresh" size={18} color={themeColors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Cabecera Resumen del Proyecto */}
      <View
        style={{
          backgroundColor: themeColors.backgroundElement,
          borderRadius: BorderRadius.large,
          borderWidth: 1,
          borderColor: themeColors.border,
          padding: Spacing.three,
          gap: Spacing.two,
        }}
      >
        <View
          style={{
            flexDirection: isDesktop ? 'row' : 'column',
            justifyContent: 'space-between',
            alignItems: isDesktop ? 'flex-start' : 'stretch',
            gap: Spacing.two,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <View
                style={{
                  backgroundColor:
                    proyecto.status === 'ACTIVO'
                      ? themeColors.success + '20'
                      : '#64748b25',
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor:
                      proyecto.status === 'ACTIVO'
                        ? themeColors.success
                        : '#64748b',
                  }}
                />
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '800',
                    color:
                      proyecto.status === 'ACTIVO'
                        ? themeColors.success
                        : '#64748b',
                  }}
                >
                  {proyecto.status}
                </Text>
              </View>

              {resumen.pendientes_count > 0 && (
                <TouchableOpacity
                  onPress={() =>
                    setStatusFilter(
                      statusFilter === 'PENDING' ? 'ALL' : 'PENDING'
                    )
                  }
                  style={{
                    backgroundColor: themeColors.warning + '20',
                    borderColor: themeColors.warning,
                    borderWidth: 1,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Ionicons
                    name="alert-circle"
                    size={13}
                    color={themeColors.warning}
                  />
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '800',
                      color: themeColors.warning,
                    }}
                  >
                    {resumen.pendientes_count} por revisar
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <Text
              style={{
                fontSize: 20,
                fontWeight: '900',
                color: themeColors.text,
                marginTop: 2,
              }}
            >
              {proyecto.nombre}
            </Text>

            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 12,
                marginTop: 2,
              }}
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Ionicons
                  name="business-outline"
                  size={14}
                  color={themeColors.primary}
                />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: themeColors.primary,
                  }}
                >
                  Cliente: {proyecto.cliente_nombre || 'General / No asignado'}
                </Text>
              </View>

              {proyecto.sucursal_nombre ? (
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={themeColors.textSecondary}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: themeColors.textSecondary,
                    }}
                  >
                    Sucursal: {proyecto.sucursal_nombre}
                  </Text>
                </View>
              ) : null}
            </View>

            {proyecto.notas ? (
              <Text
                style={{
                  fontSize: 12,
                  color: themeColors.textSecondary,
                  fontStyle: 'italic',
                  marginTop: 4,
                }}
              >
                {proyecto.notas}
              </Text>
            ) : null}
          </View>

          {/* Caja de Total General del Proyecto */}
          <View
            style={{
              backgroundColor: themeColors.background,
              borderRadius: BorderRadius.medium,
              padding: Spacing.two,
              borderWidth: 1,
              borderColor: themeColors.border,
              minWidth: isDesktop ? 240 : undefined,
              alignItems: isDesktop ? 'flex-end' : 'flex-start',
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: '800',
                color: themeColors.textSecondary,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Total Acumulado del Proyecto
            </Text>
            <Text
              style={{
                fontSize: 24,
                fontWeight: '900',
                color: themeColors.text,
                marginVertical: 2,
              }}
            >
              {formatCurrency(resumen.total_general)}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
                marginTop: 2,
              }}
            >
              <Text style={{ fontSize: 11, color: themeColors.success, fontWeight: '700' }}>
                ✓ Aprobado: {formatCurrency(statusBreakdown.totalApproved)}
              </Text>
              {statusBreakdown.totalPending > 0 && (
                <Text style={{ fontSize: 11, color: themeColors.warning, fontWeight: '700' }}>
                  ⏳ Pendiente: {formatCurrency(statusBreakdown.totalPending)}
                </Text>
              )}
            </View>
            {statusBreakdown.countRejected > 0 && (
              <Text
                style={{
                  fontSize: 10,
                  color: themeColors.textSecondary,
                  marginTop: 2,
                }}
              >
                ({statusBreakdown.countRejected} rechazado
                {statusBreakdown.countRejected === 1 ? '' : 's'} no suma
                {statusBreakdown.countRejected === 1 ? '' : 'n'} al total)
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* LAS 5 TARJETAS PRINCIPALES DE CATEGORÍA */}
      <View style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '800',
              color: themeColors.text,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Desglose por Sección (5 Bloques del Proyecto)
          </Text>
          {selectedCategory !== 'ALL' && (
            <TouchableOpacity
              onPress={() => {
                setSelectedCategory('ALL');
                setTransporteSubFilter('ALL');
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: BorderRadius.small,
                backgroundColor: themeColors.accent + '18',
              }}
            >
              <Ionicons name="apps-outline" size={14} color={themeColors.accent} />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: themeColors.accent,
                }}
              >
                Ver todas las secciones ({gastos.length})
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          {CATEGORIA_BLOCKS.map((blk) => {
            const isSelected = selectedCategory === blk.key;
            const amount =
              resumen.totales_por_categoria?.[blk.key] ?? 0;
            const stats = blockCounts[blk.key];

            return (
              <TouchableOpacity
                key={blk.key}
                activeOpacity={0.75}
                onPress={() => {
                  if (selectedCategory === blk.key) {
                    setSelectedCategory('ALL');
                  } else {
                    setSelectedCategory(blk.key);
                    setTransporteSubFilter('ALL');
                  }
                }}
                style={{
                  flexGrow: 1,
                  flexBasis: isDesktop ? '18%' : '46%',
                  minWidth: isDesktop ? 185 : 155,
                  backgroundColor: isSelected
                    ? blk.color + '15'
                    : themeColors.backgroundElement,
                  borderRadius: BorderRadius.large,
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected ? blk.color : themeColors.border,
                  padding: Spacing.two,
                  gap: 6,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      backgroundColor: blk.color + '20',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name={blk.icon} size={18} color={blk.color} />
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {stats.pendingItems > 0 && (
                      <View
                        style={{
                          backgroundColor: themeColors.warning + '25',
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: '800',
                            color: themeColors.warning,
                          }}
                        >
                          {stats.pendingItems} pend.
                        </Text>
                      </View>
                    )}
                    <View
                      style={{
                        backgroundColor: themeColors.background,
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: themeColors.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '800',
                          color: themeColors.textSecondary,
                        }}
                      >
                        {stats.totalItems}{' '}
                        {stats.totalItems === 1 ? 'gasto' : 'gastos'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '800',
                      color: themeColors.text,
                    }}
                  >
                    {blk.title}
                  </Text>
                  <Text
                    style={{
                      fontSize: 10,
                      color: themeColors.textSecondary,
                    }}
                    numberOfLines={1}
                  >
                    {blk.subtitle}
                  </Text>
                </View>

                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '900',
                    color: amount > 0 ? blk.color : themeColors.textSecondary,
                  }}
                >
                  {formatCurrency(amount)}
                </Text>

                {/* Sub-detalle especial en Transporte: Combustible vs Traslados */}
                {blk.key === 'transporte' && (
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: themeColors.border,
                      paddingTop: 6,
                      gap: 2,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '700',
                          color: themeColors.textSecondary,
                        }}
                      >
                        ⛽ Combustible:
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '800',
                          color: themeColors.text,
                        }}
                      >
                        {formatCurrency(
                          resumen.totales_por_categoria?.combustible ?? 0
                        )}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '700',
                          color: themeColors.textSecondary,
                        }}
                      >
                        🛣️ Traslados:
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '800',
                          color: themeColors.text,
                        }}
                      >
                        {formatCurrency(
                          resumen.totales_por_categoria?.traslados ?? 0
                        )}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Sub-detalle especial en Hospedaje: Noches acumuladas */}
                {blk.key === 'hospedaje' && stats.nightsCount > 0 && (
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: themeColors.border,
                      paddingTop: 6,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '700',
                        color: '#4f46e5',
                      }}
                    >
                      🌙 {stats.nightsCount}{' '}
                      {stats.nightsCount === 1
                        ? 'día/noche registrada'
                        : 'días/noches registradas'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* SUBFILTROS DE TRANSPORTE (Combustible vs Traslados: Casetas, Estacionamientos, Multas, Uber, Vuelos, Otros) */}
      {selectedCategory === 'transporte' && (
        <View
          style={{
            backgroundColor: themeColors.backgroundElement,
            borderRadius: BorderRadius.medium,
            borderWidth: 1,
            borderColor: '#0284c750',
            padding: Spacing.two,
            gap: 8,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '800',
              color: '#0284c7',
              textTransform: 'uppercase',
            }}
          >
            Subdivisión de Transporte
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[
                { key: 'ALL', label: 'Todos Transporte' },
                {
                  key: 'COMBUSTIBLE',
                  label: `⛽ Combustible (${formatCurrency(
                    resumen.totales_por_categoria?.combustible ?? 0
                  )})`,
                },
                {
                  key: 'TRASLADOS',
                  label: `🛣️ Todos Traslados (${formatCurrency(
                    resumen.totales_por_categoria?.traslados ?? 0
                  )})`,
                },
                ...(
                  Object.keys(SUBTIPOS_TRASLADO_LABELS) as SubtipoTraslado[]
                ).map((st) => ({
                  key: st,
                  label: SUBTIPOS_TRASLADO_LABELS[st],
                })),
              ].map((opt) => {
                const isSubSelected = transporteSubFilter === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setTransporteSubFilter(opt.key as any)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 16,
                      backgroundColor: isSubSelected
                        ? '#0284c7'
                        : themeColors.background,
                      borderWidth: 1,
                      borderColor: isSubSelected
                        ? '#0284c7'
                        : themeColors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: isSubSelected ? '#fff' : themeColors.text,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* SECCIÓN DE DESGLOSE DIARIO AUTOMÁTICO DE HOSPEDAJE */}
      {(selectedCategory === 'hospedaje' ||
        (selectedCategory === 'ALL' && hospedajeCalendarDays.length > 0)) && (
        <View
          style={{
            backgroundColor: themeColors.backgroundElement,
            borderRadius: BorderRadius.large,
            borderWidth: 1.5,
            borderColor: '#4f46e550',
            padding: Spacing.three,
            gap: Spacing.two,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: '#4f46e520',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="calendar-outline" size={17} color="#4f46e5" />
              </View>
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '800',
                    color: themeColors.text,
                  }}
                >
                  Desglose Automático Día por Día — Hospedaje
                </Text>
                <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                  1 sola aprobación/conciliación SAT por factura • Costo prorrateado
                  por noche
                </Text>
              </View>
            </View>

            <View
              style={{
                backgroundColor: '#4f46e515',
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: BorderRadius.small,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  color: '#4f46e5',
                }}
              >
                {hospedajeCalendarDays.length}{' '}
                {hospedajeCalendarDays.length === 1
                  ? 'noche registrada'
                  : 'noches registradas'}{' '}
                •{' '}
                {formatCurrency(
                  resumen.totales_por_categoria?.hospedaje ?? 0
                )}
              </Text>
            </View>
          </View>

          {hospedajeCalendarDays.length === 0 ? (
            <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
              Aún no hay días de hospedaje desglosados en este proyecto.
            </Text>
          ) : (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              {hospedajeCalendarDays.map((dia, idx) => (
                <TouchableOpacity
                  key={`${dia.gasto.id}_${dia.fecha}_${idx}`}
                  onPress={() => onSelectGastoForReview(dia.gasto)}
                  style={{
                    backgroundColor: themeColors.background,
                    borderWidth: 1,
                    borderColor: themeColors.border,
                    borderRadius: BorderRadius.medium,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    minWidth: 145,
                    flexGrow: 1,
                    flexBasis: isDesktop ? '18%' : '45%',
                    gap: 2,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '800',
                        color: '#4f46e5',
                      }}
                    >
                      📅 {formatFriendlyDate(dia.fecha)}
                    </Text>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor:
                          dia.gasto.status === 'APPROVED'
                            ? themeColors.success
                            : themeColors.warning,
                      }}
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '900',
                      color: themeColors.text,
                    }}
                  >
                    {formatCurrency(dia.monto_diario)}
                  </Text>
                  <Text
                    style={{
                      fontSize: 10,
                      color: themeColors.textSecondary,
                    }}
                    numberOfLines={1}
                  >
                    🏨 {dia.hotel}
                  </Text>
                  <Text
                    style={{
                      fontSize: 10,
                      color: themeColors.textSecondary,
                    }}
                    numberOfLines={1}
                  >
                    👤 {dia.empleado}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* LISTA DE GASTOS INDIVIDUALES DEL PROYECTO */}
      <View
        style={{
          backgroundColor: themeColors.backgroundElement,
          borderRadius: BorderRadius.large,
          borderWidth: 1,
          borderColor: themeColors.border,
          padding: Spacing.three,
          gap: Spacing.two,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <View>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '800',
                color: themeColors.text,
              }}
            >
              {selectedCategory === 'ALL'
                ? `Todos los Gastos del Proyecto (${filteredGastos.length})`
                : `Gastos de ${
                    CATEGORIA_BLOCKS.find((b) => b.key === selectedCategory)
                      ?.title || selectedCategory
                  } (${filteredGastos.length})`}
            </Text>
            <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
              Toca cualquier gasto para revisar comprobante, conciliar CFDI SAT o
              aprobar/rechazar
            </Text>
          </View>

          {/* Filtro rápido por estatus dentro del proyecto */}
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {[
              { key: 'ALL', label: 'Todos' },
              { key: 'PENDING', label: 'Por revisar' },
              { key: 'APPROVED', label: 'Aprobados' },
              { key: 'REJECTED', label: 'Rechazados' },
            ].map((st) => {
              const active = statusFilter === st.key;
              return (
                <TouchableOpacity
                  key={st.key}
                  onPress={() => setStatusFilter(st.key as any)}
                  style={{
                    paddingVertical: 5,
                    paddingHorizontal: 10,
                    borderRadius: 14,
                    backgroundColor: active
                      ? themeColors.primary
                      : themeColors.background,
                    borderWidth: 1,
                    borderColor: active
                      ? themeColors.primary
                      : themeColors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: active ? '#fff' : themeColors.textSecondary,
                    }}
                  >
                    {st.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {isLoading ? (
          <View style={{ paddingVertical: Spacing.five, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={themeColors.primary} />
          </View>
        ) : filteredGastos.length === 0 ? (
          <View
            style={{
              paddingVertical: Spacing.five,
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Ionicons
              name="receipt-outline"
              size={40}
              color={themeColors.textSecondary}
            />
            <Text
              style={{
                fontSize: 13,
                color: themeColors.textSecondary,
                textAlign: 'center',
              }}
            >
              No hay gastos registrados en esta sección con el filtro actual.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {filteredGastos.map((item) => {
              const { block, subblock } = classifyProjectGastoBlock(item);
              const blkMeta = CATEGORIA_BLOCKS.find((b) => b.key === block);
              const provName = GastoHelper.getProveedor(item);
              const catName = GastoHelper.getCategoria(item);
              const subcatName = GastoHelper.getSubcategoria(item);
              const fecha = formatFriendlyDate(
                item.fecha_comprobante || item.created_at
              );
              const hospDias =
                block === 'hospedaje' ? getOrComputeHospedajeDias(item) : [];

              let statusText = 'PENDIENTE';
              let statusColor = themeColors.warning;
              if (item.status === 'APPROVED') {
                statusText = 'APROBADO';
                statusColor = themeColors.success;
              } else if (item.status === 'REJECTED') {
                statusText = 'RECHAZADO (No suma)';
                statusColor = themeColors.danger;
              } else if (item.status === 'ACTION_REQUIRED') {
                statusText = 'ACCIÓN REQUERIDA';
                statusColor = themeColors.actionRequired;
              }

              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.75}
                  onPress={() => onSelectGastoForReview(item)}
                  style={{
                    backgroundColor: themeColors.background,
                    borderRadius: BorderRadius.medium,
                    borderWidth: 1,
                    borderColor:
                      item.status === 'PENDING' ||
                      item.status === 'ACTION_REQUIRED'
                        ? themeColors.warning + '80'
                        : themeColors.border,
                    padding: Spacing.two,
                    opacity: item.status === 'REJECTED' ? 0.65 : 1,
                    gap: 6,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 8,
                    }}
                  >
                    <View style={{ flex: 1, gap: 3 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 6,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor:
                              (blkMeta?.color || themeColors.primary) + '20',
                            paddingHorizontal: 7,
                            paddingVertical: 2,
                            borderRadius: 6,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '800',
                              color: blkMeta?.color || themeColors.primary,
                            }}
                          >
                            {catName || blkMeta?.title}
                            {subcatName ? ` > ${subcatName}` : ''}
                          </Text>
                        </View>

                        {subblock === 'combustible' && (
                          <View
                            style={{
                              backgroundColor: '#0284c720',
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: '800',
                                color: '#0284c7',
                              }}
                            >
                              ⛽ Combustible
                            </Text>
                          </View>
                        )}

                        {item.subtipo_traslado && (
                          <View
                            style={{
                              backgroundColor: '#0284c720',
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: '800',
                                color: '#0284c7',
                              }}
                            >
                              🛣️{' '}
                              {SUBTIPOS_TRASLADO_LABELS[
                                item.subtipo_traslado
                              ] || item.subtipo_traslado}
                            </Text>
                          </View>
                        )}

                        {Number(item.monto_propina || 0) > 0 && (
                          <View
                            style={{
                              backgroundColor: '#f59e0b20',
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: '800',
                                color: '#d97706',
                              }}
                            >
                              🍽️ Propina: {formatCurrency(Number(item.monto_propina))}
                            </Text>
                          </View>
                        )}

                        {item.es_factura_compartida && (
                          <View
                            style={{
                              backgroundColor: '#8b5cf620',
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: '800',
                                color: '#7c3aed',
                              }}
                            >
                              👥 Consumo Compartido
                            </Text>
                          </View>
                        )}

                        <View
                          style={{
                            backgroundColor: statusColor + '20',
                            paddingHorizontal: 7,
                            paddingVertical: 2,
                            borderRadius: 6,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '800',
                              color: statusColor,
                            }}
                          >
                            {statusText}
                          </Text>
                        </View>

                        {(item.factura_recibida_id || item.facturado) && (
                          <View
                            style={{
                              backgroundColor: themeColors.success + '18',
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: '800',
                                color: themeColors.success,
                              }}
                            >
                              {item.factura_recibida_id
                                ? '✓ CFDI SAT'
                                : '✓ Facturado'}
                            </Text>
                          </View>
                        )}
                      </View>

                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: '800',
                          color: themeColors.text,
                          marginTop: 2,
                        }}
                      >
                        {provName || 'Proveedor sin asignar'}
                      </Text>

                      <Text
                        style={{
                          fontSize: 12,
                          color: themeColors.textSecondary,
                        }}
                      >
                        👤 {item.empleado_nombre || 'N/D'} • 📅 {fecha}
                        {item.justificacion
                          ? ` • ${item.justificacion.replace(/\[.*?\]/g, '').trim()}`
                          : ''}
                      </Text>

                      {/* Si es Hospedaje: mostrar rango de fechas y resumen de noches */}
                      {hospDias.length > 0 && (
                        <View
                          style={{
                            marginTop: 4,
                            backgroundColor: '#4f46e512',
                            borderRadius: BorderRadius.small,
                            padding: 6,
                            borderLeftWidth: 3,
                            borderLeftColor: '#4f46e5',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: '800',
                              color: '#4f46e5',
                            }}
                          >
                            🏨 Estancia:{' '}
                            {formatFriendlyDate(
                              item.fecha_hospedaje_inicio || hospDias[0]?.fecha
                            )}{' '}
                            al{' '}
                            {formatFriendlyDate(
                              item.fecha_hospedaje_fin ||
                                hospDias[hospDias.length - 1]?.fecha
                            )}{' '}
                            ({hospDias.length}{' '}
                            {hospDias.length === 1 ? 'noche' : 'noches'} •{' '}
                            {formatCurrency(hospDias[0]?.monto_diario || 0)} /
                            noche)
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Text
                        style={{
                          fontSize: 17,
                          fontWeight: '900',
                          color:
                            item.status === 'REJECTED'
                              ? themeColors.textSecondary
                              : themeColors.text,
                          textDecorationLine:
                            item.status === 'REJECTED'
                              ? 'line-through'
                              : 'none',
                        }}
                      >
                        {formatCurrency(Number(item.monto || 0))}
                      </Text>

                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            onOpenAssignProyecto(item);
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            paddingVertical: 5,
                            paddingHorizontal: 8,
                            borderRadius: BorderRadius.small,
                            backgroundColor: themeColors.backgroundElement,
                            borderWidth: 1,
                            borderColor: themeColors.border,
                          }}
                        >
                          <Ionicons
                            name="swap-horizontal-outline"
                            size={13}
                            color={themeColors.textSecondary}
                          />
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '700',
                              color: themeColors.textSecondary,
                            }}
                          >
                            Mover
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            onSelectGastoForReview(item);
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            paddingVertical: 5,
                            paddingHorizontal: 10,
                            borderRadius: BorderRadius.small,
                            backgroundColor:
                              item.status === 'PENDING'
                                ? themeColors.primary
                                : themeColors.accent + '18',
                          }}
                        >
                          <Ionicons
                            name={
                              item.status === 'PENDING'
                                ? 'checkmark-circle-outline'
                                : 'eye-outline'
                            }
                            size={14}
                            color={
                              item.status === 'PENDING'
                                ? '#fff'
                                : themeColors.accent
                            }
                          />
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: '800',
                              color:
                                item.status === 'PENDING'
                                  ? '#fff'
                                  : themeColors.accent,
                            }}
                          >
                            {item.status === 'PENDING'
                              ? 'Revisar / Aprobar'
                              : 'Ver Detalle'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
