import React, { createElement } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  Pressable,
  Switch,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Spacing, BorderRadius } from '@/constants/theme';
import CustomInput from '@/components/CustomInput';
import CustomButton from '@/components/CustomButton';
import { styles } from './gastoFormStyles';
import { useGastoForm } from '../hooks/useGastoForm';

interface Paso2DetallesProps {
  form: ReturnType<typeof useGastoForm>;
  themeColors: any;
}

export default function Paso2Detalles({ form, themeColors }: Paso2DetallesProps) {
  const {
    role,
    mode,
    ticketFiles,
    activeTicketIndex,
    imageUri,
    imageExt,
    setActivePreviewUrl,
    setViewerInitialIndex,
    setViewerVisible,
    alertaPolitica,
    alertaLocal,
    monto,
    setMonto,
    incluyePropina,
    montoPropina,
    esComida,
    fechaComprobante,
    setFechaComprobante,
    showDatePicker,
    setShowDatePicker,
    dateValue,
    setDateValue,
    onChangeDate,
    proveedores,
    proveedor,
    setProveedor,
    proveedorSearch,
    setProveedorSearch,
    showProvDropdown,
    setShowProvDropdown,
    setShowEmpList,
    comentarioProveedor,
    setComentarioProveedor,
    setNuevoProvNombre,
    setNuevoProvRfc,
    setModalNuevoProveedorVisible,
    tipoServicioProyecto,
    setTipoServicioProyecto,
    detalleServicioProyecto,
    setDetalleServicioProyecto,
    isSplit,
    setIsSplit,
    splits,
    setSplits,
    clientes,
    selectedCliente,
    setSelectedCliente,
    clienteSearch,
    setClienteSearch,
    showCliDropdown,
    setShowCliDropdown,
    setShowCatDropdown,
    setShowSubDropdown,
    handleAddNewCliente,
    sucursalesCliente,
    sucursal,
    setSucursal,
    sucursalSearch,
    setSucursalSearch,
    showSucursalDropdown,
    setShowSucursalDropdown,
    comentarioSucursal,
    setComentarioSucursal,
    handleAddNewSucursal,
    setNewSplitClienteId,
    setNewSplitSucursalNombre,
    setNewSplitComentarioSucursal,
    setNewSplitMonto,
    setSplitClienteSearch,
    setSplitSucursalSearch,
    setShowNewSplitCliDropdown,
    setShowNewSplitSucDropdown,
    setShowSplitModal,
    metodoPago,
    setMetodoPago,
    tipoTarjeta,
    setTipoTarjeta,
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
    handleSelectFacturaPdf,
    handlePreviewPdf,
    handleRemoveFacturaPdf,
    prevStep,
    nextStep,
  } = form;

  return (
    <View style={styles.stepContainer}>
      <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
        2. Detalles de la Compra
      </Text>

      {(ticketFiles.length > 0 || imageUri) && (
        <TouchableOpacity
          onPress={() => {
            const currentFile = ticketFiles[activeTicketIndex] || ticketFiles[0];
            const curExt = currentFile ? currentFile.ext : imageExt;
            const curUri = currentFile ? currentFile.uri : imageUri;
            if (curExt !== 'pdf' && curUri) {
              setActivePreviewUrl(curUri);
              setViewerInitialIndex(ticketFiles.length > 0 ? activeTicketIndex : 0);
              setViewerVisible(true);
            }
          }}
          activeOpacity={0.8}
          style={[styles.floatingPreviewBanner, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
        >
          {(ticketFiles[0]?.ext === 'pdf' || (!ticketFiles.length && imageExt === 'pdf')) ? (
            <View style={styles.floatingPreviewThumb}>
              <Ionicons name="document-text" size={24} color={themeColors.danger} />
            </View>
          ) : (
            <Image source={{ uri: ticketFiles[0]?.uri || imageUri! }} style={styles.floatingPreviewThumb} resizeMode="cover" />
          )}
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.floatingPreviewTitle, { color: themeColors.text }]}>
              Ticket{ticketFiles.length > 1 ? `s (${ticketFiles.length} fotos)` : ''} Adjunto
            </Text>
            <Text style={[styles.floatingPreviewSub, { color: themeColors.textSecondary }]}>
              Toca aquí para ampliar y revisar {ticketFiles.length > 1 ? 'las fotos' : 'el ticket'}
            </Text>
          </View>
          <Ionicons name="eye-outline" size={20} color={themeColors.primary} />
        </TouchableOpacity>
      )}

      {!!(alertaPolitica || alertaLocal) && (
        <View style={[styles.alertBanner, { backgroundColor: themeColors.danger + '15', borderColor: themeColors.danger }]}>
          <Ionicons name="warning-outline" size={22} color={themeColors.danger} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.alertTitle, { color: themeColors.danger }]}>Alerta de Políticas de Gasto</Text>
            <Text style={[styles.alertText, { color: themeColors.text }]}>
              {[alertaPolitica, alertaLocal].filter(Boolean).join('\n')}
            </Text>
          </View>
        </View>
      )}

      <CustomInput
        label="Monto ($ MXN) *"
        placeholder="0.00"
        keyboardType="decimal-pad"
        value={monto}
        onChangeText={(val) => setMonto(val.replace(',', '.').replace(/[^0-9.]/g, ''))}
        iconName="logo-usd"
      />

      {incluyePropina === false && montoPropina ? (
        <Text style={{ fontSize: 13, color: themeColors.textSecondary, marginTop: -Spacing.one, marginBottom: Spacing.two, fontStyle: 'italic', paddingLeft: Spacing.one }}>
          Total del Gasto (Ticket + Propina): ${(Number(monto || 0) + Number(montoPropina)).toFixed(2)} MXN
        </Text>
      ) : null}

      <View style={{ position: 'relative' }}>
        <CustomInput
          label="Fecha de Gasto *"
          placeholder="Selecciona la fecha"
          value={fechaComprobante}
          editable={false}
          iconName="calendar-outline"
        />
        {Platform.OS === 'web' ? (
          createElement('input', {
            type: 'date',
            style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 100 },
            onClick: (e: any) => {
              try { e.target.showPicker(); } catch (err) {}
            },
            onChange: (e: any) => {
              if (e.target.value) {
                const parts = e.target.value.split('-');
                if (parts.length === 3) {
                  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                  setDateValue(d);
                  const dd = String(d.getDate()).padStart(2, '0');
                  const mm = String(d.getMonth() + 1).padStart(2, '0');
                  const yyyy = d.getFullYear();
                  setFechaComprobante(`${dd}/${mm}/${yyyy}`);
                }
              }
            }
          })
        ) : (
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
            onPress={() => { Keyboard.dismiss(); setShowDatePicker(true); }}
          />
        )}
      </View>

      {showDatePicker && (
        <View style={{
          backgroundColor: themeColors.backgroundElement,
          borderRadius: BorderRadius.medium,
          padding: Spacing.two,
          borderWidth: 1,
          borderColor: themeColors.border,
          marginTop: -Spacing.two,
          marginBottom: Spacing.two
        }}>
          <DateTimePicker
            value={dateValue}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onValueChange={onChangeDate}
            onDismiss={() => setShowDatePicker(false)}
            maximumDate={new Date()}
          />
          {Platform.OS === 'ios' && (
            <CustomButton
              title="Confirmar Fecha"
              onPress={() => setShowDatePicker(false)}
              style={{ marginTop: Spacing.one }}
            />
          )}
        </View>
      )}

      {/* Mensaje Informativo de Proveedor */}
      <View style={{ marginBottom: Spacing.half, marginTop: Spacing.one }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: themeColors.primary + '15',
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: BorderRadius.medium,
          borderWidth: 1,
          borderColor: themeColors.primary + '30',
        }}>
          <Ionicons name="information-circle-outline" size={20} color={themeColors.primary} />
          <Text style={{ fontSize: 13, color: themeColors.text, fontWeight: '500', flex: 1 }}>
            Si no se encuentra tu proveedor déjalo en blanco
          </Text>
        </View>
      </View>

      {/* Selector de Proveedores con Buscador */}
      <View style={[styles.customDropdownContainer, { zIndex: 1000 }]}>
        {role === 'admin' ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.half }}>
            <Text style={[styles.dropdownLabel, { color: themeColors.text, marginBottom: 0 }]}>Proveedor / Comercio</Text>
            <TouchableOpacity
              onPress={() => {
                setNuevoProvNombre(proveedorSearch.trim());
                setNuevoProvRfc('');
                setModalNuevoProveedorVisible(true);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: themeColors.primary + '15',
                paddingHorizontal: Spacing.one,
                paddingVertical: 4,
                borderRadius: BorderRadius.medium,
              }}
            >
              <Ionicons name="add-circle" size={16} color={themeColors.primary} />
              <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 12 }}>+ Nuevo Proveedor</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Proveedor / Comercio</Text>
        )}

        <TouchableOpacity
          style={[
            styles.dropdownTrigger,
            {
              backgroundColor: themeColors.backgroundElement,
              borderColor: themeColors.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }
          ]}
          onPress={() => {
            Keyboard.dismiss();
            setShowProvDropdown(!showProvDropdown);
            setShowEmpList(false);
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Ionicons name="business-outline" size={18} color={themeColors.textSecondary} />
            <Text
              style={{
                color: proveedor ? themeColors.text : themeColors.textSecondary,
                fontSize: 14,
                flex: 1,
              }}
              numberOfLines={1}
            >
              {proveedor || 'Seleccionar proveedor'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {!!proveedor && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  setProveedor('');
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={18} color={themeColors.textSecondary} />
              </TouchableOpacity>
            )}
            <Ionicons name={showProvDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
          </View>
        </TouchableOpacity>

        {showProvDropdown && (
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000, marginTop: 4 }}>
            <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
              <CustomInput
                placeholder="Buscar proveedor por nombre o RFC..."
                value={proveedorSearch}
                onChangeText={setProveedorSearch}
                iconName="search-outline"
                style={{ margin: Spacing.one, height: 40 }}
              />
              <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 220, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                {/* Opción Dejar en Blanco */}
                <TouchableOpacity
                  style={[
                    styles.dropdownItem,
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: Spacing.one,
                      borderBottomWidth: 1,
                      borderBottomColor: themeColors.border,
                      backgroundColor: themeColors.backgroundElement,
                    }
                  ]}
                  onPress={() => {
                    setProveedor('');
                    setProveedorSearch('');
                    setShowProvDropdown(false);
                  }}
                >
                  <Ionicons name="remove-circle-outline" size={20} color={themeColors.textSecondary} />
                  <Text style={{ color: themeColors.textSecondary, fontStyle: 'italic', fontSize: 13 }}>
                    Dejar en blanco (Sin proveedor)
                  </Text>
                </TouchableOpacity>

                {/* Opción rápida para agregar el proveedor si se buscó algo no existente (Solo Admin) */}
                {role === 'admin' && proveedorSearch.trim().length > 0 && !proveedores.some(p => p.nombre && p.nombre.toLowerCase() === proveedorSearch.trim().toLowerCase()) && (
                  <TouchableOpacity
                    style={[
                      styles.dropdownItem,
                      {
                        backgroundColor: themeColors.primary + '15',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: Spacing.one,
                        borderBottomWidth: 1,
                        borderBottomColor: themeColors.border,
                      }
                    ]}
                    onPress={() => {
                      setNuevoProvNombre(proveedorSearch.trim());
                      setNuevoProvRfc('');
                      setModalNuevoProveedorVisible(true);
                      setShowProvDropdown(false);
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={themeColors.primary} />
                    <Text style={{ color: themeColors.primary, fontWeight: '600', fontSize: 13 }}>
                      {`➕ Agregar "${proveedorSearch.trim()}"`}
                    </Text>
                  </TouchableOpacity>
                )}

                {proveedores
                  .filter(p =>
                    !!p.nombre && (
                      p.nombre.toLowerCase().includes(proveedorSearch.toLowerCase()) ||
                      (p.rfc && p.rfc.toLowerCase().includes(proveedorSearch.toLowerCase()))
                    )
                  )
                  .map((prov, index, array) => (
                    <TouchableOpacity
                      key={prov.id}
                      style={[
                        styles.dropdownItem,
                        index === array.length - 1 && { borderBottomWidth: 0 },
                        { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, justifyContent: 'space-between' }
                      ]}
                      onPress={() => {
                        setProveedor(prov.nombre);
                        setProveedorSearch('');
                        setShowProvDropdown(false);
                      }}
                    >
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.one }}>
                        <Ionicons name="business-outline" size={20} color={themeColors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{prov.nombre}</Text>
                          {prov.rfc ? (
                            <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>RFC: {prov.rfc}</Text>
                          ) : null}
                        </View>
                      </View>
                      {proveedor === prov.nombre && (
                        <Ionicons name="checkmark" size={18} color={themeColors.primary} />
                      )}
                    </TouchableOpacity>
                  ))}

                {proveedores.filter(p =>
                  !!p.nombre && (
                    p.nombre.toLowerCase().includes(proveedorSearch.toLowerCase()) ||
                    (p.rfc && p.rfc.toLowerCase().includes(proveedorSearch.toLowerCase()))
                  )
                ).length === 0 && (
                  <View style={{ padding: Spacing.two, alignItems: 'center' }}>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                      No se encontraron proveedores. Puedes dejarlo en blanco.
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </Pressable>
        )}
      </View>

      {/* Campo obligatorio de Proveedor a agregar si no se seleccionó proveedor */}
      {!proveedor && (
        <View style={{ marginBottom: Spacing.two }}>
          <CustomInput
            label="Proveedor a agregar *"
            placeholder="Escribe el nombre del proveedor que no encontraste..."
            value={comentarioProveedor}
            onChangeText={setComentarioProveedor}
            iconName="create-outline"
            multiline
            numberOfLines={2}
            style={{ height: 60 }}
          />
          <Text style={{ color: themeColors.textSecondary, fontSize: 11, fontStyle: 'italic', marginTop: 2, paddingLeft: 4 }}>
            {role === 'admin'
              ? 'Indica el nombre del proveedor para registrarlo en el catálogo y poder aprobar el gasto.'
              : 'Indica el nombre del proveedor para que el administrador lo registre y pueda aprobar el gasto.'}
          </Text>
        </View>
      )}

      {/* Selector de Tipo: Servicio / Proyecto / Venta / Operativo */}
      <View style={{ marginBottom: Spacing.two }}>
        <Text style={{ color: themeColors.text, marginBottom: Spacing.half, fontWeight: '500', fontSize: 14, paddingLeft: Spacing.half }}>Tipo de Gasto *</Text>
        <View style={{ flexDirection: 'row', gap: Spacing.one }}>
          {(['Servicio', 'Proyecto', 'Venta', 'Operativo'] as const).map((tipo) => (
            <TouchableOpacity
              key={tipo}
              style={{
                flex: 1,
                padding: Spacing.one,
                borderRadius: BorderRadius.medium,
                borderWidth: 1,
                borderColor: tipoServicioProyecto === tipo ? themeColors.primary : themeColors.border,
                backgroundColor: tipoServicioProyecto === tipo ? themeColors.primary + '20' : themeColors.backgroundElement,
                alignItems: 'center'
              }}
              onPress={() => setTipoServicioProyecto(tipo)}
            >
              <Text style={{ color: tipoServicioProyecto === tipo ? themeColors.primary : themeColors.textSecondary, fontWeight: '600', fontSize: 13 }}>
                {tipo}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <CustomInput
        label="Detalle de Servicio o Proyecto *"
        placeholder="Escribe el nombre o texto libre..."
        value={detalleServicioProyecto}
        onChangeText={setDetalleServicioProyecto}
        iconName="briefcase-outline"
      />

      {/* Opción Dividir Gasto (Solo en modo create) */}
      {mode === 'create' && (
        <View style={[styles.customDropdownContainer, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.two }]}>
          <Text style={[styles.dropdownLabel, { color: themeColors.text, marginBottom: 0 }]}>¿Dividir ticket en varios clientes?</Text>
          <Switch
            value={isSplit}
            onValueChange={setIsSplit}
            trackColor={{ false: themeColors.border, true: themeColors.primary + '80' }}
            thumbColor={isSplit ? themeColors.primary : themeColors.textSecondary}
          />
        </View>
      )}

      {(mode === 'edit' || !isSplit) ? (
        <>
          <View style={styles.customDropdownContainer}>
            <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Cliente Relacionado *</Text>
            <TouchableOpacity
              style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}
              onPress={() => {
                Keyboard.dismiss();
                setShowCliDropdown(!showCliDropdown);
                setShowCatDropdown(false);
                setShowSubDropdown(false);
                setShowSucursalDropdown(false);
              }}
            >
              <Text style={{ color: selectedCliente ? themeColors.text : themeColors.textSecondary }}>
                {selectedCliente || 'Selecciona un cliente'}
              </Text>
              <Ionicons name={showCliDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
            </TouchableOpacity>
            {showCliDropdown && (
              <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000 }}>
                <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <CustomInput
                    placeholder={(role === 'admin' || mode === 'edit') ? 'Buscar o agregar cliente...' : 'Buscar cliente...'}
                    value={clienteSearch}
                    onChangeText={setClienteSearch}
                    iconName="search-outline"
                    style={{ margin: Spacing.one, height: 40 }}
                  />
                  <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 250, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                    {(role === 'admin' || mode === 'edit') && clienteSearch.trim().length > 0 && !clientes.some(c => c.nombre && c.nombre.toLowerCase() === clienteSearch.trim().toLowerCase()) && (
                      <TouchableOpacity
                        style={[styles.dropdownItem, { backgroundColor: themeColors.accent + '15', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
                        onPress={() => handleAddNewCliente(clienteSearch)}
                      >
                        <Ionicons name="add-circle-outline" size={24} color={themeColors.accent} />
                        <Text style={{ color: themeColors.accent, fontWeight: '600', fontSize: 14 }}>
                          {mode === 'edit' ? `➕ Agregar "${clienteSearch.trim()}"` : `Agregar "${clienteSearch.trim()}"`}
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
                            setSelectedCliente(cli.nombre);
                            const cliSucs = sucursalesCliente.filter(s => s.cliente_id === cli.id);
                            if (cliSucs.length === 1) {
                              setSucursal(cliSucs[0].nombre);
                            } else {
                              setSucursal('');
                            }
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

          <View style={mode === 'create' ? { zIndex: 2000, marginBottom: Spacing.three } : styles.customDropdownContainer}>
            <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>
              {mode === 'edit' && role === 'admin' ? 'Sucursal del cliente' : 'Sucursal del cliente *'}
            </Text>
            <TouchableOpacity
              style={[styles.dropdownTrigger, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, opacity: !selectedCliente ? 0.5 : 1 }]}
              disabled={!selectedCliente}
              onPress={() => {
                Keyboard.dismiss();
                setShowSucursalDropdown(!showSucursalDropdown);
                setShowCatDropdown(false);
                setShowSubDropdown(false);
                setShowCliDropdown(false);
              }}
            >
              <Text style={{ color: sucursal ? themeColors.text : themeColors.textSecondary }}>
                {sucursal || (selectedCliente ? 'Selecciona una sucursal' : 'Selecciona un cliente primero')}
              </Text>
              <Ionicons name={showSucursalDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.text} />
            </TouchableOpacity>
            {showSucursalDropdown && (
              <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', zIndex: 1000 }}>
                <View style={[styles.dropdownList, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <CustomInput
                    placeholder="Buscar o agregar sucursal..."
                    value={sucursalSearch}
                    onChangeText={setSucursalSearch}
                    iconName="search-outline"
                    style={{ margin: Spacing.one, height: 40 }}
                  />
                  <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 220, paddingHorizontal: Spacing.half }} keyboardShouldPersistTaps="handled">
                    {(() => {
                      const currentCliente = clientes.find(c => c.nombre?.trim().toLowerCase() === selectedCliente?.trim().toLowerCase() || c.id === selectedCliente);
                      const filteredSucursales = currentCliente ? sucursalesCliente.filter(s => s.cliente_id === currentCliente.id && s.nombre.toLowerCase().includes(sucursalSearch.toLowerCase())) : [];
                      const existsExact = currentCliente && sucursalesCliente.some(s => s.cliente_id === currentCliente.id && s.nombre.trim().toLowerCase() === sucursalSearch.trim().toLowerCase());

                      return (
                        <>
                          {role === 'empleado' && mode === 'create' && (
                            <TouchableOpacity
                              style={[styles.dropdownItem, { backgroundColor: themeColors.accent + '10', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
                              onPress={() => {
                                setSucursal('');
                                setSucursalSearch('');
                                setShowSucursalDropdown(false);
                              }}
                            >
                              <Ionicons name="close-circle-outline" size={24} color={themeColors.danger} />
                              <Text style={{ color: themeColors.danger, fontWeight: '600', fontSize: 13 }}>
                                Dejar en blanco (Sin sucursal)
                              </Text>
                            </TouchableOpacity>
                          )}

                          {(role === 'admin' || mode === 'edit') && sucursalSearch.trim().length > 0 && !existsExact && currentCliente && (
                            <TouchableOpacity
                              style={[styles.dropdownItem, { backgroundColor: themeColors.accent + '15', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }]}
                              onPress={() => handleAddNewSucursal(sucursalSearch)}
                            >
                              <Ionicons name="add-circle-outline" size={24} color={themeColors.accent} />
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: themeColors.accent, fontWeight: '700', fontSize: 13 }}>
                                  {`➕ Agregar "${sucursalSearch.trim().toUpperCase()}"`}
                                </Text>
                                <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                                  {`Vincular a cliente: ${currentCliente.nombre}`}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          )}

                          {filteredSucursales.map((suc, index, array) => (
                            <TouchableOpacity
                              key={suc.id}
                              style={[
                                styles.dropdownItem,
                                index === array.length - 1 && { borderBottomWidth: 0 },
                                { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, justifyContent: 'space-between' }
                              ]}
                              onPress={() => {
                                setSucursal(suc.nombre);
                                setSucursalSearch('');
                                setShowSucursalDropdown(false);
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flex: 1 }}>
                                <Ionicons name="business-outline" size={20} color={themeColors.primary} />
                                <Text style={{ color: themeColors.text, fontWeight: '500', fontSize: 14 }}>{suc.nombre}</Text>
                              </View>
                              {sucursal === suc.nombre && (
                                <Ionicons name="checkmark" size={18} color={themeColors.primary} />
                              )}
                            </TouchableOpacity>
                          ))}

                          {filteredSucursales.length === 0 && !sucursalSearch.trim() && (
                            <View style={{ padding: Spacing.two, alignItems: 'center' }}>
                              <Text style={{ color: themeColors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 4 }}>
                                No hay sucursales registradas para este cliente.
                              </Text>
                              {(role === 'admin' || mode === 'edit') && (
                                <Text style={{ color: themeColors.accent, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
                                  Escribe arriba en el buscador para agregar una nueva.
                                </Text>
                              )}
                            </View>
                          )}
                        </>
                      );
                    })()}
                  </ScrollView>
                </View>
              </Pressable>
            )}
          </View>

          {role === 'empleado' && mode === 'create' && !sucursal && selectedCliente ? (
            <View style={{ marginBottom: Spacing.three }}>
              <Text style={[styles.dropdownLabel, { color: themeColors.text }]}>Sucursal a agregar *</Text>
              <CustomInput
                placeholder="Escribe el nombre de la sucursal..."
                value={comentarioSucursal}
                onChangeText={setComentarioSucursal}
                iconName="business-outline"
              />
              <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 4, marginLeft: 4 }}>
                El administrador se encargará de registrar esta sucursal.
              </Text>
            </View>
          ) : null}
        </>
      ) : (
        <View style={{ marginBottom: Spacing.three }}>
          {/* Resumen de Asignación */}
          {(() => {
            const currentTotalGasto = Number(monto || 0) + (esComida && incluyePropina === false ? Number(montoPropina || 0) : 0);
            const sumDividido = splits.reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0);
            const diff = currentTotalGasto - sumDividido;
            const isCompleto = Math.abs(diff) < 0.05 && currentTotalGasto > 0;
            const isExcedido = diff < -0.05;

            return (
              <View style={{
                backgroundColor: themeColors.backgroundElement,
                borderRadius: BorderRadius.medium,
                padding: Spacing.two,
                borderWidth: 1,
                borderColor: isCompleto ? (themeColors.success || '#10b981') : isExcedido ? themeColors.danger : (themeColors.warning || '#f59e0b'),
                marginBottom: Spacing.two
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Total del Ticket:</Text>
                  <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 13 }}>${currentTotalGasto.toFixed(2)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>Total Dividido:</Text>
                  <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 13 }}>${sumDividido.toFixed(2)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: themeColors.border, paddingTop: 4 }}>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 12 }}>
                    {isCompleto ? '✅ Estado:' : isExcedido ? '❌ Exceso:' : '⏳ Restante por asignar:'}
                  </Text>
                  <Text style={{
                    fontWeight: '700',
                    fontSize: 13,
                    color: isCompleto ? (themeColors.success || '#10b981') : isExcedido ? themeColors.danger : (themeColors.warning || '#f59e0b')
                  }}>
                    {isCompleto ? '100% Asignado' : `$${Math.abs(diff).toFixed(2)}`}
                  </Text>
                </View>
              </View>
            );
          })()}

          <Text style={[styles.dropdownLabel, { color: themeColors.text, marginBottom: Spacing.one }]}>
            Divisiones registradas ({splits.length})
          </Text>

          {splits.map((split) => (
            <View key={split.id} style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: themeColors.backgroundElement,
              padding: Spacing.two,
              borderRadius: BorderRadius.small,
              borderWidth: 1,
              borderColor: themeColors.border,
              marginBottom: Spacing.one
            }}>
              <View style={{ flex: 1, marginRight: Spacing.one }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="person-circle-outline" size={16} color={themeColors.primary} />
                  <Text style={{ color: themeColors.text, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                    {split.clienteId}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Ionicons name="business-outline" size={14} color={themeColors.textSecondary} />
                  <Text style={{ color: themeColors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                    {split.sucursalNombre || split.comentarioSucursal || 'Sin sucursal'}
                  </Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ color: themeColors.primary, fontWeight: '700', fontSize: 14 }}>
                  ${Number(split.monto).toFixed(2)}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const newSplits = splits.filter(s => s.id !== split.id);
                    setSplits(newSplits);
                  }}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <TouchableOpacity
            onPress={() => {
              const currentTotalGasto = Number(monto || 0) + (esComida && incluyePropina === false ? Number(montoPropina || 0) : 0);
              const sumDividido = splits.reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0);
              const remainder = Math.max(0, currentTotalGasto - sumDividido);

              setNewSplitClienteId('');
              setNewSplitSucursalNombre('');
              setNewSplitComentarioSucursal('');
              setNewSplitMonto(remainder > 0 ? remainder.toFixed(2) : '');
              setSplitClienteSearch('');
              setSplitSucursalSearch('');
              setShowNewSplitCliDropdown(false);
              setShowNewSplitSucDropdown(false);
              setShowSplitModal(true);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: themeColors.primary + '15',
              padding: Spacing.two,
              borderRadius: BorderRadius.small,
              marginTop: Spacing.one,
              borderWidth: 1,
              borderColor: themeColors.primary + '40',
              borderStyle: 'dashed'
            }}
          >
            <Ionicons name="add-circle-outline" size={20} color={themeColors.primary} style={{ marginRight: Spacing.half }} />
            <Text style={{ color: themeColors.primary, fontWeight: '700' }}>➕ Agregar División de Gasto</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Selector de Método de Pago */}
      <View style={styles.selectorGroup}>
        <Text style={[styles.selectorLabel, { color: themeColors.text }]}>Método de Pago *</Text>
        <View style={styles.paymentSelector}>
          <TouchableOpacity
            onPress={() => {
              setMetodoPago('efectivo');
              setTipoTarjeta(null);
            }}
            style={[
              styles.paymentOption,
              {
                backgroundColor: metodoPago === 'efectivo' ? themeColors.accent : themeColors.backgroundElement,
                borderColor: metodoPago === 'efectivo' ? 'transparent' : themeColors.border,
                flex: 1,
                alignItems: 'center',
              },
            ]}
          >
            <Text style={[styles.paymentOptionText, { color: metodoPago === 'efectivo' ? '#ffffff' : themeColors.text }]}>
              Efectivo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setMetodoPago('transferencia');
              setTipoTarjeta(null);
            }}
            style={[
              styles.paymentOption,
              {
                backgroundColor: metodoPago === 'transferencia' ? themeColors.accent : themeColors.backgroundElement,
                borderColor: metodoPago === 'transferencia' ? 'transparent' : themeColors.border,
                flex: 1,
                alignItems: 'center',
              },
            ]}
          >
            <Text style={[styles.paymentOptionText, { color: metodoPago === 'transferencia' ? '#ffffff' : themeColors.text }]}>
              Transferencia
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              if (metodoPago !== 'tarjeta_credito' && metodoPago !== 'tarjeta_debito') {
                setMetodoPago('tarjeta_debito');
              }
              if (!tipoTarjeta) {
                setTipoTarjeta('BBVA');
              }
            }}
            style={[
              styles.paymentOption,
              {
                backgroundColor: (metodoPago === 'tarjeta_debito' || metodoPago === 'tarjeta_credito' || metodoPago === 'tarjeta') ? themeColors.accent : themeColors.backgroundElement,
                borderColor: (metodoPago === 'tarjeta_debito' || metodoPago === 'tarjeta_credito' || metodoPago === 'tarjeta') ? 'transparent' : themeColors.border,
                flex: 1,
                alignItems: 'center',
              },
            ]}
          >
            <Text style={[styles.paymentOptionText, { color: (metodoPago === 'tarjeta_debito' || metodoPago === 'tarjeta_credito' || metodoPago === 'tarjeta') ? '#ffffff' : themeColors.text }]}>
              Tarjeta
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setMetodoPago('monedero_electronico');
              setTipoTarjeta(null);
            }}
            style={[
              styles.paymentOption,
              {
                backgroundColor: metodoPago === 'monedero_electronico' ? themeColors.accent : themeColors.backgroundElement,
                borderColor: metodoPago === 'monedero_electronico' ? 'transparent' : themeColors.border,
                flex: 1,
                alignItems: 'center',
              },
            ]}
          >
            <Text style={[styles.paymentOptionText, { color: metodoPago === 'monedero_electronico' ? '#ffffff' : themeColors.text, textAlign: 'center' }]}>
              Monedero Electrónico
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sub-selector si se elige Tarjeta */}
      {(metodoPago === 'tarjeta_debito' || metodoPago === 'tarjeta_credito' || metodoPago === 'tarjeta') && (
        <View style={[styles.selectorGroup, { marginTop: -Spacing.one, paddingLeft: Spacing.two, borderLeftWidth: 2, borderLeftColor: themeColors.accent, gap: Spacing.two }]}>
          <View>
            <Text style={[styles.selectorLabel, { color: themeColors.text, fontSize: 13, marginBottom: Spacing.one }]}>Tipo de Tarjeta *</Text>
            <View style={styles.paymentSelector}>
              <TouchableOpacity
                onPress={() => setMetodoPago('tarjeta_debito')}
                style={[
                  styles.paymentOption,
                  {
                    backgroundColor: metodoPago === 'tarjeta_debito' ? themeColors.accent : themeColors.backgroundElement,
                    borderColor: metodoPago === 'tarjeta_debito' ? 'transparent' : themeColors.border,
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: Spacing.one,
                  },
                ]}
              >
                <Text style={[styles.paymentOptionText, { color: metodoPago === 'tarjeta_debito' ? '#ffffff' : themeColors.text, fontSize: 11 }]}>
                  Débito
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setMetodoPago('tarjeta_credito')}
                style={[
                  styles.paymentOption,
                  {
                    backgroundColor: metodoPago === 'tarjeta_credito' ? themeColors.accent : themeColors.backgroundElement,
                    borderColor: metodoPago === 'tarjeta_credito' ? 'transparent' : themeColors.border,
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: Spacing.one,
                  },
                ]}
              >
                <Text style={[styles.paymentOptionText, { color: metodoPago === 'tarjeta_credito' ? '#ffffff' : themeColors.text, fontSize: 11 }]}>
                  Crédito
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View>
            <Text style={[styles.selectorLabel, { color: themeColors.text, fontSize: 13, marginBottom: Spacing.one }]}>Selecciona la Tarjeta *</Text>
            <View style={styles.paymentSelector}>
              {(['BBVA', 'AMEX', 'MARRIOT', 'BANORTE', 'INVEX', 'MERCADO PAGO', 'HILTON'] as const).map((card) => (
                <TouchableOpacity
                  key={card}
                  onPress={() => setTipoTarjeta(card)}
                  style={[
                    styles.paymentOption,
                    {
                      backgroundColor: tipoTarjeta === card ? themeColors.accent : themeColors.backgroundElement,
                      borderColor: tipoTarjeta === card ? 'transparent' : themeColors.border,
                      flex: 1,
                      minWidth: '45%',
                      alignItems: 'center',
                      paddingVertical: Spacing.one,
                    },
                  ]}
                >
                  <Text style={[styles.paymentOptionText, { color: tipoTarjeta === card ? '#ffffff' : themeColors.text, fontSize: 11 }]}>
                    {card}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Selector de ¿Está facturado? */}
      <View style={styles.selectorGroup}>
        <Text style={[styles.selectorLabel, { color: themeColors.text }]}>¿Estado de Facturación? *</Text>
        <View style={[styles.paymentSelector, { flexDirection: 'row', gap: 6 }]}>
          <TouchableOpacity
            onPress={() => {
              setFacturado(true);
              setFacturaStatus('SI');
              setMotivoSinFactura('');
              if (mode === 'create') setComentarioPendiente('');
            }}
            style={[
              styles.paymentOption,
              {
                backgroundColor: facturado === true ? themeColors.accent : themeColors.backgroundElement,
                borderColor: facturado === true ? 'transparent' : themeColors.border,
                flex: 1,
                paddingVertical: 8,
                alignItems: 'center',
              },
            ]}
          >
            <Text style={[styles.paymentOptionText, { color: facturado === true ? '#ffffff' : themeColors.text, fontSize: 11, fontWeight: '700' }]}>
              Sí, Facturado
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setFacturado(false);
              setFacturaStatus('PENDIENTE');
              if (mode === 'create') setMotivoSinFactura('PENDIENTE_ENTREGA');
              setFacturaPdf(null);
            }}
            style={[
              styles.paymentOption,
              {
                backgroundColor: (facturado === false && facturaStatus === 'PENDIENTE') ? themeColors.warning : themeColors.backgroundElement,
                borderColor: (facturado === false && facturaStatus === 'PENDIENTE') ? 'transparent' : themeColors.border,
                flex: 1,
                paddingVertical: 8,
                alignItems: 'center',
              },
            ]}
          >
            <Text style={[styles.paymentOptionText, { color: (facturado === false && facturaStatus === 'PENDIENTE') ? '#ffffff' : themeColors.text, fontSize: 11, fontWeight: '700' }]}>
              Pendiente
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setFacturado(false);
              setFacturaStatus('NO');
              setFacturaPdf(null);
            }}
            style={[
              styles.paymentOption,
              {
                backgroundColor: (facturado === false && facturaStatus === 'NO') ? themeColors.accent : themeColors.backgroundElement,
                borderColor: (facturado === false && facturaStatus === 'NO') ? 'transparent' : themeColors.border,
                flex: 1,
                paddingVertical: 8,
                alignItems: 'center',
              },
            ]}
          >
            <Text style={[styles.paymentOptionText, { color: (facturado === false && facturaStatus === 'NO') ? '#ffffff' : themeColors.text, fontSize: 11, fontWeight: '700' }]}>
              No Facturado
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {facturado === true && (
        <View style={{ marginBottom: Spacing.two, marginTop: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={[styles.selectorLabel, { color: themeColors.text, marginBottom: 0 }]}>
              Factura en PDF (Opcional)
            </Text>
            {facturaPdf && (
              <Text style={{ fontSize: 11, color: themeColors.success, fontWeight: '600' }}>
                ✓ PDF cargado
              </Text>
            )}
          </View>

          {facturaPdf ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: themeColors.backgroundElement,
                padding: 12,
                borderRadius: BorderRadius.medium,
                borderWidth: 1,
                borderColor: themeColors.accent + '60',
                gap: 10,
              }}
            >
              <TouchableOpacity
                onPress={handlePreviewPdf}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
                activeOpacity={0.7}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: BorderRadius.small,
                    backgroundColor: themeColors.danger + '15',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="document-text" size={20} color={themeColors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: themeColors.text, fontSize: 13, fontWeight: '700' }}
                  >
                    {facturaPdf.name}
                  </Text>
                  <Text style={{ color: themeColors.textSecondary, fontSize: 11, marginTop: 2 }}>
                    {facturaPdf.isRemote ? 'Factura guardada • Toca para abrir' : 'Toca para ver • PDF listo para guardar'}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity
                  onPress={handleSelectFacturaPdf}
                  style={{
                    padding: 6,
                    borderRadius: BorderRadius.small,
                    backgroundColor: themeColors.background,
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Cambiar PDF"
                >
                  <Ionicons name="swap-horizontal-outline" size={18} color={themeColors.accent} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleRemoveFacturaPdf}
                  style={{
                    padding: 6,
                    borderRadius: BorderRadius.small,
                    backgroundColor: themeColors.danger + '15',
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Eliminar PDF"
                >
                  <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleSelectFacturaPdf}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: themeColors.backgroundElement,
                borderWidth: 1.5,
                borderColor: themeColors.border,
                borderStyle: 'dashed',
                borderRadius: BorderRadius.medium,
                paddingVertical: 14,
                paddingHorizontal: 16,
              }}
            >
              <Ionicons name="cloud-upload-outline" size={20} color={themeColors.accent} />
              <Text style={{ color: themeColors.accent, fontSize: 13, fontWeight: '700' }}>
                Adjuntar Factura PDF
              </Text>
              <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>
                (Opcional)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {facturado === false && facturaStatus === 'PENDIENTE' && (
        <View style={{ marginBottom: Spacing.two }}>
          <View style={[styles.alertBanner, { backgroundColor: themeColors.warning + '15', borderColor: themeColors.warning, marginBottom: Spacing.two, padding: Spacing.two, borderRadius: BorderRadius.medium }]}>
            <Text style={{ color: themeColors.warning, fontWeight: '700', fontSize: 12 }}>
              {mode === 'create'
                ? '⚠️ Factura Pendiente de Entregar: Se podrá adjuntar el archivo posteriormente.'
                : '⚠️ Factura Pendiente de Entregar: Por favor explica por qué está pendiente a continuación.'}
            </Text>
          </View>
          <CustomInput
            label={mode === 'create' ? 'Explicación de Factura Pendiente (Obligatorio) *' : 'Explicación (Obligatorio) *'}
            placeholder={mode === 'create' ? 'Ej. El proveedor enviará el archivo el próximo lunes...' : 'Escribe la razón (ej: Me la mandan mañana)'}
            value={comentarioPendiente}
            onChangeText={setComentarioPendiente}
            iconName={mode === 'create' ? 'chatbox-outline' : 'time-outline'}
            multiline
            numberOfLines={2}
            style={{ height: 60 }}
          />
        </View>
      )}

      {facturado === false && facturaStatus === 'NO' && (
        <View style={{ marginBottom: Spacing.two }}>
          <CustomInput
            label="Motivo por el cual no se cuenta con factura *"
            placeholder="Ej. El establecimiento no emite facturas, régimen simplificado, etc."
            value={motivoSinFactura}
            onChangeText={setMotivoSinFactura}
            iconName="alert-circle-outline"
            multiline
            numberOfLines={2}
            style={{ height: 60 }}
          />
        </View>
      )}

      <View style={styles.footerNav}>
        <CustomButton title="Atrás" onPress={prevStep} variant="secondary" style={styles.navBtn} />
        <CustomButton title="Siguiente" onPress={nextStep} style={styles.navBtn} />
      </View>
    </View>
  );
}
