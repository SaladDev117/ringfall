import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/lib/auth';
import { ClockProvider } from '@/lib/clock';
import { usePushRegistration } from '@/lib/push';
import { colors, navTheme } from '@/lib/theme';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000 } } });

export default function RootLayout() {
  const [loaded, error] = useFonts({ SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf') });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ClockProvider>
          <ThemeProvider value={navTheme}>
            <StatusBar style="light" />
            <RootNav />
          </ThemeProvider>
        </ClockProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function RootNav() {
  const auth = useAuth();
  const signedIn = auth.status === 'signedIn';

  useEffect(() => {
    if (auth.status !== 'loading') SplashScreen.hideAsync();
    if (auth.status === 'signedOut') queryClient.clear();
  }, [auth.status]);

  usePushRegistration(signedIn);

  if (auth.status === 'loading') return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="building/[type]" options={{ title: 'Building' }} />
        <Stack.Screen name="train/[building]" options={{ title: 'Train' }} />
        <Stack.Screen name="send" options={{ title: 'Send army' }} />
        <Stack.Screen name="report/[id]" options={{ title: 'Report' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ title: 'Join the Ring' }} />
      </Stack.Protected>
    </Stack>
  );
}
