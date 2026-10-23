import * as R from '@ringfall/rules';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';

import { api, errorText } from '@/lib/api';
import { useNow } from '@/lib/clock';
import { clock, fmt } from '@/lib/format';
import { RESOURCE_ICONS, UNIT_ICONS, armyText, useBase } from '@/lib/game';
import { colors } from '@/lib/theme';
import type { ArmyView } from '@/lib/types';
import { Button, Card, Countdown, Divider, ErrorText, Loading, ProgressBar, Row, Screen, SectionTitle, T, Tag, confirm } from '@/lib/ui';

export default function ArmyScreen() {
  const { data: base, refetch, isRefetching, error } = useBase();
  if (!base) return error ? <Screen><ErrorText>{errorText(error)}</ErrorText></Screen> : <Loading />;
  const home = R.UNIT_KEYS.filter((k) => base.units[k]);

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      {base.incoming.map((i) => (
        <Card key={i.id} tone="danger">
          <Row style={{ justifyContent: 'space-between' }}>
            <T bold color={colors.danger}>⚠ {i.attacker} is attacking!</T>
            <Countdown at={i.arrivesAt} style={{ color: colors.danger }} />
          </Row>
          <T size={13} muted>
            {i.units ? armyText(i.units) : i.approxCount ? `About ${i.approxCount} troops` : 'Upgrade your Sensor Array to see what’s coming.'}
          </T>
          <T size={12} faint style={{ marginTop: 6 }}>Train more units, or send yours away so they aren’t caught.</T>
        </Card>
      ))}

      <SectionTitle right={<T mono muted size={12}>supply {fmt(base.supply.used)}/{fmt(base.supply.cap)}</T>}>At home</SectionTitle>
      <Card>
        {home.length === 0 && <T muted>Nobody’s home. Train units at the Barracks.</T>}
        {home.map((k, i) => (
          <View key={k}>
            {i > 0 && <Divider />}
            <Row style={{ justifyContent: 'space-between' }}>
              <T>{UNIT_ICONS[k]} {R.UNITS[k].name}</T>
              <T mono>{fmt(base.units[k]!)}</T>
            </Row>
          </View>
        ))}
      </Card>
      <Row style={{ gap: 8 }}>
        <Button title="Train" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/train/[building]', params: { building: 'barracks' } })} />
        <Button title="Find a target" style={{ flex: 1 }} onPress={() => router.navigate('/map')} />
      </Row>

      <SectionTitle right={<T mono muted size={12}>{base.armies.length}/{base.maxArmiesOut}</T>}>Armies out</SectionTitle>
      {base.armies.length === 0 && <T muted>No armies in the field.</T>}
      {base.armies.map((a) => <ArmyCard key={a.id} army={a} />)}
    </Screen>
  );
}

function ArmyCard({ army }: { army: ArmyView }) {
  const now = useNow();
  const qc = useQueryClient();
  const recall = useMutation({ mutationFn: () => api.recall(army.id), onSuccess: () => qc.invalidateQueries({ queryKey: ['base'] }) });
  const outbound = army.status === 'outbound';
  const at = outbound ? army.arrivesAt : army.returnsAt ?? now;
  const loot = R.RESOURCES.filter((r) => army.loot[r] > 0);
  const onRecall = async () => {
    if (await confirm('Recall army?', 'It turns around now and takes as long to get home as it has travelled.', 'Recall')) recall.mutate();
  };
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <T bold numberOfLines={1}>{army.target}</T>
          <T mono faint size={12}>{army.targetCoords}</T>
        </View>
        <Tag tone={outbound ? 'warn' : 'good'}>{outbound ? (army.mission === 'scout' ? 'scouting' : 'attacking') : 'returning'}</Tag>
      </Row>
      <T size={13} muted style={{ marginTop: 6 }}>{armyText(army.units)}</T>
      {loot.length > 0 && (
        <T mono size={13} style={{ marginTop: 4 }}>
          {loot.map((r) => `${RESOURCE_ICONS[r]} ${fmt(army.loot[r])}`).join('  ')}
        </T>
      )}
      <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <T size={12} faint>{outbound ? 'Arrives' : 'Home'} {clock(at, now)}</T>
        <Countdown at={at} />
      </Row>
      <ProgressBar from={outbound ? army.departsAt : army.arrivesAt} to={at} color={outbound ? colors.warn : colors.good} />
      {outbound && army.arrivesAt > now && (
        <Button small variant="ghost" title="Recall" onPress={onRecall} loading={recall.isPending} style={{ alignSelf: 'flex-end', marginTop: 6 }} />
      )}
      <ErrorText>{recall.error ? errorText(recall.error) : ''}</ErrorText>
    </Card>
  );
}
