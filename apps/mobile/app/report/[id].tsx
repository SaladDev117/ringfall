import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { api, errorText } from '@/lib/api';
import { clock } from '@/lib/format';
import { colors } from '@/lib/theme';
import { Button, Card, ErrorText, Loading, Row, Screen, SectionTitle, T } from '@/lib/ui';

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ['report', id], queryFn: () => api.report(id) });

  // Opening a report marks it read.
  useEffect(() => {
    if (data) {
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.invalidateQueries({ queryKey: ['base'] });
    }
  }, [data, qc]);

  if (!data) return error ? <Screen><ErrorText>{errorText(error)}</ErrorText></Screen> : <Loading />;
  return (
    <Screen>
      <Stack.Screen options={{ title: data.kind === 'scout' ? 'Scout report' : 'Battle report' }} />
      <T bold size={18}>{data.title}</T>
      <T faint size={12}>{clock(data.at)}</T>
      {data.shared && <T muted size={13}>Shared with you by a friend.</T>}
      <Card>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <T mono size={12} color={colors.text} style={{ lineHeight: 18 }}>{data.text}</T>
        </ScrollView>
      </Card>
      {!data.shared && <ShareWithFriend reportId={data.id} />}
    </Screen>
  );
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
