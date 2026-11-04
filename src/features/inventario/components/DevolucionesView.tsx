import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Keyboard,
  Pressable,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import CustomButton from '@/components/CustomButton';
import { InventarioListSkeleton } from '@/components/skeleton';
import { styles } from './devolucionesStyles';
import { useDevoluciones } from '../hooks/useDevoluciones';
import DevolucionCard from './DevolucionCard';
import GastoCard from './GastoCard';

export default function DevolucionesView() {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const {
    activeTab,
    setActiveTab,
    inventario,
    isLoading,
    clientes,
    sucursalesCliente,
    materialesDevolver,
    materialesGasto,
    expandedDevolucion,
    setExpandedDevolucion,
    expandedGasto,
    setExpandedGasto,
    observacionesDevolucion,
    setObservacionesDevolucion,
    isSubmittingDevolucion,
    tipoGasto,
    setTipoGasto,
    detalleTrabajo,
    setDetalleTrabajo,
    selectedCliente,
    setSelectedCliente,
    selectedClienteId,
    setSelectedClienteId,
    clienteSearch,
    setClienteSearch,
    showCliDropdown,
    setShowCliDropdown,
    sucursal,
    setSucursal,
    selectedSucursalId,
    setSelectedSucursalId,
    sucursalSearch,
    setSucursalSearch,
    showSucursalDropdown,
    setShowSucursalDropdown,
    isSubmittingGasto,
    isSubmittingGastoYDevolucion,
    feedbackMessage,
    totalDevolverGeneral,
    totalGastoGeneral,
    totalRestanteGeneral,
    handleDirectQty,
    handleConditionChange,
    handleSetAllCondition,
    handleClearItem,
    handleAutollenarDevolucionTodo,
    handleTransferirRestanteADevolucion,
    handleEnviarDevolucion,
    handleEnviarGasto,
  } = useDevoluciones();

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <ScrollView style={{ flex: 1 }}>
          <InventarioListSkeleton isMobile={true} count={5} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* BANNER DE NOTIFICACIÓN EN PANTALLA */}
        {feedbackMessage && (
          <View
            style={[
              styles.feedbackBanner,
              {
                backgroundColor:
                  feedbackMessage.type === 'success' ? '#10B98120' : '#DC262620',
                borderColor: feedbackMessage.type === 'success' ? '#10B981' : '#DC2626',
              },
            ]}
          >
            <Ionicons
              name={feedbackMessage.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
              size={20}
              color={feedbackMessage.type === 'success' ? '#10B981' : '#DC2626'}
            />
            <Text
              style={{
                color: feedbackMessage.type === 'success' ? '#10B981' : '#DC2626',
                fontWeight: '700',
                fontSize: 13,
                flex: 1,
              }}
            >
              {feedbackMessage.text}
            </Text>
          </View>
        )}

        {/* ENCABEZADO */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.text }]}>Control de Material</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            Devuelve materiales sobrantes al almacén o reporta el material que utilizaste en tus
            servicios y proyectos.
          </Text>
        </View>

        {/* SELECTOR DE PESTAÑAS (SEGMENTED CONTROL) */}
        <View
          style={[
            styles.tabsContainer,
            { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'devolucion' && [
                styles.activeTabBtn,
                { backgroundColor: themeColors.primary },
              ],
            ]}
            onPress={() => {
              Keyboard.dismiss();
              setActiveTab('devolucion');
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="return-down-back-outline"
              size={18}
              color={activeTab === 'devolucion' ? '#ffffff' : themeColors.textSecondary}
            />
            <Text
              style={[
                styles.tabBtnText,
                { color: activeTab === 'devolucion' ? '#ffffff' : themeColors.textSecondary },
              ]}
            >
              Devolver al Almacén
            </Text>
            {totalDevolverGeneral > 0 && activeTab !== 'devolucion' && (
              <View style={[styles.tabBadge, { backgroundColor: themeColors.primary }]}>
                <Text style={styles.tabBadgeText}>{totalDevolverGeneral}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'gasto' && [styles.activeTabBtn, { backgroundColor: '#10B981' }],
            ]}
            onPress={() => {
              Keyboard.dismiss();
              setActiveTab('gasto');
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="construct-outline"
              size={18}
              color={activeTab === 'gasto' ? '#ffffff' : themeColors.textSecondary}
            />
            <Text
              style={[
                styles.tabBtnText,
                { color: activeTab === 'gasto' ? '#ffffff' : themeColors.textSecondary },
              ]}
            >
              Gasto de Material
            </Text>
            {totalGastoGeneral > 0 && activeTab !== 'gasto' && (
              <View style={[styles.tabBadge, { backgroundColor: '#10B981' }]}>
                <Text style={styles.tabBadgeText}>{totalGastoGeneral}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* CONTENIDO PRINCIPAL */}
        {inventario.length === 0 ? (
          <View
            style={[
              styles.emptyContainer,
              {
                backgroundColor: themeColors.backgroundElement,
                borderColor: themeColors.border,
              },
            ]}
          >
            <Ionicons name="cube-outline" size={48} color={themeColors.textSecondary} />
            <Text
              style={{
                color: themeColors.textSecondary,
                marginTop: Spacing.two,
                textAlign: 'center',
                fontSize: 15,
                fontWeight: '500',
              }}
            >
              No tienes material en tu inventario personal / camioneta.
            </Text>
            <Text
              style={{
                color: themeColors.textSecondary,
                marginTop: 4,
                textAlign: 'center',
                fontSize: 12,
              }}
            >
              Puedes solicitar material en la sección de &quot;Retirar Material&quot;.
            </Text>
          </View>
        ) : (
          <View>
            {/* ========== TAB 1: DEVOLUCIÓN AL ALMACÉN ========== */}
            {activeTab === 'devolucion' && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: themeColors.backgroundElement,
                    borderColor: themeColors.border,
                  },
                ]}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: Spacing.two,
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.text }}>
                      Material en Camioneta ({inventario.length})
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: themeColors.textSecondary,
                        marginTop: 2,
                      }}
                    >
                      Selecciona lo que reintegrarás al almacén físico.
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={handleAutollenarDevolucionTodo}
                    style={[
                      styles.quickPresetBtn,
                      {
                        borderColor: themeColors.primary,
                        backgroundColor: themeColors.primary + '18',
                      },
                    ]}
                  >
                    <Ionicons name="sparkles" size={14} color={themeColors.primary} />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: themeColors.primary,
                      }}
                    >
                      Devolver Todo
                    </Text>
                  </TouchableOpacity>
                </View>

                {materialesDevolver.map((m, idx) => (
                  <DevolucionCard
                    key={m.productoId}
                    m={m}
                    idx={idx}
                    themeColors={themeColors}
                    isExpanded={!!expandedDevolucion[m.productoId]}
                    onToggleExpand={() =>
                      setExpandedDevolucion((prev) => ({
                        ...prev,
                        [m.productoId]: !prev[m.productoId],
                      }))
                    }
                    handleClearItem={handleClearItem}
                    handleDirectQty={handleDirectQty}
                    handleSetAllCondition={handleSetAllCondition}
                    handleConditionChange={handleConditionChange}
                  />
                ))}

                <Text
                  style={{
                    color: themeColors.text,
                    fontWeight: '600',
                    marginTop: Spacing.four,
                    marginBottom: Spacing.two,
                  }}
                >
                  Observaciones o Motivo (Opcional)
                </Text>
                <TextInput
                  style={[
                    styles.textArea,
                    {
                      borderColor: themeColors.border,
                      color: themeColors.text,
                      backgroundColor: themeColors.background,
                    },
                  ]}
                  multiline
                  numberOfLines={3}
                  placeholder="Ej: Material sobrante del servicio en sucursal X..."
                  placeholderTextColor={themeColors.textSecondary}
                  value={observacionesDevolucion}
                  onChangeText={setObservacionesDevolucion}
                />

                <CustomButton
                  title={
                    totalDevolverGeneral > 0
                      ? `Solicitar Devolución (${totalDevolverGeneral} unidades)`
                      : 'Solicitar Devolución'
                  }
                  variant="primary"
                  onPress={handleEnviarDevolucion}
                  loading={isSubmittingDevolucion}
                  disabled={totalDevolverGeneral === 0}
                  style={{ marginTop: Spacing.four }}
                />
              </View>
            )}

            {/* ========== TAB 2: GASTO / USO DE MATERIAL ========== */}
            {activeTab === 'gasto' && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: themeColors.backgroundElement,
                    borderColor: themeColors.border,
                  },
                ]}
              >
                {/* Encabezado de Gasto */}
                <View style={{ marginBottom: Spacing.three }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.text }}>
                    Reportar Consumo de Material
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: themeColors.textSecondary,
                      marginTop: 2,
                    }}
                  >
                    Registra los materiales de tu camioneta que utilizaste en un servicio,
                    instalación o proyecto.
                  </Text>
                </View>

                {/* 1. Selector de Tipo de Gasto */}
                <View style={{ marginBottom: Spacing.three }}>
                  <Text
                    style={{
                      color: themeColors.text,
                      marginBottom: Spacing.one,
                      fontWeight: '600',
                      fontSize: 13,
                    }}
                  >
                    Tipo de Destino / Gasto *
                  </Text>
                  <View style={{ flexDirection: 'row', gap: Spacing.one }}>
                    {(['Servicio', 'Proyecto', 'Venta', 'Operativo'] as const).map((tipo) => {
                      const isSelected = tipoGasto === tipo;
                      return (
                        <TouchableOpacity
                          key={tipo}
                          style={{
                            flex: 1,
                            paddingVertical: 10,
                            borderRadius: BorderRadius.medium,
                            borderWidth: 1.5,
                            borderColor: isSelected ? '#10B981' : themeColors.border,
                            backgroundColor: isSelected ? '#10B98120' : themeColors.background,
                            alignItems: 'center',
                          }}
                          onPress={() => setTipoGasto(tipo)}
                        >
                          <Text
                            style={{
                              color: isSelected ? '#10B981' : themeColors.textSecondary,
                              fontWeight: isSelected ? '700' : '500',
                              fontSize: 13,
                            }}
                          >
                            {tipo}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 2. Cliente Relacionado */}
                <View style={{ marginBottom: Spacing.three, zIndex: 20 }}>
                  <Text
                    style={{
                      color: themeColors.text,
                      marginBottom: Spacing.half,
                      fontWeight: '600',
                      fontSize: 13,
                    }}
                  >
                    Cliente Relacionado (Opcional)
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.dropdownTrigger,
                      {
                        backgroundColor: themeColors.background,
                        borderColor: themeColors.border,
                      },
                    ]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowCliDropdown(!showCliDropdown);
                      setShowSucursalDropdown(false);
                    }}
                  >
                    <Ionicons
                      name="business-outline"
                      size={18}
                      color={themeColors.textSecondary}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={{
                        flex: 1,
                        color: selectedCliente ? themeColors.text : themeColors.textSecondary,
                      }}
                    >
                      {selectedCliente || 'Selecciona un cliente'}
                    </Text>
                    {selectedCliente ? (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setSelectedCliente('');
                          setSelectedClienteId(null);
                          setSucursal('');
                          setSelectedSucursalId(null);
                        }}
                        style={{ padding: 4 }}
                      >
                        <Ionicons
                          name="close-circle"
                          size={16}
                          color={themeColors.textSecondary}
                        />
                      </TouchableOpacity>
                    ) : (
                      <Ionicons
                        name={showCliDropdown ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={themeColors.text}
                      />
                    )}
                  </TouchableOpacity>

                  {showCliDropdown && (
                    <Pressable
                      onPress={(e) => e.stopPropagation()}
                      style={styles.dropdownListWrapper}
                    >
                      <View
                        style={[
                          styles.dropdownList,
                          {
                            backgroundColor: themeColors.background,
                            borderColor: themeColors.border,
                          },
                        ]}
                      >
                        <TextInput
                          placeholder="Buscar cliente..."
                          placeholderTextColor={themeColors.textSecondary}
                          value={clienteSearch}
                          onChangeText={setClienteSearch}
                          style={[
                            styles.textInput,
                            {
                              height: 38,
                              marginBottom: 6,
                              backgroundColor: themeColors.backgroundElement,
                              color: themeColors.text,
                              borderColor: themeColors.border,
                            },
                          ]}
                        />
                        <ScrollView
                          nestedScrollEnabled={true}
                          style={{ maxHeight: 200 }}
                          keyboardShouldPersistTaps="handled"
                        >
                          {clientes
                            .filter(
                              (cli) =>
                                !clienteSearch ||
                                (cli.nombre &&
                                  cli.nombre.toLowerCase().includes(clienteSearch.toLowerCase()))
                            )
                            .map((cli) => (
                              <TouchableOpacity
                                key={cli.id}
                                style={[
                                  styles.dropdownItem,
                                  { borderBottomColor: themeColors.border },
                                ]}
                                onPress={() => {
                                  setSelectedCliente(cli.nombre);
                                  setSelectedClienteId(cli.id);
                                  const cliSucs = sucursalesCliente.filter(
                                    (s) => s.cliente_id === cli.id
                                  );
                                  if (cliSucs.length === 1) {
                                    setSucursal(cliSucs[0].nombre);
                                    setSelectedSucursalId(cliSucs[0].id);
                                  } else {
                                    setSucursal('');
                                    setSelectedSucursalId(null);
                                  }
                                  setClienteSearch('');
                                  setShowCliDropdown(false);
                                }}
                              >
                                <Text
                                  style={{
                                    color: themeColors.text,
                                    fontSize: 13,
                                    fontWeight: selectedClienteId === cli.id ? '700' : '400',
                                  }}
                                >
                                  {cli.nombre}
                                </Text>
                              </TouchableOpacity>
                            ))}
                        </ScrollView>
                      </View>
                    </Pressable>
                  )}
                </View>

                {/* 3. Sucursal */}
                {selectedClienteId && (
                  <View style={{ marginBottom: Spacing.three, zIndex: 10 }}>
                    <Text
                      style={{
                        color: themeColors.text,
                        marginBottom: Spacing.half,
                        fontWeight: '600',
                        fontSize: 13,
                      }}
                    >
                      Sucursal
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.dropdownTrigger,
                        {
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border,
                        },
                      ]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowSucursalDropdown(!showSucursalDropdown);
                        setShowCliDropdown(false);
                      }}
                    >
                      <Ionicons
                        name="location-outline"
                        size={18}
                        color={themeColors.textSecondary}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={{
                          flex: 1,
                          color: sucursal ? themeColors.text : themeColors.textSecondary,
                        }}
                      >
                        {sucursal || 'Selecciona una sucursal'}
                      </Text>
                      {sucursal ? (
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            setSucursal('');
                            setSelectedSucursalId(null);
                          }}
                          style={{ padding: 4 }}
                        >
                          <Ionicons
                            name="close-circle"
                            size={16}
                            color={themeColors.textSecondary}
                          />
                        </TouchableOpacity>
                      ) : (
                        <Ionicons
                          name={showSucursalDropdown ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={themeColors.text}
                        />
                      )}
                    </TouchableOpacity>

                    {showSucursalDropdown && (
                      <Pressable
                        onPress={(e) => e.stopPropagation()}
                        style={styles.dropdownListWrapper}
                      >
                        <View
                          style={[
                            styles.dropdownList,
                            {
                              backgroundColor: themeColors.background,
                              borderColor: themeColors.border,
                            },
                          ]}
                        >
                          <TextInput
                            placeholder="Buscar sucursal..."
                            placeholderTextColor={themeColors.textSecondary}
                            value={sucursalSearch}
                            onChangeText={setSucursalSearch}
                            style={[
                              styles.textInput,
                              {
                                height: 38,
                                marginBottom: 6,
                                backgroundColor: themeColors.backgroundElement,
                                color: themeColors.text,
                                borderColor: themeColors.border,
                              },
                            ]}
                          />
                          <ScrollView
                            nestedScrollEnabled={true}
                            style={{ maxHeight: 200 }}
                            keyboardShouldPersistTaps="handled"
                          >
                            {sucursalesCliente
                              .filter((s) => s.cliente_id === selectedClienteId)
                              .filter(
                                (s) =>
                                  !sucursalSearch ||
                                  (s.nombre &&
                                    s.nombre
                                      .toLowerCase()
                                      .includes(sucursalSearch.toLowerCase()))
                              )
                              .map((s) => (
                                <TouchableOpacity
                                  key={s.id}
                                  style={[
                                    styles.dropdownItem,
                                    { borderBottomColor: themeColors.border },
                                  ]}
                                  onPress={() => {
                                    setSucursal(s.nombre);
                                    setSelectedSucursalId(s.id);
                                    setSucursalSearch('');
                                    setShowSucursalDropdown(false);
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: themeColors.text,
                                      fontSize: 13,
                                      fontWeight: selectedSucursalId === s.id ? '700' : '400',
                                    }}
                                  >
                                    {s.nombre}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                          </ScrollView>
                        </View>
                      </Pressable>
                    )}
                  </View>
                )}

                {/* 4. Detalle / Motivo del Trabajo */}
                <View style={{ marginBottom: Spacing.four }}>
                  <Text
                    style={{
                      color: themeColors.text,
                      marginBottom: Spacing.half,
                      fontWeight: '600',
                      fontSize: 13,
                    }}
                  >
                    Detalle o Motivo del Trabajo (Opcional)
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        borderColor: themeColors.border,
                        color: themeColors.text,
                        backgroundColor: themeColors.background,
                        height: 42,
                      },
                    ]}
                    placeholder="Ej: Instalación de nodo de red y parcheo en site principal..."
                    placeholderTextColor={themeColors.textSecondary}
                    value={detalleTrabajo}
                    onChangeText={setDetalleTrabajo}
                  />
                </View>

                {/* 5. Lista de Materiales a Gastar */}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: Spacing.two,
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: 'bold', color: themeColors.text }}>
                    Materiales Utilizados ({inventario.length})
                  </Text>

                  {totalGastoGeneral > 0 && (
                    <View
                      style={{
                        backgroundColor: '#10B98120',
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 12,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>
                        Consumo: {totalGastoGeneral} | Restante: {totalRestanteGeneral}
                      </Text>
                    </View>
                  )}
                </View>

                {materialesGasto.map((m, idx) => (
                  <GastoCard
                    key={m.productoId}
                    m={m}
                    idx={idx}
                    themeColors={themeColors}
                    isExpanded={!!expandedGasto[m.productoId]}
                    onToggleExpand={() =>
                      setExpandedGasto((prev) => ({
                        ...prev,
                        [m.productoId]: !prev[m.productoId],
                      }))
                    }
                    handleClearItem={handleClearItem}
                    handleDirectQty={handleDirectQty}
                    handleSetAllCondition={handleSetAllCondition}
                    handleConditionChange={handleConditionChange}
                  />
                ))}

                {/* BOTONES DE ACCIÓN PARA GASTO Y DEVOLUCIÓN DEL RESTANTE */}
                <View style={{ marginTop: Spacing.four, gap: Spacing.two }}>
                  {/* Botón 1: Reportar Consumo de Material */}
                  <CustomButton
                    title={
                      totalGastoGeneral > 0
                        ? `Reportar Consumo (${totalGastoGeneral} unidades)`
                        : 'Reportar Consumo de Material'
                    }
                    variant="primary"
                    onPress={() => handleEnviarGasto(false)}
                    loading={isSubmittingGasto}
                    disabled={totalGastoGeneral === 0}
                    style={{ backgroundColor: '#10B981' }}
                  />

                  {/* Botón 2: Reportar Consumo y Devolver Restante al Almacén */}
                  {totalRestanteGeneral > 0 && totalGastoGeneral > 0 && (
                    <TouchableOpacity
                      onPress={() => handleEnviarGasto(true)}
                      disabled={isSubmittingGastoYDevolucion || isSubmittingGasto}
                      style={[
                        styles.dualActionBtn,
                        {
                          backgroundColor: themeColors.primary + '18',
                          borderColor: themeColors.primary,
                        },
                      ]}
                    >
                      {isSubmittingGastoYDevolucion ? (
                        <ActivityIndicator size="small" color={themeColors.primary} />
                      ) : (
                        <>
                          <Ionicons
                            name="swap-horizontal"
                            size={18}
                            color={themeColors.primary}
                          />
                          <Text
                            style={[styles.dualActionBtnText, { color: themeColors.primary }]}
                          >
                            Reportar Consumo ({totalGastoGeneral}) y Devolver Restante (
                            {totalRestanteGeneral}) al Almacén
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Botón 3: Cargar sobrantes en la pestaña de devolución */}
                  {totalRestanteGeneral > 0 && (
                    <TouchableOpacity
                      onPress={handleTransferirRestanteADevolucion}
                      style={[
                        styles.dualActionBtn,
                        {
                          backgroundColor: themeColors.background,
                          borderColor: themeColors.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name="arrow-undo-outline"
                        size={16}
                        color={themeColors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.dualActionBtnText,
                          { color: themeColors.textSecondary, fontSize: 12 },
                        ]}
                      >
                        Pasar todo el sobrante ({totalRestanteGeneral} pzas) a Devolución al
                        Almacén
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
