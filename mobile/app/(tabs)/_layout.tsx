import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { FloatingWorkoutBar } from '../../src/components/FloatingWorkoutBar';
import { font, useTheme } from '../../src/theme';

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        // React Navigation styles its own label, so the typeface pass over our
        // style sheets never reached it and the tab bar stayed in the system
        // font on every screen.
        // The label needs a full line's height, but the icon's box is 28 for a 24
        // icon and the item is a fixed height, so the label was squeezed to the
        // height of the type and lost what hangs below the line: "Today" read as
        // "Todau". Fitting the icon's box to the icon makes the room without
        // making the bar taller.
        tabBarLabelStyle: { fontFamily: font.ui, lineHeight: 14 },
        tabBarIconStyle: { height: 24 },        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <Ionicons name="today-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="weight"
        options={{
          title: 'Weight',
          tabBarIcon: ({ color, size }) => <Ionicons name="scale-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="train"
        options={{
          title: 'Train',
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="trends"
        options={{
          title: 'Trends',
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: 'Social',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        // Out of the bar, which holds five at phone width, but still a route: the
        // gear on Today and on Social opens it.
        options={{ title: 'Settings', href: null }}
      />
    </Tabs>
    <FloatingWorkoutBar />
  </View>
  );
}
