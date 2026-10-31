// The shape of the farm. One WorldState is shared by every rule set, view and
// clock: switching a mode never rebuilds the farm, it only changes which rules
// read and write it. Renderers, audio and UI read this; only src/sim writes it.

/** Every switch the player can flip. Each axis is independent of the others. */
export interface Rules {
  /** Which renderer draws the farm. */
  view: '2d' | '3d';
  /** Close follows the farmer; wide shows the whole field. */
  camera: 'close' | 'wide';
  /** Walk the farmer yourself, or point at tiles and let the farmer go. */
  control: 'walk' | 'point';
  /** How time passes: a real-time day with stamina, action points per day, or a continuous clock you speed up. */
  clock: 'day' | 'turns' | 'flow';
  /** Classic: water every day. Synergy: soil moisture, nutrients and companion planting decide quality. */
  growth: 'classic' | 'synergy';
  /** What you play for: free play with a shop, seasonal almanac goals, or town orders with a moving market. */
  goal: 'market' | 'almanac' | 'orders';
  /** Calm skies, or a forecast with storms, heat, crows and bugs. */
  weather: 'calm' | 'wild';
  /** Farm alone, or hire farmhands who water, harvest and replant. */
  crew: 'solo' | 'crew';
  /** A kit of tools you switch between, or one smart action that does the obvious thing. */
  tools: 'kit' | 'smart';
}

export type Axis = keyof Rules;

export type CropId = 'radish' | 'lettuce' | 'carrot' | 'beans' | 'strawberry' | 'sunflower' | 'corn' | 'pumpkin';

/** 0 spring, 1 summer, 2 autumn, 3 winter. */
export type Season = 0 | 1 | 2 | 3;

export type Weather = 'sun' | 'cloud' | 'rain' | 'storm' | 'heat';

/** Static ground. Field tiles belong to a parcel and can hold a plot. */
export type TileKind = 'grass' | 'field' | 'path' | 'water' | 'wood' | 'yard';

export type BuildKind = 'scarecrow' | 'sprinkler';

/** What the hands do. A tool maps to one of these, smart picks one for you. */
export type Verb = 'till' | 'water' | 'plant' | 'harvest' | 'tend' | 'clear' | 'build' | 'scare' | 'refill';

/** The kit. 'smart' is the single context tool used when rules.tools is 'smart'. */
export type ToolId = 'hoe' | 'can' | 'seeds' | 'hands' | 'build' | 'smart';

export type Facing = 'n' | 'e' | 's' | 'w';

export interface Crop {
  id: number;
  kind: CropId;
  /** Growth in days. Ripe when age >= the crop's days. */
  age: number;
  /** 0 seed, 1 sprout, 2 young, 3 grown, 4 ripe. Derived from age, stored for renderers. */
  stage: 0 | 1 | 2 | 3 | 4;
  /** Day ends in a row without water. */
  dry: number;
  dead: boolean;
  /** Bugs stop growth and spread to the same crop next door (wild weather only). */
  bugs: number;
  /** Predicted harvest quality 0 plain, 1 silver, 2 gold, 3 star. Always 0 under classic growth. */
  quality: 0 | 1 | 2 | 3;
  /** How many times a regrowing crop has been picked. */
  picks: number;
  /** Went a night without the moisture it needed (synergy quality penalty). */
  parched: boolean;
  planted: number;
}

export interface Plot {
  tilled: boolean;
  /** Classic growth: watered today. */
  wet: boolean;
  /** Synergy growth: 0 dry to 3 soaked. Drops by one each night. */
  moisture: number;
  /** Synergy growth: 0 spent to 3 rich. Heavy crops use it, beans put it back. */
  nutrient: number;
  crop: Crop | null;
}

export interface Build {
  id: number;
  kind: BuildKind;
  x: number;
  y: number;
}

export interface Parcel {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  owned: boolean;
  price: number;
}

export interface ActorTask {
  verb: Verb;
  x: number;
  y: number;
  /** Seconds into the action and its length. Renderers animate from these. */
  t: number;
  dur: number;
}

export interface Actor {
  id: number;
  role: 'farmer' | 'hand';
  name: string;
  /** Tile units, float. The centre of tile (3, 4) is (3.5, 4.5). */
  x: number;
  y: number;
  facing: Facing;
  /** Facing as an angle in radians, 0 = east, PI/2 = south (screen down, +y). Smoothed for renderers. */
  angle: number;
  moving: boolean;
  /** Distance walked, for footstep and bob phase. */
  walked: number;
  task: ActorTask | null;
  /** Tiles still to walk, nearest first. */
  path: { x: number; y: number }[];
  /** Job the actor is working towards. */
  job: number | null;
  /** Hands only: the chore picked for itself (not a painted job). */
  aim: { verb: Verb; x: number; y: number } | null;
  /** Short hop in turns mode: renderers lift the actor by sin(PI * hop). 0..1, 0 when idle. */
  hop: number;
  /** Hands only: shirt colour index 0..5. */
  tint: number;
  /** Hands only: true while the crew is switched off. Away actors are not drawn and do nothing. */
  away: boolean;
}

export interface Crow {
  id: number;
  /** Tile the crow is after. */
  x: number;
  y: number;
  /** Where it flies in from and flees to, tile units. */
  fromX: number;
  fromY: number;
  phase: 'in' | 'peck' | 'flee' | 'gone';
  /** Seconds in the phase (in, flee) or game minutes pecked (peck). */
  t: number;
}

export interface Job {
  id: number;
  verb: Verb;
  x: number;
  y: number;
  crop?: CropId;
  build?: BuildKind;
  claimedBy: number | null;
}

export interface OrderItem {
  crop: CropId;
  n: number;
}

