import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert, Platform, Keyboard, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAuth } from '@/context/AuthContext';
import { AuthService, Usuario, supabase } from '@/services/supabase';
import { optimizeImage } from '@/utils/imageOptimizer';
import { EvidenceReportGenerator } from '@/utils/evidenceReportGenerator';
import { EvidenceDraftService, EvidenceDraft } from '@/services/evidenceDraftService';
import { evidenciasApi } from '../api/evidenciasApi';
import { useEvidenceDrafts } from './useEvidenceDrafts';
import {
  TrabajoRealizado,
  ColaboradorItem,
  MaterialUsadoItem,
  PhotoAsset,
  EvidenciaPayload,
} from '../types';
import { ProductoInventario } from '@/components/MaterialesSelector';

interface UseEvidenciaFormProps {
  isEditing?: boolean;
  evidenceId?: string;
  initialDraftId?: string;
}

export function useEvidenciaForm({
  isEditing = false,
  evidenceId,
  initialDraftId,
}: UseEvidenciaFormProps = {}) {
  const router = useRouter();
  const { company, changeCompany } = useAuth();

  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const originalEvidenceUsageRef = useRef<Record<string, number>>({});

  // Validación y scroll a error
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const mainScrollRef = useRef<ScrollView>(null);
  const fieldPositions = useRef<Record<string, number>>({});
  const stepContainerY = useRef<number>(0);

  // Progreso / Ruedita de carga
  const [loadingModalVisible, setLoadingModalVisible] = useState(false);
  const [loadingTitle, setLoadingTitle] = useState('Procesando imágenes');
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingCurrent, setLoadingCurrent] = useState(0);
  const [loadingTotal, setLoadingTotal] = useState(0);

  // Catálogos
  const [clientes, setClientes] = useState<any[]>([]);
  const [sucursalesCliente, setSucursalesCliente] = useState<any[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<string>('');
  const [clienteSearch, setClienteSearch] = useState('');
  const [showCliDropdown, setShowCliDropdown] = useState(false);

  const [selectedSucursal, setSelectedSucursal] = useState<string>('');
  const [sucursalSearch, setSucursalSearch] = useState('');
  const [showSucursalDropdown, setShowSucursalDropdown] = useState(false);

  // Colaboradores e Inventario
  const [empleadosDisponibles, setEmpleadosDisponibles] = useState<any[]>([]);
  const [selectedColaboradores, setSelectedColaboradores] = useState<ColaboradorItem[]>([]);
  const [showColaboradorModal, setShowColaboradorModal] = useState(false);
  const [colaboradorSearch, setColaboradorSearch] = useState('');
  const [miInventarioRaw, setMiInventarioRaw] = useState<any[]>([]);
  const [productos, setProductos] = useState<ProductoInventario[]>([]);

  // Trabajos
  const generateTrabajoId = () => 'job_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
  const [trabajos, setTrabajos] = useState<TrabajoRealizado[]>([
    {
      id: 'job_init_0',
      descripcion: '',
      usa_materiales: false,
      materiales: '',
      materiales_usados: [],
      solucion: '',
      fotosAdicionales: [],
      ia_desc_run: false,
      ia_sol_run: false,
    },
  ]);

  // Procesamiento inline de foto y visor
  const [processingPhotoTarget, setProcessingPhotoTarget] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);

  // Hook de borradores
  const {
    draftsList,
    activeDraftId,
    setActiveDraftId,
    lastSavedAt,
    setLastSavedAt,
    draftsModalVisible,
    openDraftsModal,
    closeDraftsModal,
    pendingDraftPrompt,
    setPendingDraftPrompt,
    dismissPrompt,
    isSavingDraft,
    refreshDrafts,
    saveDraft: executeSaveDraft,
    deleteDraft: executeDeleteDraft,
  } = useEvidenceDrafts();

  // Scroll a primer error
  const scrollToFirstError = (errors: Record<string, string>) => {
    let targetKey: string | null = null;
    if (errors['cliente']) {
      targetKey = 'cliente';
    } else if (errors['sucursal']) {
      targetKey = 'sucursal';
    } else {
      for (let i = 0; i < trabajos.length; i++) {
        if (errors[`desc_${i}`] || errors[`sol_${i}`]) {
          targetKey = `trabajo_${i}`;
          break;
        }
      }
    }

    if (targetKey && fieldPositions.current[targetKey] !== undefined) {
      Keyboard.dismiss();
      const targetY = stepContainerY.current + fieldPositions.current[targetKey];
      mainScrollRef.current?.scrollTo({
        y: Math.max(0, targetY - 20),
        animated: true,
      });
    }
  };

  // Visor de foto
  const handleOpenPhoto = (uri: string | null) => {
    if (uri) {
      setSelectedPhoto(uri);
      setViewerVisible(true);
    }
  };

  const handleClosePhoto = () => {
    setViewerVisible(false);
    setSelectedPhoto(null);
  };

  // Sincronizar y combinar inventario (con restitución de stock si se está editando esta evidencia)
  const syncCombinedProductos = useCallback(
    async (
      miInv: any[],
      colabs: ColaboradorItem[],
      userObj: Usuario | null,
      initialUsage: Record<string, number> = originalEvidenceUsageRef.current
    ) => {
      const miProductos: ProductoInventario[] = (miInv || []).map((item: any) => {
        const empKey = userObj?.id || 'propio';
        const key = `${empKey}___${item.producto_id}`;
        const restoredQty = isEditing ? (initialUsage[key] || 0) : 0;
        const totalStock = Math.max(0, Math.round(((Number(item.cantidad_disponible) || 0) + restoredQty) * 100) / 100);

        return {
          id: item.producto_id,
          sku_interno: item.productos?.sku_interno || '',
          nombre_oficial: item.productos?.nombre_oficial || '',
          stock_actual: totalStock,
          unidad: item.productos?.unidad || 'pza',
          empleadoId: userObj?.id,
          empleadoNombre: 'Mi Inventario',
          esMio: true,
        };
      });

      if (!colabs || colabs.length === 0) {
        setProductos(miProductos);
        return;
      }

      try {
        const colabIds = colabs.map((c) => c.id).filter(Boolean);
        const colabInventarioData = await evidenciasApi.getInventarioColaboradores(colabIds);

        const colabProductos: ProductoInventario[] = colabInventarioData.map((item: any) => {
          const empName = colabs.find((c) => c.id === item.empleado_id)?.nombre || 'Colaborador';
          const prodObj = item.productos || miProductos.find((p) => p.id === item.producto_id);
          const empKey = item.empleado_id;
          const key = `${empKey}___${item.producto_id}`;
          const restoredQty = isEditing ? (initialUsage[key] || 0) : 0;
          const totalStock = Math.max(0, Math.round(((Number(item.cantidad_disponible) || 0) + restoredQty) * 100) / 100);

          return {
            id: item.producto_id || prodObj?.id || item.id,
            sku_interno: prodObj?.sku_interno || item.sku_interno || 'N/A',
            nombre_oficial: prodObj?.nombre_oficial || item.nombre_oficial || 'Material de Cuadrilla',
            stock_actual: totalStock,
            unidad: prodObj?.unidad || item.unidad || 'pza',
            empleadoId: item.empleado_id,
            empleadoNombre: empName,
            esMio: false,
          };
        });

        setProductos([...miProductos, ...colabProductos]);
      } catch (err) {
        console.warn('Error syncing combined inventario:', err);
        setProductos(miProductos);
      }
    },
    [isEditing]
  );

  useEffect(() => {
    if (currentUser) {
      syncCombinedProductos(miInventarioRaw, selectedColaboradores, currentUser);
    }
  }, [selectedColaboradores, miInventarioRaw, company, currentUser, syncCombinedProductos]);

  // Stock restante disponible por trabajo
  const getProductosDisponiblesParaTrabajo = (trabajoIndex: number): ProductoInventario[] => {
    const usedByOtherTrabajos = new Map<string, number>();

    trabajos.forEach((t, tIdx) => {
      if (tIdx !== trabajoIndex && t.usa_materiales && Array.isArray(t.materiales_usados)) {
        t.materiales_usados.forEach((m) => {
          const empKey = m.empleadoId || currentUser?.id || 'propio';
          const key = `${empKey}___${m.productoId}`;
          usedByOtherTrabajos.set(key, (usedByOtherTrabajos.get(key) || 0) + (Number(m.usado) || 0));
        });
      }
    });

    return productos.map((p) => {
      const empKey = p.empleadoId || currentUser?.id || 'propio';
      const key = `${empKey}___${p.id}`;
      const usedElsewhere = usedByOtherTrabajos.get(key) || 0;
      const originalStock = Number(p.stock_actual) || 0;
      const remainingStock = Math.max(0, Math.round((originalStock - usedElsewhere) * 100) / 100);

      return {
        ...p,
        stock_actual: remainingStock,
      };
    });
  };

  // Carga de catálogos
  const loadCatalogos = async (userId?: string) => {
    try {
      const data = await evidenciasApi.getCatalogos();
      setClientes(data.clientes);
      setSucursalesCliente(data.sucursales);
      setEmpleadosDisponibles(data.empleados);

      if (data.inventario) {
        setMiInventarioRaw(data.inventario);
        const formattedProductos: ProductoInventario[] = data.inventario.map((item: any) => ({
          id: item.producto_id,
          sku_interno: item.productos?.sku_interno || '',
          nombre_oficial: item.productos?.nombre_oficial || '',
          stock_actual: Number(item.cantidad_disponible) || 0,
          unidad: item.productos?.unidad || 'pza',
          empleadoId: userId,
          empleadoNombre: 'Mi Inventario',
          esMio: true,
        }));
        setProductos(formattedProductos);
      }
      return data;
    } catch (err) {
      console.error('Error loading catalogs:', err);
      return null;
    }
  };

  // Inicialización
  useEffect(() => {
    const init = async () => {
      const user = await AuthService.getCurrentUser();
      if (!user) {
        router.replace('/');
        return;
      }
      setCurrentUser(user);
      const cats = await loadCatalogos(user.id);
      const drafts = await refreshDrafts(user.id, company || 'inttec');

      // Si estamos en modo edición con ID de evidencia existente
      if (isEditing && evidenceId) {
        try {
          const ev = await evidenciasApi.getAdminEvidenciaById(evidenceId);
          if (ev) {
            if (ev.cliente) {
              const evCli = ev.cliente.toLowerCase().trim();
              const cli = cats?.clientes?.find((c: any) =>
                evCli.includes(String(c.nombre).toLowerCase().trim())
              );
              if (cli) {
                setSelectedCliente(cli.id);
                const remaining = evCli
                  .replace(String(cli.nombre).toLowerCase().trim(), '')
                  .replace(/[^a-z0-9áéíóúüñ ]/g, '')
                  .trim();
                if (remaining) {
                  const suc = cats?.sucursales?.find(
                    (s: any) =>
                      s.cliente_id === cli.id &&
                      remaining.includes(String(s.nombre).toLowerCase().trim())
                  );
                  if (suc) setSelectedSucursal(suc.id);
                }
              } else {
                setClienteSearch(ev.cliente);
              }
            }

            let loadedTrabajos: TrabajoRealizado[] = [];
            if (ev.descripcion_trabajo) {
              try {
                const parsedTrabajos = Array.isArray(ev.descripcion_trabajo)
                  ? ev.descripcion_trabajo
                  : typeof ev.descripcion_trabajo === 'string'
                  ? JSON.parse(ev.descripcion_trabajo)
                  : [ev.descripcion_trabajo];

                if (Array.isArray(parsedTrabajos) && parsedTrabajos.length > 0) {
                  loadedTrabajos = parsedTrabajos.map((t: any, idx: number) => ({
                    id: t.id || `job_edit_${idx}`,
                    descripcion: t.descripcion || '',
                    materiales: t.materiales || '',
                    materiales_usados: t.materiales_usados || [],
                    solucion: t.solucion || '',
                    antesImg: t.antesImg ? { uri: t.antesImg, base64: null } : undefined,
                    despuesImg: t.despuesImg ? { uri: t.despuesImg, base64: null } : undefined,
                    fotosAdicionales: Array.isArray(t.fotosAdicionales)
                      ? t.fotosAdicionales.map((f: any) =>
                          typeof f === 'string' ? { uri: f, base64: null } : f
                        )
                      : [],
                    usa_materiales:
                      t.usa_materiales ??
                      Boolean(
                        (t.materiales_usados && t.materiales_usados.length > 0) ||
                          (t.materiales && t.materiales.trim().length > 0)
                      ),
                    ia_desc_run: true,
                    ia_sol_run: true,
                  }));
                  setTrabajos(loadedTrabajos);
                }
              } catch (e) {
                console.warn('Error parsing descripcion_trabajo:', e);
              }
            }

            let restoredColabs: ColaboradorItem[] = [];
            if (ev.colaboradores) {
              try {
                const parsedColabs = typeof ev.colaboradores === 'string'
                  ? JSON.parse(ev.colaboradores)
                  : ev.colaboradores;
                if (Array.isArray(parsedColabs)) {
                  restoredColabs = parsedColabs;
                }
              } catch (e) {
                console.warn('Error parsing colaboradores in useEvidenciaForm:', e);
              }
            }

            // Fallback inteligente: si ev.colaboradores venía vacío,
            // deducir la cuadrilla a partir de los materiales usados pertenecientes a otros colaboradores
            if (restoredColabs.length === 0 && ev.descripcion_trabajo) {
              try {
                const parsedTrab = Array.isArray(ev.descripcion_trabajo)
                  ? ev.descripcion_trabajo
                  : typeof ev.descripcion_trabajo === 'string'
                  ? JSON.parse(ev.descripcion_trabajo)
                  : [];
                const seenEmpIds = new Set<string>();
                parsedTrab.forEach((t: any) => {
                  (t.materiales_usados || []).forEach((m: any) => {
                    if (m.empleadoId && m.empleadoId !== user.id && !seenEmpIds.has(m.empleadoId)) {
                      seenEmpIds.add(m.empleadoId);
                      restoredColabs.push({
                        id: m.empleadoId,
                        nombre: m.empleadoNombre || 'Colaborador',
                      });
                    }
                  });
                });
              } catch {}
            }

            // Calcular el stock original usado en este reporte para sumarlo temporalmente al disponible
            const initialUsage: Record<string, number> = {};
            if (Array.isArray(loadedTrabajos)) {
              loadedTrabajos.forEach((t) => {
                (t.materiales_usados || []).forEach((m) => {
                  if (Number(m.usado) > 0) {
                    const empKey = m.empleadoId || user.id;
                    const key = `${empKey}___${m.productoId}`;
                    initialUsage[key] = (initialUsage[key] || 0) + (Number(m.usado) || 0);
                  }
                });
              });
            }
            originalEvidenceUsageRef.current = initialUsage;

            // Recalcular stock de referencia y sobrante en cada material cargado
            if (Array.isArray(loadedTrabajos)) {
              loadedTrabajos.forEach((t) => {
                if (Array.isArray(t.materiales_usados)) {
                  t.materiales_usados.forEach((m) => {
                    const empKey = m.empleadoId || user.id;
                    const key = `${empKey}___${m.productoId}`;
                    const matchingMi = cats?.inventario?.find(
                      (i: any) => i.producto_id === m.productoId && (!m.empleadoId || m.empleadoId === user.id)
                    );
                    const currentDbStock = Number(matchingMi?.cantidad_disponible) || 0;
                    const totalAvailable = currentDbStock + (initialUsage[key] || Number(m.usado) || 0);
                    m.retirado = Math.max(Number(m.retirado) || 0, totalAvailable);
                    m.sobrante = Math.max(0, Math.round((m.retirado - Number(m.usado)) * 100) / 100);
                  });
                }
              });
              setTrabajos([...loadedTrabajos]);
            }

            if (restoredColabs.length > 0) {
              setSelectedColaboradores(restoredColabs);
            }
            syncCombinedProductos(cats?.inventario || miInventarioRaw, restoredColabs, user, initialUsage);
          }
        } catch (evErr: any) {
          Alert.alert('Error', evErr.message || 'No se pudo cargar la evidencia.');
        }
        return;
      }

      // Si viene un borrador por URL
      if (initialDraftId) {
        const targetDraft = drafts.find((d) => d.id === initialDraftId);
        if (targetDraft) {
          handleLoadDraft(targetDraft, false);
          return;
        }
      }

      // Sugerir borrador más reciente si no es edición
      if (!isEditing && drafts.length > 0) {
        setPendingDraftPrompt(drafts[0]);
      }
    };

    init();
  }, [router, company, isEditing, evidenceId, initialDraftId]);

  // Referencia actualizada para autoguardado
  const formDataRef = useRef({
    currentUser,
    company,
    selectedCliente,
    clientes,
    selectedSucursal,
    sucursalesCliente,
    selectedColaboradores,
    currentStep,
    trabajos,
    activeDraftId,
    isSubmitting,
    isSavingDraft,
  });

  useEffect(() => {
    formDataRef.current = {
      currentUser,
      company,
      selectedCliente,
      clientes,
      selectedSucursal,
      sucursalesCliente,
      selectedColaboradores,
      currentStep,
      trabajos,
      activeDraftId,
      isSubmitting,
      isSavingDraft,
    };
  }, [
    currentUser,
    company,
    selectedCliente,
    clientes,
    selectedSucursal,
    sucursalesCliente,
    selectedColaboradores,
    currentStep,
    trabajos,
    activeDraftId,
    isSubmitting,
    isSavingDraft,
  ]);

  // Autoguardado silencioso cada 60s (solo cuando no es edición directa de DB)
  useEffect(() => {
    if (isEditing) return;

    const interval = setInterval(async () => {
      const state = formDataRef.current;
      if (!state.currentUser || state.isSubmitting || state.isSavingDraft) return;

      const hasContent = Boolean(
        state.selectedCliente ||
          state.trabajos.some(
            (t) =>
              t.descripcion?.trim() ||
              t.solucion?.trim() ||
              t.materiales?.trim() ||
              t.antesImg?.uri ||
              t.despuesImg?.uri ||
              (t.fotosAdicionales && t.fotosAdicionales.length > 0)
          )
      );

      if (!hasContent) return;

      try {
        const clienteObj = state.clientes.find((c) => c.id === state.selectedCliente);
        const sucObj = state.sucursalesCliente.find((s) => s.id === state.selectedSucursal);

        await executeSaveDraft(
          {
            userId: state.currentUser.id,
            company: state.company || 'inttec',
            activeDraftId: state.activeDraftId,
            selectedCliente: state.selectedCliente,
            clienteNombre: clienteObj ? clienteObj.nombre : '',
            selectedSucursal: state.selectedSucursal,
            sucursalNombre: sucObj ? sucObj.nombre : '',
            colaboradores: state.selectedColaboradores,
            currentStep: state.currentStep,
            trabajos: state.trabajos,
          },
          true
        );
      } catch (err) {
        console.warn('[Autosave] Error en autoguardado:', err);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [isEditing, executeSaveDraft]);

  // Guardar y cargar borrador manual
  const handleSaveDraft = async (silent = false) => {
    if (!currentUser) return;
    const clienteObj = clientes.find((c) => c.id === selectedCliente);
    const sucObj = sucursalesCliente.find((s) => s.id === selectedSucursal);

    return await executeSaveDraft(
      {
        userId: currentUser.id,
        company: company || 'inttec',
        activeDraftId,
        selectedCliente,
        clienteNombre: clienteObj ? clienteObj.nombre : '',
        selectedSucursal,
        sucursalNombre: sucObj ? sucObj.nombre : '',
        colaboradores: selectedColaboradores,
        currentStep,
        trabajos,
      },
      silent
    );
  };

  const handleLoadDraft = (draft: EvidenceDraft, notify = true) => {
    setSelectedCliente(draft.selectedCliente || '');
    const cli = clientes.find((c) => c.id === draft.selectedCliente);
    setClienteSearch(cli ? cli.nombre : draft.clienteNombre || '');

    setSelectedSucursal(draft.selectedSucursal || '');
    const suc = sucursalesCliente.find((s) => s.id === draft.selectedSucursal);
    setSucursalSearch(suc ? suc.nombre : draft.sucursalNombre || '');

    if (draft.colaboradores) {
      setSelectedColaboradores(draft.colaboradores);
    }
    if (draft.trabajos && draft.trabajos.length > 0) {
      setTrabajos(
        draft.trabajos.map((t, idx) => ({
          ...t,
          id: (t as any).id || `job_draft_${idx}`,
          fotosAdicionales: t.fotosAdicionales || [],
          ia_desc_run: true,
          ia_sol_run: true,
        }))
      );
    }
    setCurrentStep(draft.currentStep || 1);
    setActiveDraftId(draft.id);
    dismissPrompt();
    closeDraftsModal();

    const timeStr = new Date(draft.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setLastSavedAt(timeStr);

    if (notify) {
      Alert.alert('Borrador Cargado', `Se restauró el borrador de "${draft.clienteNombre || 'Cliente'}" exitosamente.`);
    }
  };

  const handleDeleteDraft = async (draftId: string) => {
    if (!currentUser) return;
    await executeDeleteDraft(currentUser.id, company || 'inttec', draftId);
  };

  const handleStartNewDraft = () => {
    const doReset = () => {
      setSelectedCliente('');
      setClienteSearch('');
      setSelectedSucursal('');
      setSucursalSearch('');
      setSelectedColaboradores([]);
      setTrabajos([
        {
          id: generateTrabajoId(),
          descripcion: '',
          usa_materiales: false,
          materiales: '',
          materiales_usados: [],
          solucion: '',
          fotosAdicionales: [],
          ia_desc_run: false,
          ia_sol_run: false,
        },
      ]);
      setCurrentStep(1);
      setActiveDraftId(null);
      setLastSavedAt(null);
      dismissPrompt();
      closeDraftsModal();
    };

    if (Platform.OS === 'web') {
      if (window.confirm('¿Deseas iniciar una nueva evidencia en blanco?')) doReset();
    } else {
      Alert.alert('Nueva Evidencia', '¿Deseas iniciar una nueva evidencia en blanco?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Nueva', style: 'destructive', onPress: doReset },
      ]);
    }
  };

  // Manejo de Colaboradores
  const handleAddColaborador = async (emp: any) => {
    if (selectedColaboradores.some((c) => c.id === emp.id)) return;
    const newColabs = [...selectedColaboradores, { id: emp.id, nombre: emp.nombre, email: emp.email }];
    setSelectedColaboradores(newColabs);
    setShowColaboradorModal(false);
    setColaboradorSearch('');
    await syncCombinedProductos(miInventarioRaw, newColabs, currentUser);
  };

  const handleRemoveColaborador = async (empId: string, empNombre: string) => {
    const doRemove = async () => {
      const newColabs = selectedColaboradores.filter((c) => c.id !== empId);
      setSelectedColaboradores(newColabs);

      setTrabajos((prev) =>
        prev.map((t) => {
          const filteredMat = (t.materiales_usados || []).filter((m) => m.empleadoId !== empId);
          const textoMateriales = filteredMat.map((m) => `৹ ${m.usado}x ${m.nombre} (${m.unidad || 'pza'})`).join('\n');
          return {
            ...t,
            materiales_usados: filteredMat,
            materiales: textoMateriales,
            usa_materiales: filteredMat.length > 0 ? t.usa_materiales : false,
          };
        })
      );

      await syncCombinedProductos(miInventarioRaw, newColabs, currentUser);
    };

    const hasUsedMat = trabajos.some((t) => (t.materiales_usados || []).some((m) => m.empleadoId === empId));
    if (hasUsedMat) {
      if (Platform.OS === 'web') {
        if (window.confirm(`Al remover a ${empNombre}, se quitarán de la lista los materiales asignados a su inventario. ¿Continuar?`)) {
          await doRemove();
        }
      } else {
        Alert.alert(
          'Remover Colaborador',
          `Al remover a ${empNombre}, se quitarán de este reporte los materiales tomados de su inventario. ¿Deseas continuar?`,
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Remover', style: 'destructive', onPress: doRemove },
          ]
        );
      }
    } else {
      await doRemove();
    }
  };

  // Manejo de Trabajos
  const handleAddTrabajo = () => {
    setTrabajos((prev) => [
      ...prev,
      {
        id: generateTrabajoId(),
        descripcion: '',
        usa_materiales: false,
        materiales: '',
        materiales_usados: [],
        solucion: '',
        fotosAdicionales: [],
        ia_desc_run: false,
        ia_sol_run: false,
      },
    ]);
  };

  const handleRemoveTrabajo = (index: number) => {
    if (trabajos.length <= 1) {
      Alert.alert('Aviso', 'Debe haber al menos un trabajo en la evidencia.');
      return;
    }
    setTrabajos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCloneTrabajo = (index: number) => {
    const item = trabajos[index];
    if (!item) return;
    setTrabajos((prev) => [
      ...prev,
      {
        ...item,
        id: generateTrabajoId(),
        antesImg: item.antesImg ? { ...item.antesImg } : undefined,
        despuesImg: item.despuesImg ? { ...item.despuesImg } : undefined,
        fotosAdicionales: item.fotosAdicionales ? [...item.fotosAdicionales] : [],
      },
    ]);
  };

  const handleUpdateTrabajoField = (index: number, field: keyof TrabajoRealizado, value: any) => {
    setTrabajos((prev) =>
      prev.map((t, i) => {
        if (i === index) {
          return { ...t, [field]: value };
        }
        return t;
      })
    );
  };

  const handleUpdateMaterialesUsados = (index: number, mats: MaterialUsadoItem[]) => {
    const texto = mats.map((m) => `৹ ${m.usado}x ${m.nombre} (${m.unidad || 'pza'})`).join('\n');
    setTrabajos((prev) =>
      prev.map((t, i) => {
        if (i === index) {
          return {
            ...t,
            materiales_usados: mats,
            materiales: texto,
            usa_materiales: mats.length > 0 ? true : t.usa_materiales,
          };
        }
        return t;
      })
    );
  };

  // Mejora con IA
  const handleMejorarRedaccion = async (texto: string, field: 'descripcion' | 'solucion', index: number) => {
    if (!texto || texto.trim().length === 0) {
      Alert.alert('Aviso', 'No hay texto para mejorar.');
      return;
    }
    setLoadingTitle('Mejorando redacción con IA ✨');
    setLoadingMessage('Por favor espera un momento...');
    setLoadingModalVisible(true);

    try {
      const mejorado = await evidenciasApi.mejorarRedaccionIA(
        texto,
        field === 'descripcion' ? 'situacion' : 'solucion'
      );
      setTrabajos((prev) =>
        prev.map((t, i) => (i === index ? { ...t, [field]: mejorado } : t))
      );
    } catch (error: any) {
      Alert.alert('Error IA', error.message || 'No se pudo conectar con la IA');
    } finally {
      setLoadingModalVisible(false);
    }
  };

  // Permisos y Fotos
  const requestCameraPermission = async () => {
    if (Platform.OS === 'web') return true;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso de cámara requerido', 'Necesitamos permiso de la cámara para tomar fotografías.');
      return false;
    }
    return true;
  };

  const requestLibraryPermission = async () => {
    if (Platform.OS === 'web') return true;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso de galería requerido', 'Necesitamos permiso de galería para seleccionar imágenes.');
      return false;
    }
    return true;
  };

  const handleCapturePhoto = async (type: 'antes' | 'despues' | 'adicional', jobIndex: number) => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    const currentExtras = trabajos[jobIndex]?.fotosAdicionales || [];
    if (type === 'adicional' && currentExtras.length >= 250) {
      Alert.alert('Límite alcanzado', 'Has alcanzado el límite máximo de 250 fotos adicionales para este trabajo.');
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.6,
      });

      if (!result.canceled && result.assets?.[0]) {
        const photoUri = result.assets[0].uri;
        setProcessingPhotoTarget(`${type}_${jobIndex}`);

        try {
          const optimized = await optimizeImage(photoUri);
          if (type === 'antes') {
            setTrabajos((prev) =>
              prev.map((t, i) => (i === jobIndex ? { ...t, antesImg: { uri: optimized.uri, base64: null } } : t))
            );
          } else if (type === 'despues') {
            setTrabajos((prev) =>
              prev.map((t, i) => (i === jobIndex ? { ...t, despuesImg: { uri: optimized.uri, base64: null } } : t))
            );
          } else if (type === 'adicional') {
            setTrabajos((prev) =>
              prev.map((t, i) => {
                if (i === jobIndex) {
                  const updated = [...(t.fotosAdicionales || []), { uri: optimized.uri, base64: null }];
                  return { ...t, fotosAdicionales: updated.slice(0, 250) };
                }
                return t;
              })
            );
          }
        } finally {
          setProcessingPhotoTarget(null);
        }
      }
    } catch (err) {
      console.error('Camera capture error:', err);
      setProcessingPhotoTarget(null);
      if (Platform.OS === 'web') {
        await handleSelectGallery(type, jobIndex);
      } else {
        Alert.alert('Error', 'No se pudo abrir la cámara.');
      }
    }
  };

  const handleSelectGallery = async (type: 'antes' | 'despues' | 'adicional', jobIndex: number) => {
    const hasPermission = await requestLibraryPermission();
    if (!hasPermission) return;

    const currentExtras = trabajos[jobIndex]?.fotosAdicionales || [];
    if (type === 'adicional' && currentExtras.length >= 250) {
      Alert.alert('Límite alcanzado', 'Has alcanzado el límite máximo de 250 fotografías adicionales.');
      return;
    }

    const remainingSlots = type === 'adicional' ? Math.max(1, 250 - currentExtras.length) : 1;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: type === 'adicional',
        allowsEditing: false,
        selectionLimit: remainingSlots,
        quality: 0.6,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        if (type === 'antes' || type === 'despues') {
          setProcessingPhotoTarget(`${type}_${jobIndex}`);
          try {
            const opt = await optimizeImage(result.assets[0].uri);
            if (type === 'antes') {
              setTrabajos((prev) =>
                prev.map((t, i) => (i === jobIndex ? { ...t, antesImg: { uri: opt.uri, base64: null } } : t))
              );
            } else {
              setTrabajos((prev) =>
                prev.map((t, i) => (i === jobIndex ? { ...t, despuesImg: { uri: opt.uri, base64: null } } : t))
              );
            }
          } finally {
            setProcessingPhotoTarget(null);
          }
        } else if (type === 'adicional') {
          if (result.assets.length === 1) {
            setProcessingPhotoTarget(`adicional_${jobIndex}`);
            try {
              const opt = await optimizeImage(result.assets[0].uri);
              setTrabajos((prev) =>
                prev.map((t, i) => {
                  if (i === jobIndex) {
                    const combined = [...(t.fotosAdicionales || []), { uri: opt.uri, base64: null }];
                    return { ...t, fotosAdicionales: combined.slice(0, 250) };
                  }
                  return t;
                })
              );
            } finally {
              setProcessingPhotoTarget(null);
            }
          } else {
            const totalToProcess = result.assets.length;
            setLoadingTitle('Procesando fotografías');
            setLoadingMessage(`Optimizando 0 de ${totalToProcess} fotos...`);
            setLoadingCurrent(0);
            setLoadingTotal(totalToProcess);
            setLoadingModalVisible(true);

            const mappedPhotos: PhotoAsset[] = [];
            const BATCH_SIZE = 5;

            try {
              for (let i = 0; i < totalToProcess; i += BATCH_SIZE) {
                const chunk = result.assets.slice(i, i + BATCH_SIZE);
                const processedChunk = await Promise.all(
                  chunk.map(async (asset) => {
                    try {
                      const opt = await optimizeImage(asset.uri);
                      return { uri: opt.uri, base64: null };
                    } catch {
                      return { uri: asset.uri, base64: null };
                    }
                  })
                );
                mappedPhotos.push(...processedChunk);
                const currentDone = Math.min(i + chunk.length, totalToProcess);
                setLoadingCurrent(currentDone);
                setLoadingMessage(
                  `Optimizando ${currentDone} de ${totalToProcess} fotos (${Math.round((currentDone / totalToProcess) * 100)}%)...`
                );
              }

              setTrabajos((prev) =>
                prev.map((t, i) => {
                  if (i === jobIndex) {
                    const combined = [...(t.fotosAdicionales || []), ...mappedPhotos];
                    return { ...t, fotosAdicionales: combined.slice(0, 250) };
                  }
                  return t;
                })
              );
            } finally {
              setLoadingModalVisible(false);
            }
          }
        }
      }
    } catch (err) {
      console.error('Gallery picker error:', err);
      setProcessingPhotoTarget(null);
      setLoadingModalVisible(false);
      Alert.alert('Error', 'No se pudieron seleccionar imágenes.');
    }
  };

  const handleRemovePhoto = (type: 'antes' | 'despues' | 'adicional', jobIndex: number, photoIndex?: number) => {
    setTrabajos((prev) =>
      prev.map((t, i) => {
        if (i !== jobIndex) return t;
        if (type === 'antes') return { ...t, antesImg: undefined };
        if (type === 'despues') return { ...t, despuesImg: undefined };
        if (type === 'adicional' && photoIndex !== undefined) {
          const nextExtras = (t.fotosAdicionales || []).filter((_, idx) => idx !== photoIndex);
          return { ...t, fotosAdicionales: nextExtras };
        }
        return t;
      })
    );
  };

  // Base64 helper para fotos locales
  const getPhotoBase64 = async (photo?: PhotoAsset): Promise<string | null> => {
    if (!photo) return null;
    if (photo.base64 && typeof photo.base64 === 'string' && photo.base64.length > 0) {
      return photo.base64;
    }
    if (!photo.uri) return null;

    if (photo.uri.startsWith('data:image/')) {
      const parts = photo.uri.split('base64,');
      return parts[1] || null;
    }

    if (
      (photo.uri.startsWith('http://') || photo.uri.startsWith('https://')) &&
      !photo.uri.startsWith('blob:') &&
      !photo.uri.includes('localhost') &&
      !photo.uri.includes('127.0.0.1')
    ) {
      return null;
    }

    if (photo.uri.startsWith('blob:') || (Platform.OS === 'web' && !photo.uri.startsWith('http'))) {
      try {
        const response = await fetch(photo.uri);
        const blob = await response.blob();
        const b64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split('base64,')[1] || '');
          };
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        });
        if (b64) return b64;
      } catch (err) {
        console.warn('Error reading blob uri on web:', err);
      }
    }

    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (manipulated.base64) return manipulated.base64;
    } catch (err) {
      console.warn('Error reading photo base64 with ImageManipulator:', err);
    }

    if (Platform.OS === 'web') {
      try {
        const response = await fetch(photo.uri);
        const blob = await response.blob();
        return await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split('base64,')[1] || (null as any));
          };
          reader.onerror = () => resolve(null as any);
          reader.readAsDataURL(blob);
        });
      } catch {}
    } else {
      try {
        const { readAsStringAsync, EncodingType } = await import('expo-file-system/legacy');
        const b64 = await readAsStringAsync(photo.uri, { encoding: EncodingType.Base64 });
        if (b64) return b64;
      } catch {}
    }

    return null;
  };

  // Navegación entre pasos
  const nextStep = async () => {
    if (currentStep === 1) {
      const errors: Record<string, string> = {};
      if (!selectedCliente) {
        errors['cliente'] = 'Por favor selecciona el cliente.';
      } else {
        const clienteSucursales = sucursalesCliente.filter((s) => s.cliente_id === selectedCliente);
        if (clienteSucursales.length > 0 && !selectedSucursal) {
          errors['sucursal'] = 'Por favor selecciona la sucursal.';
        }
      }

      trabajos.forEach((t, i) => {
        if (!t.descripcion.trim()) {
          errors['desc_' + i] = 'La situación encontrada es obligatoria.';
        }
        if (!t.solucion.trim()) {
          errors['sol_' + i] = 'La solución aplicada es obligatoria.';
        }
      });

      if (Object.keys(errors).length > 0) {
        setFormErrors(errors);
        scrollToFirstError(errors);
        return;
      }

      setFormErrors({});
      setLoadingTitle('Optimizando con IA ✨');
      setLoadingMessage('Mejorando la redacción técnica de los reportes...');
      setLoadingModalVisible(true);

      try {
        const newTrabajos = await Promise.all(
          trabajos.map(async (t) => {
            let newDesc = t.descripcion;
            let newSol = t.solucion;

            if (!t.ia_desc_run && newDesc.trim().length > 0) {
              try {
                newDesc = await evidenciasApi.mejorarRedaccionIA(newDesc, 'situacion');
              } catch {}
            }

            if (!t.ia_sol_run && newSol.trim().length > 0) {
              try {
                newSol = await evidenciasApi.mejorarRedaccionIA(newSol, 'solucion');
              } catch {}
            }

            return {
              ...t,
              descripcion: newDesc,
              solucion: newSol,
              ia_desc_run: true,
              ia_sol_run: true,
            };
          })
        );

        setTrabajos(newTrabajos);
      } catch (err) {
        console.error('Error al mejorar con IA automático:', err);
      } finally {
        setLoadingModalVisible(false);
        setCurrentStep(2);
      }
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  // Exportar PDF
  const handleExportPDF = async () => {
    if (!selectedCliente) {
      Alert.alert('Aviso', 'Por favor selecciona el cliente antes de generar el reporte.');
      return;
    }

    setLoadingTitle('Generando Documento PDF');
    setLoadingMessage('Componiendo y optimizando el reporte...');
    setLoadingModalVisible(true);

    try {
      const clienteObj = clientes.find((c) => c.id === selectedCliente);
      const sucObj = sucursalesCliente.find((s) => s.id === selectedSucursal);

      const evData = {
        empleado_id: currentUser?.id || '',
        cliente: clienteObj ? clienteObj.nombre + (sucObj ? ' - ' + sucObj.nombre : '') : selectedCliente,
        descripcion_trabajo: trabajos,
        created_at: new Date().toISOString(),
        colaboradores: selectedColaboradores,
        empresa: company,
      };

      await EvidenceReportGenerator.exportToPDF(
        evData as any,
        currentUser?.nombre || 'Técnico Autorizado'
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo exportar el PDF.');
    } finally {
      setLoadingModalVisible(false);
    }
  };

  // Envío final a base de datos
  const handleSaveToDatabase = async () => {
    if (!currentUser) return;
    if (!selectedCliente) {
      Alert.alert('Validación', 'Por favor llena el nombre del cliente.');
      return;
    }
    const hasEmptyFields = trabajos.some((t) => !t.descripcion.trim() || !t.solucion.trim());
    if (hasEmptyFields) {
      Alert.alert('Validación', 'Por favor llena la situación y la solución para todos los trabajos.');
      return;
    }

    setIsSubmitting(true);

    let totalPhotosToUpload = 0;
    trabajos.forEach((t) => {
      if (t.antesImg?.uri && !t.antesImg.uri.startsWith('http')) totalPhotosToUpload++;
      if (t.despuesImg?.uri && !t.despuesImg.uri.startsWith('http')) totalPhotosToUpload++;
      (t.fotosAdicionales || []).forEach((extra) => {
        if (extra.uri && !extra.uri.startsWith('http')) totalPhotosToUpload++;
      });
    });

    setLoadingTitle('Guardando en el servidor');
    setLoadingMessage('Iniciando subida de evidencias...');
    setLoadingCurrent(0);
    setLoadingTotal(totalPhotosToUpload);
    setLoadingModalVisible(true);

    try {
      let uploadedCount = 0;

      const uploadPhoto = async (base64Data: string, prefix: string) => {
        const randId = Math.random().toString(36).substring(2, 7);
        const fileName = `${currentUser.id}/evidencia_${prefix}_${Date.now()}_${randId}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('tickets')
          .upload(fileName, base64Data, { contentType: 'image/jpeg', upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('tickets').getPublicUrl(fileName);
        uploadedCount++;
        setLoadingCurrent(uploadedCount);
        setLoadingMessage(
          `Subiendo foto ${uploadedCount} de ${totalPhotosToUpload} (${Math.round(
            (uploadedCount / Math.max(1, totalPhotosToUpload)) * 100
          )}%)...`
        );
        return urlData.publicUrl;
      };

      let fotoAntesUrl: string | null = null;
      let fotoDespuesUrl: string | null = null;
      const allFotosAdicionalesUrls: string[] = [];

      const isRemotePublicUrl = (url?: string | null) =>
        Boolean(url && (url.startsWith('http://') || url.startsWith('https://')) && !url.startsWith('blob:'));

      const trabajosPayload = [];
      for (let i = 0; i < trabajos.length; i++) {
        const t = trabajos[i];
        let antesUrl: string | null = null;
        let despuesUrl: string | null = null;

        if (isRemotePublicUrl(t.antesImg?.uri)) {
          antesUrl = t.antesImg!.uri;
          if (i === 0) fotoAntesUrl = antesUrl;
        } else if (t.antesImg?.uri) {
          const b64 = await getPhotoBase64(t.antesImg);
          if (!b64) {
            throw new Error(`La foto del "Antes" en Trabajo #${i + 1} no se pudo procesar.`);
          }
          antesUrl = await uploadPhoto(b64, `t${i}_antes`);
          if (i === 0) fotoAntesUrl = antesUrl;
        }

        if (isRemotePublicUrl(t.despuesImg?.uri)) {
          despuesUrl = t.despuesImg!.uri;
          if (i === 0) fotoDespuesUrl = despuesUrl;
        } else if (t.despuesImg?.uri) {
          const b64 = await getPhotoBase64(t.despuesImg);
          if (!b64) {
            throw new Error(`La foto del "Después" en Trabajo #${i + 1} no se pudo procesar.`);
          }
          despuesUrl = await uploadPhoto(b64, `t${i}_despues`);
          if (i === 0) fotoDespuesUrl = despuesUrl;
        }

        const jobExtrasUrls: string[] = [];
        const extras = t.fotosAdicionales || [];
        if (extras.length > 0) {
          const CONCURRENCY = 4;
          for (let j = 0; j < extras.length; j += CONCURRENCY) {
            const chunk = extras.slice(j, j + CONCURRENCY);
            const urls = await Promise.all(
              chunk.map(async (extra, chunkIdx) => {
                if (!extra?.uri) return null;
                if (isRemotePublicUrl(extra.uri)) return extra.uri;
                const b64 = await getPhotoBase64(extra);
                if (!b64) {
                  throw new Error(`Una foto adicional en Trabajo #${i + 1} (foto ${j + chunkIdx + 1}) expiró.`);
                }
                return await uploadPhoto(b64, `t${i}_extra_${j + chunkIdx}`);
              })
            );
            urls.forEach((u) => {
              if (u && isRemotePublicUrl(u)) {
                jobExtrasUrls.push(u);
                allFotosAdicionalesUrls.push(u);
              }
            });
          }
        }

        trabajosPayload.push({
          descripcion: t.descripcion.trim(),
          materiales: t.materiales.trim() || null,
          materiales_usados: t.materiales_usados || [],
          solucion: t.solucion.trim() || null,
          antesImg: antesUrl || (isRemotePublicUrl(t.antesImg?.uri) ? t.antesImg!.uri : null),
          despuesImg: despuesUrl || (isRemotePublicUrl(t.despuesImg?.uri) ? t.despuesImg!.uri : null),
          fotosAdicionales: jobExtrasUrls,
        });
      }

      setLoadingMessage('Registrando evidencia en el servidor...');

      const allMateriales = trabajos
        .map((t) => t.materiales.trim())
        .filter(Boolean)
        .join(', ');

      const allSoluciones = trabajos
        .map((t, i) => (t.solucion.trim() ? `Trabajo #${i + 1}: ${t.solucion.trim()}` : ''))
        .filter(Boolean)
        .join('\n');

      const clienteObj = clientes.find((c) => c.id === selectedCliente);
      const sucObj = sucursalesCliente.find((s) => s.id === selectedSucursal);
      const clienteStr = clienteObj ? clienteObj.nombre + (sucObj ? ' - ' + sucObj.nombre : '') : selectedCliente;

      const payload: EvidenciaPayload = {
        cliente: clienteStr,
        descripcion_trabajo: JSON.stringify(trabajosPayload),
        materiales_usados: allMateriales || null,
        observaciones: allSoluciones || null,
        foto_antes_url: fotoAntesUrl,
        foto_despues_url: fotoDespuesUrl,
        fotos_adicionales_urls: allFotosAdicionalesUrls.length > 0 ? allFotosAdicionalesUrls : null,
        colaboradores: selectedColaboradores.length > 0 ? JSON.stringify(selectedColaboradores) : null,
      };

      if (isEditing && evidenceId) {
        await evidenciasApi.updateEvidencia(evidenceId, payload);
      } else {
        await evidenciasApi.createEvidencia(payload);
      }

      setLoadingModalVisible(false);

      if (activeDraftId && currentUser) {
        await EvidenceDraftService.deleteDraft(currentUser.id, company || 'inttec', activeDraftId);
        setActiveDraftId(null);
        await refreshDrafts(currentUser.id, company || 'inttec');
      }

      Alert.alert(
        'Éxito',
        isEditing
          ? 'Evidencia actualizada correctamente.'
          : 'Evidencia y reporte guardados correctamente en el servidor.'
      );
      router.back();
    } catch (err: any) {
      console.error('Error saving evidence:', err);
      setLoadingModalVisible(false);
      Alert.alert(
        'Guardado Parcial',
        `${err.message}\n\nPuedes exportar el PDF con el botón correspondiente.`
      );
    } finally {
      setIsSubmitting(false);
      setLoadingModalVisible(false);
    }
  };

  return {
    currentUser,
    company,
    changeCompany,
    currentStep,
    nextStep,
    prevStep,
    formErrors,
    mainScrollRef,
    fieldPositions,
    stepContainerY,
    // Catálogos
    clientes,
    sucursalesCliente,
    selectedCliente,
    setSelectedCliente,
    clienteSearch,
    setClienteSearch,
    showCliDropdown,
    setShowCliDropdown,
    selectedSucursal,
    setSelectedSucursal,
    sucursalSearch,
    setSucursalSearch,
    showSucursalDropdown,
    setShowSucursalDropdown,
    // Colaboradores e Inventario
    empleadosDisponibles,
    selectedColaboradores,
    showColaboradorModal,
    setShowColaboradorModal,
    colaboradorSearch,
    setColaboradorSearch,
    handleAddColaborador,
    handleRemoveColaborador,
    productos,
    getProductosDisponiblesParaTrabajo,
    // Trabajos
    trabajos,
    handleAddTrabajo,
    handleRemoveTrabajo,
    handleCloneTrabajo,
    handleUpdateTrabajoField,
    handleUpdateMaterialesUsados,
    handleMejorarRedaccion,
    // Fotos
    processingPhotoTarget,
    selectedPhoto,
    viewerVisible,
    handleOpenPhoto,
    handleClosePhoto,
    handleCapturePhoto,
    handleSelectGallery,
    handleRemovePhoto,
    // Modal de Carga
    loadingModalVisible,
    loadingTitle,
    loadingMessage,
    loadingCurrent,
    loadingTotal,
    // Borradores
    draftsList,
    activeDraftId,
    lastSavedAt,
    draftsModalVisible,
    openDraftsModal,
    closeDraftsModal,
    pendingDraftPrompt,
    dismissPrompt,
    isSavingDraft,
    handleSaveDraft,
    handleLoadDraft,
    handleDeleteDraft,
    handleStartNewDraft,
    // Acciones finales
    isSubmitting,
    handleExportPDF,
    handleSaveToDatabase,
  };
}
