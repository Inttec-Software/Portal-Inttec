import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthService, Usuario } from '@/services/supabase';
import { useRouter, useSegments } from 'expo-router';

interface AuthContextType {
  user: Usuario | null;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<Usuario | null>>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  refreshSession: async () => {},
  setUser: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  useEffect(() => {
    refreshSession();
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
    <AuthContext.Provider value={{ user, isLoading, refreshSession, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
