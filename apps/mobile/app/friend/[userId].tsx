import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { api, errorText } from '@/lib/api';
import { useNow } from '@/lib/clock';
import { ago, fmt } from '@/lib/format';
import { useBase } from '@/lib/game';
import { colors } from '@/lib/theme';
import { Button, Card, ErrorText, Loading, Row, Screen, SectionTitle, T, Tag, confirm } from '@/lib/ui';

export default function FriendScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const now = useNow();
  const qc = useQueryClient();
  const { data: base } = useBase();
  const { data } = useQuery({ queryKey: ['friends'], queryFn: api.friends });
  const after = () => {
    qc.invalidateQueries({ queryKey: ['friends'] });
    qc.invalidateQueries({ queryKey: ['conversations'] });
    router.back();
  };
  const remove = useMutation({ mutationFn: () => api.removeFriend(userId), onSuccess: after });
  const block = useMutation({ mutationFn: () => api.block(userId), onSuccess: after });
  const report = useMutation({ mutationFn: (reason: string) => api.reportUser(userId, reason) });

  if (!data || !base) return <Loading />;
  const friend = data.friends.find((f) => f.userId === userId);
  if (!friend) return <Screen><T muted>You’re no longer friends with this commander.</T></Screen>;
  const b = friend.base;

  const send = (mission: 'raid' | 'scout') => b && router.push({
    pathname: '/send',
    params: { kind: 'base', id: b.id, name: b.name, x: String(b.x), y: String(b.y), mission },
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: friend.username }} />
      <Card>
        <T bold size={20}>{friend.username}</T>
        <T faint size={12}>{friend.lastSeenAt ? `Last seen ${ago(friend.lastSeenAt, now)}` : 'Not seen yet'}</T>
        {b ? (
          <>
            <T style={{ marginTop: 10 }}>{b.name}</T>
            <Row style={{ gap: 8 }}>
              <T mono faint size={12}>{b.coords}</T>
              <T mono faint size={12}>⚑ {fmt(b.power)}</T>
              {b.shielded && <Tag tone="accent">shielded</Tag>}
            </Row>
          </>
        ) : <T muted style={{ marginTop: 8 }}>No base on this Ring yet.</T>}
      </Card>

      <Button title="✉ Message" onPress={() => router.push({ pathname: '/chat/[userId]', params: { userId } })} />
      {b && (
        <Row style={{ gap: 8 }}>
          <Button title="⚔ Raid" variant="secondary" style={{ flex: 1 }} onPress={() => send('raid')} />
          <Button title="🛰 Scout" variant="secondary" style={{ flex: 1 }} onPress={() => send('scout')} />
        </Row>
      )}

      <SectionTitle>Manage</SectionTitle>
      <Button
        title="Remove friend"
        variant="secondary"
        loading={remove.isPending}
        onPress={async () => (await confirm('Remove friend?', `You can add ${friend.username} again later.`, 'Remove', true)) && remove.mutate()}
      />
      <Button
        title="Block"
        variant="danger"
        loading={block.isPending}
        onPress={async () => (await confirm(`Block ${friend.username}?`, 'They’re removed from your friends and can’t message you or send requests.', 'Block', true)) && block.mutate()}
      />
      <Button
        title={report.isSuccess ? 'Reported. Thanks.' : 'Report abuse'}
        variant="ghost"
        disabled={report.isSuccess}
        loading={report.isPending}
        onPress={async () => (await confirm('Report this commander?', 'Our moderators will review their messages.', 'Report', true)) && report.mutate('Reported from profile')}
      />
      <ErrorText>{[remove.error, block.error, report.error].filter(Boolean).map(errorText).join(' ')}</ErrorText>
      <T faint size={12} color={colors.faint}>Friends can raid each other too, following the usual rules.</T>
    </Screen>
  );
}
