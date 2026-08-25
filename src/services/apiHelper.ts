import { AuthService, CompanyService, EnvService } from './supabase';
import Constants from 'expo-constants';

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

export const getApiHeaders = async () => {
  const token = await AuthService.getToken();
  const company = CompanyService.getActiveCompany();
  const env = EnvService.getActiveEnv();
  
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-company': company,
    'x-env': env
  };
};

export const getApiUrl = () => {
  const rawApiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:10000';
  return resolveLocalhost(rawApiUrl);
};
