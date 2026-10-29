import { useState, useEffect, useMemo, useCallback } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { EvidenceReportGenerator } from '@/utils/evidenceReportGenerator';
import { logger } from '@/utils/logger';
import { evidenciasApi } from '../api/evidenciasApi';
import { EvidenciaItem } from '../types';

interface UseEvidenciasListProps {
  isAdmin?: boolean;
}

export function useEvidenciasList({ isAdmin = false }: UseEvidenciasListProps = {}) {
  const { company } = useAuth();

  const [evidencias, setEvidencias] = useState<EvidenciaItem[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modal de Detalles
  const [selectedEvidencia, setSelectedEvidencia] = useState<EvidenciaItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Modal visor de imagen
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      if (isAdmin) {
        const res = await evidenciasApi.getAdminEvidencias();
        setEvidencias(res.evidencias || []);
        setEmployees(res.employees || []);
      } else {
        const list = await evidenciasApi.getMisEvidencias();
        setEvidencias(list || []);
      }
    } catch (error: any) {
      logger.error('Error fetching evidencias list', error);
      Alert.alert('Error', error.message || 'No se pudieron cargar las evidencias.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData, company]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData(true);
  };

  // Filtrado
  const filteredEvidencias = useMemo(() => {
    return evidencias.filter((ev) => {
      if (selectedEmployeeId && (ev.creado_por || ev.usuario?.id) !== selectedEmployeeId) {
        return false;
      }
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const clienteMatch = ev.cliente?.toLowerCase().includes(q);
        const empleadoMatch =
          ev.creado_por_nombre?.toLowerCase().includes(q) ||
          ev.usuario?.nombre?.toLowerCase().includes(q);
        const fechaMatch = (ev.fecha || ev.created_at || '').includes(q);
        return clienteMatch || empleadoMatch || fechaMatch;
      }
      return true;
    });
  }, [evidencias, selectedEmployeeId, searchQuery]);

  // Paginación
  const totalPages = Math.ceil(filteredEvidencias.length / pageSize) || 1;
  const paginatedEvidencias = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEvidencias.slice(start, start + pageSize);
  }, [filteredEvidencias, currentPage, pageSize]);

  // Abrir detalle
  const handleOpenDetail = (ev: EvidenciaItem) => {
    setSelectedEvidencia(ev);
    setModalVisible(true);
  };

  const handleCloseDetail = () => {
    setModalVisible(false);
    setSelectedEvidencia(null);
  };

  // Exportar PDF
  const handleExportPDF = async (evidencia: EvidenciaItem) => {
    try {
      setIsExporting(true);
      let parsedTrabajos: any[] = [];
      try {
        if (typeof evidencia.descripcion_trabajo === 'string') {
          parsedTrabajos = JSON.parse(evidencia.descripcion_trabajo);
        } else if (Array.isArray(evidencia.descripcion_trabajo)) {
          parsedTrabajos = evidencia.descripcion_trabajo;
        }
      } catch {
        parsedTrabajos = [{ descripcion: String(evidencia.descripcion_trabajo || '') }];
      }

      let parsedColabs: any[] = [];
      try {
        if (typeof evidencia.colaboradores === 'string') {
          parsedColabs = JSON.parse(evidencia.colaboradores);
        } else if (Array.isArray(evidencia.colaboradores)) {
          parsedColabs = evidencia.colaboradores;
        }
      } catch {}

      const evData = {
        empleado_id: evidencia.creado_por || evidencia.usuario?.id || '',
        cliente: evidencia.cliente,
        descripcion_trabajo: parsedTrabajos,
        materiales_usados: evidencia.materiales_usados,
        observaciones: evidencia.observaciones,
        foto_antes_url: evidencia.foto_antes_url,
        foto_despues_url: evidencia.foto_despues_url,
        fotos_adicionales_urls: evidencia.fotos_adicionales_urls,
        created_at: evidencia.created_at || evidencia.fecha || new Date().toISOString(),
        colaboradores: parsedColabs,
        empresa: company,
      };

      const techName =
        evidencia.creado_por_nombre ||
        evidencia.usuario?.nombre ||
        'Técnico Autorizado';

      await EvidenceReportGenerator.exportToPDF(evData as any, techName);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo generar el reporte PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenPhoto = (url?: string | null) => {
    if (url) {
      setSelectedPhoto(url);
      setViewerVisible(true);
    }
  };

  const handleClosePhoto = () => {
    setViewerVisible(false);
    setSelectedPhoto(null);
  };

  return {
    evidencias: filteredEvidencias,
    paginatedEvidencias,
    employees,
    selectedEmployeeId,
    setSelectedEmployeeId,
    searchQuery,
    setSearchQuery,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalCount: filteredEvidencias.length,
    isLoading,
    isRefreshing,
    handleRefresh,
    selectedEvidencia,
    modalVisible,
    handleOpenDetail,
    handleCloseDetail,
    isExporting,
    handleExportPDF,
    selectedPhoto,
    viewerVisible,
    handleOpenPhoto,
    handleClosePhoto,
  };
}
