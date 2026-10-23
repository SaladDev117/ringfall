import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import BattleReplay from '@/components/three/BattleReplay';
import { api, errorText } from '@/lib/api';
import type { ReportDetail } from '@/lib/types';
import { clock, fmt } from '@/lib/format';
import { RESOURCE_ICONS } from '@/lib/game';
import { colors } from '@/lib/theme';
import { Button, Card, ErrorText, Loading, Row, Screen, SectionTitle, T } from '@/lib/ui';

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ['report', id], queryFn: () => api.report(id) });
  const [showLog, setShowLog] = useState(false);

  // Opening a report marks it read.
  useEffect(() => {
    if (data) {
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.invalidateQueries({ queryKey: ['base'] });
    }
  }, [data, qc]);

  if (!data) return error ? <Screen><ErrorText>{errorText(error)}</ErrorText></Screen> : <Loading />;
  const battle = data.data.battle;
  return (
    <Screen>
      <Stack.Screen options={{ title: data.kind === 'scout' ? 'Scout report' : 'Battle report' }} />
      <T bold size={18}>{data.title}</T>
      <T faint size={12}>{clock(data.at)}</T>
      {data.shared && <T muted size={13}>Shared with you by a friend.</T>}
      {battle && (
        <View style={{ height: 460, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
          <BattleReplay
            dom={{ style: { flex: 1 } }}
            battle={battle}
            perspective={data.side}
            attackerName={data.data.attackerName}
            defenderName={data.data.defenderName}
            nest={data.kind === 'nest'}
            summary={lootLine(data)}
          />
        </View>
      )}
      {battle && <Button small variant="ghost" title={showLog ? 'Hide battle log' : 'Show battle log'} onPress={() => setShowLog((v) => !v)} />}
      {(!battle || showLog) && (
        <Card>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <T mono size={12} color={colors.text} style={{ lineHeight: 18 }}>{data.text}</T>
          </ScrollView>
        </Card>
      )}
      {!data.shared && <ShareWithFriend reportId={data.id} />}
    </Screen>
  );
}

/** One line about the spoils, from the reader's side of the battle. */
function lootLine(r: ReportDetail): string | undefined {
  const loot = r.data.loot;
  if (!loot || r.outcome !== 'attacker') return undefined;
  const parts = (['alloy', 'plasma', 'relics'] as const).filter((k) => loot[k] > 0).map((k) => `${RESOURCE_ICONS[k]} ${fmt(loot[k])}`);
  if (!parts.length) return undefined;
  return `${r.side === 'attacker' ? 'Loot' : 'Stolen'}: ${parts.join('  ')}`;
}

/** Bragging rights: send the report into a friend's messages. */
function ShareWithFriend({ reportId }: { reportId: string }) {
  const { data } = useQuery({ queryKey: ['friends'], queryFn: api.friends });
  const share = useMutation({ mutationFn: (userId: string) => api.shareReport(userId, reportId) });
  const [sentTo, setSentTo] = useState<string[]>([]);
  if (!data?.friends.length) return null;
  return (
    <>
      <SectionTitle>Share with a friend</SectionTitle>
      <Row style={{ flexWrap: 'wrap', gap: 8 }}>
        {data.friends.map((f) => (
          <Button
            key={f.userId}
            small
            variant={sentTo.includes(f.userId) ? 'primary' : 'secondary'}
            title={sentTo.includes(f.userId) ? `Sent to ${f.username}` : f.username}
            disabled={sentTo.includes(f.userId)}
            onPress={() => share.mutate(f.userId, { onSuccess: () => setSentTo((s) => [...s, f.userId]) })}
          />
        ))}
      </Row>
      <ErrorText>{share.error ? errorText(share.error) : ''}</ErrorText>
    </>
  );
}
