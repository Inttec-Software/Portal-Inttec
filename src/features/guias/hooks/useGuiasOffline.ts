import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Directory, File, Paths } from 'expo-file-system';
import { GuiasService } from '../api/guiasService';
import { Guia, GuiaCategoria, collectGuideImageUrls } from '../types';

const CACHE_KEY = '@portal_inttec:guias_cache_v1';

interface GuiasCachePayload {
  categorias: GuiaCategoria[];
  guias: Guia[];
  syncedAt: string | null;
  imageMap: Record<string, string>;
}

const hashUrl = (url: string): string => {
  let hash = 5381;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 33) ^ url.charCodeAt(i);
  }
  const cleanExt = url.split('?')[0].split('.').pop();
  const ext = cleanExt && /^[a-z0-9]{2,5}$/i.test(cleanExt) ? cleanExt : 'jpg';
  return `guia_${(hash >>> 0).toString(36)}.${ext}`;
};

async function cacheRemoteImages(
  guias: Guia[],
  existingMap: Record<string, string>
): Promise<Record<string, string>> {
  if (Platform.OS === 'web') return existingMap;

  const urls = new Set<string>();
  for (const g of guias) {
    for (const u of collectGuideImageUrls(g.bloques)) {
      if (/^https?:\/\//i.test(u)) {
        urls.add(u);
      }
    }
  }

  if (urls.size === 0) return existingMap;

  const nextMap: Record<string, string> = { ...existingMap };
  try {
    const cacheDir = new Directory(Paths.document, 'guias_cache');
    cacheDir.create({ intermediates: true, idempotent: true });

    await Promise.all(
      Array.from(urls).map(async (url) => {
        try {
          const localFile = new File(cacheDir, hashUrl(url));
          if (localFile.exists) {
            nextMap[url] = localFile.uri;
            return;
          }
          const downloaded = await File.downloadFileAsync(url, localFile, {
            idempotent: true,
          });
          nextMap[url] = downloaded.uri;
        } catch (err) {
          console.warn('[GuiasOffline] No se pudo cachear imagen:', url, err);
        }
      })
    );
  } catch (err) {
    console.warn('[GuiasOffline] Error preparando directorio offline:', err);
  }

  return nextMap;
}

export function useGuiasOffline() {
  const [categorias, setCategorias] = useState<GuiaCategoria[]>([]);
  const [guias, setGuias] = useState<Guia[]>([]);
  const [localImageMap, setLocalImageMap] = useState<Record<string, string>>({});
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const loadFromCache = useCallback(async (): Promise<GuiasCachePayload | null> => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed: GuiasCachePayload = JSON.parse(raw);
      setCategorias(Array.isArray(parsed.categorias) ? parsed.categorias : []);
      setGuias(Array.isArray(parsed.guias) ? parsed.guias : []);
      setLocalImageMap(parsed.imageMap || {});
      setLastSyncedAt(parsed.syncedAt || null);
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const syncWithServer = useCallback(async (existingImageMap: Record<string, string> = {}) => {
    setSyncing(true);
    try {
      const net = await NetInfo.fetch();
      const online = net.isConnected !== false;
      setIsOffline(!online);

      if (!online) {
        return false;
      }

      const [catsRes, guiasRes] = await Promise.all([
        GuiasService.getCategorias(false),
        GuiasService.getGuias(false),
      ]);

      const nextCats = Array.isArray(catsRes) ? catsRes : [];
      const nextGuias = Array.isArray(guiasRes) ? guiasRes : [];
      const nextImageMap = await cacheRemoteImages(nextGuias, existingImageMap);
      const syncedAt = new Date().toISOString();

      setCategorias(nextCats);
      setGuias(nextGuias);
      setLocalImageMap(nextImageMap);
      setLastSyncedAt(syncedAt);
      setIsOffline(false);

      const payload: GuiasCachePayload = {
        categorias: nextCats,
        guias: nextGuias,
        syncedAt,
        imageMap: nextImageMap,
      };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
      return true;
    } catch (err) {
      console.warn('[GuiasOffline] Modo caché activo por error de red:', err);
      setIsOffline(true);
      return false;
    } finally {
      setSyncing(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const cached = await loadFromCache();
    await syncWithServer(cached?.imageMap || localImageMap);
  }, [loadFromCache, syncWithServer, localImageMap]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const cached = await loadFromCache();
      if (mounted && cached) {
        setLoading(false);
      }
      await syncWithServer(cached?.imageMap || {});
      if (mounted) {
        setLoading(false);
      }
    };
    void init();
    return () => {
      mounted = false;
    };
  }, [loadFromCache, syncWithServer]);

  const getGuiaByIdLocal = useCallback(
    (id: string): Guia | undefined => guias.find((g) => g.id === id),
    [guias]
  );

  return {
    categorias,
    guias,
    localImageMap,
    lastSyncedAt,
    loading,
    syncing,
    isOffline,
    refresh,
    getGuiaByIdLocal,
  };
}
