import * as R from '@ringfall/rules';
import type { ReactNode } from 'react';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';
import type { BaseView } from './types';

/** The tutorial step the player is on, or null once it's finished or skipped. */
export function tutorialStep(base: BaseView | undefined): R.TutorialStep | null {
  const t = base?.tutorial;
  return t ? R.TUTORIAL[t.step] ?? null : null;
}

/** Whether the player is on `key` and hasn't done it yet: the moment to show a hint for it. */
export function onStep(base: BaseView | undefined, key: R.TutorialStepKey): boolean {
  return tutorialStep(base)?.key === key && !base?.tutorial?.done;
}

/** The building the tutorial points at in the 3D base right now. */
export function tutorialTarget(base: BaseView): R.BuildingType | null {
  if (onStep(base, 'upgradeCommand')) return 'commandCenter';
  if (onStep(base, 'trainTroopers')) return 'barracks';
  // The Alloy Extractor can't be upgraded until the Command Center's upgrade lands.
  if (onStep(base, 'upgradeAlloy') && !base.builds.some((b) => b.type === 'commandCenter')) return 'alloyExtractor';
  return null;
}

export const inviteMessage = (code: string) =>
  `Join me on Ringfall, the war for the Oruun Ring. Use my invite code ${code} when you sign up and you'll land right next to my base.`;

/**
 * Shares the invite code: the share sheet on phones, the browser's share sheet or the clipboard on the web.
 * Resolves to a line to show the player, or null if they backed out.
 */
export async function shareInvite(code: string): Promise<string | null> {
  const message = inviteMessage(code);
  if (Platform.OS === 'web') {
    const nav = globalThis.navigator as Navigator | undefined;
    if (nav?.share) {
      try {
        await nav.share({ text: message });
        return 'Invite shared.';
      } catch {
        return null;
      }
    }
    await nav?.clipboard?.writeText(message);
    return `Invite copied: paste it to a friend. Your code is ${code}.`;
  }
  const result = await Share.share({ message });
  return result.action === Share.dismissedAction ? null : 'Invite shared.';
}

/** A tutorial pointer inside a regular screen. */
export function TutorialHint({ children }: { children: ReactNode }) {
  return (
    <View style={styles.hint}>
      <Text style={styles.label}>★ TUTORIAL</Text>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { borderWidth: 1, borderColor: colors.warn, backgroundColor: 'rgba(251,191,36,0.08)', borderRadius: 12, padding: 12, gap: 4 },
  label: { color: colors.warn, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  text: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
