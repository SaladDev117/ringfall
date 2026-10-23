import { Link, Stack } from 'expo-router';

import { colors } from '@/lib/theme';
import { Screen, T } from '@/lib/ui';

export default function NotFoundScreen() {
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Lost on the Ring' }} />
      <T size={18} bold>This screen doesn’t exist.</T>
      <Link href="/" style={{ color: colors.accent, marginTop: 12 }}>Back to your base</Link>
    </Screen>
  );
}
