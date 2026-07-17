import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthService, Usuario, CompanyService, supabase } from '@/services/supabase';
import { useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthContextType {
  user: Usuario | null;
  isLoading: boolean;
  company: 'inttec' | 'daravisa';
  refreshSession: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<Usuario | null>>;
  changeCompany: (newCompany: 'inttec' | 'daravisa') => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  company: 'inttec',
  refreshSession: async () => {},
  setUser: () => {},
  changeCompany: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [company, setCompanyState] = useState<'inttec' | 'daravisa'>('inttec');
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
      await CompanyService.setActiveCompany(newCompany);
      setCompanyState(newCompany);
      
      let currentUser = await AuthService.getCurrentUser();

      // Si la sesión guardada para la nueva empresa pertenece a otro usuario, la descartamos
      if (currentUser && currentEmail && currentUser.email.trim().toLowerCase() !== currentEmail.trim().toLowerCase()) {
        currentUser = null;
      }

      // Si no hay una sesión guardada para el correo actual en la nueva empresa, la buscamos
      if (!currentUser && currentEmail) {
        const { data: dbUser, error } = await supabase
          .from('usuarios')
          .select('*')
          .eq('email', currentEmail.trim().toLowerCase())
          .maybeSingle();

        if (dbUser && !error) {
          await AsyncStorage.setItem(`logged_user_${newCompany}`, JSON.stringify(dbUser));
          currentUser = dbUser as Usuario;
        } else {
          await AsyncStorage.removeItem(`logged_user_${newCompany}`);
        }
      }

      setUser(currentUser);
    } catch (error) {
      console.error('Error changing company:', error);
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
    if (isLoading) return;

    const rootSegment = segments[0] as string | undefined;
    const inAuthGroup = rootSegment === '(admin)' || rootSegment === '(empleado)';

    if (!user && inAuthGroup) {
      // Redirect to login if not authenticated and trying to access protected groups
      router.replace('/');
    } else if (user) {
      // If user is authenticated and is not in a protected group (e.g. login screen)
      if (!inAuthGroup) {
        if (user.rol === 'ADMIN') {
          router.replace('/(admin)/dashboard');
        } else {
          router.replace('/(empleado)/dashboard');
        }
      } else if (rootSegment === '(admin)' && user.rol !== 'ADMIN') {
         // Redirect to their actual role if they try to access wrong group
         router.replace('/(empleado)/dashboard');
      } else if (rootSegment === '(empleado)' && user.rol === 'ADMIN') {
         router.replace('/(admin)/dashboard');
      }
    }
  }, [user, isLoading, segments]);

  return (
    <AuthContext.Provider value={{ user, isLoading, company, refreshSession, setUser, changeCompany }}>
      {children}
    </AuthContext.Provider>
  );
}
