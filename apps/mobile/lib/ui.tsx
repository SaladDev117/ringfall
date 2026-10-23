import type { ReactNode } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNow } from './clock';
import { duration } from './format';
import { colors, mono } from './theme';

export function Screen({ children, refreshing, onRefresh, padded = true }: {
  children: ReactNode; refreshing?: boolean; onRefresh?: () => void; padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[padded && styles.screen, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent} /> : undefined}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'danger' | 'accent' }) {
  return (
    <View style={[styles.card, tone === 'danger' && styles.cardDanger, tone === 'accent' && styles.cardAccent, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{children}</Text>
      {right}
    </View>
  );
}

export function T({ children, style, muted, faint, mono: isMono, size, bold, color, numberOfLines, selectable }: {
  children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; faint?: boolean; mono?: boolean; size?: number;
  bold?: boolean; color?: string; numberOfLines?: number; selectable?: boolean;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      selectable={selectable}
      style={[
        styles.text,
        muted && { color: colors.muted },
        faint && { color: colors.faint },
        isMono && { fontFamily: mono },
        size !== undefined && { fontSize: size },
        bold && { fontWeight: '700' },
        color !== undefined && { color },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Row({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (!onPress) return <View style={[styles.row, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, style, pressed && { opacity: 0.6 }]}>
      {children}
    </Pressable>
  );
}

export const Spacer = ({ h = 12 }: { h?: number }) => <View style={{ height: h }} />;

export const Divider = () => <View style={styles.divider} />;

export function Button({ title, onPress, variant = 'primary', disabled, loading, small, style }: {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean;
  loading?: boolean; small?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        variant === 'primary' && { backgroundColor: colors.accent },
        variant === 'secondary' && { backgroundColor: colors.cardRaised, borderColor: colors.border, borderWidth: 1 },
        variant === 'danger' && { backgroundColor: colors.dangerDim, borderColor: colors.danger, borderWidth: 1 },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        off && { opacity: 0.45 },
        pressed && !off && { opacity: 0.75 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.bg : colors.text} />
      ) : (
        <Text style={[
          styles.buttonText,
          small && { fontSize: 13 },
          variant === 'primary' && { color: colors.bg },
          variant === 'danger' && { color: colors.danger },
          variant === 'ghost' && { color: colors.accent },
        ]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      <T muted size={13} style={{ marginBottom: 6 }}>{label}</T>
      <TextInput placeholderTextColor={colors.faint} style={[styles.input, style]} autoCapitalize="none" autoCorrect={false} {...rest} />
    </View>
  );
}

export function Tag({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' | 'danger' | 'warn' | 'good' }) {
  const color = { muted: colors.muted, accent: colors.accent, danger: colors.danger, warn: colors.warn, good: colors.good }[tone];
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <Text style={[styles.tagText, { color }]}>{children}</Text>
    </View>
  );
}

/** Time left until `at`, ticking every second. */
export function Countdown({ at, style, done = 'done' }: { at: number; style?: StyleProp<TextStyle>; done?: string }) {
  const now = useNow();
  const left = at - now;
  return <Text style={[styles.text, { fontFamily: mono }, style]}>{left > 0 ? duration(left) : done}</Text>;
}

export function ProgressBar({ from, to, color = colors.accent }: { from: number; to: number; color?: string }) {
  const now = useNow();
  const p = to > from ? Math.min(1, Math.max(0, (now - from) / (to - from))) : 1;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${p * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <T color={colors.danger} style={{ marginVertical: 8 }}>{children}</T>;
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 40 }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

/** A yes/no prompt that also works on the web build. */
export function confirm(title: string, message: string, ok = 'OK', destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? true);
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

export function Stepper({ value, onChange, max }: { value: number; onChange: (n: number) => void; max: number }) {
  const set = (n: number) => onChange(Math.max(0, Math.min(max, n)));
  return (
    <View style={styles.stepper}>
      <Button small variant="secondary" title="−" onPress={() => set(value - 1)} disabled={value <= 0} />
      <TextInput
        style={[styles.input, styles.stepperInput]}
        keyboardType="number-pad"
        value={String(value)}
        onChangeText={(t) => set(Number(t.replace(/\D/g, '')) || 0)}
      />
      <Button small variant="secondary" title="+" onPress={() => set(value + 1)} disabled={value >= max} />
      <Button small variant="ghost" title="Max" onPress={() => set(max)} disabled={max <= 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12 },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14 },
  cardDanger: { borderColor: colors.danger, backgroundColor: colors.dangerDim },
  cardAccent: { borderColor: colors.accent },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  section: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  text: { color: colors.text, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 8 },
  button: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  buttonSmall: { paddingVertical: 6, paddingHorizontal: 12, minHeight: 34 },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  input: {
    backgroundColor: colors.cardRaised, color: colors.text, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
  },
  tag: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  tagText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  progressTrack: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden', marginTop: 6 },
  progressFill: { height: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperInput: { width: 72, textAlign: 'center', fontFamily: mono, paddingVertical: 6 },
});
