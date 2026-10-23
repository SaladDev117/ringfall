import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { API_URL, api, errorText } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { useBase } from '@/lib/game';
import { colors } from '@/lib/theme';
import { Button, Card, ErrorText, Field, Screen, SectionTitle, Spacer, T, confirm } from '@/lib/ui';

export default function SettingsScreen() {
  const user = useUser();
  const { data: base } = useBase();
  const qc = useQueryClient();
  const [name, setName] = useState(base?.name ?? '');
  const [password, setPassword] = useState('');
  const rename = useMutation({ mutationFn: () => api.rename(name.trim()), onSuccess: () => qc.invalidateQueries({ queryKey: ['base'] }) });
  const remove = useMutation({ mutationFn: () => api.deleteAccount(password) });

  const onDelete = async () => {
    const ok = await confirm('Delete your account?', 'Your commander, base, friends and messages are deleted for good.', 'Delete', true);
    if (ok) remove.mutate();
  };

  return (
    <Screen>
      <SectionTitle>Commander</SectionTitle>
      <Card>
        <T bold size={17}>{user?.username}</T>
        <T muted size={13}>Invite code {user?.inviteCode}</T>
      </Card>

      <SectionTitle>Base name</SectionTitle>
      <Field label="Name (3–24 characters)" value={name} onChangeText={setName} maxLength={24} autoCapitalize="words" />
      <ErrorText>{rename.error ? errorText(rename.error) : ''}</ErrorText>
      <Button title={rename.isSuccess ? 'Saved' : 'Rename base'} variant="secondary" onPress={() => rename.mutate()} disabled={name.trim().length < 3} loading={rename.isPending} />

      <Spacer />
      <Button title="Log out" variant="secondary" onPress={() => api.logout()} />

      <SectionTitle>Danger zone</SectionTitle>
      <Card tone="danger">
        <T size={13} color={colors.danger} style={{ marginBottom: 10 }}>Deleting your account can’t be undone.</T>
        <Field label="Confirm with your password" value={password} onChangeText={setPassword} secureTextEntry />
        <ErrorText>{remove.error ? errorText(remove.error) : ''}</ErrorText>
        <Button title="Delete account" variant="danger" onPress={onDelete} disabled={!password} loading={remove.isPending} />
      </Card>
      <T faint size={11} style={{ textAlign: 'center', marginTop: 12 }}>Server {API_URL}</T>
    </Screen>
  );
}
