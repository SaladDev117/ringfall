import * as R from '@ringfall/rules';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BaseScene from '@/components/three/BaseScene';
import { TutorialCard } from '@/components/TutorialCard';
import { errorText } from '@/lib/api';
import { clockOffset, useNow } from '@/lib/clock';
import { fmt } from '@/lib/format';
import { RESOURCE_ICONS, UNIT_ICONS, liveResources, useBase } from '@/lib/game';
import { colors, mono } from '@/lib/theme';
import { tutorialTarget } from '@/lib/tutorial';
import type { BaseView } from '@/lib/types';
import { Countdown, ErrorText, Loading, Screen } from '@/lib/ui';

export default function BaseScreen() {
  const { data: base, error } = useBase();
  if (!base) return error ? <Screen><ErrorText>{errorText(error)}</ErrorText></Screen> : <Loading />;

  const shieldUntil = Math.max(base.shieldUntil ?? 0, base.protectionUntil ?? 0) || null;
  const incomingAt = base.incoming.length ? Math.min(...base.incoming.map((i) => i.arrivesAt)) : null;

  return (
    <View style={styles.fill}>
      <BaseScene
        dom={{ style: { flex: 1 } }}
        levels={base.levels}
        builds={base.builds}
        units={base.units}
        shieldUntil={shieldUntil}
        incomingAt={incomingAt}
        clockOffset={clockOffset()}
        seed={base.id}
        onSelectBuilding={(type) => router.push({ pathname: '/building/[type]', params: { type } })}
        onSelectArmy={() => router.navigate('/army')}
        highlight={tutorialTarget(base)}
      />
      <Hud base={base} />
      <View pointerEvents="box-none" style={styles.bottom}>
        <TutorialCard base={base} />
        <Activity base={base} />
      </View>
    </View>
  );
}

function Hud({ base }: { base: BaseView }) {
  const insets = useSafeAreaInsets();
  const now = useNow();
  const live = liveResources(base, now);
  const protectedUntil = base.protectionUntil && base.protectionUntil > now ? base.protectionUntil : null;
  const shield = base.shieldUntil && base.shieldUntil > now ? base.shieldUntil : null;
  return (
    <View pointerEvents="box-none" style={[styles.hud, { paddingTop: insets.top + 8 }]}>
      <View style={styles.hudRow} pointerEvents="box-none">
        <View style={styles.title}>
          <Text style={styles.name} numberOfLines={1}>{base.name}</Text>
          <Text style={styles.sub}>{base.sectorName} · ⚑ {fmt(base.power)}</Text>
        </View>
        <Pressable accessibilityLabel="All buildings" onPress={() => router.push('/buildings')} style={styles.iconBtn}>
          <Text style={styles.iconText}>☰</Text>
        </Pressable>
        <Pressable accessibilityLabel="Settings" onPress={() => router.push('/settings')} style={styles.iconBtn}>
          <Text style={styles.iconText}>⚙</Text>
        </Pressable>
      </View>
      <View style={styles.resources}>
        {R.RESOURCES.map((r) => {
          const full = live[r] >= base.caps[r];
          return (
            <View key={r} style={styles.res}>
              <Text style={[styles.resValue, { color: colors[r] }]}>{RESOURCE_ICONS[r]} {fmt(live[r])}</Text>
              <Text style={[styles.resRate, full && { color: colors.warn }]}>{full ? 'FULL' : `+${fmt(base.rates[r])}/h`}</Text>
            </View>
          );
        })}
      </View>
      {(protectedUntil || shield) && (
        <View style={styles.shieldPill}>
          <Text style={styles.shieldText}>🛡 {protectedUntil ? 'Protected' : 'Shield'} </Text>
          <Countdown at={(protectedUntil ?? shield)!} style={styles.shieldText} />
        </View>
      )}
    </View>
  );
}

/** Everything ticking: incoming attacks, construction, training and armies, as tappable chips. */
function Activity({ base }: { base: BaseView }) {
  const now = useNow();
  const chips: { key: string; text: string; at: number; tone?: 'danger'; go: () => void }[] = [];
  for (const i of base.incoming) chips.push({ key: i.id, text: `⚠ ${i.attacker}`, at: i.arrivesAt, tone: 'danger', go: () => router.navigate('/army') });
  for (const b of base.builds) {
    chips.push({ key: b.id, text: `⚒ ${R.BUILDINGS[b.type].name} L${b.toLevel}`, at: b.endsAt, go: () => router.push({ pathname: '/building/[type]', params: { type: b.type } }) });
  }
  for (const t of base.training) {
    if (now < t.startsAt) continue;
    chips.push({
      key: t.id, text: `${UNIT_ICONS[t.unit]} ${t.done}/${t.qty}`, at: t.startsAt + (t.done + 1) * t.unitMs,
      go: () => router.push({ pathname: '/train/[building]', params: { building: t.building } }),
    });
  }
  for (const a of base.armies) {
    chips.push({
      key: a.id, text: `${a.status === 'outbound' ? '➜' : '↩'} ${a.target}`, at: a.status === 'outbound' ? a.arrivesAt : a.returnsAt ?? now,
      go: () => router.navigate('/army'),
    });
  }
  if (!chips.length) return null;
  return (
    <View pointerEvents="box-none">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
        {chips.map((c) => (
          <Pressable key={c.key} onPress={c.go} style={[styles.chip, c.tone === 'danger' && styles.chipDanger]}>
            <Text style={[styles.chipText, c.tone === 'danger' && { color: colors.danger }]} numberOfLines={1}>{c.text}</Text>
            <Countdown at={c.at} style={[styles.chipTime, c.tone === 'danger' && { color: colors.danger }]} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const glass = 'rgba(10,14,19,0.72)';

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  hud: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, gap: 8 },
  hudRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, backgroundColor: glass, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  name: { color: colors.text, fontSize: 16, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 11, fontFamily: mono },
  iconBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: glass, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: colors.text, fontSize: 20 },
  resources: { flexDirection: 'row', gap: 6 },
  res: { flex: 1, backgroundColor: glass, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8 },
  resValue: { fontFamily: mono, fontSize: 14 },
  resRate: { color: colors.muted, fontFamily: mono, fontSize: 10 },
  shieldPill: {
    flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: 'rgba(15,59,55,0.85)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.accent,
  },
  shieldText: { color: colors.accent, fontSize: 12, fontFamily: mono },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 10, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: glass, borderRadius: 18, paddingHorizontal: 12,
    paddingVertical: 8, borderWidth: 1, borderColor: colors.border, maxWidth: 240,
  },
  chipDanger: { borderColor: colors.danger, backgroundColor: 'rgba(58,26,28,0.9)' },
  chipText: { color: colors.text, fontSize: 13, flexShrink: 1 },
  chipTime: { color: colors.accent, fontSize: 12 },
});
