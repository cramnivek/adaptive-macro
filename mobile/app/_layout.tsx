import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Toaster } from '../src/components/Toaster';
import { AppProvider } from '../src/state/AppStore';
import { font, useTheme } from '../src/theme';
import { session as loud } from '../src/theme/sessionTheme';

export default function RootLayout() {
  const { colors, isDark } = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    IBMPlexMono_500Medium,
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Fire and forget: nothing renders differently based on the answer, and
    // awaiting it would delay first paint for a permission the user never sees.
    void import('../src/web/persistence').then(({ requestPersistentStorage }) =>
      requestPersistentStorage(),
    );
  }, []);

  // The fonts are local on native but a network fetch on the iOS PWA's first
  // cold load. Painting the background colour rather than nothing means a slow
  // connection shows an empty app in the right colour — on a dark-default app
  // a white flash is the most visible failure there is.
  //
  // `&& !fontError` is load-bearing: if the load fails outright (offline or
  // flaky first load on the PWA) fontsLoaded never becomes true, and without
  // it the app would sit blank forever. On failure we render anyway and the
  // screens fall back to the system font — degraded but usable.
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Toaster />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            // Set once here rather than on each of the eleven modal screens:
            // React Navigation draws its own title, so it kept the system font
            // while the screen beneath it was typeset.
            headerTitleStyle: { fontFamily: font.uiStrong },
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
            name="routines"
            options={{
              presentation: 'modal',
              headerShown: true,
              title: 'Routines',
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
            }}
          />
          <Stack.Screen
            name="session"
            options={{
              presentation: 'modal',
              headerShown: true,
              // No title and the logger's own ground, so the modal bar is not
              // a strip of a different dark above a screen that has already
              // said "WORKOUT" in 26px. The chevron still dismisses it.
              title: '',
              headerStyle: { backgroundColor: loud.ground },
              headerTintColor: loud.figure,
            }}
          />
          <Stack.Screen
            name="progression"
            options={{
              presentation: 'modal',
              headerShown: true,
              title: 'Progression',
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
