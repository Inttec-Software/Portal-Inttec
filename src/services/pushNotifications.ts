import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/services/supabase';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let Notifications: any = null;

if (!isExpoGo) {
  Notifications = require('expo-notifications');
  
  // Comportamiento local: cómo se mostrarán las notificaciones cuando la app está abierta
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export class PushNotificationService {
  /**
   * Solicita permisos de notificación y obtiene el token de Expo
   */
  static async registerForPushNotificationsAsync(): Promise<string | undefined> {
    if (isExpoGo) {
      console.log('Las notificaciones push no están soportadas dentro de Expo Go en SDK 53+. Necesitas un Development Build.');
      return undefined;
    }

    let token;

    if (Platform.OS === 'web') {
      console.log('Notificaciones Push omitidas en la Web (requiere VAPID key).');
      return undefined;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Fallo al obtener permiso para notificaciones push');
        return undefined;
      }

      // Obtener el ID del proyecto de EAS o App Config
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;

      if (!projectId) {
        console.warn('Project ID no encontrado, las notificaciones podrían no funcionar en producción.');
      }

      try {
        token = (await Notifications.getExpoPushTokenAsync({
          projectId,
        })).data;
        console.log('Expo Push Token obtenido:', token);
      } catch (e) {
        console.error('Error obteniendo push token:', e);
      }
    } else {
      console.log('Las notificaciones Push requieren un dispositivo físico (no un simulador).');
    }

    return token;
  }

  /**
   * Dispara la Edge Function para enviar una notificación push a otro usuario
   */
  static async sendPushNotification(targetUserId: string, title: string, body: string, data?: any) {
    try {
      const { data: result, error } = await supabase.functions.invoke('send-push', {
        body: { targetUserId, title, body, data }
      });
      if (error) {
        console.warn('[PushNotification] No se pudo enviar notificación push:', error.message || error);
      } else {
        console.log('[PushNotification] Notificación push enviada:', result);
      }
    } catch (e: any) {
      console.warn('[PushNotification] Excepción controlada al enviar push:', e?.message || e);
    }
  }
}
