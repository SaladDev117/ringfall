import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { useBase } from '@/lib/game';
import { colors } from '@/lib/theme';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;

export default function TabLayout() {
  const { data: base } = useBase();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Base', headerShown: false, tabBarIcon: icon('⌂') }} />
      <Tabs.Screen
        name="army"
        options={{
          title: 'Army',
          tabBarIcon: icon('⚔'),
          tabBarBadge: base?.incoming.length ? base.incoming.length : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger },
        }}
      />
      <Tabs.Screen name="map" options={{ title: 'Map', tabBarIcon: icon('◎') }} />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: icon('✉'),
          tabBarBadge: base?.unreadReports ? base.unreadReports : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.bg },
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: 'Social',
          tabBarIcon: icon('☺'),
          tabBarBadge: base && base.social.friendRequests + base.social.unreadMessages > 0
            ? base.social.friendRequests + base.social.unreadMessages : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.bg },
        }}
      />
    </Tabs>
  );
}
