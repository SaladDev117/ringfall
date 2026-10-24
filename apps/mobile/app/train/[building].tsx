import * as R from '@ringfall/rules';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import UnitShowcase from '@/components/three/UnitShowcase';
import { api, errorText } from '@/lib/api';
import { useNow } from '@/lib/clock';
import { clock, duration, fmt } from '@/lib/format';
import { RESOURCE_ICONS, UNIT_ICONS, liveResources, useBase } from '@/lib/game';
import { colors } from '@/lib/theme';
import { TutorialHint, onStep } from '@/lib/tutorial';
import type { BaseView } from '@/lib/types';
import { Button, Card, Countdown, ErrorText, Loading, ProgressBar, Row, Screen, SectionTitle, Stepper, T, Tag, confirm } from '@/lib/ui';

export default function TrainScreen() {
  const { building } = useLocalSearchParams<{ building: R.TrainingBuilding }>();
  const { data: base } = useBase();
  const units = R.UNIT_KEYS.filter((k) => R.UNITS[k].trainedAt === building);
  const [picked, setSelected] = useState<R.UnitKey | null>(null);
  if (!base) return <Loading />;
  // Show the first unit this base can train (the Barracks lists the locked Wisp Drone first).
  const trainable = units.find((u) => Object.entries(R.UNITS[u].requires).every(([b, l]) => base.levels[b as R.BuildingType] >= (l as number)));
  const selected = picked ?? trainable ?? units[0] ?? 'trooper';
  const queue = base.training.filter((t) => t.building === building);
  const buildingName = R.BUILDINGS[building]?.name ?? 'Train';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: buildingName }} />
      {/* Pinned above the list, so the model stays in view whichever unit card is tapped. */}
      <View style={{ height: 230, margin: 16, marginBottom: 0, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
        <UnitShowcase dom={{ style: { flex: 1 } }} unit={selected} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 12, bottom: 10 }}>
          <T bold size={18}>{UNIT_ICONS[selected]} {R.UNITS[selected].name}</T>
          <T muted size={12}>{R.UNITS[selected].class} · drag to spin</T>
        </View>
      </View>
      <Screen>
        <Row style={{ justifyContent: 'space-between' }}>
          <T muted size={13}>Supply</T>
          <T mono size={13} color={base.supply.used >= base.supply.cap ? colors.warn : colors.muted}>
            {fmt(base.supply.used)} / {fmt(base.supply.cap)}
          </T>
        </Row>
        {queue.length > 0 && (
          <>
            <SectionTitle>Queue</SectionTitle>
            {queue.map((job) => <QueueItem key={job.id} job={job} />)}
          </>
        )}
        {building === 'barracks' && onStep(base, 'trainTroopers') && (
          <TutorialHint>Train 5 Troopers: the amount is already set, so tap Train. They come out one at a time, 3 minutes apart.</TutorialHint>
        )}
        <SectionTitle>Units</SectionTitle>
        {units.map((u) => (
          <Pressable key={u} onPress={() => setSelected(u)}>
            <UnitCard base={base} unit={u} selected={u === selected} suggested={u === 'trooper' && onStep(base, 'trainTroopers') ? 5 : 1} />
          </Pressable>
        ))}
      </Screen>
    </View>
  );
}

function QueueItem({ job }: { job: R.TrainJob }) {
  const now = useNow();
  const qc = useQueryClient();
  const cancel = useMutation({ mutationFn: () => api.cancelTraining(job.id), onSuccess: () => qc.invalidateQueries({ queryKey: ['base'] }) });
  const started = now >= job.startsAt;
  const next = job.startsAt + (job.done + 1) * job.unitMs;
  const end = R.jobEndsAt(job);
  const onCancel = async () => {
    const ok = await confirm('Cancel training?', 'Units not started are refunded in full, the one in progress at half.', 'Cancel batch', true);
    if (ok) cancel.mutate();
  };
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <T>{UNIT_ICONS[job.unit]} {R.UNITS[job.unit].name} · {job.done}/{job.qty}</T>
        {started ? <Countdown at={next} /> : <T muted mono size={13}>starts {clock(job.startsAt, now)}</T>}
      </Row>
      {started && <ProgressBar from={next - job.unitMs} to={next} />}
      <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <T faint size={12}>All done {clock(end, now)}</T>
        <Button small variant="ghost" title="Cancel" onPress={onCancel} loading={cancel.isPending} />
      </Row>
    </Card>
  );
}

function UnitCard({ base, unit, selected, suggested }: { base: BaseView; unit: R.UnitKey; selected: boolean; suggested: number }) {
  const now = useNow();
  const qc = useQueryClient();
  const [qty, setQty] = useState(suggested);
  const train = useMutation({
    mutationFn: () => api.train(unit, qty),
    onSuccess: () => {
      setQty(1);
      qc.invalidateQueries({ queryKey: ['base'] });
    },
  });
  const def: R.UnitDef = R.UNITS[unit];
  const missing = Object.entries(def.requires).find(([b, l]) => base.levels[b as R.BuildingType] < (l as number));
  const live = liveResources(base, now);
  const byCost = Math.min(...R.RESOURCES.filter((r) => def.cost[r] > 0).map((r) => Math.floor(live[r] / def.cost[r])));
  const bySupply = Math.floor((base.supply.cap - base.supply.used) / def.supply);
  let max = Math.max(0, Math.min(byCost, bySupply, 10_000));
  if (unit === 'titan') {
    const owned = (base.units.titan ?? 0) + (base.unitsAway.titan ?? 0) + base.training.filter((t) => t.unit === 'titan').reduce((n, t) => n + t.qty - t.done, 0);
    max = Math.min(max, Math.max(0, R.titanCap(base.levels.titanForge) - owned));
  }
  const seconds = R.trainSeconds(unit, base.levels[def.trainedAt]);
  const atHome = base.units[unit] ?? 0;

  return (
    <Card tone={selected ? 'accent' : undefined}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={17} bold>{UNIT_ICONS[unit]} {def.name}</T>
        <Tag>{def.class}</Tag>
      </Row>
      <T mono faint size={12} style={{ marginTop: 4 }}>
        ATK {def.atk} · HP {def.hp} · SPD {def.speed} · CARRY {def.carry} · SUP {def.supply}
      </T>
      <Row style={{ flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
        {R.RESOURCES.filter((r) => def.cost[r] > 0).map((r) => (
          <T key={r} mono size={13} color={live[r] >= def.cost[r] ? colors[r] : colors.danger}>{RESOURCE_ICONS[r]} {fmt(def.cost[r])}</T>
        ))}
        <T mono size={13} muted>⏱ {duration(seconds * 1000)}</T>
        {atHome > 0 && <T mono size={13} muted>· {atHome} home</T>}
      </Row>
      {missing ? (
        <T faint size={13} style={{ marginTop: 8 }}>Needs {R.BUILDINGS[missing[0] as R.BuildingType].name} level {missing[1] as number}</T>
      ) : (
        <View style={{ marginTop: 10, gap: 8 }}>
          <Stepper value={Math.min(qty, max)} onChange={setQty} max={max} />
          {qty > 0 && max > 0 && <T faint size={12}>{qty} × {duration(seconds * 1000)} = {duration(qty * seconds * 1000)}</T>}
          <ErrorText>{train.error ? errorText(train.error) : ''}</ErrorText>
          <Button title={max > 0 ? `Train ${Math.min(qty, max)}` : bySupply <= 0 ? 'No supply left' : 'Not enough resources'} onPress={() => train.mutate()} disabled={max <= 0 || qty <= 0} loading={train.isPending} />
        </View>
      )}
    </Card>
  );
}
