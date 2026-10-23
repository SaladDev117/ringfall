import * as R from '@ringfall/rules';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { api, errorText } from '@/lib/api';
import { useNow } from '@/lib/clock';
import { clock, duration, fmt } from '@/lib/format';
import { UNIT_ICONS, useBase } from '@/lib/game';
import { colors } from '@/lib/theme';
import { Button, Card, Divider, ErrorText, Loading, Row, Screen, SectionTitle, Stepper, T } from '@/lib/ui';

export default function SendScreen() {
  const params = useLocalSearchParams<{
    kind: 'base' | 'nest'; id: string; name: string; x: string; y: string; level?: string; mission?: 'raid' | 'scout';
  }>();
  const { data: base } = useBase();
  const now = useNow();
  const qc = useQueryClient();
  const [mission, setMission] = useState<'raid' | 'scout'>(params.mission === 'scout' ? 'scout' : 'raid');
  const [picked, setPicked] = useState<R.Army>({});
  const launch = useMutation({
    mutationFn: () => api.launch({ kind: params.kind, id: params.id }, mission, picked),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['base'] });
      router.navigate('/army');
    },
  });

  const odds = useNestOdds(params.kind === 'nest' ? Number(params.level) : 0, picked);

  if (!base) return <Loading />;
  const target = { x: Number(params.x), y: Number(params.y) };
  const available = R.UNIT_KEYS.filter((k) => (base.units[k] ?? 0) > 0 && (mission === 'raid' || k === 'wisp'));
  const army: R.Army = Object.fromEntries(available.filter((k) => picked[k]).map((k) => [k, picked[k]]));
  const size = R.armySize(army);
  const travel = size ? R.travelSeconds(base, target, army) * 1000 : 0;
  const isNest = params.kind === 'nest';

  const setUnit = (k: R.UnitKey, n: number) => setPicked((p) => ({ ...p, [k]: n }));
  const all = () => setPicked(Object.fromEntries(available.map((k) => [k, base.units[k] ?? 0])));

  return (
    <Screen>
      <Stack.Screen options={{ title: params.name }} />
      <Card>
        <T bold size={17}>{isNest ? '✶' : '●'} {params.name}</T>
        <T mono faint size={12}>{R.formatCoords(target)} · {R.distance(base, target).toFixed(1)} tiles away</T>
        {isNest && <T muted size={13} style={{ marginTop: 6 }}>Blight Nests only give up their loot when you clear them completely.</T>}
      </Card>

      {!isNest && (
        <Row style={{ gap: 8 }}>
          <Button title="⚔ Raid" style={{ flex: 1 }} variant={mission === 'raid' ? 'primary' : 'secondary'} onPress={() => setMission('raid')} />
          <Button title="🛰 Scout" style={{ flex: 1 }} variant={mission === 'scout' ? 'primary' : 'secondary'} onPress={() => setMission('scout')} />
        </Row>
      )}

      <SectionTitle right={<Button small variant="ghost" title="Send all" onPress={all} disabled={!available.length} />}>Pick units</SectionTitle>
      <Card>
        {available.length === 0 && (
          <T muted>{mission === 'scout' ? 'You need Wisp Drones (Barracks, needs a Sensor Array).' : 'Nobody at home to send.'}</T>
        )}
        {available.map((k, i) => (
          <View key={k}>
            {i > 0 && <Divider />}
            <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <T>{UNIT_ICONS[k]} {R.UNITS[k].name} <T faint size={12}>/{base.units[k]}</T></T>
              <Stepper value={Math.min(picked[k] ?? 0, base.units[k] ?? 0)} max={base.units[k] ?? 0} onChange={(n) => setUnit(k, n)} />
            </Row>
          </View>
        ))}
      </Card>

      {size > 0 && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <T muted size={13}>Travel time</T>
            <T mono>{duration(travel)}</T>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <T muted size={13}>Arrives</T>
            <T mono>{clock(now + travel, now)}</T>
          </Row>
          {mission === 'raid' && (
            <Row style={{ justifyContent: 'space-between' }}>
              <T muted size={13}>Can carry home</T>
              <T mono>{fmt(R.armyCarry(army))}</T>
            </Row>
          )}
          {odds !== null && (
            <Row style={{ justifyContent: 'space-between' }}>
              <T muted size={13}>Estimated win chance</T>
              <T mono color={odds >= 0.8 ? colors.good : odds >= 0.4 ? colors.warn : colors.danger}>{Math.round(odds * 100)}%</T>
            </Row>
          )}
          <T faint size={12} style={{ marginTop: 4 }}>The slowest unit sets the pace: {fmt(R.slowestSpeed(army))} tiles/hour.</T>
        </Card>
      )}

      <ErrorText>{launch.error ? errorText(launch.error) : ''}</ErrorText>
      <Button
        title={mission === 'scout' ? `Send ${size} Wisp${size === 1 ? '' : 's'}` : `Launch ${fmt(size)} unit${size === 1 ? '' : 's'}`}
        onPress={() => launch.mutate()}
        disabled={size === 0}
        loading={launch.isPending}
      />
      {base.armies.length >= base.maxArmiesOut && (
        <T color={colors.warn} size={13}>All {base.maxArmiesOut} army slots are in use. Wait for one to come home.</T>
      )}
    </Screen>
  );
}

/** Simulates the raid against a full-strength nest a few dozen times, using the same rules as the server. */
function useNestOdds(level: number, army: R.Army): number | null {
  const key = JSON.stringify(army);
  return useMemo(() => {
    const attackers = JSON.parse(key) as R.Army;
    if (!level || R.armySize(attackers) === 0) return null;
    const garrison = R.nestGarrison(level);
    let wins = 0;
    const runs = 40;
    for (let i = 0; i < runs; i++) {
      if (R.simulateBattle({ attacker: attackers, defender: garrison, seed: `odds-${i}` }).outcome === 'attacker') wins++;
    }
    return wins / runs;
  }, [level, key]);
}
