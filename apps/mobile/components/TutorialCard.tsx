import * as R from '@ringfall/rules';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, errorText } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { fmt } from '@/lib/format';
import { RESOURCE_ICONS } from '@/lib/game';
import { colors, mono } from '@/lib/theme';
import { shareInvite } from '@/lib/tutorial';
import type { BaseView, TutorialView } from '@/lib/types';
import { Countdown, confirm } from '@/lib/ui';

const rewardText = (r: R.Resources) =>
  R.RESOURCES.filter((k) => r[k] > 0).map((k) => `+${fmt(r[k])} ${RESOURCE_ICONS[k]}`).join('  ');

interface Action {
  label: string;
  run: () => void;
  /** A line above the button: what the player is waiting for, and how long. */
  status?: { text: string; at?: number };
}

/** The tutorial's objective card on the base screen: what to do, a button that does it or goes there, and the reward. */
export function TutorialCard({ base }: { base: BaseView }) {
  const qc = useQueryClient();
  const user = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [finished, setFinished] = useState<R.Resources | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['base'] });

  const claim = useMutation({
    mutationFn: (shared: boolean) => api.tutorialClaim(shared),
    onSuccess: (r) => {
      if (r.step >= R.TUTORIAL_DONE) setFinished(r.reward);
      else setNote(`Reward collected: ${rewardText(r.reward)}`);
      setCollapsed(false);
      refresh();
    },
  });
  const rush = useMutation({ mutationFn: api.tutorialRush, onSuccess: refresh });
  const skip = useMutation({ mutationFn: api.tutorialSkip, onSuccess: refresh });

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(id);
  }, [note]);

  if (finished) {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>★ TUTORIAL COMPLETE</Text>
        <Text style={styles.title}>You’re ready, Commander.</Text>
        {note && <Text style={styles.note}>{note}</Text>}
        <Text style={styles.body}>
          Final reward: {rewardText(finished)}. Keep upgrading, train a bigger army, and raid the Blight and your neighbours.
          Timers keep running while you’re away.
        </Text>
        <Pressable style={styles.button} onPress={() => setFinished(null)}>
          <Text style={styles.buttonText}>Let’s go</Text>
        </Pressable>
      </View>
    );
  }

  const view = base.tutorial;
  const step = view ? R.TUTORIAL[view.step] : null;
  if (!view || !step) return null;

  const onSkip = async () => {
    if (await confirm('Skip the tutorial?', 'You won’t get the rest of its rewards.', 'Skip', true)) skip.mutate();
  };
  const share = async () => {
    const said = await shareInvite(user?.inviteCode ?? '');
    if (!said) return;
    setNote(said);
    claim.mutate(true);
  };

  const action = view.done
    ? { label: `Claim reward  ${rewardText(step.reward)}`, run: () => claim.mutate(false) }
    : nextAction(base, view, step.key, () => rush.mutate(), share);
  const busy = claim.isPending || rush.isPending || skip.isPending;
  const error = claim.error ?? rush.error ?? skip.error;

  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={() => setCollapsed((c) => !c)} accessibilityLabel={collapsed ? 'Show tutorial' : 'Hide tutorial'}>
        <Text style={styles.label}>★ TUTORIAL · {view.step + 1} OF {R.TUTORIAL_DONE}</Text>
        <Text style={styles.chevron}>{collapsed ? '▴' : '▾'}</Text>
      </Pressable>
      <Text style={styles.title}>{view.done ? `✓ ${step.title}` : step.title}</Text>
      {!collapsed && (
        <>
          {note && <Text style={styles.note}>{note}</Text>}
          {!view.done && <Text style={styles.body}>{step.body}</Text>}
          {action.status && (
            <View style={styles.status}>
              <Text style={styles.statusText}>{action.status.text}</Text>
              {action.status.at && <Countdown at={action.status.at} style={styles.statusTime} />}
            </View>
          )}
          <Pressable style={[styles.button, view.done && styles.claim, busy && { opacity: 0.6 }]} onPress={action.run} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.buttonText}>{action.label}</Text>}
          </Pressable>
          {error && <Text style={styles.error}>{errorText(error)}</Text>}
          <View style={styles.footer}>
            {!view.done && <Text style={styles.reward}>Reward {rewardText(step.reward)}</Text>}
            <Pressable onPress={onSkip} hitSlop={8} style={{ marginLeft: 'auto' }}>
              <Text style={styles.skip}>Skip tutorial</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

/** What the card's button does on an unfinished step: usually go to the right screen, sometimes a free speed-up. */
function nextAction(base: BaseView, view: TutorialView, key: R.TutorialStepKey, rush: () => void, share: () => void): Action {
  const building = (type: R.BuildingType) => () => router.push({ pathname: '/building/[type]', params: { type } });
  switch (key) {
    case 'upgradeCommand':
      return { label: 'Show me', run: building('commandCenter') };
    case 'trainTroopers':
      return { label: 'Show me', run: () => router.push({ pathname: '/train/[building]', params: { building: 'barracks' } }) };
    case 'raidNest': {
      if (view.rush?.kind === 'training') {
        return { label: 'Finish training now · free', run: rush, status: { text: 'Troopers ready in', at: view.rush.at } };
      }
      const home = base.units.trooper ?? 0;
      if (!home) return { label: 'Show me', run: () => router.push({ pathname: '/train/[building]', params: { building: 'barracks' } }) };
      const nest = view.nest;
      if (!nest) return { label: 'Open the map', run: () => router.navigate('/map') };
      return {
        label: `Send Troopers to the ${nest.name}`,
        run: () => router.push({
          pathname: '/send',
          params: { kind: 'nest', id: nest.id, name: nest.name, x: String(nest.x), y: String(nest.y), level: String(nest.level), troopers: String(Math.min(10, home)) },
        }),
      };
    }
    case 'readReport': {
      if (view.rush?.kind === 'march') {
        return { label: 'Arrive now · free', run: rush, status: { text: 'Your army reaches the nest in', at: view.rush.at } };
      }
      if (view.reportId) {
        const id = view.reportId;
        return { label: '▶ Watch the battle', run: () => router.push({ pathname: '/report/[id]', params: { id } }) };
      }
      const marching = base.armies.find((a) => a.targetKind === 'nest' && a.status === 'outbound');
      if (marching) return { label: 'See your army', run: () => router.navigate('/army'), status: { text: 'Your army reaches the nest in', at: marching.arrivesAt } };
      return { label: 'Open reports', run: () => router.navigate('/reports') };
    }
    case 'upgradeAlloy': {
      const cc = base.builds.find((b) => b.type === 'commandCenter');
      return {
        label: 'Show me',
        run: building('alloyExtractor'),
        status: cc ? { text: 'Command Center reaches level 2 in', at: cc.endsAt } : undefined,
      };
    }
    case 'shareCode':
      return { label: 'Share my invite code', run: share };
  }
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12, backgroundColor: 'rgba(10,14,19,0.9)', borderRadius: 14, borderWidth: 1, borderColor: colors.warn,
    padding: 12, gap: 6,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: colors.warn, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  chevron: { color: colors.warn, fontSize: 14, paddingHorizontal: 4 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  note: { color: colors.good, fontSize: 13, fontFamily: mono },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { color: colors.text, fontSize: 13 },
  statusTime: { color: colors.warn, fontSize: 13 },
  button: { backgroundColor: colors.warn, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 2 },
  claim: { backgroundColor: colors.good },
  buttonText: { color: colors.bg, fontSize: 15, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reward: { color: colors.muted, fontSize: 12, fontFamily: mono },
  skip: { color: colors.faint, fontSize: 12 },
});
