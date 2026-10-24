import * as R from '@ringfall/rules';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { api, errorText } from '@/lib/api';
import { useNow } from '@/lib/clock';
import { duration, fmt } from '@/lib/format';
import { BUILDING_INFO, RESOURCE_ICONS, effectAt, liveResources, useBase } from '@/lib/game';
import { colors } from '@/lib/theme';
import { TutorialHint, onStep } from '@/lib/tutorial';
import { Button, Card, Countdown, Divider, ErrorText, Loading, ProgressBar, Row, Screen, SectionTitle, T, confirm } from '@/lib/ui';

const TRAINS_AT: Partial<Record<R.BuildingType, R.TrainingBuilding>> = {
  barracks: 'barracks', vehicleBay: 'vehicleBay', hangar: 'hangar', titanForge: 'titanForge',
};

export default function BuildingScreen() {
  const { type } = useLocalSearchParams<{ type: R.BuildingType }>();
  const { data: base } = useBase();
  const now = useNow();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['base'] });
  const upgrade = useMutation({ mutationFn: () => api.build(type), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: (id: string) => api.cancelBuild(id), onSuccess: refresh });

  if (!base || !(type in R.BUILDINGS)) return <Loading />;
  const def = R.BUILDINGS[type];
  const info = BUILDING_INFO[type];
  const level = base.levels[type];
  const next = level + 1;
  const job = base.builds.find((b) => b.type === type);
  const maxed = level >= def.maxLevel;
  const cost = maxed ? null : R.upgradeCost(type, next);
  const live = liveResources(base, now);
  const check = R.checkUpgrade(base.levels, type);
  const affordable = cost ? R.canAfford(live, cost) : false;
  const builderFree = base.builds.length < base.builderSlots;

  let blocker = '';
  if (!check.ok) blocker = check.reason === 'max_level' ? 'Max level reached.' : `Needs Command Center level ${R.requiredCC(type, next)}.`;
  else if (!affordable) blocker = 'Not enough resources yet.';
  else if (!builderFree && !job) blocker = 'All builders are busy.';

  const onCancel = async () => {
    if (job && (await confirm('Cancel upgrade?', 'You get all the resources back.', 'Cancel upgrade', true))) cancel.mutate(job.id);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: def.name }} />
      <Row>
        <T size={34}>{info.icon}</T>
        <View style={{ flex: 1 }}>
          <T size={22} bold>{def.name}</T>
          <T muted mono size={13}>{level ? `Level ${level}` : 'Not built'} · max {def.maxLevel}</T>
        </View>
      </Row>
      <T muted>{info.blurb}</T>
      {((type === 'commandCenter' && onStep(base, 'upgradeCommand')) || (type === 'alloyExtractor' && onStep(base, 'upgradeAlloy'))) && !job && (
        <TutorialHint>
          {blocker
            ? `${blocker} It’s on its way: come back when it finishes.`
            : 'Tap Upgrade below. Upgrades take time, and you can carry on with other things while the builders work.'}
        </TutorialHint>
      )}

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T muted size={13}>Now</T>
          <T mono size={13} style={{ flex: 1, textAlign: 'right' }}>{effectAt(type, level)}</T>
        </Row>
        {!maxed && (
          <Row style={{ justifyContent: 'space-between' }}>
            <T muted size={13}>Level {next}</T>
            <T mono size={13} color={colors.accent} style={{ flex: 1, textAlign: 'right' }}>{effectAt(type, next)}</T>
          </Row>
        )}
      </Card>

      {job ? (
        <Card tone="accent">
          <Row style={{ justifyContent: 'space-between' }}>
            <T>Upgrading to level {job.toLevel}</T>
            <Countdown at={job.endsAt} />
          </Row>
          <ProgressBar from={job.startedAt} to={job.endsAt} />
          <Button title="Cancel (full refund)" variant="danger" small onPress={onCancel} loading={cancel.isPending} style={{ marginTop: 12 }} />
        </Card>
      ) : cost ? (
        <>
          <SectionTitle>{level ? `Upgrade to level ${next}` : 'Build'}</SectionTitle>
          <Card>
            {R.RESOURCES.filter((r) => cost[r] > 0).map((r) => (
              <Row key={r} style={{ justifyContent: 'space-between', minHeight: 28 }}>
                <T mono color={colors[r]}>{RESOURCE_ICONS[r]} {fmt(cost[r])}</T>
                <T mono size={13} color={live[r] >= cost[r] ? colors.muted : colors.danger}>have {fmt(live[r])}</T>
              </Row>
            ))}
            <Divider />
            <Row style={{ justifyContent: 'space-between' }}>
              <T muted size={13}>Build time</T>
              <T mono size={13}>{duration(R.upgradeSeconds(type, next) * 1000)}</T>
            </Row>
          </Card>
          <ErrorText>{upgrade.error ? errorText(upgrade.error) : blocker}</ErrorText>
          <Button title={level ? `Upgrade to L${next}` : 'Build'} onPress={() => upgrade.mutate()} disabled={!!blocker} loading={upgrade.isPending} />
        </>
      ) : null}

      {TRAINS_AT[type] && level > 0 && (
        <Button
          title="Train units"
          variant="secondary"
          onPress={() => router.push({ pathname: '/train/[building]', params: { building: TRAINS_AT[type]! } })}
        />
      )}
    </Screen>
  );
}
