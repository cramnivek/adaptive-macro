import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../src/state/AppStore';
import { useTheme } from '../src/theme';

export default function RootLayout() {
  const { colors, isDark } = useTheme();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Fire and forget: nothing renders differently based on the answer, and
    // awaiting it would delay first paint for a permission the user never sees.
    void import('../src/web/persistence').then(({ requestPersistentStorage }) =>
      requestPersistentStorage(),
    );
  }, []);

  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="search"
            options={{
              presentation: 'modal',
              headerShown: true,
              title: 'Add food',
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="quick-add"
            options={{
              presentation: 'modal',
              headerShown: true,
              title: 'Quick add',
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="repeat"
            options={{
              presentation: 'modal',
              headerShown: true,
              title: 'Repeat a day',
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="describe"
            options={{
              presentation: 'modal',
              headerShown: true,
              title: 'Describe a meal',
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="food-new"
            options={{
              presentation: 'modal',
              headerShown: true,
              title: 'New food',
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="scan"
            options={{
              presentation: 'modal',
              headerShown: true,
              title: 'Scan barcode',
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="import-workouts"
            options={{
              presentation: 'modal',
              headerShown: true,
              title: 'Import workouts',
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
            }}
          />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
