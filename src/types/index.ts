export type WeightUnit = 'lb' | 'kg';
export type EncouragementTone = 'minimal' | 'warm' | 'playful' | 'off';
export type TierType = 'T1' | 'T2a' | 'T2b' | 'T2c' | 'T3a' | 'T3b' | 'T3c' | 'T3d';
export type SetType = 'rm_target' | 'backoff' | 'straight' | 'mrs' | 'test';
export type SlotStatus = 'work' | 'rest' | 'test' | 'omitted';
export type TrainingMaxKey = 'squat' | 'bench' | 'deadlift' | 'ohp' | 'front_squat';
export type SessionStatus = 'active' | 'partial' | 'completed' | 'skipped';

export interface SourceReference {
  sheet: 'J&T2.0' | 'J&T2.0 KGS';
  ranges: string[];
}

export type LoadBasis =
  | { kind: 'training_max'; key: TrainingMaxKey; block: 1 | 2 }
  | { kind: 'achieved_rm'; slotId: string }
  | { kind: 'user_selected' };

export interface ProgramSetPrescription {
  setNumber: number;
  type: SetType;
  prescribedReps: number;
  isAmrap?: boolean;
  amrapOptional?: boolean;
  percentage?: number;
  loadBasis: LoadBasis;
  sourceRefs: SourceReference[];
}

export interface ExerciseSlotPrescription {
  slotId: string;
  exerciseId: string;
  week: number;
  day: number;
  tier: TierType;
  exerciseName: string;
  status: SlotStatus;
  setType: 'rm_backoff' | 'straight' | 'mrs' | 'test' | 'rest' | 'omitted';
  setCount: number;
  repTarget: number | null;
  percentage?: number;
  loadBasis?: LoadBasis;
  trainingMaxBlock?: 1 | 2;
  mrsAdditionalSets?: number;
  prescribedSets: ProgramSetPrescription[];
  sourceRefs: SourceReference[];
  notes?: string;
  ambiguity?: string;
}

export interface DayPrescription {
  week: number;
  dayNumber: number;
  title: string;
  exercises: ExerciseSlotPrescription[];
  sourceRefs: SourceReference[];
}

export interface UserProfile {
  id: string;
  name: string;
  unit: WeightUnit;
  equipmentIncrement: number;
  barbellWeight: number;
  tone: EncouragementTone;
  currentWeek: number;
  currentDay: number;
  cycleCompleted?: boolean;
  trainingMaxes: Partial<Record<TrainingMaxKey, number>>;
  block2ConfirmedTMs?: Partial<Record<TrainingMaxKey, number>>;
  block2ConfirmedAt?: number;
  exerciseCustomizations?: Record<string, string>;
  theme?: 'dark' | 'light';
  weeklyGoalSessions?: number;
}

export interface SessionSettingsSnapshot {
  unit: WeightUnit;
  equipmentIncrement: number;
  barbellWeight: number;
  trainingMaxes: Partial<Record<TrainingMaxKey, number>>;
  block2ConfirmedTMs?: Partial<Record<TrainingMaxKey, number>>;
  exerciseCustomizations?: Record<string, string>;
}

export interface LoggedSet {
  setId: string;
  type: SetType;
  prescribedReps: number;
  actualReps: number | null;
  load: number | null;
  unit: WeightUnit;
  rir?: number;
  isAmrap?: boolean;
  amrapDeclined?: boolean;
  completed: boolean;
  userLoadOverride?: boolean;
  timestamp?: number;
}

export interface LoggedExercise {
  slotId: string;
  exerciseId: string;
  tier: TierType;
  exerciseName: string;
  status: SlotStatus;
  targetRM?: number;
  achievedRMWeight?: number;
  achievedRMReps?: number;
  rmMismatchWarning?: string;
  manualLoadDecisionPending?: boolean;
  manualBackoffLoad?: number;
  sets: LoggedSet[];
  notes?: string;
  sourceRefs: SourceReference[];
  loadBasis?: LoadBasis;
}

export interface WorkoutSession {
  sessionId: string;
  profileId: string;
  week: number;
  day: number;
  startTime: number;
  updatedTime: number;
  completedTime?: number;
  status: SessionStatus;
  isPartial: boolean;
  isSkipped: boolean;
  isDemo?: boolean;
  isEditingCompleted?: boolean;
  advancedAt?: number;
  cycleCompletedAt?: number;
  prescriptionSnapshot: DayPrescription;
  settingsSnapshot: SessionSettingsSnapshot;
  exercises: LoggedExercise[];
  encouragementMessage?: string;
}

export interface BackupExportData {
  version: 2;
  timestamp: number;
  profiles: UserProfile[];
  sessions: WorkoutSession[];
  activeSessions: WorkoutSession[];
  app: 'GZCL_Jacked_And_Tan_2_Partner_Engine';
}
