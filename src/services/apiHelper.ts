import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const isBrowser = Platform.OS !== 'web' || typeof window !== 'undefined';

export const resolveLocalhost = (url: string) => {
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
  const rawApiUrl = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:10000').trim().replace(/\/+$/, '');
  return resolveLocalhost(rawApiUrl).replace(/\/+$/, '');
};
