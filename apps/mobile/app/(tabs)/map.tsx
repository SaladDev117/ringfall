import * as R from '@ringfall/rules';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import SectorMap from '@/components/three/SectorMap';
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
      <View style={{ height: 380, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
        <SectorMap
          dom={{ style: { flex: 1 } }}
          sector={data.me.sector}
          places={data.places.filter((p) => R.sectorOf(p.x) === data.me.sector).map((p) => ({
            id: p.id, kind: p.kind, name: p.name, x: p.x, y: p.y,
            level: p.kind === 'nest' ? p.level : undefined, isMe: p.kind === 'base' && p.isMe,
          }))}
          onSelect={(id) => {
            const place = data.places.find((p) => p.id === id);
            if (place) openPlace(place);
          }}
        />
      </View>
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

function openPlace(place: PlaceView) {
  router.push({
    pathname: '/send',
    params: {
      kind: place.kind, id: place.id, name: place.name, x: String(place.x), y: String(place.y),
      level: place.kind === 'nest' ? String(place.level) : undefined,
    },
  });
}

function PlaceRow({ place }: { place: PlaceView }) {
  const open = () => openPlace(place);
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
