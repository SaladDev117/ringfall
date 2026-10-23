import { Share } from 'react-native';

import { useUser } from '@/lib/auth';
import { colors, mono } from '@/lib/theme';
import { Button, Card, Screen, SectionTitle, T } from '@/lib/ui';

export default function SocialScreen() {
  const user = useUser();
  const code = user?.inviteCode ?? '';
  const share = () =>
    Share.share({
      message: `Join me on Ringfall, the war for the Oruun Ring. Use my invite code ${code} when you sign up and you'll land right next to my base.`,
    });

  return (
    <Screen>
      <SectionTitle>Your invite code</SectionTitle>
      <Card tone="accent" style={{ alignItems: 'center', gap: 8 }}>
        <T style={{ fontFamily: mono, fontSize: 30, letterSpacing: 3, color: colors.accent }} selectable>{code}</T>
        <T muted size={13} style={{ textAlign: 'center' }}>Friends who sign up with it land in your sector, right next to you.</T>
        <Button title="Share invite" onPress={share} style={{ alignSelf: 'stretch' }} />
      </Card>
    </Screen>
  );
}