export interface Order {
  id: number;
  who: string;
  items: OrderItem[];
  reward: number;
  rep: number;
  due: number;
}

export type GoalKind = 'harvest' | 'variety' | 'quality' | 'earn' | 'growing' | 'nowither';

export interface Goal {
  id: string;
  kind: GoalKind;
  text: string;
  target: number;
  progress: number;
  done: boolean;
  /** Set when the goal can only be met under another rule (quality needs synergy). */
  needs?: Partial<Rules>;
}

export interface Almanac {
  /** Season number since the start, 0-based. */
  round: number;
  goals: Goal[];
  stars: number;
  /** Stars per finished round. */
  history: number[];
  unlocked: CropId[];
  /** Offered at a season change: pick one to unlock. Null when nothing is on offer. */
  draft: CropId[] | null;
  /** Per-round counters the goals read. */
  harvested: number;
  kinds: CropId[];
  fine: number;
  earned: number;
  withered: number;
}

export interface Market {
  /** Price multiplier per crop, around 1. Only moves under orders. */
  demand: Record<CropId, number>;
}

export interface Stats {
  harvested: Record<CropId, number>;
  earned: number;
  days: number;
  /** Seconds played under each value of each axis, for the lab notes. */
  playtime: Record<string, number>;
}

export interface DayReport {
  day: number;
  sold: { crop: CropId; n: number; value: number }[];
  wages: number;
  grew: number;
  withered: number;
  eaten: number;
  crewWork: number;
  income: number;
}

export interface WorldState {
  version: 1;
  /** The farm's random seed. */
  worldSeed: number;
  /** Mulberry32 state. Only src/sim/rng.ts touches it. */
  rng: number;
  nextId: number;

  rules: Rules;

  W: number;
  H: number;
  tiles: TileKind[];
  /** Parcel id per tile, -1 off the field. */
  parcelOf: number[];
  /** One per tile; only field tiles are used. Index y * W + x. */
  plots: Plot[];
  parcels: Parcel[];
  builds: Build[];
  actors: Actor[];
  crows: Crow[];
  jobs: Job[];

  /** 1-based. Ten days make a season. */
  day: number;
  /** Minutes since 6:00. The day runs to 1080 (midnight). */
  minute: number;
  weather: Weather;
  /** Next three days. */
  forecast: Weather[];

  stamina: number;
  staminaMax: number;
  /** Water left in the can. Refill at the well or the pond. */
  water: number;
  /** Tool levels, 0 to 2. Level 1 works three plots in a row, level 2 a three by three square. */
  tools: { can: number; hoe: number };
  ap: number;
  apMax: number;
  /** Flow clock speed: 0 paused, 1, 2 or 4. */
  speed: number;

  tool: ToolId;
  /** The kit tool to go back to when smart tools are switched off. */
  kitTool: ToolId;
  /** The seed packet in hand. */
  seed: CropId;
  buildKind: BuildKind;

  coins: number;
  /** Harvested and not yet sold, counted by quality [plain, silver, gold, star]. Sold overnight under market and almanac; kept for orders. */
  stock: Record<CropId, number[]>;

  market: Market;
  orders: Order[];
  rep: number;
  almanac: Almanac;
  milestones: Record<string, boolean>;
  stats: Stats;
  /** Yesterday's summary, shown in the morning. */
  report: DayReport | null;

  /** Seconds of simulation since the start. */
  time: number;
  /** Set during the night transition so renderers can fade. 0 when awake. */
  night: number;
  /** Night transition progress 0 to 1, or -1 when awake. The day turns over at 0.5. */
  turnover: number;
  /** Minutes today at which crows will come (wild weather). */
  crowPlan: number[];
}

/** Things that happened this step. Renderers, audio and UI react to them; none of them change the world. */
export type SimEvent =
  | { type: 'till'; x: number; y: number; by: number }
  | { type: 'water'; x: number; y: number; by: number }
  | { type: 'plant'; x: number; y: number; crop: CropId; by: number }
  | { type: 'grow'; x: number; y: number; crop: CropId; stage: number }
  | { type: 'harvest'; x: number; y: number; crop: CropId; quality: number; by: number }
  | { type: 'tend'; x: number; y: number; by: number }
  | { type: 'clear'; x: number; y: number; by: number }
  | { type: 'build'; x: number; y: number; kind: BuildKind; by: number }
  | { type: 'unbuild'; x: number; y: number; kind: BuildKind }
  | { type: 'wither'; x: number; y: number; crop: CropId }
  | { type: 'bugs'; x: number; y: number }
  | { type: 'sprinkle'; x: number; y: number }
  | { type: 'crowIn'; id: number; x: number; y: number }
  | { type: 'crowEat'; id: number; x: number; y: number }
  | { type: 'crowScared'; id: number; x: number; y: number }
  | { type: 'step'; by: number; x: number; y: number; ground: TileKind }
  | { type: 'deny'; x: number; y: number; reason: string }
  | { type: 'coins'; amount: number; x?: number; y?: number }
  | { type: 'sell'; crop: CropId; n: number; value: number }
  | { type: 'buy'; item: string; cost: number }
  | { type: 'order'; id: number; done: boolean }
  | { type: 'goal'; id: string }
  | { type: 'milestone'; id: string }
  | { type: 'night' }
  | { type: 'dawn'; day: number; weather: Weather; season: Season }
  | { type: 'season'; season: Season; round: number }
  | { type: 'thunder' }
  | { type: 'rules'; rules: Rules; changed: Axis[] }
  | { type: 'tired' }
  | { type: 'hire'; id: number }
  | { type: 'refill'; x: number; y: number; by: number }
  | { type: 'upgrade'; tool: 'can' | 'hoe'; level: number }
  | { type: 'request'; id: number; who: string; done: boolean; reward: number };
