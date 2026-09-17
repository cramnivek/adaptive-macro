import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../src/state/AppStore';
import { useTheme } from '../src/theme';

export default function RootLayout() {
  const { colors, isDark } = useTheme();

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
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
