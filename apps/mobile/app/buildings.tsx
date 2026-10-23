import * as R from '@ringfall/rules';
import { router } from 'expo-router';
import { View } from 'react-native';

import { useNow } from '@/lib/clock';
import { BUILDING_INFO, liveResources, useBase } from '@/lib/game';
import { colors } from '@/lib/theme';
import type { BaseView } from '@/lib/types';
import { Card, Countdown, Divider, Loading, Row, Screen, SectionTitle, T, Tag } from '@/lib/ui';

const GROUPS: { title: string; types: R.BuildingType[] }[] = [
  { title: 'Economy', types: ['commandCenter', 'alloyExtractor', 'plasmaTap', 'relicDigSite', 'depot', 'vault', 'habitat'] },
  { title: 'Military', types: ['barracks', 'vehicleBay', 'hangar', 'titanForge'] },
  { title: 'Defence', types: ['sensorArray', 'repairBay', 'sentryTurret', 'railTurret', 'flakTurret', 'perimeterWall', 'shieldGenerator'] },
];

/** Every building as a list: the quick way to find one, including those not on the map yet. */
export default function BuildingsScreen() {
  const { data: base } = useBase();
  if (!base) return <Loading />;
  return (
    <Screen>
      {GROUPS.map((g) => (
        <View key={g.title} style={{ gap: 8 }}>
          <SectionTitle>{g.title}</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {g.types.map((type, i) => (
              <View key={type}>
                {i > 0 && <Divider />}
                <BuildingRow base={base} type={type} />
              </View>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

function BuildingRow({ base, type }: { base: BaseView; type: R.BuildingType }) {
  const now = useNow();
  const level = base.levels[type];
  const def = R.BUILDINGS[type];
  const job = base.builds.find((b) => b.type === type);
  const next = level + 1;
  const locked = level === 0 && base.levels.commandCenter < def.unlockCC;
  let status: React.ReactNode;
  if (job) status = <Countdown at={job.endsAt} style={{ color: colors.accent, fontSize: 13 }} />;
  else if (locked) status = <Tag>CC {def.unlockCC}</Tag>;
  else if (level >= def.maxLevel) status = <Tag tone="good">Max</Tag>;
  else {
    const check = R.checkUpgrade(base.levels, type);
    const affordable = R.canAfford(liveResources(base, now), R.upgradeCost(type, next));
    const builderFree = base.builds.length < base.builderSlots;
    status = check.ok && affordable && builderFree
      ? <Tag tone="accent">{level === 0 ? 'Build' : 'Upgrade'}</Tag>
      : null;
  }
  return (
    <Row onPress={() => router.push({ pathname: '/building/[type]', params: { type } })} style={{ minHeight: 44 }}>
      <T size={18} style={{ width: 28, textAlign: 'center' }}>{BUILDING_INFO[type].icon}</T>
      <T style={{ flex: 1 }} color={locked ? colors.faint : colors.text}>{def.name}</T>
      <T mono muted size={13} style={{ width: 40, textAlign: 'right' }}>{level ? `L${level}` : '—'}</T>
      <View style={{ width: 82, alignItems: 'flex-end' }}>{status}</View>
    </Row>
  );
}
