import { DarkTheme, type Theme } from 'expo-router';

export const colors = {
  bg: '#0A0E13',
  card: '#111821',
  cardRaised: '#16202B',
  border: '#1F2A36',
  text: '#E6EDF3',
  muted: '#8B98A5',
  faint: '#5C6773',
  accent: '#2DD4BF', // Oruun teal
  accentDim: '#0F3B37',
  danger: '#F87171',
  dangerDim: '#3A1A1C',
  warn: '#FBBF24',
  good: '#4ADE80',
  alloy: '#C5CDD6',
  plasma: '#60A5FA',
  relics: '#2DD4BF',
};

/** Numbers and timers use a monospaced face so they don't jitter as they tick. */
export const mono = 'SpaceMono';

export const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
};
