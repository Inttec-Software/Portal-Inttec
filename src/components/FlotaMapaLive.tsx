import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  Vehiculo,
  Usuario,
  VehiculoService,
  FlotaGpsLiveResponse,
  GpsRouteHistoryResponse,
  GpsRouteStop,
  GpsRouteTrip,
  inttecClient,
  daravisaClient,
  sortUsuariosByRoleAndName,
} from '@/services/supabase';
import { getApiUrl, getApiHeaders } from '@/services/apiHelper';
import { useAuth } from '@/context/AuthContext';

interface FlotaMapaLiveProps {
  onVehiculoUpdated?: () => void;
}

const getOffsetDateStr = (daysAgo: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function FlotaMapaLive({ onVehiculoUpdated }: FlotaMapaLiveProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { company } = useAuth();

  const [gpsResponse, setGpsResponse] = useState<FlotaGpsLiveResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedVehiculo, setSelectedVehiculo] = useState<Vehiculo | null>(null);

  // Modo de Mapa: 'LIVE' (Posición en vivo) o 'ROUTE' (Ruta trazada y lugares visitados)
  const [mapMode, setMapMode] = useState<'LIVE' | 'ROUTE'>('LIVE');
  const [routeDateStr, setRouteDateStr] = useState<string>(() => getOffsetDateStr(0));
  const [routeHistory, setRouteHistory] = useState<GpsRouteHistoryResponse | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [focusedStop, setFocusedStop] = useState<GpsRouteStop | null>(null);
  const [focusedTrip, setFocusedTrip] = useState<GpsRouteTrip | null>(null);

  // Empleados para asignación diaria
  const [empleados, setEmpleados] = useState<Usuario[]>([]);
  const [asignarModalVisible, setAsignarModalVisible] = useState(false);
  const [vehiculoParaAsignar, setVehiculoParaAsignar] = useState<Vehiculo | null>(null);
  const [selectedEmpleadosIds, setSelectedEmpleadosIds] = useState<string[]>([]);
  const [selectedImei, setSelectedImei] = useState<string>('');
  const [isSavingAsignacion, setIsSavingAsignacion] = useState(false);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const fetchFlotaLive = useCallback(async (force = false, silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const data = await VehiculoService.getFlotaGpsLive(force);
      setGpsResponse(data);
      setSelectedVehiculo((prev) => {
        if (!prev && data.vehiculos.length > 0) return data.vehiculos[0];
        if (prev) {
          const updated = data.vehiculos.find((v) => v.id === prev.id);
          return updated || (data.vehiculos.length > 0 ? data.vehiculos[0] : null);
        }
        return null;
      });
    } catch (err: any) {
      console.warn('[FlotaMapaLive] Error cargando GPS:', err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const fetchRouteHistory = useCallback(async (vehId: string, dateStr: string) => {
    setIsLoadingRoute(true);
    setFocusedStop(null);
    setFocusedTrip(null);
    try {
      const history = await VehiculoService.getHistorialRutaVehiculo(vehId, dateStr);
      setRouteHistory(history);
    } catch (err: any) {
      console.warn('[FlotaMapaLive] Error cargando historial de ruta:', err.message);
      setRouteHistory(null);
    } finally {
      setIsLoadingRoute(false);
    }
  }, []);

  const fetchEmpleados = useCallback(async () => {
    try {
      const headers = await getApiHeaders();
      const res = await fetch(`${getApiUrl()}/api/reportes/admin/all`, { headers });
      if (res.ok) {
        const data = await res.json();
        setEmpleados(sortUsuariosByRoleAndName(data.usuarios || []));
        return;
      }
    } catch {}
    try {
      const client = company === 'daravisa' ? daravisaClient : inttecClient;
      const { data } = await client.from('usuarios').select('*').order('nombre');
      setEmpleados(sortUsuariosByRoleAndName(data || []));
    } catch {}
  }, [company]);

  useEffect(() => {
    fetchFlotaLive(false, false);
    fetchEmpleados();
  }, [fetchFlotaLive, fetchEmpleados]);

  // Cargar ruta trazada cuando cambia el vehículo seleccionado o la fecha en modo ROUTE
  useEffect(() => {
    if (mapMode === 'ROUTE' && selectedVehiculo?.id) {
      fetchRouteHistory(selectedVehiculo.id, routeDateStr);
    }
  }, [mapMode, selectedVehiculo?.id, routeDateStr, fetchRouteHistory]);

  // Auto-refresh cada 15 segundos en modo LIVE
  useEffect(() => {
    if (!autoRefresh || mapMode !== 'LIVE') return;
    const interval = setInterval(() => {
      fetchFlotaLive(false, true);
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, mapMode, fetchFlotaLive]);

  const vehiculos = useMemo(() => gpsResponse?.vehiculos || [], [gpsResponse]);

  const stats = useMemo(() => {
    let enMovimiento = 0;
    let encendidosDetenidos = 0;
    let apagados = 0;

    vehiculos.forEach((v) => {
      const speed = Number(v.gps_velocidad || 0);
      if (speed > 3) enMovimiento++;
      else if (v.gps_ignicion) encendidosDetenidos++;
      else apagados++;
    });

    return {
      total: vehiculos.length,
      enMovimiento,
      encendidosDetenidos,
      apagados,
    };
  }, [vehiculos]);

  // HTML interactivo de Leaflet para dibujar cada viaje (A -> B, B -> C...) con un color distinto y pines A, B, C...
  const leafletRouteHtml = useMemo(() => {
    if (!routeHistory || routeHistory.points.length === 0) return null;

    const coordsJson = JSON.stringify(routeHistory.points.map((p) => [p.lat, p.lng]));
    const stopsJson = JSON.stringify(routeHistory.stops);
    const tripsJson = JSON.stringify(routeHistory.trips || []);
    const focusStopJson = JSON.stringify(
      focusedStop ? { lat: focusedStop.lat, lng: focusedStop.lng, id: focusedStop.id } : null
    );
    const focusTripIdJson = JSON.stringify(focusedTrip ? focusedTrip.id : null);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; font-family: system-ui, -apple-system, sans-serif; }
    .stop-badge {
      display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 50%;
      color: #fff; font-weight: 900; font-size: 13px;
      border: 2.5px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    }
    .popup-title { font-weight: 800; font-size: 13px; margin-bottom: 3px; color: #111827; }
    .popup-addr { font-size: 12px; color: #374151; margin-bottom: 4px; }
    .popup-time { font-size: 11px; font-weight: 700; color: #2563eb; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const coords = ${coordsJson};
    const stops = ${stopsJson};
    const trips = ${tripsJson};
    const focusStop = ${focusStopJson};
    const focusTripId = ${focusTripIdJson};

    const map = L.map('map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    let allBounds = null;
    let focusedTripPoly = null;

    if (trips && trips.length > 0) {
      trips.forEach((tr) => {
        const trCoords = (tr.points || []).map(p => [p.lat, p.lng]);
        if (trCoords.length < 2) return;

        const isFocused = focusTripId === tr.id;
        const isDimmed = focusTripId && !isFocused;

        // Borde blanco / sombra para separar visualmente cuando dos viajes pasan por la misma calle
        L.polyline(trCoords, {
          color: '#ffffff',
          weight: isFocused ? 10 : 7,
          opacity: isDimmed ? 0.25 : 0.85
        }).addTo(map);

        const poly = L.polyline(trCoords, {
          color: tr.color || '#2563eb',
          weight: isFocused ? 6.5 : 4.8,
          opacity: isDimmed ? 0.25 : 0.98
        }).addTo(map);

        const tripPopup =
          '<div class="popup-title" style="color:' + tr.color + '">🛣️ Viaje #' + tr.numero + ' (' + tr.tramo_label + ')</div>' +
          '<div class="popup-addr"><b>De (' + tr.desde_letra + '):</b> ' + (tr.origen_direccion || '') + '<br/><b>A (' + tr.hasta_letra + '):</b> ' + (tr.destino_direccion || '') + '</div>' +
          '<div class="popup-time" style="color:' + tr.color + '">🕒 ' + tr.hora_inicio + ' → ' + tr.hora_fin + ' • ' + tr.distancia_km + ' km (Máx ' + tr.velocidad_max_kmh + ' km/h)</div>';

        poly.bindPopup(tripPopup);

        if (isFocused) {
          focusedTripPoly = poly;
        }
      });

      if (coords.length > 1) {
        allBounds = L.polyline(coords).getBounds();
      }
    } else if (coords.length > 1) {
      L.polyline(coords, { color: '#1e3a8a', weight: 7, opacity: 0.35 }).addTo(map);
      const poly = L.polyline(coords, { color: '#2563eb', weight: 4.5, opacity: 0.95 }).addTo(map);
      allBounds = poly.getBounds();
    } else if (coords.length === 1) {
      map.setView(coords[0], 16);
    }

    if (focusedTripPoly) {
      map.fitBounds(focusedTripPoly.getBounds(), { padding: [36, 36] });
      setTimeout(() => focusedTripPoly.openPopup(), 250);
    } else if (allBounds) {
      map.fitBounds(allBounds, { padding: [28, 28] });
    }

    // Dibujar marcadores con letra (Lugar A, Lugar B, Lugar C...)
    stops.forEach((s, idx) => {
      const letter = s.letra || String(idx + 1);
      // Color del pin: Verde para Inicio (A), el color del viaje que llegó a ese lugar para los demás
      const incomingTrip = trips && idx > 0 ? trips[idx - 1] : null;
      const bg = idx === 0 ? '#16a34a' : (incomingTrip && incomingTrip.color ? incomingTrip.color : '#2563eb');

      const icon = L.divIcon({
        className: '',
        html: '<div class="stop-badge" style="background:' + bg + '">' + letter + '</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      });

      const title = s.tipo === 'INICIO'
        ? '🟢 Lugar ' + letter + ' (Inicio del día)'
        : s.tipo === 'ACTUAL'
          ? '🚐 Lugar ' + letter + ' (Última ubicación)'
          : '🅿️ Lugar ' + letter + ' (Parada #' + idx + ')';
      const popupHtml =
        '<div class="popup-title">' + title + '</div>' +
        '<div class="popup-addr">📍 ' + (s.direccion || '') + '</div>' +
        '<div class="popup-time">🕒 Estuvo de ' + s.hora_llegada + ' a ' + s.hora_salida + ' (' + s.duracion_minutos + ' min)</div>';

      const marker = L.marker([s.lat, s.lng], { icon }).addTo(map).bindPopup(popupHtml);
      if (focusStop && focusStop.id === s.id) {
        map.setView([s.lat, s.lng], 17);
        setTimeout(() => marker.openPopup(), 250);
      }
    });
  </script>
</body>
</html>`;
  }, [routeHistory, focusedStop, focusedTrip]);

  // URL de Static Map con múltiples polilíneas de colores por viaje para dispositivos móviles nativos
  const staticRouteMapUrl = useMemo(() => {
    const apiKey =
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyDgvQcdXQYx8uSGNJJ4wENAGkIVbDIaUXc';

    if (mapMode === 'ROUTE' && routeHistory && routeHistory.points.length > 0) {
      let pathsParam = '';
      if (routeHistory.trips && routeHistory.trips.length > 0) {
        const activeTrips = focusedTrip ? [focusedTrip] : routeHistory.trips;
        pathsParam = activeTrips
          .map((tr) => {
            const hexClean = (tr.color || '#2563eb').replace('#', '');
            const step = Math.max(1, Math.ceil(tr.points.length / 25));
            const pts = tr.points
              .filter((_, idx) => idx === 0 || idx === tr.points.length - 1 || idx % step === 0)
              .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
              .join('|');
            return `path=color:0x${hexClean}ff%7Cweight:5%7C${pts}`;
          })
          .join('&');
      } else {
        const step = Math.max(1, Math.ceil(routeHistory.points.length / 45));
        const pathPts = routeHistory.points
          .filter((_, idx) => idx === 0 || idx === routeHistory.points.length - 1 || idx % step === 0)
          .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
          .join('|');
        pathsParam = `path=color:0x2563ebff%7Cweight:5%7C${pathPts}`;
      }

      const stopMarkers = routeHistory.stops
        .slice(0, 10)
        .map((s, idx) => {
          const color = idx === 0 ? 'green' : s.tipo === 'ACTUAL' ? 'blue' : 'red';
          const lbl = (s.letra || String(idx + 1)).slice(0, 1).toUpperCase();
          return `markers=color:${color}%7Clabel:${lbl}%7C${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
        })
        .join('&');

      return `https://maps.googleapis.com/maps/api/staticmap?size=640x320&scale=2&maptype=roadmap&${pathsParam}&${stopMarkers}&key=${apiKey}`;
    }

    const validVehs = vehiculos.filter((v) => v.gps_lat && v.gps_lng);
    if (validVehs.length === 0) return null;

    if (selectedVehiculo?.gps_lat && selectedVehiculo?.gps_lng) {
      const lat = selectedVehiculo.gps_lat;
      const lng = selectedVehiculo.gps_lng;
      const color =
        Number(selectedVehiculo.gps_velocidad || 0) > 3
          ? 'green'
          : selectedVehiculo.gps_ignicion
            ? 'blue'
            : 'red';
      return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=640x320&scale=2&maptype=roadmap&markers=color:${color}%7Clabel:${encodeURIComponent(
        (selectedVehiculo.placas || 'V').slice(0, 1)
      )}%7C${lat},${lng}&key=${apiKey}`;
    }

    return null;
  }, [mapMode, routeHistory, vehiculos, selectedVehiculo]);

  const handleOpenGoogleMaps = (lat?: number | null, lng?: number | null) => {
    if (!lat || !lng) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  const handleOpenAsignarModal = (veh: Vehiculo) => {
    setVehiculoParaAsignar(veh);
    setSelectedEmpleadosIds(veh.conductores_hoy_ids || []);
    setSelectedImei(veh.gps_imei || '');
    setAsignarModalVisible(true);
  };

  const toggleEmpleadoSeleccion = (empId: string) => {
    setSelectedEmpleadosIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const handleSaveAsignacion = async () => {
    if (!vehiculoParaAsignar) return;
    setIsSavingAsignacion(true);
    try {
      await VehiculoService.asignarConductoresDia(
        vehiculoParaAsignar.id,
        selectedEmpleadosIds,
        selectedImei.trim() || null
      );
      setAsignarModalVisible(false);
      await fetchFlotaLive(true, false);
      onVehiculoUpdated?.();
      showAlert('Asignación Guardada', 'Se actualizaron los conductores y configuración GPS de la unidad para hoy.');
    } catch (err: any) {
      showAlert('Error', err.message || 'No se pudo guardar la asignación.');
    } finally {
      setIsSavingAsignacion(false);
    }
  };

  if (isLoading) {
    return (
      <View
        style={[
          styles.cardContainer,
          {
            backgroundColor: themeColors.backgroundElement,
            borderColor: themeColors.border,
            alignItems: 'center',
            paddingVertical: 32,
          },
        ]}
      >
        <ActivityIndicator size="large" color={themeColors.accent} />
        <Text style={{ color: themeColors.textSecondary, marginTop: 10, fontSize: 13 }}>
          Consultando localizadores GPS Ruptela...
        </Text>
      </View>
    );
  }

  const todayStr = getOffsetDateStr(0);
  const yesterdayStr = getOffsetDateStr(1);
  const twoDaysAgoStr = getOffsetDateStr(2);

  return (
    <View
      style={[
        styles.cardContainer,
        { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border },
      ]}
    >
      {/* Encabezado y Controles */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Ionicons name="navigate-circle" size={22} color={themeColors.accent} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: themeColors.text }}>
              Rastreo GPS y Rutas (Ruptela)
            </Text>
            <View
              style={{
                backgroundColor:
                  gpsResponse?.source === 'EPCOM_LIVE' || gpsResponse?.source === 'WEBHOOK'
                    ? '#dcfce7'
                    : '#fef3c7',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 12,
                borderWidth: 1,
                borderColor:
                  gpsResponse?.source === 'EPCOM_LIVE' || gpsResponse?.source === 'WEBHOOK'
                    ? '#86efac'
                    : '#fde68a',
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color:
                    gpsResponse?.source === 'EPCOM_LIVE' || gpsResponse?.source === 'WEBHOOK'
                      ? '#166534'
                      : '#92400e',
                }}
              >
                {gpsResponse?.source === 'EPCOM_LIVE'
                  ? '● EPCOM GPS EN VIVO'
                  : gpsResponse?.source === 'WEBHOOK'
                    ? '● WEBHOOK ACTIVO'
                    : '● MODO DEMO'}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 2 }}>
            Ubicación en tiempo real, ruta trazada por calles y bitácora de lugares visitados
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            onPress={() => {
              if (mapMode === 'ROUTE' && selectedVehiculo) {
                fetchRouteHistory(selectedVehiculo.id, routeDateStr);
              } else {
                fetchFlotaLive(true, false);
              }
            }}
            disabled={isRefreshing || isLoadingRoute}
            style={[
              styles.actionChip,
              { backgroundColor: themeColors.accent, borderColor: themeColors.accent },
            ]}
          >
            {isRefreshing || isLoadingRoute ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="refresh" size={14} color="#fff" />
            )}
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Actualizar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Contadores Rápidos de Estado */}
      <View style={styles.statsRow}>
        <View style={[styles.statPill, { backgroundColor: '#dcfce7', borderColor: '#86efac' }]}>
          <Ionicons name="speedometer" size={15} color="#15803d" />
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#15803d' }}>
            {stats.enMovimiento} En Ruta
          </Text>
        </View>
        <View style={[styles.statPill, { backgroundColor: '#dbeafe', borderColor: '#93c5fd' }]}>
          <Ionicons name="flash" size={15} color="#1d4ed8" />
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#1d4ed8' }}>
            {stats.encendidosDetenidos} Encendidas
          </Text>
        </View>
        <View style={[styles.statPill, { backgroundColor: '#f3f4f6', borderColor: '#d1d5db' }]}>
          <Ionicons name="lock-closed" size={15} color="#4b5563" />
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#4b5563' }}>
            {stats.apagados} Estacionadas
          </Text>
        </View>
      </View>

      {/* Selector de Vista: Ubicación en Vivo vs Ruta Trazada y Lugares */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: themeColors.background,
          borderRadius: 10,
          padding: 3,
          borderWidth: 1,
          borderColor: themeColors.border,
          marginTop: 12,
          gap: 4,
        }}
      >
        <TouchableOpacity
          onPress={() => setMapMode('LIVE')}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: mapMode === 'LIVE' ? themeColors.accent : 'transparent',
          }}
        >
          <Ionicons
            name="locate"
            size={15}
            color={mapMode === 'LIVE' ? '#fff' : themeColors.textSecondary}
          />
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: mapMode === 'LIVE' ? '#fff' : themeColors.textSecondary,
            }}
          >
            Ubicación en Vivo
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setMapMode('ROUTE')}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: mapMode === 'ROUTE' ? themeColors.accent : 'transparent',
          }}
        >
          <Ionicons
            name="git-branch-outline"
            size={15}
            color={mapMode === 'ROUTE' ? '#fff' : themeColors.textSecondary}
          />
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: mapMode === 'ROUTE' ? '#fff' : themeColors.textSecondary,
            }}
          >
            Ruta Trazada y Lugares
          </Text>
        </TouchableOpacity>
      </View>

      {/* Barra de Fecha y Resumen cuando está activo "Ruta Trazada y Lugares" */}
      {mapMode === 'ROUTE' && (
        <View
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 10,
            backgroundColor: themeColors.background,
            borderWidth: 1,
            borderColor: themeColors.border,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>
                📅 Día del recorrido:
              </Text>
              {[
                { label: 'Hoy', val: todayStr },
                { label: 'Ayer', val: yesterdayStr },
                { label: 'Antier', val: twoDaysAgoStr },
              ].map((d) => {
                const active = routeDateStr === d.val;
                return (
                  <TouchableOpacity
                    key={d.val}
                    onPress={() => setRouteDateStr(d.val)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 8,
                      backgroundColor: active ? themeColors.accent : themeColors.backgroundElement,
                      borderWidth: 1,
                      borderColor: active ? themeColors.accent : themeColors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: active ? '#fff' : themeColors.text,
                      }}
                    >
                      {d.label} ({d.val.slice(5)})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {routeHistory && !isLoadingRoute && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#2563eb' }}>
                  🛣️ {routeHistory.distancia_total_km} km recorridos
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary }}>
                  ⚡ Máx: {routeHistory.velocidad_max_kmh} km/h
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#dc2626' }}>
                  📍 {routeHistory.stops.length} lugares
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* MAPA PRINCIPAL (En Vivo o Ruta Trazada con Calles) */}
      {mapMode === 'ROUTE' ? (
        <View
          style={[
            styles.mapWrapper,
            { borderColor: themeColors.border, backgroundColor: themeColors.background },
          ]}
        >
          {isLoadingRoute ? (
            <View style={{ height: 300, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
              <ActivityIndicator size="large" color={themeColors.accent} />
              <Text style={{ fontSize: 12, color: themeColors.textSecondary, marginTop: 8 }}>
                Trazando ruta por calles y detectando paradas de {selectedVehiculo?.marca} {selectedVehiculo?.modelo}...
              </Text>
            </View>
          ) : routeHistory && routeHistory.points.length > 0 ? (
            <>
              {Platform.OS === 'web' && leafletRouteHtml ? (
                <iframe
                  title="Ruta Trazada GPS"
                  width="100%"
                  height="340"
                  style={{ border: 0 }}
                  srcDoc={leafletRouteHtml}
                />
              ) : staticRouteMapUrl ? (
                <Image
                  source={{ uri: staticRouteMapUrl }}
                  style={{ width: '100%', height: 260 }}
                  contentFit="cover"
                />
              ) : null}

              {/* Barra de filtro por Viajes de Colores (Lugar A -> B, B -> C...) */}
              {routeHistory.trips && routeHistory.trips.length > 0 && (
                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderTopWidth: 1,
                    borderTopColor: themeColors.border,
                    backgroundColor: themeColors.backgroundElement,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.text, marginBottom: 6 }}>
                    🎨 Viajes por Color (toca un tramo para resaltarlo en el mapa):
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <TouchableOpacity
                        onPress={() => {
                          setFocusedTrip(null);
                          setFocusedStop(null);
                        }}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 8,
                          backgroundColor: !focusedTrip ? themeColors.text : themeColors.background,
                          borderWidth: 1,
                          borderColor: themeColors.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '800',
                            color: !focusedTrip ? themeColors.background : themeColors.text,
                          }}
                        >
                          Todos ({routeHistory.trips.length})
                        </Text>
                      </TouchableOpacity>

                      {routeHistory.trips.map((tr) => {
                        const isTripActive = focusedTrip?.id === tr.id;
                        return (
                          <TouchableOpacity
                            key={tr.id}
                            onPress={() => {
                              setFocusedStop(null);
                              setFocusedTrip(isTripActive ? null : tr);
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 8,
                              backgroundColor: isTripActive ? tr.color : tr.color + '18',
                              borderWidth: 1.5,
                              borderColor: tr.color,
                            }}
                          >
                            <View
                              style={{
                                width: 12,
                                height: 4,
                                borderRadius: 2,
                                backgroundColor: isTripActive ? '#fff' : tr.color,
                              }}
                            />
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '800',
                                color: isTripActive ? '#fff' : tr.color,
                              }}
                            >
                              Viaje #{tr.numero}: {tr.tramo_label} ({tr.distancia_km} km)
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* Bitácora de Lugares (A, B, C...) intercalada con cada Viaje de color (A -> B, B -> C...) */}
              <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: themeColors.border }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.text, marginBottom: 8 }}>
                  📍 Bitácora de Lugares y Viajes de {selectedVehiculo?.marca} {selectedVehiculo?.modelo} ({routeDateStr})
                </Text>
                <View style={{ gap: 6 }}>
                  {routeHistory.stops.map((stop, idx) => {
                    const isFocused = focusedStop?.id === stop.id;
                    const letter = stop.letra || String(idx + 1);
                    const incomingTrip =
                      routeHistory.trips && idx > 0 ? routeHistory.trips[idx - 1] : null;
                    const outgoingTrip =
                      routeHistory.trips && idx < routeHistory.trips.length
                        ? routeHistory.trips[idx]
                        : null;

                    const badgeColor =
                      idx === 0
                        ? '#16a34a'
                        : incomingTrip?.color
                          ? incomingTrip.color
                          : '#2563eb';
                    const badgeText =
                      stop.tipo === 'INICIO'
                        ? `LUGAR ${letter} • INICIO`
                        : stop.tipo === 'ACTUAL'
                          ? `LUGAR ${letter} • ACTUAL`
                          : `LUGAR ${letter} • PARADA #${idx}`;

                    return (
                      <React.Fragment key={stop.id}>
                        {/* Tarjeta del Lugar (A, B, C...) */}
                        <TouchableOpacity
                          onPress={() => {
                            setFocusedTrip(null);
                            setFocusedStop(stop);
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: 10,
                            borderRadius: 8,
                            backgroundColor: isFocused
                              ? badgeColor + '18'
                              : themeColors.backgroundElement,
                            borderWidth: 1.5,
                            borderColor: isFocused ? badgeColor : themeColors.border,
                            gap: 8,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <View
                                style={{
                                  backgroundColor: badgeColor,
                                  paddingHorizontal: 7,
                                  paddingVertical: 2,
                                  borderRadius: 5,
                                }}
                              >
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>
                                  {badgeText}
                                </Text>
                              </View>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>
                                🕒 Estuvo de {stop.hora_llegada} a {stop.hora_salida}
                              </Text>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: badgeColor }}>
                                ({stop.duracion_minutos} min detenido)
                              </Text>
                            </View>
                            <Text
                              style={{ fontSize: 12, color: themeColors.text, marginTop: 4 }}
                              numberOfLines={2}
                            >
                              📍 {stop.direccion}
                            </Text>
                          </View>

                          <TouchableOpacity
                            onPress={() => handleOpenGoogleMaps(stop.lat, stop.lng)}
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 5,
                              borderRadius: 6,
                              backgroundColor: '#2563eb18',
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <Ionicons name="open-outline" size={13} color="#2563eb" />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#2563eb' }}>
                              Mapa
                            </Text>
                          </TouchableOpacity>
                        </TouchableOpacity>

                        {/* Conector del Viaje en su color propio (De Lugar A -> Lugar B) */}
                        {outgoingTrip && (
                          <TouchableOpacity
                            onPress={() => {
                              setFocusedStop(null);
                              setFocusedTrip(
                                focusedTrip?.id === outgoingTrip.id ? null : outgoingTrip
                              );
                            }}
                            style={{
                              marginLeft: 16,
                              paddingVertical: 7,
                              paddingHorizontal: 10,
                              borderLeftWidth: 4,
                              borderLeftColor: outgoingTrip.color,
                              backgroundColor:
                                focusedTrip?.id === outgoingTrip.id
                                  ? outgoingTrip.color + '22'
                                  : outgoingTrip.color + '0D',
                              borderRadius: 6,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: 6,
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <View
                                style={{
                                  backgroundColor: outgoingTrip.color,
                                  paddingHorizontal: 6,
                                  paddingVertical: 1.5,
                                  borderRadius: 4,
                                }}
                              >
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>
                                  🛣️ VIAJE #{outgoingTrip.numero} ({outgoingTrip.tramo_label})
                                </Text>
                              </View>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.text }}>
                                {outgoingTrip.hora_inicio} → {outgoingTrip.hora_fin}
                              </Text>
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: outgoingTrip.color }}>
                                {outgoingTrip.distancia_km} km • {outgoingTrip.duracion_minutos} min en ruta
                              </Text>
                              {outgoingTrip.velocidad_max_kmh > 0 && (
                                <Text style={{ fontSize: 10, color: themeColors.textSecondary, fontWeight: '600' }}>
                                  (Máx {outgoingTrip.velocidad_max_kmh} km/h)
                                </Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        )}
                      </React.Fragment>
                    );
                  })}
                </View>
              </View>
            </>
          ) : (
            <View style={{ height: 180, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
              <Ionicons name="map-outline" size={32} color={themeColors.textSecondary} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text, marginTop: 8 }}>
                Sin movimientos registrados en esta fecha ({routeDateStr})
              </Text>
              <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2, textAlign: 'center' }}>
                Prueba seleccionando &quot;Ayer&quot; o elige otra camioneta de la lista inferior.
              </Text>
            </View>
          )}
        </View>
      ) : selectedVehiculo && selectedVehiculo.gps_lat && selectedVehiculo.gps_lng ? (
        <View
          style={[
            styles.mapWrapper,
            { borderColor: themeColors.border, backgroundColor: themeColors.background },
          ]}
        >
          {Platform.OS === 'web' ? (
            <iframe
              title="Mapa GPS Flota"
              width="100%"
              height="270"
              style={{ border: 0, borderRadius: 10 }}
              loading="lazy"
              allowFullScreen
              src={`https://maps.google.com/maps?q=${selectedVehiculo.gps_lat},${selectedVehiculo.gps_lng}&z=16&output=embed`}
            />
          ) : staticRouteMapUrl ? (
            <Image
              source={{ uri: staticRouteMapUrl }}
              style={{ width: '100%', height: 220, borderRadius: 10 }}
              contentFit="cover"
            />
          ) : null}

          {/* Barra flotante inferior de la unidad enfocada en el mapa */}
          <View style={[styles.mapOverlayBar, { backgroundColor: themeColors.background }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor:
                      Number(selectedVehiculo.gps_velocidad || 0) > 3
                        ? '#16a34a'
                        : selectedVehiculo.gps_ignicion
                          ? '#2563eb'
                          : '#6b7280',
                  }}
                />
                <Text style={{ fontSize: 13, fontWeight: '800', color: themeColors.text }}>
                  {selectedVehiculo.marca} {selectedVehiculo.modelo} ({selectedVehiculo.placas})
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.accent }}>
                  • {Number(selectedVehiculo.gps_velocidad || 0)} km/h
                </Text>
              </View>
              <Text
                style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 2 }}
                numberOfLines={1}
              >
                📍{' '}
                {selectedVehiculo.gps_direccion ||
                  `${selectedVehiculo.gps_lat.toFixed(5)}, ${selectedVehiculo.gps_lng.toFixed(5)}`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setMapMode('ROUTE')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: themeColors.accent,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
              }}
            >
              <Ionicons name="git-branch-outline" size={14} color="#fff" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>Ver Ruta</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Lista de Unidades con Telemetría y Conductores de Hoy */}
      <View style={{ gap: 10, marginTop: 12 }}>
        {vehiculos.map((veh) => {
          const isSelected = selectedVehiculo?.id === veh.id;
          const speed = Number(veh.gps_velocidad || 0);
          const isMoving = speed > 3;
          const statusColor = isMoving ? '#16a34a' : veh.gps_ignicion ? '#2563eb' : '#6b7280';
          const statusLabel = isMoving
            ? `En movimiento (${speed} km/h)`
            : veh.gps_ignicion
              ? 'Motor Encendido (Detenida)'
              : 'Motor Apagado / Estacionada';

          const conductoresNombres =
            veh.conductores_hoy && veh.conductores_hoy.length > 0
              ? veh.conductores_hoy.map((c) => c.nombre).join(', ')
              : 'Sin chofer asignado hoy';

          return (
            <TouchableOpacity
              key={veh.id}
              activeOpacity={0.85}
              onPress={() => setSelectedVehiculo(veh)}
              style={[
                styles.vehicleCard,
                {
                  backgroundColor: themeColors.background,
                  borderColor: isSelected ? themeColors.accent : themeColors.border,
                  borderWidth: isSelected ? 2 : 1,
                },
              ]}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Ionicons name="car-sport" size={18} color={statusColor} />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: themeColors.text }}>
                      {veh.marca} {veh.modelo} ({veh.placas})
                    </Text>
                    {veh.gps_nombre_epcom ? (
                      <View style={{ backgroundColor: themeColors.accent + '20', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.accent }}>
                          🛰️ {veh.gps_nombre_epcom}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Estado de motor y velocidad */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: statusColor + '15',
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 6,
                      }}
                    >
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor }}>
                        {statusLabel}
                      </Text>
                    </View>
                    {veh.gps_bateria_v ? (
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>
                        🔋 {veh.gps_bateria_v}V
                      </Text>
                    ) : null}
                  </View>

                  {/* Dirección actual reportada por el Ruptela */}
                  <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginTop: 4 }} numberOfLines={2}>
                    📍{' '}
                    {veh.gps_direccion ||
                      (veh.gps_lat
                        ? `${veh.gps_lat.toFixed(5)}, ${veh.gps_lng?.toFixed(5)}`
                        : 'Esperando señal GPS...')}
                  </Text>

                  {/* Conductores del día */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 }}>
                    <Ionicons
                      name="people-outline"
                      size={13}
                      color={veh.conductores_hoy?.length ? themeColors.accent : themeColors.textSecondary}
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: veh.conductores_hoy?.length ? '700' : '400',
                        color: veh.conductores_hoy?.length ? themeColors.text : themeColors.textSecondary,
                      }}
                    >
                      Hoy la trae: {conductoresNombres}
                    </Text>
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedVehiculo(veh);
                      setMapMode('ROUTE');
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: '#2563eb',
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      borderRadius: 8,
                    }}
                  >
                    <Ionicons name="git-branch-outline" size={13} color="#fff" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>
                      Ruta y Lugares
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleOpenAsignarModal(veh)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      backgroundColor: themeColors.accent + '15',
                      borderWidth: 1,
                      borderColor: themeColors.accent + '40',
                      paddingHorizontal: 8,
                      paddingVertical: 5,
                      borderRadius: 8,
                    }}
                  >
                    <Ionicons name="person-add-outline" size={13} color={themeColors.accent} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.accent }}>
                      Asignar Hoy
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* MODAL 1: Asignar Chofer / Cuadrilla del Día y Vincular IMEI */}
      <Modal
        visible={asignarModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAsignarModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text }}>
                  Asignar Camioneta por Hoy
                </Text>
                <Text style={{ fontSize: 12, color: themeColors.textSecondary }}>
                  {vehiculoParaAsignar?.marca} {vehiculoParaAsignar?.modelo} ({vehiculoParaAsignar?.placas})
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAsignarModalVisible(false)}>
                <Ionicons name="close" size={22} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {/* Campo IMEI del Ruptela ECO5 Lite */}
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text, marginBottom: 4 }}>
                IMEI del GPS Ruptela (EPCOM GPS)
              </Text>
              <TextInput
                value={selectedImei}
                onChangeText={setSelectedImei}
                placeholder="Ej. 867553056692023"
                placeholderTextColor={themeColors.textSecondary}
                style={[
                  styles.inputField,
                  { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.backgroundElement },
                ]}
              />
              {gpsResponse?.dispositivos_epcom_disponibles &&
              gpsResponse.dispositivos_epcom_disponibles.length > 0 ? (
                <View style={{ marginTop: 6 }}>
                  <Text style={{ fontSize: 11, color: themeColors.textSecondary, marginBottom: 4 }}>
                    Señales en tu EPCOM GPS (toca para vincular):
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {gpsResponse.dispositivos_epcom_disponibles.map((dev) => (
                        <TouchableOpacity
                          key={dev.imei}
                          onPress={() => setSelectedImei(dev.imei)}
                          style={{
                            backgroundColor:
                              selectedImei === dev.imei ? themeColors.accent : themeColors.accent + '18',
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: themeColors.accent,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: '700',
                              color: selectedImei === dev.imei ? '#fff' : themeColors.accent,
                            }}
                          >
                            {dev.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              ) : null}
            </View>

            <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text, marginBottom: 6 }}>
              ¿Quiénes van en esta camioneta hoy? ({selectedEmpleadosIds.length} seleccionados)
            </Text>

            <ScrollView style={{ maxHeight: 260, borderWidth: 1, borderColor: themeColors.border, borderRadius: 8 }}>
              {empleados.map((emp) => {
                const checked = selectedEmpleadosIds.includes(emp.id);
                return (
                  <TouchableOpacity
                    key={emp.id}
                    onPress={() => toggleEmpleadoSeleccion(emp.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: themeColors.border,
                      backgroundColor: checked ? themeColors.accent + '15' : 'transparent',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: checked ? '700' : '500', color: themeColors.text }}>
                        {emp.nombre}
                      </Text>
                      <Text style={{ fontSize: 11, color: themeColors.textSecondary }}>{emp.rol}</Text>
                    </View>
                    <Ionicons
                      name={checked ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={checked ? themeColors.accent : themeColors.textSecondary}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                onPress={() => setSelectedEmpleadosIds([])}
                style={[
                  styles.modalBtn,
                  { backgroundColor: themeColors.backgroundElement, borderColor: themeColors.border, borderWidth: 1 },
                ]}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textSecondary }}>
                  Limpiar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveAsignacion}
                disabled={isSavingAsignacion}
                style={[styles.modalBtn, { flex: 1, backgroundColor: themeColors.accent }]}
              >
                {isSavingAsignacion ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>
                    Guardar Asignación de Hoy
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    marginHorizontal: Spacing.two,
    marginTop: Spacing.two,
    padding: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  mapWrapper: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mapOverlayBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  vehicleCard: {
    padding: 12,
    borderRadius: BorderRadius.small,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBox: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  inputField: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
