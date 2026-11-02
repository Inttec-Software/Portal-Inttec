import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import CustomButton from '@/components/CustomButton';
import { TrabajoRealizado, ColaboradorItem } from '../types';

interface Paso2RevisionProps {
  clienteNombre: string;
  sucursalNombre?: string;
  colaboradores: ColaboradorItem[];
  trabajos: TrabajoRealizado[];
  isSubmitting: boolean;
  isSavingDraft: boolean;
  isEditing?: boolean;
  onPrev: () => void;
  onExportPDF: () => void;
  onSaveToDatabase: () => void;
  onSaveDraft: () => void;
}

export default function Paso2Revision({
  clienteNombre,
  sucursalNombre,
  colaboradores,
  trabajos,
  isSubmitting,
  isSavingDraft,
  isEditing = false,
  onPrev,
  onExportPDF,
  onSaveToDatabase,
  onSaveDraft,
}: Paso2RevisionProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const antesCount = trabajos.filter((t) => t.antesImg?.uri).length;
  const despuesCount = trabajos.filter((t) => t.despuesImg?.uri).length;
  const extrasCount = trabajos.reduce(
    (acc, t) => acc + (t.fotosAdicionales?.length || 0),
    0
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: themeColors.text }]}>
        2. Revisión y Finalización
      </Text>
      <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
        Verifica el resumen del reporte antes de enviarlo o exportarlo.
      </Text>

      {/* Tarjeta de Resumen */}
      <View
        style={[
          styles.summaryCard,
          {
            backgroundColor: themeColors.backgroundElement,
            borderColor: themeColors.border,
          },
        ]}
      >
        <Text style={[styles.summaryTitle, { color: themeColors.primary }]}>
          Resumen de la Intervención
        </Text>

        <View style={styles.summaryRow}>
          <Ionicons name="business-outline" size={16} color={themeColors.primary} />
          <Text style={[styles.summaryText, { color: themeColors.text }]}>
            <Text style={{ fontWeight: '700' }}>Cliente: </Text>
            {clienteNombre || 'Sin cliente asignado'}
            {sucursalNombre ? ` (${sucursalNombre})` : ''}
          </Text>
        </View>

        {colaboradores.length > 0 && (
          <View style={styles.summaryRow}>
            <Ionicons name="people-outline" size={16} color={themeColors.accent} />
            <Text style={[styles.summaryText, { color: themeColors.text }]}>
              <Text style={{ fontWeight: '700' }}>Cuadrilla: </Text>
              {colaboradores.map((c) => c.nombre).join(', ')}
            </Text>
          </View>
        )}

        <View style={styles.summaryRow}>
          <Ionicons name="layers-outline" size={16} color={themeColors.textSecondary} />
          <Text style={[styles.summaryText, { color: themeColors.text }]}>
            <Text style={{ fontWeight: '700' }}>Trabajos Registrados: </Text>
            {trabajos.length}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Ionicons name="camera-outline" size={16} color={themeColors.success} />
          <Text style={[styles.summaryText, { color: themeColors.text }]}>
            <Text style={{ fontWeight: '700' }}>Fotos Antes / Después: </Text>
            {antesCount} Antes, {despuesCount} Después
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Ionicons name="images-outline" size={16} color={themeColors.accent} />
          <Text style={[styles.summaryText, { color: themeColors.text }]}>
            <Text style={{ fontWeight: '700' }}>Fotos Adicionales: </Text>
            {extrasCount} fotografías
          </Text>
        </View>

        {/* Detalle de Reportes */}
        <View style={[styles.detailSection, { borderTopColor: themeColors.border }]}>
          <Text style={[styles.detailTitle, { color: themeColors.text }]}>
            Detalle de los Reportes (Versión Mejorada)
          </Text>

          {trabajos.map((t, idx) => (
            <View
              key={idx}
              style={[
                styles.jobPreviewCard,
                { backgroundColor: themeColors.background, borderColor: themeColors.border },
              ]}
            >
              <Text style={[styles.jobPreviewNumber, { color: themeColors.primary }]}>
                Trabajo #{idx + 1}
              </Text>
              <Text style={[styles.jobPreviewText, { color: themeColors.text }]}>
                <Text style={{ fontWeight: '600' }}>Situación: </Text>
                {t.descripcion}
              </Text>
              <Text style={[styles.jobPreviewText, { color: themeColors.text, marginTop: 4 }]}>
                <Text style={{ fontWeight: '600' }}>Solución: </Text>
                {t.solucion}
              </Text>
              {t.materiales_usados && t.materiales_usados.length > 0 && (
                <Text style={[styles.jobPreviewText, { color: themeColors.textSecondary, marginTop: 4 }]}>
                  <Text style={{ fontWeight: '600' }}>Materiales: </Text>
                  {t.materiales_usados.map((m) => `${m.usado}x ${m.nombre}`).join(', ')}
                </Text>
              )}
            </View>
          ))}

          <Text style={[styles.noticeText, { color: themeColors.textSecondary }]}>
            💡 Si necesitas modificar cualquier texto o fotografía, presiona "Atrás".
          </Text>
        </View>
      </View>

      {/* Botonera de Acción */}
      <View style={styles.actionsContainer}>
        <CustomButton
          title="EXPORTAR REPORTE A PDF"
          onPress={onExportPDF}
          variant="primary"
          icon={<Ionicons name="document-text-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />}
        />

        <CustomButton
          title={isEditing ? 'ACTUALIZAR EN EL SERVIDOR' : 'GUARDAR EN EL SERVIDOR'}
          onPress={onSaveToDatabase}
          loading={isSubmitting}
          variant="success"
          style={{ marginTop: Spacing.two }}
          icon={<Ionicons name="cloud-upload-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />}
        />

        {!isEditing && (
          <CustomButton
            title="GUARDAR COMO BORRADOR"
            onPress={onSaveDraft}
            loading={isSavingDraft}
            variant="secondary"
            style={{ marginTop: Spacing.two }}
            icon={<Ionicons name="save-outline" size={20} color={themeColors.text} style={{ marginRight: 8 }} />}
          />
        )}
      </View>

      {/* Navegación */}
      <View style={styles.navRow}>
        <CustomButton title="Atrás" onPress={onPrev} variant="secondary" style={{ width: 120 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: Spacing.four,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: Spacing.three,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.large,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: Spacing.two,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  summaryText: {
    fontSize: 13,
    flex: 1,
  },
  detailSection: {
    borderTopWidth: 1,
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
  },
  detailTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: Spacing.one,
  },
  jobPreviewCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.small,
    padding: Spacing.two,
    marginBottom: 8,
  },
  jobPreviewNumber: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  jobPreviewText: {
    fontSize: 12,
    lineHeight: 16,
  },
  noticeText: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
  },
  actionsContainer: {
    marginVertical: Spacing.two,
  },
  navRow: {
    flexDirection: 'row',
    marginTop: Spacing.two,
  },
});
