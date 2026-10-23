import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView } from 'react-native';

import { api, errorText } from '@/lib/api';
import { clock } from '@/lib/format';
import { colors } from '@/lib/theme';
import { Card, ErrorText, Loading, Screen, T } from '@/lib/ui';

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
      <Card>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <T mono size={12} color={colors.text} style={{ lineHeight: 18 }}>{data.text}</T>
        </ScrollView>
      </Card>
    </Screen>
  );
}
