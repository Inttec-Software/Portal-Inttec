import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';
import { Gasto } from '@/services/supabase';
import {
  Proyecto,
  ProyectoDetailResponse,
  ProyectoResumen,
} from '../types';
import { ProyectoDetailView } from './ProyectoDetailView';

interface ProyectosTabViewProps {
  proyectos: ProyectoResumen[];
  statusFilter: 'ACTIVO' | 'CERRADO' | 'ALL';
  onChangeStatusFilter: (s: 'ACTIVO' | 'CERRADO' | 'ALL') => void;
  proyectoSearch: string;
  onChangeProyectoSearch: (q: string) => void;
  isLoadingProyectos: boolean;
  selectedProyectoId: string | null;
  selectedProyectoDetail: ProyectoDetailResponse | null;
  isLoadingProyectoDetail: boolean;
  isDesktop: boolean;
  themeColors: any;
  formatCurrency: (val: number) => string;
  formatFriendlyDate: (dateStr?: string | null) => string;
  onOpenNewProyecto: () => void;
  onOpenEditProyecto: (proyecto: Proyecto) => void;
  onToggleProyectoStatus: (proyecto: Proyecto) => void;
  onSelectProyecto: (proyectoId: string) => void;
  onCloseProyectoDetail: () => void;
  onRefreshProyectos: () => void;
  onRefreshProyectoDetail: () => void;
  onSelectGastoForReview: (gasto: Gasto) => void;
  onOpenAssignProyecto: (gasto: Gasto) => void;
  onExportProyectoPDF?: () => void;
  onExportProyectoXLSX?: () => void;
  isExportingProyecto?: boolean;
  headerComponent?: React.ReactNode;
}

