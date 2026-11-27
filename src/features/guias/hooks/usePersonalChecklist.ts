import { useState, useEffect, useCallback, useMemo } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Guia, GuiaBlock, getCheckableKeysForBlock } from '../types';

const getStorageKey = (guiaId: string) => `@portal_inttec:guia_checks_${guiaId}`;

export function usePersonalChecklist(guiaId: string | undefined, bloques: GuiaBlock[]) {
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const loadChecklist = async () => {
      if (!guiaId) {
        if (active) {
          setCheckedMap({});
          setLoaded(true);
        }
        return;
      }
      try {
        const raw = await AsyncStorage.getItem(getStorageKey(guiaId));
        if (!active) return;
        if (raw) {
          try {
            setCheckedMap(JSON.parse(raw));
          } catch {
            setCheckedMap({});
          }
        } else {
          setCheckedMap({});
        }
      } catch {
        // noop
      } finally {
        if (active) setLoaded(true);
      }
    };
    void loadChecklist();

    return () => {
      active = false;
    };
  }, [guiaId]);

  const persistMap = useCallback(
    async (next: Record<string, boolean>) => {
      if (!guiaId) return;
      try {
        await AsyncStorage.setItem(getStorageKey(guiaId), JSON.stringify(next));
      } catch (err) {
        console.warn('[Guias] Error guardando checklist local:', err);
      }
    },
    [guiaId]
  );

  const toggleItem = useCallback(
    (itemKey: string) => {
      setCheckedMap((prev) => {
        const next = { ...prev, [itemKey]: !prev[itemKey] };
        if (!next[itemKey]) delete next[itemKey];
        void persistMap(next);
        return next;
      });
    },
    [persistMap]
  );

  const executeReset = useCallback(() => {
    setCheckedMap({});
    if (guiaId) {
      void AsyncStorage.removeItem(getStorageKey(guiaId)).catch(() => {});
    }
  }, [guiaId]);

  const resetAll = useCallback(() => {
    const title = 'Reiniciar checklist';
    const msg = 'Se limpiarán todas tus marcas personales de esta guía para usarla en una nueva instalación.';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${msg}`)) {
        executeReset();
      }
      return;
    }
    Alert.alert(title, msg, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Reiniciar', style: 'destructive', onPress: executeReset },
    ]);
  }, [executeReset]);

  const { totalCount, completedCount, progressPercent } = useMemo(() => {
    const allKeys: string[] = [];
    for (const block of bloques || []) {
      allKeys.push(...getCheckableKeysForBlock(block));
    }
    const total = allKeys.length;
    const completed = allKeys.filter((k) => Boolean(checkedMap[k])).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { totalCount: total, completedCount: completed, progressPercent: pct };
  }, [bloques, checkedMap]);

  return {
    loaded,
    checkedMap,
    toggleItem,
    resetAll,
    totalCount,
    completedCount,
    progressPercent,
  };
}

export function useGuiasProgressSummary(guias: Guia[]) {
  const [summaryMap, setSummaryMap] = useState<
    Record<string, { completed: number; total: number }>
  >({});

  const computeSummary = useCallback(async () => {
    if (!guias || guias.length === 0) {
      return {};
    }

    const keys = guias.map((g) => getStorageKey(g.id));
    const pairs = await AsyncStorage.multiGet(keys);
    const next: Record<string, { completed: number; total: number }> = {};

    guias.forEach((guia, idx) => {
      const allKeys: string[] = [];
      for (const block of guia.bloques || []) {
        allKeys.push(...getCheckableKeysForBlock(block));
      }
      const total = allKeys.length;
      if (total === 0) return;

      const raw = pairs[idx]?.[1];
      let parsed: Record<string, boolean> = {};
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = {};
        }
      }
      const completed = allKeys.filter((k) => Boolean(parsed[k])).length;
      next[guia.id] = { completed, total };
    });

    return next;
  }, [guias]);

  const refreshSummary = useCallback(async () => {
    try {
      const next = await computeSummary();
      setSummaryMap(next);
    } catch (err) {
      console.warn('[Guias] Error calculando resumen de checklists:', err);
    }
  }, [computeSummary]);

  useEffect(() => {
    let active = true;
    computeSummary()
      .then((next) => {
        if (active) setSummaryMap(next);
      })
      .catch((err) => {
        console.warn('[Guias] Error calculando resumen de checklists:', err);
      });
    return () => {
      active = false;
    };
  }, [computeSummary]);

  return { summaryMap, refreshSummary };
}
