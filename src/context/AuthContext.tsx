import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AuthService, Usuario, CompanyService, EnvService, SessionExpiredError } from '@/services/supabase';
import { CatalogService } from '@/services/catalogService';
import { ModuleCache } from '@/services/moduleCache';
import { invalidateHeaderCache } from '@/services/apiHelper';
import { installFetchInterceptor, registerSessionExpiredHandler } from '@/services/sessionInterceptor';
import { getTokenExpirationMs, isTokenExpired, JWT_REFRESH_THRESHOLD_MS, shouldRefreshToken } from '@/utils/jwtUtils';
import { useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PushNotificationService } from '@/services/pushNotifications';
import { AppState, Platform } from 'react-native';

installFetchInterceptor();

const MAX_TIMEOUT_MS = 2_147_483_647;
const DEFAULT_EXPIRED_MESSAGE = 'Tu sesión expiró. Por seguridad, inicia sesión de nuevo.';

interface AuthContextType {
  user: Usuario | null;
  isLoading: boolean;
  company: 'inttec' | 'daravisa';
  env: 'cloud' | 'test';
  sessionExpiredMessage: string | null;
  clearSessionExpiredMessage: () => void;
  refreshSession: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<Usuario | null>>;
  changeCompany: (newCompany: 'inttec' | 'daravisa') => Promise<void>;
  changeEnv: (newEnv: 'cloud' | 'test') => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  company: 'inttec',
  env: 'cloud',
  sessionExpiredMessage: null,
  clearSessionExpiredMessage: () => {},
  refreshSession: async () => {},
  setUser: () => {},
  changeCompany: async () => {},
  changeEnv: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [company, setCompanyState] = useState<'inttec' | 'daravisa'>('inttec');
  const [env, setEnvState] = useState<'cloud' | 'test'>('cloud');
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);
  const segments = useSegments();
  const router = useRouter();

  const userRef = useRef<Usuario | null>(null);
  const syncSessionRef = useRef<(options?: { showExpiredNotice?: boolean }) => Promise<void>>(async () => {});

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiringLockRef = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const clearSessionTimers = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (expireTimerRef.current) {
      clearTimeout(expireTimerRef.current);
      expireTimerRef.current = null;
    }
  }, []);

  const clearSessionExpiredMessage = useCallback(() => {
    setSessionExpiredMessage(null);
  }, []);

  const handleSessionExpired = useCallback(async (showNotice = true) => {
    if (expiringLockRef.current) return;
    expiringLockRef.current = true;

    try {
      clearSessionTimers();
      const hadActiveSession = Boolean(userRef.current) || (await AuthService.hasStoredUser());
      await AuthService.logout();
      setUser(null);
      if (showNotice && hadActiveSession) {
        setSessionExpiredMessage(DEFAULT_EXPIRED_MESSAGE);
      }
    } catch (error) {
      console.error('Error handling expired session:', error);
    } finally {
      expiringLockRef.current = false;
    }
  }, [clearSessionTimers]);

  const syncSessionState = useCallback(async (options?: { showExpiredNotice?: boolean }) => {
    const showNotice = options?.showExpiredNotice ?? true;
    const token = await AuthService.getToken();

    if (!token || isTokenExpired(token)) {
      const hasSession = Boolean(userRef.current) || (await AuthService.hasStoredUser());
      if (hasSession) {
        await handleSessionExpired(showNotice);
      } else {
        clearSessionTimers();
      }
      return;
    }

    let activeToken = token;

    if (shouldRefreshToken(activeToken)) {
      try {
        const refreshed = await AuthService.refreshToken();
        if (refreshed) {
          activeToken = refreshed.token;
          setUser(refreshed.usuario);
        }
      } catch (error) {
        if (error instanceof SessionExpiredError) {
          await handleSessionExpired(showNotice);
          return;
        }
      }
    }

    clearSessionTimers();
    setSessionExpiredMessage(null);
    const expMs = getTokenExpirationMs(activeToken);
    if (!expMs) return;

    const nowMs = Date.now();
    const refreshDelayMs = expMs - JWT_REFRESH_THRESHOLD_MS - nowMs;
    if (refreshDelayMs > 0 && refreshDelayMs <= MAX_TIMEOUT_MS) {
      refreshTimerRef.current = setTimeout(() => {
        void syncSessionRef.current({ showExpiredNotice: true });
      }, refreshDelayMs);
    }

    const expireDelayMs = expMs - nowMs;
    if (expireDelayMs > 0 && expireDelayMs <= MAX_TIMEOUT_MS) {
      expireTimerRef.current = setTimeout(() => {
        void handleSessionExpired(true);
      }, expireDelayMs);
    }
  }, [clearSessionTimers, handleSessionExpired]);

  useEffect(() => {
    syncSessionRef.current = syncSessionState;
  }, [syncSessionState]);

  const refreshSession = async () => {
    try {
      setIsLoading(true);
      const currentUser = await AuthService.getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error('Error fetching user context:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const changeCompany = async (newCompany: 'inttec' | 'daravisa') => {
    setIsLoading(true);
    try {
      const currentEmail = user?.email;
      const currentRole = user?.rol;

      // Copiar el token JWT al nuevo entorno ANTES de cambiar la empresa
      // para que getApiHeaders() pueda enviarlo en las llamadas de catálogo.
      const currentToken = await AsyncStorage.getItem(`jwt_token_${company}`);
      if (currentToken) {
        await AsyncStorage.setItem(`jwt_token_${newCompany}`, currentToken);
      }

      await CompanyService.setActiveCompany(newCompany);
      invalidateHeaderCache();
      ModuleCache.invalidate();
      setCompanyState(newCompany);
      
      let currentUser = await AuthService.getCurrentUser();

      // Siempre actualizamos el usuario desde el backend al cambiar de empresa
      // para garantizar que el rol y otros datos estén sincronizados.
      if (currentEmail) {
        const allUsers = await CatalogService.getUsuarios().catch(() => []);
        const dbUser = allUsers.find((u: Usuario) => u.email?.trim().toLowerCase() === currentEmail.trim().toLowerCase());

        if (dbUser) {
          // Si el rol en la sesión activa es diferente al del usuario (por falta de sincronización previa),
          // mantenemos el rol activo y lo sincronizamos en la base de datos de la nueva empresa
          if (currentRole && dbUser.rol !== currentRole) {
            try {
              await CatalogService.actualizarUsuario(dbUser.id, { rol: currentRole });
              dbUser.rol = currentRole;
            } catch (syncErr) {
              console.warn('Could not sync user role across company:', syncErr);
            }
          }

          await AsyncStorage.setItem(`logged_user_${newCompany}`, JSON.stringify(dbUser));
          
          currentUser = dbUser as Usuario;
        } else if (user) {
          // Si el usuario aún no existe en la tabla usuarios de la otra empresa, conservar la sesión activa
          await AsyncStorage.setItem(`logged_user_${newCompany}`, JSON.stringify(user));
          currentUser = user;
        }
      }

      setUser(currentUser);
    } catch (error) {
      console.error('Error changing company:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const changeEnv = async (newEnv: 'cloud' | 'test') => {
    setIsLoading(true);
    try {
      await EnvService.setActiveEnv(newEnv);
      setEnvState(newEnv);
      
      const currentEmail = user?.email;
      let currentUser = null;

      if (currentEmail) {
        const allUsers = await CatalogService.getUsuarios();
        const dbUser = allUsers.find((u: Usuario) => u.email?.trim().toLowerCase() === currentEmail.trim().toLowerCase());

        if (dbUser) {
          await AsyncStorage.setItem(`logged_user_${company}`, JSON.stringify(dbUser));
          currentUser = dbUser as Usuario;
        } else {
          await AsyncStorage.removeItem(`logged_user_${company}`);
        }
      }
      
      setUser(currentUser);

      // Force a reload of the app to clear all hooks/states
      if (Platform.OS === 'web') {
        window.location.reload();
      } else {
        try {
          const Updates = require('expo-updates');
          await Updates.reloadAsync();
        } catch (e) {
          console.warn('Updates.reloadAsync not available');
        }
      }
    } catch (error) {
      console.error('Error changing env:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    registerSessionExpiredHandler(() => {
      void handleSessionExpired(true);
    });
    return () => {
      registerSessionExpiredHandler(null);
      clearSessionTimers();
    };
  }, [clearSessionTimers, handleSessionExpired]);

  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && userRef.current) {
        void syncSessionState({ showExpiredNotice: true });
      }
    });

    if (Platform.OS === 'web' && typeof document !== 'undefined' && typeof window !== 'undefined') {
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible' && userRef.current) {
          void syncSessionState({ showExpiredNotice: true });
        }
      };
      const onFocus = () => {
        if (userRef.current) {
          void syncSessionState({ showExpiredNotice: true });
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('focus', onFocus);
      return () => {
        appStateSub.remove();
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('focus', onFocus);
      };
    }

    return () => {
      appStateSub.remove();
    };
  }, [syncSessionState]);

  useEffect(() => {
    let active = true;
    const initSession = async () => {
      try {
        const [savedCompany, savedEnv] = await Promise.all([
          CompanyService.loadSavedCompany(),
          EnvService.loadSavedEnv(),
        ]);
        if (active) {
          setCompanyState(savedCompany);
          setEnvState(savedEnv);
        }

        const hadStoredUser = await AuthService.hasStoredUser();
        const currentUser = await AuthService.getCurrentUser();
        if (active) {
          setUser(currentUser);
          if (hadStoredUser && !currentUser) {
            setSessionExpiredMessage(DEFAULT_EXPIRED_MESSAGE);
          }
        }
      } catch (error) {
        console.error('Error fetching user context:', error);
        if (active) setUser(null);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    initSession();
    return () => {
      active = false;
    };
  }, []);

  const activeUserId = user?.id;

  useEffect(() => {
    if (activeUserId) {
      void syncSessionState({ showExpiredNotice: false });
    } else {
      clearSessionTimers();
    }
  }, [activeUserId, company, clearSessionTimers, syncSessionState]);

  useEffect(() => {
    if (user) {
      PushNotificationService.registerForPushNotificationsAsync().then(token => {
        if (token) {
          // Update user row in DB with this token
          CatalogService.actualizarUsuario(user.id, { expo_push_token: token } as any).catch(err => {
            console.error('Error saving push token:', err);
          });
        }
      });
    }
  }, [user]);

  useEffect(() => {
    if (isLoading) return;

    const rootSegment = segments[0] as string | undefined;
    const inAuthGroup = rootSegment === '(admin)' || rootSegment === '(empleado)';

    if (!user && inAuthGroup) {
      // Redirect to login if not authenticated and trying to access protected groups
      router.replace('/');
    } else if (user) {
      // If user is authenticated and is not in a protected group (e.g. login screen)
      if (!inAuthGroup) {
        if (user.rol?.toUpperCase() === 'ADMIN' || user.rol?.toUpperCase() === 'DEV') {
          router.replace('/(admin)/dashboard');
        } else {
          router.replace('/(empleado)/gastos');
        }
      } else if (rootSegment === '(admin)' && user.rol?.toUpperCase() !== 'ADMIN' && user.rol?.toUpperCase() !== 'DEV') {
         // Redirect to their actual role if they try to access wrong group
         router.replace('/(empleado)/gastos');
      } else if (rootSegment === '(empleado)' && user.rol?.toUpperCase() === 'ADMIN') {
         router.replace('/(admin)/dashboard');
      }
    }
  }, [user, isLoading, segments, router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        company,
        env,
        sessionExpiredMessage,
        clearSessionExpiredMessage,
        refreshSession,
        setUser,
        changeCompany,
        changeEnv
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
