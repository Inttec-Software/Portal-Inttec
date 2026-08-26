import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthService, Usuario, CompanyService, EnvService, supabase } from '@/services/supabase';
import { useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PushNotificationService } from '@/services/pushNotifications';
import { Platform } from 'react-native';

interface AuthContextType {
  user: Usuario | null;
  isLoading: boolean;
  company: 'inttec' | 'daravisa';
  env: 'cloud' | 'test';
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
  const segments = useSegments();
  const router = useRouter();

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
      await CompanyService.setActiveCompany(newCompany);
      setCompanyState(newCompany);
      
      let currentUser = await AuthService.getCurrentUser();

      // Siempre actualizamos el usuario desde la base de datos al cambiar de empresa
      // para garantizar que el rol y otros datos estén sincronizados.
      if (currentEmail) {
        const { data: dbUser, error } = await supabase
          .from('usuarios')
          .select('*')
          .eq('email', currentEmail.trim().toLowerCase())
          .maybeSingle();

        if (dbUser && !error) {
          // Si el rol en la sesión activa es diferente al de la base de datos (por falta de sincronización previa),
          // mantenemos el rol activo y lo sincronizamos en la base de datos de la nueva empresa
          if (currentRole && dbUser.rol !== currentRole) {
            try {
              await supabase
                .from('usuarios')
                .update({ rol: currentRole })
                .eq('id', dbUser.id);
              dbUser.rol = currentRole;
            } catch (syncErr) {
              console.warn('Could not sync user role across company:', syncErr);
            }
          }

          await AsyncStorage.setItem(`logged_user_${newCompany}`, JSON.stringify(dbUser));
          
          // Copiar también el token JWT al nuevo entorno
          const currentToken = await AsyncStorage.getItem(`jwt_token_${company}`);
          if (currentToken) {
            await AsyncStorage.setItem(`jwt_token_${newCompany}`, currentToken);
          }
          
          currentUser = dbUser as Usuario;
        } else {
          await AsyncStorage.removeItem(`logged_user_${newCompany}`);
          await AsyncStorage.removeItem(`jwt_token_${newCompany}`);
          currentUser = null;
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
        const { data: dbUser, error } = await supabase
          .from('usuarios')
          .select('*')
          .eq('email', currentEmail.trim().toLowerCase())
          .maybeSingle();

        if (dbUser && !error) {
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
    let active = true;
    const initSession = async () => {
      try {
        const savedCompany = await CompanyService.loadSavedCompany();
        if (active) setCompanyState(savedCompany);
        const savedEnv = await EnvService.loadSavedEnv();
        if (active) setEnvState(savedEnv);
        
        const currentUser = await AuthService.getCurrentUser();
        if (active) setUser(currentUser);
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

  useEffect(() => {
    if (user) {
      PushNotificationService.registerForPushNotificationsAsync().then(token => {
        if (token) {
          // Update user row in DB with this token
          supabase.from('usuarios')
            .update({ expo_push_token: token })
            .eq('id', user.id)
            .then(({ error }) => {
              if (error) console.error('Error saving push token:', error);
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
        if (user.rol === 'ADMIN' || user.rol === 'DEV') {
          router.replace('/(admin)/dashboard');
        } else {
          router.replace('/(empleado)/gastos');
        }
      } else if (rootSegment === '(admin)' && user.rol !== 'ADMIN' && user.rol !== 'DEV') {
         // Redirect to their actual role if they try to access wrong group
         router.replace('/(empleado)/gastos');
      } else if (rootSegment === '(empleado)' && user.rol === 'ADMIN') {
         router.replace('/(admin)/dashboard');
      }
    }
  }, [user, isLoading, segments, router]);

  return (
    <AuthContext.Provider value={{ user, isLoading, company, env, refreshSession, setUser, changeCompany, changeEnv }}>
      {children}
    </AuthContext.Provider>
  );
}
