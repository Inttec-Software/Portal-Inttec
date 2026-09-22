import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const isBrowser = Platform.OS !== 'web' || typeof window !== 'undefined';

export const resolveLocalhost = (url: string) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      return url.replace(/localhost|127\.0\.0\.1/, window.location.hostname);
    }
    return url;
  }
  if (__DEV__ && url && (url.includes('localhost') || url.includes('127.0.0.1'))) {
    const debuggerHost = Constants.expoConfig?.hostUri || (Constants.manifest as any)?.debuggerHost;
    if (debuggerHost) {
      const ip = debuggerHost.split(':')[0];
      return url.replace(/localhost|127\.0\.0\.1/, ip);
    }
  }
  return url;
};

let headerCache: { company: string; env: string; token: string | null } | null = null;

export const invalidateHeaderCache = () => {
  headerCache = null;
};

export const getApiHeaders = async (forceRefresh = false) => {
  if (!forceRefresh && headerCache) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${headerCache.token}`,
      'x-company': headerCache.company,
      'x-env': headerCache.env
    };
  }

  let company = 'inttec';
  let env = 'prod';
  let token = null;

  try {
    if (isBrowser) {
      const [compRes, envRes] = await Promise.all([
        AsyncStorage.getItem('active_company'),
        AsyncStorage.getItem('active_env')
      ]);
      company = compRes || 'inttec';
      env = envRes || 'prod';
      token = await AsyncStorage.getItem(`jwt_token_${company}`);
    }
  } catch (e) {
    console.warn('Error reading auth state from AsyncStorage in apiHelper', e);
  }
  
  headerCache = { company, env, token };

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-company': company,
    'x-env': env
  };
};

export const getApiUrl = () => {
  let rawApiUrl = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:10000').trim().replace(/\/+$/, '');

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (__DEV__ && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      // Si estamos en desarrollo local en el navegador y el bundle tenía la URL de Render, usar el backend local
      if (rawApiUrl.includes('onrender.com')) {
        rawApiUrl = `http://${window.location.hostname}:10000`;
      }
    }
  }

  return resolveLocalhost(rawApiUrl).replace(/\/+$/, '');
};
