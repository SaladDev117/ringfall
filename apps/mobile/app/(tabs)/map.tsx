import * as R from '@ringfall/rules';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { api, errorText } from '@/lib/api';
import { colors } from '@/lib/theme';
import type { PlaceView } from '@/lib/types';
import { Button, Card, ErrorText, Loading, Row, Screen, SectionTitle, T, Tag } from '@/lib/ui';

type Filter = 'all' | 'players' | 'nests';

const BLOCK_TEXT: Record<string, string> = {
  target_protected: 'protected',
  target_shielded: 'shielded',
  power_gap: 'too weak to attack',
  too_many_armies: '',
  repeat_limit: 'hit 3× today',
};

export default function MapScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const { data, error, refetch, isRefetching } = useQuery({ queryKey: ['nearby'], queryFn: api.nearby, refetchInterval: 60_000 });
  if (!data) return error ? <Screen><ErrorText>{errorText(error)}</ErrorText></Screen> : <Loading />;
  const places = data.places.filter((p) =>
    !(p.kind === 'base' && p.isMe) && (filter === 'all' || (filter === 'nests' ? p.kind === 'nest' : p.kind === 'base')));

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      <Card>
        <T bold>{data.me.sectorName}</T>
        <T muted mono size={13}>Sector {data.me.sector} · you are at {data.me.x}, {data.me.y}</T>
        {data.sectors.length > 1 && <T faint size={12}>Your Sensor Array also shows {data.sectors.filter((s) => s.sector !== data.me.sector).map((s) => s.name).join(', ')}</T>}
      </Card>
      <Grid places={data.places} me={data.me} />
      <Row style={{ gap: 6 }}>
        {(['all', 'players', 'nests'] as Filter[]).map((f) => (
          <Button key={f} small title={f[0]!.toUpperCase() + f.slice(1)} variant={filter === f ? 'primary' : 'secondary'} onPress={() => setFilter(f)} />
        ))}
      </Row>
      <SectionTitle>Nearby</SectionTitle>
      {places.length === 0 && <T muted>Nothing here yet.</T>}
      {places.map((p) => <PlaceRow key={p.id} place={p} />)}
    </Screen>
  );
}

function PlaceRow({ place }: { place: PlaceView }) {
  const open = () => router.push({
    pathname: '/send',
    params: {
      kind: place.kind, id: place.id, name: place.name, x: String(place.x), y: String(place.y),
      level: place.kind === 'nest' ? String(place.level) : undefined,
    },
  });
  const blocked = place.kind === 'base' && place.blocked ? BLOCK_TEXT[place.blocked] ?? place.blocked : '';
  return (
    <Card>
      <Row onPress={open}>
        <T size={22}>{place.kind === 'nest' ? '✶' : '●'}</T>
        <View style={{ flex: 1 }}>
          <T bold numberOfLines={1}>{place.name}</T>
          <T mono faint size={12}>
            {place.kind === 'base' ? `${place.owner} · ` : ''}{place.coords} · {place.distance.toFixed(1)} tiles
          </T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {place.kind === 'nest' && <Tag tone={place.level <= 2 ? 'good' : place.level <= 5 ? 'warn' : 'danger'}>Level {place.level}</Tag>}
          {place.kind === 'base' && (
            <Tag tone={place.powerBand === 'stronger' ? 'danger' : place.powerBand === 'weaker' ? 'good' : 'muted'}>{place.powerBand}</Tag>
          )}
          {blocked ? <T faint size={11}>{blocked}</T> : null}
        </View>
      </Row>
    </Card>
  );
}

/** The whole sector at a glance, MXit style: each character covers a 3 × 3 patch of tiles. */
function Grid({ places, me }: { places: PlaceView[]; me: { x: number; y: number; sector: number } }) {
  const CELL = 3;
  const x0 = me.sector * R.SECTOR_LENGTH;
  const cols = Math.ceil(R.SECTOR_LENGTH / CELL);
  const rows = Math.ceil(R.RING_WIDTH / CELL);
  const cells: string[][] = Array.from({ length: rows }, () => Array<string>(cols).fill('·'));
  const rank: Record<string, number> = { '·': 0, '✶': 1, '○': 2, '■': 3 };
  const put = (x: number, y: number, ch: string) => {
    const cx = Math.floor((x - x0) / CELL);
    const cy = Math.floor(y / CELL);
    const row = cells[cy];
    if (!row || cx < 0 || cx >= cols) return;
    if (rank[ch]! > rank[row[cx]!]!) row[cx] = ch;
  };
  for (const p of places) put(p.x, p.y, p.kind === 'nest' ? '✶' : p.isMe ? '■' : '○');
  return (
    <Card style={{ alignItems: 'center' }}>
      {cells.map((row, i) => (
        <T key={i} mono size={11} color={colors.muted} style={{ lineHeight: 15 }}>{row.join(' ')}</T>
      ))}
      <T faint size={11} style={{ marginTop: 6 }}>■ you  ○ commander  ✶ Blight Nest · each dot is 3×3 tiles</T>
    </Card>
  );
}
