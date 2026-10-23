import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, errorText } from '@/lib/api';
import { clock } from '@/lib/format';
import { colors } from '@/lib/theme';
import type { MessageView } from '@/lib/types';
import { Button, ErrorText, Loading, T } from '@/lib/ui';

const MAX = 500;

export default function ChatScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const { data, error } = useQuery({ queryKey: ['thread', userId], queryFn: () => api.thread(userId), refetchInterval: 5_000 });
  const send = useMutation({
    mutationFn: () => api.sendMessage(userId, text),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['thread', userId] });
    },
  });

  // Reading the thread marks it read; refresh the badges whenever new messages show up.
  const count = data?.messages.length;
  useEffect(() => {
    if (count === undefined) return;
    qc.invalidateQueries({ queryKey: ['conversations'] });
    qc.invalidateQueries({ queryKey: ['base'] });
  }, [count, qc]);

  if (!data) return error ? <View style={{ padding: 16 }}><ErrorText>{errorText(error)}</ErrorText></View> : <Loading />;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen options={{ title: data.username }} />
      <FlatList
        inverted
        data={data.messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, gap: 6 }}
        renderItem={({ item }) => <Bubble m={item} />}
        ListEmptyComponent={<T muted style={{ textAlign: 'center', padding: 24 }}>Say hi to {data.username}. Trash talk is half the fun.</T>}
      />
      {data.friends ? (
        <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={colors.faint}
            maxLength={MAX}
            multiline
          />
          <Button small title="Send" onPress={() => send.mutate()} disabled={!text.trim()} loading={send.isPending} />
        </View>
      ) : (
        <T muted style={{ padding: 16, textAlign: 'center' }}>You’re no longer friends, so you can’t reply.</T>
      )}
      {send.error && <View style={{ paddingHorizontal: 12 }}><ErrorText>{errorText(send.error)}</ErrorText></View>}
    </KeyboardAvoidingView>
  );
}

function Bubble({ m }: { m: MessageView }) {
  return (
    <View style={[styles.bubble, m.fromMe ? styles.mine : styles.theirs]}>
      {m.report ? (
        <Pressable onPress={() => router.push({ pathname: '/report/[id]', params: { id: m.report!.id } })}>
          <T bold color={colors.accent}>⚔ {m.report.title}</T>
          <T faint size={12}>Tap to read the report</T>
        </Pressable>
      ) : (
        <T selectable color={m.fromMe ? colors.bg : colors.text}>{m.body}</T>
      )}
      <T size={10} color={m.fromMe ? colors.accentDim : colors.faint} style={{ alignSelf: 'flex-end', marginTop: 2 }}>{clock(m.at)}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.card,
  },
  input: {
    flex: 1, color: colors.text, backgroundColor: colors.cardRaised, borderRadius: 18, paddingHorizontal: 14,
    paddingVertical: 8, fontSize: 16, maxHeight: 120, borderWidth: 1, borderColor: colors.border,
  },
  bubble: { maxWidth: '80%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.accent },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
});
