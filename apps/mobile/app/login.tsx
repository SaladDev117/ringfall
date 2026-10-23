import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { api, errorText } from '@/lib/api';
import { colors, mono } from '@/lib/theme';
import { Button, ErrorText, Field, Screen, Spacer, T } from '@/lib/ui';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.login(username.trim(), password);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={styles.hero}>
          <T style={styles.logo}>RINGFALL</T>
          <T muted style={{ textAlign: 'center' }}>The Oruun built the Ring and vanished.{'\n'}Now it’s yours to take.</T>
        </View>
        <Field label="Username" value={username} onChangeText={setUsername} textContentType="username" autoComplete="username" />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          autoComplete="password"
          onSubmitEditing={submit}
        />
        <ErrorText>{error}</ErrorText>
        <Button title="Log in" onPress={submit} loading={busy} disabled={!username || !password} />
        <Spacer h={20} />
        <Link href="/register" style={styles.link}>New commander? Create an account</Link>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 60, marginBottom: 36, gap: 10 },
  logo: { fontFamily: mono, fontSize: 40, letterSpacing: 6, color: colors.accent },
  link: { color: colors.accent, textAlign: 'center', fontSize: 15 },
});
