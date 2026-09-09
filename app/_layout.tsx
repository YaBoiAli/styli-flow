import 'react-native-gesture-handler';

import {
  DMSans_400Regular,
  DMSans_500Medium,
} from '@expo-google-fonts/dm-sans';
import { Syne_700Bold } from '@expo-google-fonts/syne';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AuthProvider } from '@/context/AuthContext';
import { PreferencesProvider } from '@/context/PreferencesContext';
import { SubscriptionProvider } from '@/context/SubscriptionContext';
import { colors } from '@/constants/theme';
import { initAnalytics, trackAppOpened } from '@/lib/analytics';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Syne_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
      void initAnalytics().then(() => {
        trackAppOpened();
      });
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <SubscriptionProvider>
        <PreferencesProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'fade_from_bottom',
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="style" />
            <Stack.Screen name="occasion" />
            <Stack.Screen name="budget" />
            <Stack.Screen name="generation" />
            <Stack.Screen name="outfit" />
            <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
            <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
            <Stack.Screen name="saved/[id]" />
            <Stack.Screen name="+not-found" />
          </Stack>
        </PreferencesProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}
