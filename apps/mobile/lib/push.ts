import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { api } from './api';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/**
 * Asks for notification permission and sends this phone's Expo push token to the server.
 * Push needs a physical device and an EAS project id (`npx eas-cli init` adds it to app.json).
 */
export function usePushRegistration(signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn || Platform.OS === 'web' || !Device.isDevice) return;
    const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    (async () => {
      let { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
      if (status !== 'granted') return;
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', { name: 'Ringfall', importance: Notifications.AndroidImportance.HIGH });
      }
      const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
      await api.registerPushToken(data, Platform.OS === 'ios' ? 'ios' : 'android');
    })().catch((e) => console.warn('Push registration failed', e));
  }, [signedIn]);
}
