import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';

export interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  itemsPerPageOptions?: number[];
  isLoading?: boolean;
  style?: ViewStyle;
}

export default function PaginationControls({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  itemsPerPageOptions = [20, 25, 50, 100],
  isLoading = false,
  style,
}: PaginationControlsProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { width } = useWindowDimensions();
  const isCompact = width < 680;

  const validTotalPages = Math.max(1, totalPages || 1);
  const validCurrentPage = Math.min(Math.max(1, currentPage || 1), validTotalPages);

  // Calcular rango visible (ej. Mostrando 1 - 25 de 1,100)
  const startItem = totalItems === 0 ? 0 : (validCurrentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(validCurrentPage * itemsPerPage, totalItems);

  // Generar lista de números de página con elipsis
  const getPageNumbers = () => {
    if (validTotalPages <= 7) {
      return Array.from({ length: validTotalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis-left' | 'ellipsis-right')[] = [];
    pages.push(1);

    const leftBoundary = Math.max(2, validCurrentPage - 1);
    const rightBoundary = Math.min(validTotalPages - 1, validCurrentPage + 1);

    if (leftBoundary > 2) {
      pages.push('ellipsis-left');
    }

    for (let p = leftBoundary; p <= rightBoundary; p++) {
      if (p > 1 && p < validTotalPages) {
        pages.push(p);
      }
    }

    if (rightBoundary < validTotalPages - 1) {
      pages.push('ellipsis-right');
    }

    pages.push(validTotalPages);
    return pages;
  };

  const handlePrev = () => {
    if (validCurrentPage > 1 && !isLoading) {
      onPageChange(validCurrentPage - 1);
    }
  };

  const handleNext = () => {
    if (validCurrentPage < validTotalPages && !isLoading) {
      onPageChange(validCurrentPage + 1);
    }
  };

  const handleFirst = () => {
    if (validCurrentPage > 1 && !isLoading) {
      onPageChange(1);
    }
  };

  const handleLast = () => {
    if (validCurrentPage < validTotalPages && !isLoading) {
      onPageChange(validTotalPages);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: themeColors.backgroundElement,
          borderColor: themeColors.border,
        },
        style,
      ]}
    >
      {/* Información del total de registros */}
      <View style={styles.infoContainer}>
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={themeColors.accent} />
            <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
              Cargando...
            </Text>
          </View>
        ) : (
          <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
            {totalItems === 0
              ? 'Sin registros'
              : `Mostrando ${startItem} - ${endItem} de ${totalItems.toLocaleString('es-MX')}`}
          </Text>
        )}
      </View>

      {/* Controles centrales de página */}
      <View style={styles.controlsContainer}>
        {/* Ir a la primera página */}
        {!isCompact && (
          <TouchableOpacity
            onPress={handleFirst}
            disabled={validCurrentPage <= 1 || isLoading}
            style={[
              styles.navButton,
              {
                borderColor: themeColors.border,
                opacity: validCurrentPage <= 1 || isLoading ? 0.35 : 1,
              },
            ]}
          >
            <Ionicons name="play-back" size={14} color={themeColors.text} />
          </TouchableOpacity>
        )}

        {/* Anterior */}
        <TouchableOpacity
          onPress={handlePrev}
          disabled={validCurrentPage <= 1 || isLoading}
          style={[
            styles.navButton,
            {
              borderColor: themeColors.border,
              opacity: validCurrentPage <= 1 || isLoading ? 0.35 : 1,
            },
          ]}
        >
          <Ionicons name="chevron-back" size={16} color={themeColors.text} />
        </TouchableOpacity>

        {/* En móvil: Texto simple de página */}
        {isCompact ? (
          <View style={styles.compactPageBadge}>
            <Text style={[styles.compactPageText, { color: themeColors.text }]}>
              Pág. {validCurrentPage} / {validTotalPages}
            </Text>
          </View>
        ) : (
          /* En desktop: Botones individuales de números */
          <View style={styles.pageNumbersRow}>
            {getPageNumbers().map((item, idx) => {
              if (item === 'ellipsis-left' || item === 'ellipsis-right') {
                return (
                  <View key={`ellipsis-${idx}`} style={styles.ellipsisBox}>
                    <Text style={{ color: themeColors.textSecondary, fontWeight: '700' }}>
                      …
                    </Text>
                  </View>
                );
              }

              const isCurrent = item === validCurrentPage;
              return (
                <TouchableOpacity
                  key={`page-${item}`}
                  onPress={() => !isLoading && onPageChange(item)}
                  disabled={isLoading}
                  style={[
                    styles.pageButton,
                    {
                      borderColor: isCurrent ? themeColors.accent : themeColors.border,
                      backgroundColor: isCurrent ? themeColors.accent : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.pageButtonText,
                      {
                        color: isCurrent ? '#ffffff' : themeColors.text,
                        fontWeight: isCurrent ? '700' : '500',
                      },
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Siguiente */}
        <TouchableOpacity
          onPress={handleNext}
          disabled={validCurrentPage >= validTotalPages || isLoading}
          style={[
            styles.navButton,
            {
              borderColor: themeColors.border,
              opacity: validCurrentPage >= validTotalPages || isLoading ? 0.35 : 1,
            },
          ]}
        >
          <Ionicons name="chevron-forward" size={16} color={themeColors.text} />
        </TouchableOpacity>

        {/* Ir a la última página */}
        {!isCompact && (
          <TouchableOpacity
            onPress={handleLast}
            disabled={validCurrentPage >= validTotalPages || isLoading}
            style={[
              styles.navButton,
              {
                borderColor: themeColors.border,
                opacity: validCurrentPage >= validTotalPages || isLoading ? 0.35 : 1,
              },
            ]}
          >
            <Ionicons name="play-forward" size={14} color={themeColors.text} />
          </TouchableOpacity>
        )}
      </View>

      {/* Selector de tamaño de página (opcional) */}
      {onItemsPerPageChange && (
        <View style={styles.pageSizeContainer}>
          <Text style={[styles.pageSizeLabel, { color: themeColors.textSecondary }]}>
            Por pág:
          </Text>
          <View style={styles.pageSizeRow}>
            {itemsPerPageOptions.map((opt) => {
              const isSelected = opt === itemsPerPage;
              return (
                <TouchableOpacity
                  key={`opt-${opt}`}
                  onPress={() => !isLoading && onItemsPerPageChange(opt)}
                  disabled={isLoading}
                  style={[
                    styles.pageSizeButton,
                    {
                      borderColor: isSelected ? themeColors.accent : themeColors.border,
                      backgroundColor: isSelected
                        ? themeColors.accent + '20'
                        : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.pageSizeButtonText,
                      {
                        color: isSelected ? themeColors.accent : themeColors.textSecondary,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  infoContainer: {
    minWidth: 160,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  infoText: {
    fontSize: 13,
    fontWeight: '500',
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactPageBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
    borderRadius: BorderRadius.small,
  },
  compactPageText: {
    fontSize: 13,
    fontWeight: '600',
  },
  pageNumbersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageButton: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageButtonText: {
    fontSize: 13,
  },
  ellipsisBox: {
    width: 24,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageSizeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pageSizeLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  pageSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageSizeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
  },
  pageSizeButtonText: {
    fontSize: 12,
  },
});