export function ProyectosTabView({
  proyectos,
  statusFilter,
  onChangeStatusFilter,
  proyectoSearch,
  onChangeProyectoSearch,
  isLoadingProyectos,
  selectedProyectoId,
  selectedProyectoDetail,
  isLoadingProyectoDetail,
  isDesktop,
  themeColors,
  formatCurrency,
  formatFriendlyDate,
  onOpenNewProyecto,
  onOpenEditProyecto,
  onToggleProyectoStatus,
  onSelectProyecto,
  onCloseProyectoDetail,
  onRefreshProyectos,
  onRefreshProyectoDetail,
  onSelectGastoForReview,
  onOpenAssignProyecto,
  onExportProyectoPDF,
  onExportProyectoXLSX,
  isExportingProyecto,
  headerComponent,
}: ProyectosTabViewProps) {
  const counts = useMemo(() => {
    let activos = 0;
    let cerrados = 0;
    for (const p of proyectos) {
      if (p.status === 'CERRADO') cerrados += 1;
      else activos += 1;
    }
    return { activos, cerrados, todos: proyectos.length };
  }, [proyectos]);

  const filteredProyectos = useMemo(() => {
    const q = proyectoSearch.trim().toLowerCase();
    return proyectos.filter((p) => {
      if (statusFilter === 'ACTIVO' && p.status !== 'ACTIVO') return false;
      if (statusFilter === 'CERRADO' && p.status !== 'CERRADO') return false;
      if (!q) return true;
      const text = `${p.nombre || ''} ${p.cliente_nombre || ''} ${p.sucursal_nombre || ''} ${p.notas || ''}`.toLowerCase();
      return text.includes(q);
    });
  }, [proyectos, statusFilter, proyectoSearch]);

  // Si hay un proyecto abierto, mostrar su vista detalle con las 5 tarjetas
  if (selectedProyectoId) {
    if (isLoadingProyectoDetail && !selectedProyectoDetail) {
      return (
        <ScrollView style={{ flex: 1 }}>
          {headerComponent}
          <View
            style={{
              paddingVertical: Spacing.seven,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <ActivityIndicator size="large" color={themeColors.primary} />
            <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>
              Cargando proyecto y desglose por categorías...
            </Text>
          </View>
        </ScrollView>
      );
    }

    if (selectedProyectoDetail) {
      return (
        <View style={{ flex: 1 }}>
          <ProyectoDetailView
            proyecto={selectedProyectoDetail.proyecto}
            resumen={selectedProyectoDetail.resumen}
            gastos={selectedProyectoDetail.gastos}
            isLoading={isLoadingProyectoDetail}
            isDesktop={isDesktop}
            themeColors={themeColors}
            formatCurrency={formatCurrency}
            formatFriendlyDate={formatFriendlyDate}
            onBack={onCloseProyectoDetail}
            onRefresh={onRefreshProyectoDetail}
            onEditProyecto={onOpenEditProyecto}
            onToggleProyectoStatus={onToggleProyectoStatus}
            onSelectGastoForReview={onSelectGastoForReview}
            onOpenAssignProyecto={onOpenAssignProyecto}
            onExportProyectoPDF={onExportProyectoPDF}
            onExportProyectoXLSX={onExportProyectoXLSX}
            isExportingProyecto={isExportingProyecto}
          />
        </View>
      );
    }
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: Spacing.seven }}
    >
      {headerComponent}

      <View style={{ paddingHorizontal: Spacing.three, gap: Spacing.two }}>
        {/* Barra de controles de Proyectos */}
        <View
          style={{
            flexDirection: isDesktop ? 'row' : 'column',
            justifyContent: 'space-between',
            alignItems: isDesktop ? 'center' : 'stretch',
            gap: Spacing.two,
          }}
        >
          {/* Filtros Activos / Cerrados / Todos */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: themeColors.backgroundElement,
              borderRadius: BorderRadius.medium,
              borderWidth: 1,
              borderColor: themeColors.border,
              overflow: 'hidden',
            }}
          >
            {[
              { key: 'ACTIVO' as const, label: `Activos (${counts.activos})` },
              { key: 'CERRADO' as const, label: `Cerrados (${counts.cerrados})` },
              { key: 'ALL' as const, label: `Todos (${counts.todos})` },
            ].map((tab, idx) => {
              const active = statusFilter === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => onChangeStatusFilter(tab.key)}
                  style={{
                    paddingVertical: 9,
                    paddingHorizontal: 14,
                    backgroundColor: active
                      ? themeColors.primary + '20'
                      : 'transparent',
                    borderRightWidth: idx < 2 ? 1 : 0,
                    borderColor: themeColors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: active ? '800' : '600',
                      color: active
                        ? themeColors.primary
                        : themeColors.textSecondary,
                    }}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Buscador de proyectos + Botón Nuevo Proyecto */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              flex: isDesktop ? 1 : undefined,
              maxWidth: isDesktop ? 560 : undefined,
            }}
          >
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: themeColors.backgroundElement,
                borderRadius: BorderRadius.medium,
                borderWidth: 1,
                borderColor: themeColors.border,
                paddingHorizontal: 10,
                height: 40,
              }}
            >
              <Ionicons
                name="search-outline"
                size={16}
                color={themeColors.textSecondary}
                style={{ marginRight: 6 }}
              />
              <TextInput
                value={proyectoSearch}
                onChangeText={onChangeProyectoSearch}
                placeholder="Buscar proyecto, cliente o sucursal..."
                placeholderTextColor={themeColors.textSecondary}
                style={{ flex: 1, color: themeColors.text, fontSize: 13 }}
              />
              {proyectoSearch.length > 0 && (
                <TouchableOpacity onPress={() => onChangeProyectoSearch('')}>
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color={themeColors.textSecondary}
                  />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              onPress={onRefreshProyectos}
              style={{
                height: 40,
                width: 40,
                borderRadius: BorderRadius.medium,
                backgroundColor: themeColors.backgroundElement,
                borderWidth: 1,
                borderColor: themeColors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="refresh" size={18} color={themeColors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onOpenNewProyecto}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 40,
                paddingHorizontal: 14,
                borderRadius: BorderRadius.medium,
                backgroundColor: themeColors.primary,
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '800',
                  color: '#fff',
                }}
              >
                Nuevo Proyecto
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Grid de Proyectos */}
        {isLoadingProyectos ? (
          <View
            style={{
              paddingVertical: Spacing.seven,
              alignItems: 'center',
              gap: 10,
            }}
          >
            <ActivityIndicator size="large" color={themeColors.primary} />
            <Text style={{ fontSize: 13, color: themeColors.textSecondary }}>
              Cargando proyectos...
            </Text>
          </View>
        ) : filteredProyectos.length === 0 ? (
          <View
            style={{
              backgroundColor: themeColors.backgroundElement,
              borderRadius: BorderRadius.large,
              borderWidth: 1,
              borderColor: themeColors.border,
              padding: Spacing.six,
              alignItems: 'center',
              gap: Spacing.two,
            }}
          >
            <Ionicons
              name="folder-open-outline"
              size={48}
              color={themeColors.textSecondary}
            />
            <Text
              style={{
                fontSize: 15,
                fontWeight: '800',
                color: themeColors.text,
                textAlign: 'center',
              }}
            >
              No hay proyectos en esta vista
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: themeColors.textSecondary,
                textAlign: 'center',
                maxWidth: 420,
              }}
            >
              Crea un nuevo proyecto con su cliente y sucursal para
              que los empleados seleccionen el proyecto de la lista y concentren ahí
              todos sus gastos.
            </Text>
            <TouchableOpacity
              onPress={onOpenNewProyecto}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginTop: 4,
                paddingVertical: 10,
                paddingHorizontal: 18,
                borderRadius: BorderRadius.medium,
                backgroundColor: themeColors.primary,
              }}
            >
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>
                Crear Primer Proyecto
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            {filteredProyectos.map((proy) => {
              const cat = proy.totales_por_categoria || {
                alimentos: 0,
                hospedaje: 0,
                material: 0,
                equipo: 0,
                transporte: 0,
                combustible: 0,
                traslados: 0,
              };

              return (
                <TouchableOpacity
                  key={proy.id}
                  activeOpacity={0.8}
                  onPress={() => onSelectProyecto(proy.id)}
                  style={{
                    flexGrow: 1,
                    flexBasis: isDesktop ? '31%' : '100%',
                    minWidth: isDesktop ? 310 : '100%',
                    backgroundColor: themeColors.backgroundElement,
                    borderRadius: BorderRadius.large,
                    borderWidth: proy.pendientes_count > 0 ? 1.5 : 1,
                    borderColor:
                      proy.pendientes_count > 0
                        ? themeColors.warning
                        : themeColors.border,
                    padding: Spacing.three,
                    gap: Spacing.two,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05,
                    shadowRadius: 6,
                    elevation: 2,
                  }}
                >
                  {/* Top Row: Status + Pendientes + Edit */}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        flexWrap: 'wrap',
                      }}
                    >
                      <View
                        style={{
                          backgroundColor:
                            proy.status === 'ACTIVO'
                              ? themeColors.success + '18'
                              : '#64748b20',
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <View
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor:
                              proy.status === 'ACTIVO'
                                ? themeColors.success
                                : '#64748b',
                          }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '800',
                            color:
                              proy.status === 'ACTIVO'
                                ? themeColors.success
                                : '#64748b',
                          }}
                        >
                          {proy.status}
                        </Text>
                      </View>

                      {proy.pendientes_count > 0 && (
                        <View
                          style={{
                            backgroundColor: themeColors.warning + '20',
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 10,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Ionicons
                            name="time"
                            size={12}
                            color={themeColors.warning}
                          />
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '800',
                              color: themeColors.warning,
                            }}
                          >
                            {proy.pendientes_count} por revisar
                          </Text>
                        </View>
                      )}

                      {(proy.venta_rel || proy.venta_id) && (
                        <View
                          style={{
                            backgroundColor: '#0284c718',
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 10,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Ionicons name="cart-outline" size={11} color="#0284c7" />
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '800',
                              color: '#0284c7',
                            }}
                            numberOfLines={1}
                          >
                            {proy.venta_rel?.folio
                              ? `Venta ${proy.venta_rel.folio}`
                              : proy.venta_rel?.cliente
                                ? `Venta: ${proy.venta_rel.cliente}`
                                : 'Venta vinculada'}
                          </Text>
                        </View>
                      )}
                    </View>

                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        onOpenEditProyecto(proy);
                      }}
                      style={{
                        padding: 6,
                        borderRadius: BorderRadius.small,
                        backgroundColor: themeColors.background,
                        borderWidth: 1,
                        borderColor: themeColors.border,
                      }}
                    >
                      <Ionicons
                        name="create-outline"
                        size={15}
                        color={themeColors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Nombre y Cliente/Sucursal */}
                  <View style={{ gap: 3 }}>
                    <Text
                      style={{
                        fontSize: 17,
                        fontWeight: '900',
                        color: themeColors.text,
                      }}
                      numberOfLines={2}
                    >
                      {proy.nombre}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Ionicons
                        name="business-outline"
                        size={13}
                        color={themeColors.primary}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: themeColors.primary,
                        }}
                        numberOfLines={1}
                      >
                        {proy.cliente_nombre || 'Sin cliente asignado'}
                      </Text>
                    </View>
                    {proy.sucursal_nombre ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Ionicons
                          name="location-outline"
                          size={13}
                          color={themeColors.textSecondary}
                        />
                        <Text
                          style={{
                            fontSize: 12,
                            color: themeColors.textSecondary,
                          }}
                          numberOfLines={1}
                        >
                          Sucursal: {proy.sucursal_nombre}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Mini resumen de los 5 bloques */}
                  <View
                    style={{
                      backgroundColor: themeColors.background,
                      borderRadius: BorderRadius.medium,
                      padding: 8,
                      borderWidth: 1,
                      borderColor: themeColors.border,
                      gap: 4,
                    }}
                  >
                    {[
                      {
                        label: '🍽️ Alimentos',
                        val: cat.alimentos,
                        color: '#ea580c',
                      },
                      {
                        label: '🏨 Hospedaje',
                        val: cat.hospedaje,
                        color: '#4f46e5',
                      },
                      {
                        label: '🧱 Material',
                        val: cat.material,
                        color: '#059669',
                      },
                      {
                        label: '🛠️ Equipo',
                        val: cat.equipo,
                        color: '#7c3aed',
                      },
                      {
                        label: '🚚 Transporte',
                        val: cat.transporte,
                        color: '#0284c7',
                      },
                    ].map((row) => (
                      <View
                        key={row.label}
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '600',
                            color: themeColors.textSecondary,
                          }}
                        >
                          {row.label}
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: row.val > 0 ? '800' : '600',
                            color:
                              row.val > 0
                                ? themeColors.text
                                : themeColors.textSecondary,
                          }}
                        >
                          {formatCurrency(row.val)}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Footer con Total General */}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: 6,
                      borderTopWidth: 1,
                      borderTopColor: themeColors.border,
                    }}
                  >
                    <View>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '800',
                          color: themeColors.textSecondary,
                          textTransform: 'uppercase',
                        }}
                      >
                        Total Proyecto
                      </Text>
                      <Text
                        style={{
                          fontSize: 19,
                          fontWeight: '900',
                          color: themeColors.text,
                        }}
                      >
                        {formatCurrency(proy.total_general)}
                      </Text>
                    </View>

                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: themeColors.primary + '18',
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: BorderRadius.small,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: themeColors.primary,
                        }}
                      >
                        Ver Proyecto
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={15}
                        color={themeColors.primary}
                      />
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
