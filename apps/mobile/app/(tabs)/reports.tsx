import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';

import { api, errorText } from '@/lib/api';
import { useNow } from '@/lib/clock';
import { ago } from '@/lib/format';
import { colors } from '@/lib/theme';
import type { ReportSummary } from '@/lib/types';
import { Card, ErrorText, Loading, Row, Screen, T } from '@/lib/ui';

const ICON: Record<ReportSummary['kind'], string> = { raid: '⚔', scout: '🛰', nest: '✶' };

function tone(r: ReportSummary): string {
  if (r.outcome === 'draw' || r.outcome === 'bounced') return colors.warn;
  if (r.kind === 'scout') return r.outcome === 'success' === (r.side === 'attacker') ? colors.good : colors.danger;
  return (r.outcome === 'attacker') === (r.side === 'attacker') ? colors.good : colors.danger;
}

export default function ReportsScreen() {
  const now = useNow();
  const { data, error, refetch, isRefetching } = useQuery({ queryKey: ['reports'], queryFn: api.reports, refetchInterval: 30_000 });
  if (!data) return error ? <Screen><ErrorText>{errorText(error)}</ErrorText></Screen> : <Loading />;
  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      {data.length === 0 && <T muted>No reports yet. Raid a Blight Nest to get your first one.</T>}
      {data.map((r) => (
        <Card key={r.id}>
          <Row onPress={() => router.push({ pathname: '/report/[id]', params: { id: r.id } })}>
            <T size={20} color={tone(r)}>{ICON[r.kind]}</T>
            <View style={{ flex: 1 }}>
              <T bold={!r.seen} numberOfLines={2}>{r.title}</T>
              <T faint size={12}>{ago(r.at, now)}</T>
            </View>
            {!r.seen && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
