import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { api, errorText } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { useNow } from '@/lib/clock';
import { ago, fmt } from '@/lib/format';
import { colors, mono } from '@/lib/theme';
import type { ConversationView, FriendView } from '@/lib/types';
import { Button, Card, Divider, ErrorText, Field, Loading, Row, Screen, SectionTitle, T } from '@/lib/ui';

export default function SocialScreen() {
  const qc = useQueryClient();
  const friends = useQuery({ queryKey: ['friends'], queryFn: api.friends, refetchInterval: 30_000 });
  const convos = useQuery({ queryKey: ['conversations'], queryFn: api.conversations, refetchInterval: 15_000 });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['friends'] });
    qc.invalidateQueries({ queryKey: ['conversations'] });
    qc.invalidateQueries({ queryKey: ['base'] });
  };
  const answer = useMutation({ mutationFn: (v: { id: string; accept: boolean }) => api.answerRequest(v.id, v.accept), onSuccess: refresh });

  if (!friends.data) return friends.error ? <Screen><ErrorText>{errorText(friends.error)}</ErrorText></Screen> : <Loading />;
  const { incoming, outgoing } = friends.data;
  const byUser = new Map((convos.data ?? []).map((c) => [c.userId, c]));

  return (
    <Screen refreshing={friends.isRefetching} onRefresh={refresh}>
      {incoming.length > 0 && (
        <>
          <SectionTitle>Friend requests</SectionTitle>
          {incoming.map((r) => (
            <Card key={r.id}>
              <Row>
                <T bold style={{ flex: 1 }}>{r.username}</T>
                <Button small title="Accept" onPress={() => answer.mutate({ id: r.id, accept: true })} />
                <Button small variant="secondary" title="Decline" onPress={() => answer.mutate({ id: r.id, accept: false })} />
              </Row>
            </Card>
          ))}
        </>
      )}

      <SectionTitle>Friends</SectionTitle>
      {friends.data.friends.length === 0 && <T muted>No friends yet. Share your invite code or add someone below.</T>}
      {friends.data.friends.map((f) => <FriendRow key={f.userId} friend={f} convo={byUser.get(f.userId)} />)}

      <AddFriend onAdded={refresh} />
      {outgoing.length > 0 && (
        <T faint size={12}>Waiting for: {outgoing.map((o) => o.username).join(', ')}</T>
      )}

      <InviteCard />
    </Screen>
  );
}

function FriendRow({ friend, convo }: { friend: FriendView; convo?: ConversationView }) {
  const now = useNow();
  const online = friend.lastSeenAt && now - friend.lastSeenAt < 10 * 60_000;
  return (
    <Card>
      <Row onPress={() => router.push({ pathname: '/friend/[userId]', params: { userId: friend.userId } })}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: online ? colors.good : colors.border }} />
        <View style={{ flex: 1 }}>
          <T bold>{friend.username}</T>
          {convo?.preview ? (
            <T size={13} color={convo.unread ? colors.text : colors.muted} numberOfLines={1}>
              {convo.fromMe ? 'You: ' : ''}{convo.preview}
            </T>
          ) : (
            <T faint size={12} numberOfLines={1}>
              {friend.base ? `${friend.base.name} · ${friend.base.coords}` : 'No base this season'}
            </T>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          {convo?.unread ? (
            <View style={{ backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 }}>
              <T size={12} bold color={colors.bg}>{convo.unread}</T>
            </View>
          ) : friend.base ? <T mono faint size={12}>⚑ {fmt(friend.base.power)}</T> : null}
          <T faint size={11}>{online ? 'online' : friend.lastSeenAt ? ago(friend.lastSeenAt, now) : ''}</T>
        </View>
      </Row>
    </Card>
  );
}

function AddFriend({ onAdded }: { onAdded: () => void }) {
  const [value, setValue] = useState('');
  const add = useMutation({
    mutationFn: () => api.addFriend(value),
    onSuccess: () => {
      setValue('');
      onAdded();
    },
  });
  return (
    <Card>
      <Field label="Add a friend by username or invite code" value={value} onChangeText={setValue} placeholder="name or RF-XXXXX" />
      <ErrorText>{add.error ? errorText(add.error) : ''}</ErrorText>
      {add.data && <T color={colors.good} size={13} style={{ marginBottom: 8 }}>
        {add.data.status === 'friends' ? `You and ${add.data.username} are now friends.` : `Request sent to ${add.data.username}.`}
      </T>}
      <Button title="Send request" variant="secondary" onPress={() => add.mutate()} disabled={value.trim().length < 3} loading={add.isPending} />
    </Card>
  );
}

function InviteCard() {
  const user = useUser();
  const code = user?.inviteCode ?? '';
  const share = () =>
    Share.share({
      message: `Join me on Ringfall, the war for the Oruun Ring. Use my invite code ${code} when you sign up and you'll land right next to my base.`,
    });
  return (
    <>
      <SectionTitle>Your invite code</SectionTitle>
      <Card tone="accent" style={{ alignItems: 'center', gap: 8 }}>
        <T style={{ fontFamily: mono, fontSize: 28, letterSpacing: 3, color: colors.accent }} selectable>{code}</T>
        <T muted size={13} style={{ textAlign: 'center' }}>Friends who sign up with it land in your sector and send you a friend request.</T>
        <Divider />
        <Button title="Share invite" onPress={share} style={{ alignSelf: 'stretch' }} />
      </Card>
    </>
  );
}
