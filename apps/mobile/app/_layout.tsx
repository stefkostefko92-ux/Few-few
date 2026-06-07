import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useQueueStore } from '@/store/queueStore';
import { colors } from '@/theme/theme';

const queryClient = new QueryClient();

export default function RootLayout() {
  const hydrate = useQueueStore((s) => s.hydrate);
  const processAll = useQueueStore((s) => s.processAll);

  useEffect(() => {
    void hydrate().then(() => processAll());
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void processAll();
      }
    });
    return () => sub.remove();
  }, [hydrate, processAll]);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
            headerBackTitle: 'Назад',
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="status" options={{ title: 'Провери сигнал' }} />
          <Stack.Screen name="report/category" options={{ title: 'Нов сигнал' }} />
          <Stack.Screen name="report/capture" options={{ title: 'Нов сигнал' }} />
          <Stack.Screen name="report/location" options={{ title: 'Нов сигнал' }} />
          <Stack.Screen name="report/details" options={{ title: 'Нов сигнал' }} />
          <Stack.Screen name="report/review" options={{ title: 'Преглед' }} />
          <Stack.Screen
            name="report/sent"
            options={{ headerShown: false, gestureEnabled: false }}
          />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
