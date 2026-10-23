import * as R from '@ringfall/rules';
import { router } from 'expo-router';
import { View } from 'react-native';

import { errorText } from '@/lib/api';
import { useNow } from '@/lib/clock';
import { clock, fmt } from '@/lib/format';
import { BUILDING_INFO, RESOURCE_ICONS, UNIT_ICONS, armyText, liveResources, useBase } from '@/lib/game';
import { colors } from '@/lib/theme';
import type { BaseView } from '@/lib/types';
import { Card, Countdown, Divider, ErrorText, Loading, ProgressBar, Row, Screen, SectionTitle, T, Tag } from '@/lib/ui';

const GROUPS: { title: string; types: R.BuildingType[] }[] = [
  { title: 'Economy', types: ['commandCenter', 'alloyExtractor', 'plasmaTap', 'relicDigSite', 'depot', 'vault', 'habitat'] },
  { title: 'Military', types: ['barracks', 'vehicleBay', 'hangar', 'titanForge'] },
  { title: 'Defence', types: ['sensorArray', 'repairBay', 'sentryTurret', 'railTurret', 'flakTurret', 'perimeterWall', 'shieldGenerator'] },
];

export default function BaseScreen() {
  const { data: base, error, refetch, isRefetching } = useBase();
  if (!base) return error ? <Screen><ErrorText>{errorText(error)}</ErrorText></Screen> : <Loading />;

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      <Header base={base} />
      <Resources base={base} />
      <Timers base={base} />
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

function Header({ base }: { base: BaseView }) {
  const now = useNow();
  return (
    <View style={{ gap: 4 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T muted mono size={13}>{base.coords} · {base.sectorName}</T>
        <T muted mono size={13}>⚑ {fmt(base.power)} power</T>
      </Row>
      {base.protectionUntil && base.protectionUntil > now ? (
        <T size={13} color={colors.accent}>🛡 Beginner protection: <Countdown at={base.protectionUntil} style={{ fontSize: 13, color: colors.accent }} /></T>
      ) : base.shieldUntil && base.shieldUntil > now ? (
        <T size={13} color={colors.accent}>🛡 Shield: <Countdown at={base.shieldUntil} style={{ fontSize: 13, color: colors.accent }} /></T>
      ) : null}
    </View>
  );
}

function Resources({ base }: { base: BaseView }) {
  const now = useNow();
  const live = liveResources(base, now);
  return (
    <Card>
      {R.RESOURCES.map((r) => {
        const full = live[r] >= base.caps[r];
        return (
          <Row key={r} style={{ justifyContent: 'space-between', minHeight: 30 }}>
            <T mono size={16} color={colors[r]}>{RESOURCE_ICONS[r]} {fmt(live[r])}<T mono faint size={13}> / {fmt(base.caps[r])}</T></T>
            <T mono size={13} color={full ? colors.warn : colors.muted}>{full ? 'FULL' : `+${fmt(base.rates[r])}/h`}</T>
          </Row>
        );
      })}
      {base.levels.vault > 0 && <T faint size={12} style={{ marginTop: 4 }}>🔒 Vault protects {fmt(base.protected.alloy)} of each</T>}
    </Card>
  );
}

function Timers({ base }: { base: BaseView }) {
  const now = useNow();
  const rows: React.ReactNode[] = [];
  for (const i of base.incoming) {
    rows.push(
      <Card key={i.id} tone="danger">
        <Row style={{ justifyContent: 'space-between' }}>
          <T bold color={colors.danger}>⚠ INCOMING · {i.attacker}</T>
          <Countdown at={i.arrivesAt} style={{ color: colors.danger }} />
        </Row>
        {i.units ? <T size={13} muted>{armyText(i.units)}</T> : i.approxCount ? <T size={13} muted>About {i.approxCount} troops</T> : null}
      </Card>,
    );
  }
  for (const b of base.builds) {
    rows.push(
      <Card key={b.id}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T>⚒ {R.BUILDINGS[b.type].name} → L{b.toLevel}</T>
          <Countdown at={b.endsAt} />
        </Row>
        <ProgressBar from={b.startedAt} to={b.endsAt} />
      </Card>,
    );
  }
  for (const t of base.training) {
    const next = t.startsAt + (t.done + 1) * t.unitMs;
    const started = now >= t.startsAt;
    rows.push(
      <Card key={t.id}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T>⚙ {UNIT_ICONS[t.unit]} {R.UNITS[t.unit].name} {t.done}/{t.qty}</T>
          {started ? <Countdown at={next} /> : <T muted mono size={13}>queued</T>}
        </Row>
        {started && <ProgressBar from={next - t.unitMs} to={next} />}
      </Card>,
    );
  }
  for (const a of base.armies) {
    const at = a.status === 'outbound' ? a.arrivesAt : a.returnsAt ?? now;
    rows.push(
      <Card key={a.id}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T numberOfLines={1} style={{ flex: 1 }}>
            {a.status === 'outbound' ? '➜' : '↩'} {a.mission === 'scout' ? 'Scouting' : 'Raid'} {a.status === 'outbound' ? '→' : '←'} {a.target}
          </T>
          <Countdown at={at} />
        </Row>
        <T faint size={12}>{a.status === 'outbound' ? `Arrives ${clock(a.arrivesAt, now)}` : `Home ${clock(at, now)}`}</T>
      </Card>,
    );
  }
  if (!rows.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <SectionTitle>Activity</SectionTitle>
      {rows}
    </View>
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
