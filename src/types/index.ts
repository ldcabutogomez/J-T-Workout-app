/**
 * Domain types and models for Jacked & Tan 2.0 Partner Training Engine.
 * Traceable to the GZCL Free Compendium November 27th Update workbook.
 */

export type WeightUnit = 'lb' | 'kg';
export type EncouragementTone = 'minimal' | 'warm' | 'playful' | 'off';
export type TierType = 'T1' | 'T2a' | 'T2b' | 'T2c' | 'T3a' | 'T3b' | 'T3c' | 'T3d';
export type SetType = 'warmup' | 'rm_target' | 'backoff' | 'straight' | 'mrs';

export interface UserProfile {
  id: string;
  name: string;
  unit: WeightUnit;
  equipmentIncrement: number; // e.g. 5 lb or 2.5 kg
  barbellWeight: number; // e.g. 45 lb or 20 kg
  tone: EncouragementTone;
  currentWeek: number; // 1-12
  currentDay: number;  // 1-4
  trainingMaxes: { [liftKey: string]: number }; // TM = estimated daily 2RM
  block2ConfirmedTMs?: { [liftKey: string]: number };
  exerciseCustomizations?: { [slotKey: string]: string };
  theme?: 'dark' | 'light';
  weeklyGoalSessions?: number; // default 4
}

export interface ProgramSetPrescription {
  type: SetType;
  prescribedReps: number;
  isAmrap?: boolean;
  percentage?: number; // decimal e.g. 0.70 for 70%
  loadFromRM?: boolean; // For Block 2 (Weeks 7-11) where T1 back-offs derive from that day's logged RM
  sourceRef: string; // Cell trace e.g., "J&T2.0!Col_T1_Wk1"
}

export interface ExerciseSlotPrescription {
  tier: TierType;
  defaultExercise: string;
  parentLiftKey?: string; // e.g., 'squat' | 'bench' | 'deadlift' | 'ohp'
  isRestWeek?: boolean;
  notes?: string;
  targetRM?: number;
  prescribedSets: ProgramSetPrescription[];
  mrsSetsCount?: number;
  sourceRef: string;
}

export interface DayPrescription {
  dayNumber: number;
  title: string;
  primaryLift: string;
  exercises: ExerciseSlotPrescription[];
  sourceRef: string;
}

export interface LoggedSet {
  setId: string;
  type: SetType;
  prescribedReps: number;
  actualReps: number;
  load: number;
  unit: WeightUnit;
  rir?: number; // Reps In Reserve (0 to 3+)
  isAmrap?: boolean;
  completed: boolean;
  timestamp: number;
}

export interface LoggedExercise {
  slotKey: string;
  tier: TierType;
  exerciseName: string;
  targetRM?: number;
  achievedRMWeight?: number;
  rmMismatchWarning?: string; // surfaced if target RM was 6 reps but lifter logged 4 or 8
  manualLoadDecisionPending?: boolean;
  sets: LoggedSet[];
  notes?: string;
  sourceRef: string;
}

export interface WorkoutSession {
  sessionId: string;
  profileId: string;
  week: number;
  day: number;
  startTime: number;
  completedTime?: number;
  isPartial: boolean;
  isSkipped: boolean;
  isDemo?: boolean;
  exercises: LoggedExercise[];
  encouragementMessage?: string;
}

export interface BackupExportData {
  version: number;
  timestamp: number;
  profiles: UserProfile[];
  sessions: WorkoutSession[];
  app: string;
}
