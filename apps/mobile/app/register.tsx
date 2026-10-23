import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { api, errorText } from '@/lib/api';
import { Button, Card, ErrorText, Field, Screen, T } from '@/lib/ui';

export default function RegisterScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(params.code ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.register(username.trim(), password, inviteCode.trim());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Field label="Commander name (3–16 letters, digits or _)" value={username} onChangeText={setUsername} maxLength={16} />
      <Field label="Password (8+ characters)" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" />
      <Field
        label="Friend’s invite code (optional, puts you next to them)"
        value={inviteCode}
        onChangeText={setInviteCode}
        autoCapitalize="characters"
        placeholder="RF-XXXXX"
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Land on the Ring" onPress={submit} loading={busy} disabled={username.length < 3 || password.length < 8} />
      <Card style={{ marginTop: 16 }}>
        <T muted size={13}>
          There’s no email on your account yet, so keep your password safe: a forgotten password can’t be reset.
        </T>
      </Card>
    </Screen>
  );
}
