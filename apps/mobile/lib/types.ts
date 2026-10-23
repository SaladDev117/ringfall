import type { Army, BuildJob, BuildingLevels, Resources, TrainJob } from '@ringfall/rules';

export interface User {
  id: string;
  username: string;
  inviteCode: string;
  createdAt: number;
}

export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface ArmyView {
  id: string;
  mission: 'raid' | 'scout';
  status: 'outbound' | 'returning';
  target: string;
  targetCoords: string;
  units: Army;
  loot: Resources;
  departsAt: number;
  arrivesAt: number;
  returnsAt: number | null;
}

export interface IncomingView {
  id: string;
  attacker: string;
  arrivesAt: number;
  approxCount: number | null;
  units: Army | null;
}

/** GET /base */
export interface BaseView {
  id: string;
  name: string;
  x: number;
  y: number;
  sector: number;
  sectorName: string;
  coords: string;
  serverTime: number;
  resources: Resources;
  resourcesAt: number;
  rates: Resources;
  caps: Resources;
  protected: Resources;
  levels: BuildingLevels;
  builds: BuildJob[];
  builderSlots: number;
  training: TrainJob[];
  units: Army;
  unitsAway: Army;
  supply: { used: number; cap: number };
  power: number;
  shieldUntil: number | null;
  protectionUntil: number | null;
  armies: ArmyView[];
  maxArmiesOut: number;
  incoming: IncomingView[];
  unreadReports: number;
}

export type PlaceView =
  | {
      kind: 'base';
      id: string;
      name: string;
      owner: string;
      isMe: boolean;
      x: number;
      y: number;
      coords: string;
      distance: number;
      powerBand: 'weaker' | 'even' | 'stronger';
      shielded: boolean;
      protected: boolean;
      blocked: string | null;
    }
  | { kind: 'nest'; id: string; name: string; level: number; x: number; y: number; coords: string; distance: number };

/** GET /map/nearby */
export interface NearbyView {
  me: { x: number; y: number; sector: number; sectorName: string };
  sectors: { sector: number; name: string }[];
  places: PlaceView[];
}

export interface ReportSummary {
  id: string;
  kind: 'raid' | 'scout' | 'nest';
  at: number;
  outcome: string;
  side: 'attacker' | 'defender';
  title: string;
  seen: boolean;
}

export interface ReportDetail extends Omit<ReportSummary, 'seen'> {
  text: string;
  data: { loot?: Resources; attackerName: string; defenderName: string; targetName: string; coords: string };
}
