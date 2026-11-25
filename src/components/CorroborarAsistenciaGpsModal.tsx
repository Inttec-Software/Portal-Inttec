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
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
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
  vehiculoPlacas,
  gpsVehiculoAlerta,
}: CorroborarAsistenciaGpsModalProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

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
          if (res.unidades.length > 0) {
            setSelectedUnit(res.unidades[0]);
          }
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
  }, [visible, asistenciaId, fecha, hora, empleadoLat, empleadoLng, tipo, vehiculoId]);

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

  // Generador de HTML para Leaflet en Web con los pines del empleado y las camionetas
  const leafletHtml = useMemo(() => {
    if (!snapshot) return null;

    const empLat = snapshot.empleado_lat;
    const empLng = snapshot.empleado_lng;
    const empHasGps = (snapshot.empleado_gps_activo || snapshot.empleado_en_oficina || isChecadaOficina) && empLat && empLng;

    const unitsWithCoords = snapshot.unidades.filter((u) => u.lat && u.lng);
    const unitsJson = JSON.stringify(unitsWithCoords);
    const empJson = JSON.stringify(
      empHasGps
        ? {
            lat: empLat,
            lng: empLng,
            nombre: empleadoNombre,
            dir: (snapshot.empleado_en_oficina || isChecadaOficina)
              ? '🏢 Checador Físico en Oficina Matriz (Inttec)'
              : (snapshot.empleado_direccion || empleadoDireccion || ''),
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
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; font-family: system-ui, -apple-system, sans-serif; }
    .unit-pin {
      display: flex; align-items: center; justify-content: center;
      border-radius: 50%; color: #fff; font-weight: 800; font-size: 11px;
      border: 2.5px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.45);
      cursor: pointer;
    }
    .emp-pin {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 50%;
      background: #7c3aed; color: #fff; font-weight: 900; font-size: 15px;
      border: 3px solid #fff; box-shadow: 0 3px 8px rgba(124,58,237,0.5);
    }
    .oficina-pin {
      display: flex; align-items: center; justify-content: center;
      width: 34px; height: 34px; border-radius: 50%;
      background: #15803d; color: #fff; font-weight: 900; font-size: 16px;
      border: 3px solid #fff; box-shadow: 0 3px 8px rgba(21,128,61,0.5);
    }
    .popup-box { font-size: 12px; line-height: 1.4; color: #1f2937; }
    .popup-title { font-weight: 800; font-size: 13px; margin-bottom: 2px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const units = ${unitsJson};
    const emp = ${empJson};
    const focusId = ${focusUnitIdJson};

    const map = L.map('map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    const group = [];

    // Pin de Empleado u Oficina
    if (emp) {
      const pinClass = emp.esOficina ? 'oficina-pin' : 'emp-pin';
      const pinIcon = emp.esOficina ? '🏢' : '👤';
      const empIcon = L.divIcon({
        className: '',
        html: '<div class="' + pinClass + '">' + pinIcon + '</div>',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -17]
      });
      const empMarker = L.marker([emp.lat, emp.lng], { icon: empIcon, zIndexOffset: 1000 }).addTo(map);
      const title = emp.esOficina
        ? '<div class="popup-title" style="color:#15803d">🏢 Checador Físico de Oficina</div><div style="font-size:11px; color:#374151">👤 ' + emp.nombre + ' (' + ${JSON.stringify(tipo)} + ')</div>'
        : '<div class="popup-title" style="color:#7c3aed">👤 ' + emp.nombre + ' (' + ${JSON.stringify(tipo)} + ')</div>';

      empMarker.bindPopup('<div class="popup-box">' + title + '<div>📍 ' + (emp.dir || 'Oficina') + '</div><div style="color:#6b7280; font-size:11px; margin-top:2px">Hora: ' + ${JSON.stringify(hora)} + '</div></div>');
      group.push([emp.lat, emp.lng]);
    }

    // Pines de Unidades Ruptela
    units.forEach((u) => {
      const isMoving = u.velocidad > 10;
      const isAsignada = u.es_vehiculo_asignado;
      const bg = isMoving ? '#16a34a' : (u.ignicion ? '#2563eb' : '#4b5563');
      const size = isAsignada ? 32 : 28;
      const border = isAsignada ? '3px solid #eab308' : '2.5px solid #fff';

      const pinIcon = L.divIcon({
        className: '',
        html: '<div class="unit-pin" style="width:' + size + 'px; height:' + size + 'px; background:' + bg + '; border:' + border + ';">' + (isAsignada ? '⭐' : '🚐') + '</div>',
        iconSize: [size, size],
        iconAnchor: [size/2, size/2],
        popupAnchor: [0, -size/2]
      });

      const marker = L.marker([u.lat, u.lng], { icon: pinIcon }).addTo(map);
      const distText = u.distancia_empleado_m !== null ? '<br/>📏 <b>Distancia al empleado:</b> ' + (u.distancia_empleado_m < 1000 ? u.distancia_empleado_m + ' m' : (u.distancia_empleado_m/1000).toFixed(2) + ' km') : '';
      const popupHtml = '<div class="popup-box">' +
        '<div class="popup-title" style="color:' + bg + '">🚐 ' + u.marca + ' ' + u.modelo + ' (' + u.placas + ')' + (isAsignada ? ' ⭐ CAMIONETA DEL TURNO' : '') + '</div>' +
        '<div>📍 ' + (u.direccion || 'Ubicación') + '</div>' +
        '<div>⚡ <b>Velocidad:</b> ' + u.velocidad + ' km/h ' + (isMoving ? '🚨 EN MOVIMIENTO' : (u.ignicion ? '🔵 Motor encendido' : '⚪ Motor apagado')) + '</div>' +
        '<div>🕒 <b>Hora reporte:</b> ' + (u.hora_reporte || '') + ' (±' + (u.diferencia_minutos || 0) + ' min)</div>' +
        distText +
        '</div>';

      marker.bindPopup(popupHtml);
      group.push([u.lat, u.lng]);

      if (focusId && u.vehiculo_id === focusId) {
        setTimeout(() => marker.openPopup(), 250);
      }
    });

    if (group.length > 1) {
      map.fitBounds(L.latLngBounds(group), { padding: [36, 36], maxZoom: 16 });
    } else if (group.length === 1) {
      map.setView(group[0], 15);
    } else {
      map.setView([28.6353, -106.0889], 13);
    }
  </script>
</body>
</html>`;
  }, [snapshot, selectedUnit, empleadoNombre, empleadoDireccion, hora, tipo]);

  // Static Map para dispositivos móviles nativos
  const staticMapUrl = useMemo(() => {
    if (!snapshot) return null;
    const apiKey =
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyDgvQcdXQYx8uSGNJJ4wENAGkIVbDIaUXc';

    const markers: string[] = [];

    const hasCoords = !!((snapshot.empleado_gps_activo || snapshot.empleado_en_oficina || isChecadaOficina) && snapshot.empleado_lat && snapshot.empleado_lng);
    if (hasCoords) {
      const color = (snapshot.empleado_en_oficina || isChecadaOficina) ? 'green' : 'purple';
      const label = (snapshot.empleado_en_oficina || isChecadaOficina) ? 'O' : 'E';
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
    return `https://maps.googleapis.com/maps/api/staticmap?size=640x320&scale=2&maptype=roadmap&${markers.join('&')}&key=${apiKey}`;
  }, [snapshot, isChecadaOficina]);

  return (
    <Modal
      statusBarTranslucent={true}
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 18 }}>🛰️</Text>
                <Text style={[styles.modalTitle, { color: themeColors.text }]} numberOfLines={1}>
                  Corroboración con Flota GPS
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
                {empleadoNombre} • <Text style={{ fontWeight: '700', color: themeColors.accent }}>{tipo}</Text> a las{' '}
                {formatHoraDisplay(hora)} ({fecha})
                {snapshot?.desfase_horas_oficina && snapshot.desfase_horas_oficina !== 0 && snapshot.hora_oficina_chihuahua
                  ? ` • 🕒 ${formatHoraDisplay(snapshot.hora_oficina_chihuahua)} Hora Chihuahua`
                  : ''}
                {isChecadaOficina ? ' • 🏢 Checador de Oficina' : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={themeColors.accent} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text, marginTop: 12 }}>
                Consultando satélites y telemetría de las 5 unidades...
              </Text>
              <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 4, textAlign: 'center' }}>
                Revisando ubicación, velocidad y motor de cada camioneta a las {formatHoraDisplay(hora)}
              </Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={48} color={themeColors.danger} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: themeColors.danger, marginTop: 8 }}>
                Error al consultar flota
              </Text>
              <Text style={{ fontSize: 12, color: themeColors.textSecondary, textAlign: 'center', marginTop: 4 }}>
                {error}
              </Text>
            </View>
          ) : snapshot ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 12 }}>
              {/* Alerta de Checada en Oficina vs Celular con GPS vs Celular Apagado */}
              {isChecadaOficina ? (
                <View style={[styles.alertBanner, { backgroundColor: '#f0fdf4', borderColor: '#22c55e' }]}>
                  <Ionicons name="business" size={22} color="#15803d" />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#166534' }}>
                      🏢 CHECADOR FÍSICO DE OFICINA
                    </Text>
                    <Text style={{ fontSize: 11, color: '#14532d', marginTop: 2 }}>
                      Checada presencial registrada en el checador físico de la oficina (Hikvision MinMoe). Se sabe de antemano que la asistencia es física en las instalaciones centrales, por lo que no requiere ubicación del celular.
                    </Text>
                  </View>
                </View>
              ) : !snapshot.empleado_gps_activo ? (
                <View style={[styles.alertBanner, { backgroundColor: '#fee2e2', borderColor: '#ef4444' }]}>
                  <Ionicons name="warning" size={20} color="#b91c1c" />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#991b1b' }}>
                      UBICACIÓN DEL CELULAR APAGADA
                    </Text>
                    <Text style={{ fontSize: 11, color: '#7f1d1d', marginTop: 2 }}>
                      El empleado checó sin transmitir GPS. Revisa abajo dónde estaban las 5 camionetas a esa hora exacta para verificar si iba en alguna de ellas.
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={[styles.alertBanner, { backgroundColor: '#f0fdf4', borderColor: '#22c55e' }]}>
                  <Ionicons name="checkmark-circle" size={20} color="#15803d" />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#166534' }}>
                      CELULAR CON GPS ACTIVO
                    </Text>
                    <Text style={{ fontSize: 11, color: '#14532d', marginTop: 2 }}>
                      📍 {snapshot.empleado_direccion || `${snapshot.empleado_lat?.toFixed(5)}, ${snapshot.empleado_lng?.toFixed(5)}`}
                    </Text>
                  </View>
                </View>
              )}

              {/* Aviso de homologación de huso horario si el técnico estaba fuera de Chihuahua o su reloj tenía desfase */}
              {snapshot.desfase_horas_oficina !== undefined && snapshot.desfase_horas_oficina !== 0 && (
                <View style={[styles.alertBanner, { backgroundColor: '#eff6ff', borderColor: '#60a5fa' }]}>
                  <Ionicons name="time" size={20} color="#1d4ed8" />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#1e3a8a' }}>
                      🕒 SINCRONIZACIÓN AUTOMÁTICA DE HUSO HORARIO ({snapshot.zona_horaria_detectada || snapshot.utc_offset_empleado})
                    </Text>
                    <Text style={{ fontSize: 11, color: '#1e40af', marginTop: 2 }}>
                      La checada marcó las <Text style={{ fontWeight: '800' }}>{formatHoraDisplay(hora)}</Text> en el reloj del sitio/dispositivo ({snapshot.utc_offset_empleado}), lo que equivale exactamente a las{' '}
                      <Text style={{ fontWeight: '800' }}>{formatHoraDisplay(snapshot.hora_oficina_chihuahua || hora)}</Text> en Hora Oficial de Oficina Chihuahua (UTC-6). El satélite GPS se consultó en el instante real exacto del reporte.
                    </Text>
                  </View>
                </View>
              )}

              {/* Alerta de camioneta en movimiento o lejos si la hay */}
              {snapshot.resumen.alerta_principal && (
                <View style={[styles.alertBanner, { backgroundColor: '#fef3c7', borderColor: '#f59e0b' }]}>
                  <Ionicons name="speedometer" size={20} color="#b45309" />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#92400e' }}>
                      ALERTA AUTOMÁTICA DE CHECADA
                    </Text>
                    <Text style={{ fontSize: 11, color: '#78350f', marginTop: 2 }}>
                      {snapshot.resumen.alerta_principal}
                    </Text>
                  </View>
                </View>
              )}

              {/* Resumen numérico */}
              <View style={styles.metricsRow}>
                <View style={[styles.metricChip, { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.textSecondary }}>
                    Camionetas
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: themeColors.text }}>
                    {snapshot.resumen.total_unidades}
                  </Text>
                </View>

                <View style={[styles.metricChip, { backgroundColor: '#dcfce7', borderColor: '#86efac' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#166534' }}>
                    En movimiento
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#15803d' }}>
                    {snapshot.resumen.en_movimiento}
                  </Text>
                </View>

                <View style={[styles.metricChip, { backgroundColor: '#e0f2fe', borderColor: '#7dd3fc' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#075985' }}>
                    Estacionadas
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#0369a1' }}>
                    {snapshot.resumen.estacionadas}
                  </Text>
                </View>

                {(snapshot.empleado_gps_activo || isChecadaOficina) && (
                  <View style={[styles.metricChip, { backgroundColor: '#ede9fe', borderColor: '#c4b5fd' }]}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#5b21b6' }}>
                      {isChecadaOficina ? 'En oficina' : 'Junto al emp.'}
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#6d28d9' }}>
                      {snapshot.resumen.cerca_empleado}
                    </Text>
                  </View>
                )}
              </View>

              {/* MAPA COMPARATIVO */}
              <View style={[styles.mapContainer, { borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement }]}>
                {Platform.OS === 'web' && leafletHtml ? (
                  <iframe
                    title="Mapa Comparativo Flota vs Asistencia"
                    width="100%"
                    height="320"
                    style={{ border: 0 }}
                    srcDoc={leafletHtml}
                  />
                ) : staticMapUrl ? (
                  <Image
                    source={{ uri: staticMapUrl }}
                    style={{ width: '100%', height: 260 }}
                    contentFit="cover"
                  />
                ) : (
                  <View style={{ height: 200, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                      No se encontraron coordenadas para mostrar el mapa
                    </Text>
                  </View>
                )}
              </View>

              {/* LISTA DETALLADA DE LAS 5 CAMIONETAS */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.text }}>
                  Posición de las unidades a las {formatHoraDisplay(hora)}:
                </Text>

                {snapshot.unidades.map((unit) => {
                  const isMoving = unit.velocidad > 10;
                  const isSelected = selectedUnit?.vehiculo_id === unit.vehiculo_id;

                  const badgeBg =
                    unit.badge_color === 'verde'
                      ? '#dcfce7'
                      : unit.badge_color === 'azul'
                        ? '#e0f2fe'
                        : unit.badge_color === 'rojo'
                          ? '#fee2e2'
                          : themeColors.backgroundElement;

                  const badgeText =
                    unit.badge_color === 'verde'
                      ? '#15803d'
                      : unit.badge_color === 'azul'
                        ? '#0369a1'
                        : unit.badge_color === 'rojo'
                          ? '#b91c1c'
                          : themeColors.textSecondary;

                  return (
                    <TouchableOpacity
                      key={unit.vehiculo_id}
                      activeOpacity={0.8}
                      onPress={() => setSelectedUnit(unit)}
                      style={[
                        styles.unitCard,
                        {
                          backgroundColor: isSelected ? themeColors.accent + '10' : themeColors.background,
                          borderColor: isSelected ? themeColors.accent : themeColors.border,
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.text }}>
                              {unit.marca} {unit.modelo}
                            </Text>
                            <View style={{ backgroundColor: themeColors.backgroundElement, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: themeColors.border }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.text }}>
                                {unit.placas}
                              </Text>
                            </View>
                            {unit.es_vehiculo_asignado && (
                              <View style={{ backgroundColor: '#fef08a', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#facc15' }}>
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#854d0e' }}>
                                  ⭐ CAMIONETA DEL TURNO
                                </Text>
                              </View>
                            )}
                          </View>

                          <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 4 }}>
                            📍 {unit.direccion || 'Ubicación no disponible'}
                          </Text>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                            <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: badgeText }}>
                                {unit.motivo_estado}
                              </Text>
                            </View>

                            <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                              ⚡ {unit.velocidad} km/h • {unit.ignicion ? 'Motor ON' : 'Motor OFF'}
                            </Text>

                            {unit.bateria_v && (
                              <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                                🔋 {unit.bateria_v} V
                              </Text>
                            )}

                            {unit.hora_reporte && (
                              <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                                🕒 Reportó: {unit.hora_reporte}
                                {snapshot.desfase_horas_oficina !== undefined &&
                                snapshot.desfase_horas_oficina !== 0 &&
                                unit.hora_reporte_chihuahua &&
                                unit.hora_reporte_chihuahua !== unit.hora_reporte
                                  ? ` (${unit.hora_reporte_chihuahua} Chih.)`
                                  : ''}
                                {typeof unit.diferencia_minutos === 'number'
                                  ? ` • ±${unit.diferencia_minutos} min`
                                  : ''}
                              </Text>
                            )}
                          </View>
                        </View>

                        {unit.lat && unit.lng && (
                          <TouchableOpacity
                            onPress={() => handleOpenGoogleMaps(unit.lat, unit.lng)}
                            style={[styles.gmapsBtn, { backgroundColor: themeColors.accent + '15' }]}
                            accessibilityLabel="Abrir en Google Maps"
                          >
                            <Ionicons name="navigate-outline" size={16} color={themeColors.accent} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.accent }}>
                              Maps
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  modalContent: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '92%',
    borderRadius: BorderRadius.large,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
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
    fontSize: 16,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 6,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  metricChip: {
    flex: 1,
    minWidth: 100,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  mapContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
  },
  unitCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gmapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    marginLeft: 8,
  },
});
