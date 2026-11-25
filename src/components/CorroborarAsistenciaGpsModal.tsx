import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  AsistenciaService,
  CorroboracionFlotaResponse,
  FleetGpsSnapshotItem,
} from '@/services/supabase';
import { formatHoraDisplay } from '@/utils/asistenciaUtils';

interface CorroborarAsistenciaGpsModalProps {
  visible: boolean;
  onClose: () => void;
  asistenciaId?: string;
  empleadoNombre: string;
  fecha: string;
  hora: string;
  tipo?: 'Entrada' | 'Salida';
  empleadoLat?: number | null;
  empleadoLng?: number | null;
  empleadoDireccion?: string | null;
  vehiculoId?: string | null;
  vehiculoPlacas?: string | null;
  gpsVehiculoAlerta?: string | null;
}

export default function CorroborarAsistenciaGpsModal({
  visible,
  onClose,
  asistenciaId,
  empleadoNombre,
  fecha,
  hora,
  tipo = 'Entrada',
  empleadoLat,
  empleadoLng,
  empleadoDireccion,
  vehiculoId,
}: CorroborarAsistenciaGpsModalProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const themeColors = Colors[isDark ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 860;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<CorroboracionFlotaResponse | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<FleetGpsSnapshotItem | null>(null);

  useEffect(() => {
    if (!visible) {
      setSnapshot(null);
      setError(null);
      setSelectedUnit(null);
      return;
    }

    let isMounted = true;
    const loadSnapshot = async () => {
      setIsLoading(true);
      setError(null);
      setSelectedUnit(null);
      try {
        const res = await AsistenciaService.corroborarConFlotaGps({
          asistenciaId,
          fecha,
          hora,
          empleadoLat,
          empleadoLng,
          empleadoNombre,
          empleadoDireccion,
          tipoChecada: tipo,
          vehiculoId,
        });
        if (isMounted) {
          setSnapshot(res);
          // Iniciar sin unidad preseleccionada para que ningún popup tape el mapa al abrir
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'No se pudo cargar la posición histórica de la flota');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadSnapshot();

    return () => {
      isMounted = false;
    };
  }, [visible, asistenciaId, fecha, hora, empleadoLat, empleadoLng, empleadoNombre, empleadoDireccion, tipo, vehiculoId]);

  const isChecadaOficina = useMemo(() => {
    if (snapshot?.empleado_en_oficina) return true;
    const dir = (snapshot?.empleado_direccion || empleadoDireccion || '').toLowerCase();
    return (
      dir.includes('minmoe') ||
      dir.includes('checador f') ||
      dir.includes('checador de oficina') ||
      dir.includes('checador oficina') ||
      dir.includes('terminal') ||
      dir.includes('oficina') ||
      dir.includes('hikvision') ||
      dir.includes('facial')
    );
  }, [snapshot, empleadoDireccion]);

  const handleOpenGoogleMaps = (lat?: number | null, lng?: number | null) => {
    if (!lat || !lng) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  // Generador de HTML limpio para Leaflet en Web (con CartoDB Voyager sin ruido visual y sin auto-popup inicial)
  const leafletHtml = useMemo(() => {
    if (!snapshot) return null;

    const empLat = snapshot.empleado_lat;
    const empLng = snapshot.empleado_lng;
    const empHasGps =
      (snapshot.empleado_gps_activo || snapshot.empleado_en_oficina || isChecadaOficina) &&
      empLat &&
      empLng;

    const unitsWithCoords = snapshot.unidades.filter((u) => u.lat && u.lng);
    const unitsJson = JSON.stringify(unitsWithCoords);
    const empJson = JSON.stringify(
      empHasGps
        ? {
            lat: empLat,
            lng: empLng,
            nombre: empleadoNombre,
            dir:
              snapshot.empleado_en_oficina || isChecadaOficina
                ? 'Checador Físico en Oficina Matriz'
                : snapshot.empleado_direccion || empleadoDireccion || '',
            esOficina: Boolean(snapshot.empleado_en_oficina || isChecadaOficina),
          }
        : null
    );
    const focusUnitIdJson = JSON.stringify(selectedUnit?.vehiculo_id || null);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; }
    .leaflet-popup-content-wrapper { border-radius: 10px; box-shadow: 0 4px 16px rgba(15,23,42,0.14); padding: 2px; }
    .leaflet-popup-content { margin: 10px 12px; }
    .unit-pin {
      display: flex; align-items: center; justify-content: center;
      border-radius: 50%; color: #fff; font-weight: 800; font-size: 11px;
      border: 2.5px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.32);
      cursor: pointer; transition: transform 0.15s ease;
    }
    .emp-pin {
      display: flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; border-radius: 50%;
      background: #7c3aed; color: #fff; font-weight: 800; font-size: 13px;
      border: 2.5px solid #fff; box-shadow: 0 2px 8px rgba(124,58,237,0.45);
    }
    .oficina-pin {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 8px;
      background: #15803d; color: #fff; font-weight: 800; font-size: 15px;
      border: 2.5px solid #fff; box-shadow: 0 2px 8px rgba(21,128,61,0.45);
    }
    .popup-box { font-size: 12px; line-height: 1.45; color: #334155; min-width: 180px; }
    .popup-title { font-weight: 700; font-size: 13px; color: #0f172a; margin-bottom: 2px; }
    .popup-meta { font-size: 11px; color: #64748b; margin-top: 4px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const units = ${unitsJson};
    const emp = ${empJson};
    const focusId = ${focusUnitIdJson};

    const map = L.map('map', { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    const group = [];

    // Pin de Oficina Matriz Inttec
    const OFICINA_LAT = 28.657943;
    const OFICINA_LNG = -106.118195;
    const oficinaIcon = L.divIcon({
      className: '',
      html: '<div class="oficina-pin">🏢</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16]
    });
    const oficinaMarker = L.marker([OFICINA_LAT, OFICINA_LNG], { icon: oficinaIcon, zIndexOffset: 950 }).addTo(map);
    const oficinaPopupHtml = emp && emp.esOficina
      ? '<div class="popup-box"><div class="popup-title">Oficina Matriz Inttec</div><div>Checada presencial: <b>' + emp.nombre + '</b></div><div class="popup-meta">Calle Camello, Col. Granjas • ' + ${JSON.stringify(hora)} + '</div></div>'
      : '<div class="popup-box"><div class="popup-title">Oficina Matriz Inttec</div><div class="popup-meta">Calle Camello, Col. Granjas</div></div>';
    oficinaMarker.bindPopup(oficinaPopupHtml);
    if (emp && emp.esOficina) {
      group.push([OFICINA_LAT, OFICINA_LNG]);
    }

    // Pin de Empleado (cuando tiene GPS de celular fuera de oficina)
    if (emp && !emp.esOficina) {
      const empIcon = L.divIcon({
        className: '',
        html: '<div class="emp-pin">👤</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
      });
      const empMarker = L.marker([emp.lat, emp.lng], { icon: empIcon, zIndexOffset: 1000 }).addTo(map);
      empMarker.bindPopup(
        '<div class="popup-box">' +
        '<div class="popup-title">' + emp.nombre + ' (' + ${JSON.stringify(tipo)} + ')</div>' +
        '<div>' + (emp.dir || 'Ubicación registrada') + '</div>' +
        '<div class="popup-meta">Hora: ' + ${JSON.stringify(hora)} + '</div>' +
        '</div>'
      );
      group.push([emp.lat, emp.lng]);
    }

    // Pines de Unidades
    let focusedMarker = null;
    let focusedCoords = null;

    units.forEach((u) => {
      const isMoving = u.velocidad > 10;
      const isAsignada = u.es_vehiculo_asignado;
      const isSelected = focusId && u.vehiculo_id === focusId;
      const bg = isMoving ? '#16a34a' : (u.ignicion ? '#2563eb' : '#475569');
      const size = isSelected ? 34 : (isAsignada ? 30 : 26);
      const border = isSelected ? '3px solid #0f172a' : (isAsignada ? '2.5px solid #eab308' : '2px solid #fff');
      const zIdx = isSelected ? 1100 : (isAsignada ? 800 : 500);

      const pinIcon = L.divIcon({
        className: '',
        html: '<div class="unit-pin" style="width:' + size + 'px; height:' + size + 'px; background:' + bg + '; border:' + border + ';">' + (isAsignada ? '★' : '🚐') + '</div>',
        iconSize: [size, size],
        iconAnchor: [size/2, size/2],
        popupAnchor: [0, -size/2]
      });

      const marker = L.marker([u.lat, u.lng], { icon: pinIcon, zIndexOffset: zIdx }).addTo(map);
      const statusTxt = isMoving
        ? (u.velocidad + ' km/h en movimiento')
        : (u.ignicion ? 'Motor encendido (detenida)' : 'Estacionada');
      const distTxt = u.distancia_empleado_m !== null
        ? ' • a ' + (u.distancia_empleado_m < 1000 ? u.distancia_empleado_m + ' m' : (u.distancia_empleado_m/1000).toFixed(1) + ' km')
        : '';

      const popupHtml = '<div class="popup-box">' +
        '<div class="popup-title">' + u.marca + ' ' + u.modelo + ' (' + u.placas + ')</div>' +
        '<div>' + (u.direccion || 'Ubicación') + '</div>' +
        '<div class="popup-meta">' + statusTxt + distTxt + (u.hora_reporte ? ' • ' + u.hora_reporte : '') + '</div>' +
        '</div>';

      marker.bindPopup(popupHtml);
      group.push([u.lat, u.lng]);

      if (isSelected) {
        focusedMarker = marker;
        focusedCoords = [u.lat, u.lng];
      }
    });

    if (focusedMarker && focusedCoords) {
      map.setView(focusedCoords, 16);
      setTimeout(() => focusedMarker.openPopup(), 180);
    } else if (group.length > 1) {
      map.fitBounds(L.latLngBounds(group), { padding: [36, 36], maxZoom: 15 });
    } else if (group.length === 1) {
      map.setView(group[0], 15);
    } else {
      map.setView([28.657943, -106.118195], 13);
    }
  </script>
</body>
</html>`;
  }, [snapshot, selectedUnit, empleadoNombre, empleadoDireccion, hora, tipo, isChecadaOficina]);

  // Static Map para dispositivos móviles nativos
  const staticMapUrl = useMemo(() => {
    if (!snapshot) return null;
    const apiKey =
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyDgvQcdXQYx8uSGNJJ4wENAGkIVbDIaUXc';

    const markers: string[] = [];

    const hasCoords = !!(
      (snapshot.empleado_gps_activo || snapshot.empleado_en_oficina || isChecadaOficina) &&
      snapshot.empleado_lat &&
      snapshot.empleado_lng
    );
    if (hasCoords) {
      const color = snapshot.empleado_en_oficina || isChecadaOficina ? 'green' : 'purple';
      const label = snapshot.empleado_en_oficina || isChecadaOficina ? 'O' : 'E';
      markers.push(
        `markers=color:${color}%7Clabel:${label}%7C${snapshot.empleado_lat!.toFixed(5)},${snapshot.empleado_lng!.toFixed(5)}`
      );
    }

    snapshot.unidades.slice(0, 5).forEach((u, idx) => {
      if (u.lat && u.lng) {
        const color = u.velocidad > 10 ? 'green' : u.ignicion ? 'blue' : 'gray';
        const label = String(idx + 1);
        markers.push(`markers=color:${color}%7Clabel:${label}%7C${u.lat.toFixed(5)},${u.lng.toFixed(5)}`);
      }
    });

    if (markers.length === 0) return null;
    return `https://maps.googleapis.com/maps/api/staticmap?size=640x340&scale=2&maptype=roadmap&${markers.join('&')}&key=${apiKey}`;
  }, [snapshot, isChecadaOficina]);

  // Determinar si existe alguna alerta importante que amerite mostrarse arriba
  const anomalyMessage = useMemo(() => {
    if (!snapshot) return null;
    if (snapshot.resumen.alerta_principal) return snapshot.resumen.alerta_principal;
    if (!isChecadaOficina && !snapshot.empleado_gps_activo) {
      return 'El empleado registró asistencia con la ubicación del celular apagada.';
    }
    return null;
  }, [snapshot, isChecadaOficina]);

  const renderUnitRow = (unit: FleetGpsSnapshotItem) => {
    const isSelected = selectedUnit?.vehiculo_id === unit.vehiculo_id;
    const isMoving = unit.velocidad > 10;

    const dotColor = isMoving
      ? '#16a34a'
      : unit.badge_color === 'azul'
        ? '#2563eb'
        : unit.badge_color === 'rojo'
          ? '#dc2626'
          : '#94a3b8';

    const pillBg =
      unit.badge_color === 'verde'
        ? '#dcfce7'
        : unit.badge_color === 'azul'
          ? '#e0f2fe'
          : unit.badge_color === 'rojo'
            ? '#fee2e2'
            : isDark
              ? '#334155'
              : '#f1f5f9';

    const pillText =
      unit.badge_color === 'verde'
        ? '#15803d'
        : unit.badge_color === 'azul'
          ? '#0369a1'
          : unit.badge_color === 'rojo'
            ? '#b91c1c'
            : themeColors.textSecondary;

    const delayedReport = typeof unit.diferencia_minutos === 'number' && unit.diferencia_minutos > 30;

    return (
      <TouchableOpacity
        key={unit.vehiculo_id}
        activeOpacity={0.75}
        onPress={() =>
          setSelectedUnit((prev) => (prev?.vehiculo_id === unit.vehiculo_id ? null : unit))
        }
        style={[
          styles.unitRow,
          {
            backgroundColor: isSelected
              ? isDark
                ? themeColors.accent + '22'
                : '#eff6ff'
              : themeColors.background,
            borderColor: isSelected ? themeColors.accent : themeColors.border,
          },
        ]}
      >
        <View style={[styles.statusDot, { backgroundColor: dotColor }]} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text
              style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }}
              numberOfLines={1}
            >
              {unit.marca} {unit.modelo}
            </Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: themeColors.textSecondary,
                backgroundColor: themeColors.backgroundElement,
                paddingHorizontal: 5,
                paddingVertical: 1,
                borderRadius: 4,
              }}
            >
              {unit.placas}
            </Text>
            {unit.es_vehiculo_asignado && (
              <View style={styles.assignedTag}>
                <Text style={styles.assignedTagText}>Asignada</Text>
              </View>
            )}
          </View>

          <Text
            style={{ fontSize: 11.5, color: themeColors.textSecondary, marginTop: 2 }}
            numberOfLines={1}
          >
            {unit.direccion || 'Sin dirección disponible'}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            <View style={[styles.statusPill, { backgroundColor: pillBg }]}>
              <Text style={{ fontSize: 10.5, fontWeight: '700', color: pillText }}>
                {unit.motivo_estado}
              </Text>
            </View>

            {delayedReport && unit.hora_reporte && (
              <Text style={{ fontSize: 10.5, color: '#b45309', fontWeight: '600' }}>
                Últ. señal {unit.hora_reporte}
              </Text>
            )}
          </View>
        </View>

        {unit.lat && unit.lng && (
          <TouchableOpacity
            onPress={() => handleOpenGoogleMaps(unit.lat, unit.lng)}
            style={[styles.iconActionBtn, { borderColor: themeColors.border }]}
            accessibilityLabel="Abrir en Google Maps"
          >
            <Ionicons name="open-outline" size={15} color={themeColors.textSecondary} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      statusBarTranslucent={true}
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContent,
            isDesktop && { maxWidth: 940 },
            { backgroundColor: themeColors.background },
          ]}
        >
          {/* Header compacto con toda la información clave en una sola barra */}
          <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                  {empleadoNombre}
                </Text>

                <View
                  style={[
                    styles.headerChip,
                    {
                      backgroundColor:
                        tipo === 'Entrada' ? '#dbeafe' : '#f3e8ff',
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: tipo === 'Entrada' ? '#1d4ed8' : '#6d28d9',
                    }}
                  >
                    {tipo} • {formatHoraDisplay(hora)}
                  </Text>
                </View>

                {snapshot && (
                  <View
                    style={[
                      styles.headerChip,
                      {
                        backgroundColor: isChecadaOficina
                          ? '#dcfce7'
                          : snapshot.empleado_gps_activo
                            ? '#dcfce7'
                            : '#fee2e2',
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        isChecadaOficina
                          ? 'business-outline'
                          : snapshot.empleado_gps_activo
                            ? 'location-outline'
                            : 'warning-outline'
                      }
                      size={12}
                      color={
                        isChecadaOficina || snapshot.empleado_gps_activo ? '#15803d' : '#b91c1c'
                      }
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color:
                          isChecadaOficina || snapshot.empleado_gps_activo ? '#15803d' : '#b91c1c',
                      }}
                    >
                      {isChecadaOficina
                        ? 'Checador Oficina'
                        : snapshot.empleado_gps_activo
                          ? 'GPS Celular Activo'
                          : 'GPS Apagado'}
                    </Text>
                  </View>
                )}
              </View>

              <Text
                style={{ fontSize: 11.5, color: themeColors.textSecondary, marginTop: 3 }}
                numberOfLines={1}
              >
                {fecha}
                {snapshot?.desfase_horas_oficina &&
                snapshot.desfase_horas_oficina !== 0 &&
                snapshot.hora_oficina_chihuahua
                  ? ` • Equivale a ${formatHoraDisplay(snapshot.hora_oficina_chihuahua)} Hora Chihuahua (${snapshot.utc_offset_empleado})`
                  : ''}
                {!isChecadaOficina && snapshot?.empleado_gps_activo && snapshot.empleado_direccion
                  ? ` • ${snapshot.empleado_direccion}`
                  : ''}
              </Text>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={themeColors.accent} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: themeColors.text, marginTop: 12 }}>
                Consultando ubicación de la flota a las {formatHoraDisplay(hora)}...
              </Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={40} color={themeColors.danger} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.danger, marginTop: 8 }}>
                No se pudo consultar la flota
              </Text>
              <Text style={{ fontSize: 12, color: themeColors.textSecondary, textAlign: 'center', marginTop: 4 }}>
                {error}
              </Text>
            </View>
          ) : snapshot ? (
            <>
              {/* Solo mostrar banner si existe una anomalía real que requiera atención */}
              {anomalyMessage && (
                <View style={styles.anomalyBanner}>
                  <Ionicons name="alert-circle" size={16} color="#b45309" />
                  <Text style={styles.anomalyText}>{anomalyMessage}</Text>
                </View>
              )}

              {isDesktop ? (
                /* VISTA ESCRITORIO: 2 Columnas limpias (Mapa a la izquierda, Lista a la derecha) */
                <View style={styles.desktopBody}>
                  <View
                    style={[
                      styles.desktopMapCol,
                      { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement },
                    ]}
                  >
                    {leafletHtml ? (
                      <iframe
                        title="Mapa Flota vs Asistencia"
                        width="100%"
                        height="100%"
                        style={{ border: 0, minHeight: 430 }}
                        srcDoc={leafletHtml}
                      />
                    ) : (
                      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                          Sin coordenadas disponibles
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={[styles.desktopListCol, { borderLeftColor: themeColors.border }]}>
                    <View style={styles.listHeaderRow}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>
                        Flota ({snapshot.resumen.total_unidades})
                      </Text>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                        {snapshot.resumen.en_movimiento > 0
                          ? `${snapshot.resumen.en_movimiento} en ruta • `
                          : ''}
                        {snapshot.resumen.estacionadas} detenidas
                        {selectedUnit ? ' • Toca de nuevo para ver todas' : ''}
                      </Text>
                    </View>

                    <ScrollView
                      style={{ flex: 1 }}
                      contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12, gap: 6 }}
                    >
                      {snapshot.unidades.map(renderUnitRow)}
                    </ScrollView>
                  </View>
                </View>
              ) : (
                /* VISTA MÓVIL / PANTALLA COMPACTA */
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
                  <View
                    style={[
                      styles.mobileMapContainer,
                      { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement },
                    ]}
                  >
                    {Platform.OS === 'web' && leafletHtml ? (
                      <iframe
                        title="Mapa Flota vs Asistencia"
                        width="100%"
                        height="260"
                        style={{ border: 0 }}
                        srcDoc={leafletHtml}
                      />
                    ) : staticMapUrl ? (
                      <Image
                        source={{ uri: staticMapUrl }}
                        style={{ width: '100%', height: 230 }}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={{ height: 180, justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                          Sin coordenadas disponibles
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>
                      Unidades ({snapshot.resumen.total_unidades})
                    </Text>
                    <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                      {snapshot.resumen.en_movimiento > 0
                        ? `${snapshot.resumen.en_movimiento} en ruta • `
                        : ''}
                      {snapshot.resumen.estacionadas} detenidas
                    </Text>
                  </View>

                  <View style={{ gap: 6 }}>{snapshot.unidades.map(renderUnitRow)}</View>
                </ScrollView>
              )}
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  modalContent: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '90%',
    borderRadius: BorderRadius.large,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 12px 36px rgba(0,0,0,0.22)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  headerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 999,
  },
  closeBtn: {
    padding: 4,
    borderRadius: 6,
  },
  loadingContainer: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  anomalyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  anomalyText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
  },
  desktopBody: {
    flexDirection: 'row',
    height: 460,
  },
  desktopMapCol: {
    flex: 1.35,
    overflow: 'hidden',
  },
  desktopListCol: {
    flex: 1,
    borderLeftWidth: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mobileMapContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  assignedTag: {
    backgroundColor: '#fef9c3',
    borderColor: '#fde047',
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  assignedTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#854d0e',
  },
  iconActionBtn: {
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
});
