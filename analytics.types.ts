/**
 * analytics.types.ts
 * AEROCOMMS · Strict Analytics Type System — Phase 2
 *
 * Canonical contract for all ClientEvents rows.
 * Discriminated union keyed on `eventType`; every new event variant
 * must extend IcaoEventBase and provide a narrow `metadata` shape.
 *
 * Backward-compat rule: all Phase-2 metadata fields are optional so
 * that legacy v1.0 rows (shallow `{ scenarioId, timeSpentSec, replays }`)
 * continue to satisfy their respective types without type errors.
 */

// ─────────────────────────────────────────────────────────────────────────────
// § 0 · Primitive helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Present, unknown, or absent — used for fields that sensors may not populate */
export type Maybe<T> = T | null | undefined;

/** Constrained 0–100 score — a plain number; keep the alias for documentation */
export type Score100 = number;

/** Constrained 0–10 index — e.g. workload, congestion */
export type Index10 = number;

/** Milliseconds duration */
export type Ms = number;

/** Ratio in [0, 1] */
export type Ratio = number;

// ─────────────────────────────────────────────────────────────────────────────
// § 1 · Enumerations
// ─────────────────────────────────────────────────────────────────────────────

export type IcaoEventVersion = '1.0' | '2.0';

export type IcaoLicenseType =
  | 'B2C_FREE'
  | 'B2C_PRO'
  | 'B2B_ACADEMIC'
  | 'B2B_CORPORATE'
  | 'B2B_DEMO';

export type IcaoScenarioDifficulty =
  | 'easy'
  | 'standard'
  | 'advanced'
  | 'emergency';

export type IcaoCompletionStatus = 'passed' | 'failed' | 'abandoned';

export type IcaoAbandonmentPoint =
  | 'pre_atc_reveal'
  | 'post_atc_reveal'
  | 'during_readback'
  | 'post_feedback'
  | 'unknown';

// ─────────────────────────────────────────────────────────────────────────────
// § 2 · Shared base — every event carries these fields
// ─────────────────────────────────────────────────────────────────────────────

export interface IcaoEventBase {
  // Identity
  readonly eventId:   string;
  readonly timestamp: string; // ISO-8601 UTC

  // User
  readonly userId: string;
  readonly email:  string;
  readonly name:   string;
  readonly role:   string;

  // Session
  readonly sessionId:   string;
  readonly durationSec: number; // seconds since session_started

  // Context
  readonly level:            string;
  readonly country:          string;
  readonly scenarioType:     string;
  readonly emergencyType:    string;
  readonly flightScenarioId: string;
  readonly routeName:        string;
  readonly scenarioId:       string;
  readonly phaseCode:        string;
  readonly userAgent:        string;

  // B2B Phase-1 enrichment (absent on v1 rows — all optional)
  readonly companyId?:          string;
  readonly cohortId?:           string;
  readonly instructorId?:       string;
  readonly licenseType?:        IcaoLicenseType;
  readonly eventVersion?:       IcaoEventVersion;
  readonly scenarioDifficulty?: IcaoScenarioDifficulty;
  readonly workloadIndex?:      Index10; // 0–10
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3 · scenario_completed metadata — Phase 2 rich dimensions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 3.1 Aeronautical compliance
 * Measures how accurately the student applied ICAO phraseology procedures.
 */
export interface ScenarioCompletedAeronautical {
  /** Percentage of readback content that matched the clearance. 0–100 */
  readbackAccuracy: Score100;
  /** True when all transmissions followed standard phraseology without deviation */
  phraseologyStandard: boolean;
  /** Count of clearance content that was omitted or altered */
  clearanceDeviations: number;
  /** Compliance with altitude restrictions stated in the clearance. 0–100 */
  altitudeRestrictionCompliance: Score100;
  /** Compliance with heading instructions. 0–100 */
  headingCompliance: Score100;
  /** Accuracy of frequency change read-backs. 0–100 */
  frequencyChangeAccuracy: Score100;
  /** Accuracy of call-sign usage across all transmissions. 0–100 */
  callSignAccuracy: Score100;
  /** Accuracy of runway assignment acknowledgment. 0–100 */
  runwayAssignmentAccuracy: Score100;
  /** Rate of standard ICAO phraseology used vs total word count. 0–100 */
  standardPhraseologyRate: Score100;
  /** Count of errors that would be safety-critical in a live environment */
  safetyCriticalMistakes: number;
}

/**
 * 3.2 Pedagogical scores
 */
export interface ScenarioCompletedScores {
  overallScore:        Score100;
  grammar:             Score100;
  pronunciation:       Score100;
  fluency:             Score100;
  comprehension:       Score100;
  operationalAccuracy: Score100;
}

export interface ScenarioCompletedLearningMetrics {
  /** Signed delta vs. the immediately preceding attempt on the same scenario */
  improvementDelta: number;
  /** How well material from previous sessions was retained. 0–100 */
  retentionScore: Score100;
  /** Efficiency of remediation exercises in correcting past errors. 0–100 */
  remediationEfficiency: Score100;
  /** Errors repeated from at least one prior attempt */
  recurrentErrorCount: number;
}

export interface ScenarioCompletedPedagogical {
  attemptNumber:    number;
  completionStatus: IcaoCompletionStatus;
  scores:           ScenarioCompletedScores;
  learningMetrics:  ScenarioCompletedLearningMetrics;
}

/**
 * 3.3 Cognitive / Psychological load
 * Captured from voice-activity detection and NLP pipeline.
 */
export interface ScenarioCompletedCognitive {
  /** Time from ATC audio end to first student vocalization */
  reactionTimeMs: Ms;
  /** Time student spent processing the full instruction before responding */
  instructionProcessingTimeMs: Ms;
  /** Latency between each decision point in a multi-element clearance */
  decisionLatencyMs: Ms;
  /** Student's average speech rate during the transmission */
  speechRateWPM: number;
  /** Count of audible hesitations (ums, ehs, pauses > threshold) */
  hesitationCount: number;
  /** Total milliseconds spent in hesitation */
  hesitationDurationMs: Ms;
  /** Time taken to recover a clean transmission after an interruption */
  interruptionRecoveryTimeMs: Ms;
  /** Ratio of filler words to total words. [0, 1] */
  fillerWordFrequency: Ratio;
  /** Composite stability index: low variance in tone, pace, and phrasing. 0–100 */
  communicationStabilityIndex: Score100;
  /** Score drop compared to baseline under simulated stress conditions */
  stressPerformanceDrop: number; // signed
  /** Model-estimated confidence from prosody and latency signals. 0–100 */
  confidenceScore: Score100;
}

/**
 * 3.4 Listening Comprehension
 */
export interface ScenarioCompletedListeningComprehension {
  /** Accuracy of extracting the clearance from a clean audio feed. 0–100 */
  instructionComprehensionAccuracy: Score100;
  /** Same metric under simulated ambient cockpit / ATC noise. 0–100 */
  noisyEnvironmentAccuracy: Score100;
  /** Ability to adapt to non-native or regional ATC accents. 0–100 */
  accentAdaptationScore: Score100;
  /** Retention when multiple sequential instructions were given. 0–100 */
  multiInstructionRetentionScore: Score100;
}

/**
 * 3.5 Engagement
 */
export interface ScenarioCompletedEngagement {
  /** Milliseconds from scenario load to first user interaction */
  timeToFirstInteraction: Ms;
  /** Total seconds the microphone was open during the scenario */
  micOpenDurationSec: number;
  /** How many times the student replayed the ATC audio */
  replayCount: number;
  /** How many times the student retried after a failure */
  retryCount: number;
  /** Fraction of total scenario time spent idle (no input). [0, 1] */
  idleTimeRatio: Ratio;
  /** Phase label where the student abandoned, if status === 'abandoned' */
  abandonmentPoint: Maybe<IcaoAbandonmentPoint>;
}

/**
 * 3.6 Simulation Context
 * Environmental difficulty injected by the scenario engine.
 */
export interface ScenarioCompletedSimContext {
  /** Weather complexity factor rendered by the simulation. 0–10 */
  weatherComplexity: Index10;
  /** Number of simultaneous traffic contacts active during scenario. 0–10 */
  trafficDensity: Index10;
  /** Radio channel saturation level. 0–10 */
  radioCongestionLevel: Index10;
  /** Emergency procedure complexity (0 when no emergency). 0–10 */
  emergencyComplexity: Index10;
  /** Composite workload score for the scenario instance. 0–10 */
  workloadIndex: Index10;
}

/**
 * 3.7 Longitudinal / Derived
 * Computed by the scoring pipeline after each attempt.
 */
export interface ScenarioCompletedLongitudinal {
  /** Composite readiness for live ATC operations. 0–100 */
  operationalReadinessScore: Score100;
  /** Adherence to radio discipline norms across all transmissions. 0–100 */
  radioDisciplineScore: Score100;
  /** Performance maintenance under increasing workload / stress. 0–100 */
  stressResilienceScore: Score100;
  /** Variance-penalized consistency across all communication metrics. 0–100 */
  communicationConsistencyScore: Score100;
  /**
   * Model prediction of the student's readiness for the certification exam,
   * based on longitudinal performance trajectory. 0–100
   */
  predictedCertificationReadiness: Score100;
}

/**
 * Complete metadata for `scenario_completed`.
 *
 * All dimension groups are optional so that legacy v1.0 rows
 * (which only include `{ scenarioId, timeSpentSec, replays }`)
 * remain valid without requiring back-fill.
 */
export interface ScenarioCompletedMetadata {
  // ── Legacy v1.0 shallow fields (always present on old rows) ──────────────
  scenarioId?:   string;
  timeSpentSec?: number;
  replays?:      number;

  // ── Phase 2 rich dimensions (absent on v1.0 rows) ─────────────────────────
  aeronautical?:          ScenarioCompletedAeronautical;
  pedagogical?:           ScenarioCompletedPedagogical;
  cognitive?:             ScenarioCompletedCognitive;
  listeningComprehension?: ScenarioCompletedListeningComprehension;
  engagement?:            ScenarioCompletedEngagement;
  simContext?:            ScenarioCompletedSimContext;
  longitudinal?:          ScenarioCompletedLongitudinal;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4 · Per-event metadata shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionStartedMetadata {
  sessionCount: number;
}

export interface ScenarioStartedMetadata {
  scenarioId: string;
  phaseCode:  string;
}

export interface ReplayPressedMetadata {
  replayNumber: number;
}

export interface UserQuitMetadata {
  scenarioId:   string;
  phaseCode:    string;
  timeSpentSec: number;
  lastAction:   string;
  replays:      number;
}

export interface DashboardViewMetadata {
  source: string;
}

export interface TrainingStartClickMetadata {
  country: string;
  level:   string;
}

// Events whose metadata carries no additional fields beyond the base context
export type EmptyMetadata = Record<never, never>;

// ─────────────────────────────────────────────────────────────────────────────
// § 5 · Discriminated union — IcaoAnalyticsEvent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every variant extends IcaoEventBase and narrows `eventType` to a single
 * literal, giving full discriminated-union exhaustiveness checking.
 */

export interface SessionStartedEvent extends IcaoEventBase {
  eventType: 'session_started';
  metadata:  SessionStartedMetadata;
}

export interface ScenarioStartedEvent extends IcaoEventBase {
  eventType: 'scenario_started';
  metadata:  ScenarioStartedMetadata;
}

export interface ScenarioCompletedEvent extends IcaoEventBase {
  eventType: 'scenario_completed';
  metadata:  ScenarioCompletedMetadata;
}

export interface ReplayPressedEvent extends IcaoEventBase {
  eventType: 'replay_pressed';
  metadata:  ReplayPressedMetadata;
}

export interface UserQuitEvent extends IcaoEventBase {
  eventType: 'user_quit';
  metadata:  UserQuitMetadata;
}

export interface DashboardViewEvent extends IcaoEventBase {
  eventType: 'dashboard_view';
  metadata:  DashboardViewMetadata;
}

export interface TrainingStartClickEvent extends IcaoEventBase {
  eventType: 'training_start_click';
  metadata:  TrainingStartClickMetadata;
}

export interface RouteCompletedEvent extends IcaoEventBase {
  eventType: 'route_completed';
  metadata:  EmptyMetadata;
}

export interface AttemptSubmitEvent extends IcaoEventBase {
  eventType: 'attempt_submit';
  metadata:  EmptyMetadata;
}

export interface AtcRevealEvent extends IcaoEventBase {
  eventType: 'atc_reveal';
  metadata:  EmptyMetadata;
}

/**
 * Fallback for rows written before event typing was introduced.
 * `metadata` is typed as `unknown` (not `any`) so consumers must
 * narrow before accessing fields — prevents silent runtime errors.
 */
export interface UnknownEvent extends IcaoEventBase {
  eventType: 'unknown' | (string & {});
  metadata:  unknown;
}

/**
 * Master discriminated union.
 *
 * Use a `switch (event.eventType)` or type-guard helper to narrow to
 * a specific variant before accessing `metadata` fields.
 */
export type IcaoAnalyticsEvent =
  | SessionStartedEvent
  | ScenarioStartedEvent
  | ScenarioCompletedEvent
  | ReplayPressedEvent
  | UserQuitEvent
  | DashboardViewEvent
  | TrainingStartClickEvent
  | RouteCompletedEvent
  | AttemptSubmitEvent
  | AtcRevealEvent
  | UnknownEvent;

// ─────────────────────────────────────────────────────────────────────────────
// § 6 · Type-guard helpers
// ─────────────────────────────────────────────────────────────────────────────

export function isScenarioCompleted(e: IcaoAnalyticsEvent): e is ScenarioCompletedEvent {
  return e.eventType === 'scenario_completed';
}

export function isSessionStarted(e: IcaoAnalyticsEvent): e is SessionStartedEvent {
  return e.eventType === 'session_started';
}

export function isUserQuit(e: IcaoAnalyticsEvent): e is UserQuitEvent {
  return e.eventType === 'user_quit';
}

/**
 * Returns true when the scenario_completed metadata contains at least one
 * Phase-2 rich dimension — used to decide whether to render extended analytics.
 */
export function hasRichMetadata(m: ScenarioCompletedMetadata): boolean {
  return !!(
    m.aeronautical   ||
    m.pedagogical    ||
    m.cognitive      ||
    m.listeningComprehension ||
    m.engagement     ||
    m.simContext     ||
    m.longitudinal
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// § 7 · Server-side row shape (Google Sheets flat record)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The exact column layout stored in the ClientEvents sheet.
 * `metadata` is stored as a JSON string; deserialize before use.
 * This interface mirrors EVENT_HEADERS in Código.js / ConfigService.js.
 */
export interface ClientEventRow {
  // v1 columns
  eventId:          string;
  timestamp:        string;
  userId:           string;
  email:            string;
  name:             string;
  role:             string;
  eventType:        string;
  level:            string;
  country:          string;
  scenarioType:     string;
  emergencyType:    string;
  flightScenarioId: string;
  routeName:        string;
  scenarioId:       string;
  phaseCode:        string;
  metadata:         string; // JSON-stringified metadata object
  userAgent:        string;

  // v1.5 session columns
  sessionId:   string;
  durationSec: number | string;

  // B2B Phase-1 columns (empty string when not set)
  companyId:          string;
  cohortId:           string;
  instructorId:       string;
  licenseType:        string;
  eventVersion:       string;
  scenarioDifficulty: string;
  workloadIndex:      number | string;
}

/**
 * Deserialize a ClientEventRow into a typed IcaoAnalyticsEvent.
 * Throws on invalid JSON in `metadata`; callers should catch.
 */
export function deserializeClientEventRow(row: ClientEventRow): IcaoAnalyticsEvent {
  const base: IcaoEventBase = {
    eventId:          row.eventId,
    timestamp:        row.timestamp,
    userId:           row.userId,
    email:            row.email,
    name:             row.name,
    role:             row.role,
    sessionId:        row.sessionId,
    durationSec:      Number(row.durationSec) || 0,
    level:            row.level,
    country:          row.country,
    scenarioType:     row.scenarioType,
    emergencyType:    row.emergencyType,
    flightScenarioId: row.flightScenarioId,
    routeName:        row.routeName,
    scenarioId:       row.scenarioId,
    phaseCode:        row.phaseCode,
    userAgent:        row.userAgent,
    companyId:          row.companyId   || undefined,
    cohortId:           row.cohortId    || undefined,
    instructorId:       row.instructorId || undefined,
    licenseType:        (row.licenseType as IcaoLicenseType) || undefined,
    eventVersion:       (row.eventVersion as IcaoEventVersion) || undefined,
    scenarioDifficulty: (row.scenarioDifficulty as IcaoScenarioDifficulty) || undefined,
    workloadIndex:      row.workloadIndex !== '' ? Number(row.workloadIndex) : undefined,
  };

  const rawMetadata: unknown = row.metadata ? JSON.parse(row.metadata) : {};

  // Narrow to the correct event variant based on eventType
  switch (row.eventType) {
    case 'session_started':
      return { ...base, eventType: 'session_started', metadata: rawMetadata as SessionStartedMetadata };
    case 'scenario_started':
      return { ...base, eventType: 'scenario_started', metadata: rawMetadata as ScenarioStartedMetadata };
    case 'scenario_completed':
      return { ...base, eventType: 'scenario_completed', metadata: rawMetadata as ScenarioCompletedMetadata };
    case 'replay_pressed':
      return { ...base, eventType: 'replay_pressed', metadata: rawMetadata as ReplayPressedMetadata };
    case 'user_quit':
      return { ...base, eventType: 'user_quit', metadata: rawMetadata as UserQuitMetadata };
    case 'dashboard_view':
      return { ...base, eventType: 'dashboard_view', metadata: rawMetadata as DashboardViewMetadata };
    case 'training_start_click':
      return { ...base, eventType: 'training_start_click', metadata: rawMetadata as TrainingStartClickMetadata };
    case 'route_completed':
      return { ...base, eventType: 'route_completed', metadata: {} };
    case 'attempt_submit':
      return { ...base, eventType: 'attempt_submit', metadata: {} };
    case 'atc_reveal':
      return { ...base, eventType: 'atc_reveal', metadata: {} };
    default:
      return { ...base, eventType: row.eventType, metadata: rawMetadata };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 8 · B2B Analytics API — Response Types (Phase 4)
//
// GAS function → REST concept
//   apiB2bGetKpis(sessionToken, companyId)         → GET /api/b2b/analytics/:companyId/kpis
//   apiB2bGetPerformance(sessionToken, companyId)  → GET /api/b2b/analytics/:companyId/performance
//   apiB2bGetRisk(sessionToken, companyId)         → GET /api/b2b/analytics/:companyId/risk
// ─────────────────────────────────────────────────────────────────────────────

// ── 8.1 Shared envelope ──────────────────────────────────────────────────────

export interface B2bResponseBase {
  readonly ok:          true;
  readonly companyId:   string;
  readonly generatedAt: string; // ISO-8601 UTC
}

export interface B2bApiError {
  readonly ok:      false;
  readonly code:    'TENANT_FORBIDDEN' | 'INVALID_COMPANY_ID' | 'SESSION_ERROR' | 'SERVER_ERROR';
  readonly message: string;
}

export type B2bApiResult<T extends B2bResponseBase> = T | B2bApiError;

// ── 8.2 KPIs endpoint ────────────────────────────────────────────────────────

export interface B2bOrganizationalKpis {
  /** Total number of users whose companyId matches this tenant */
  totalPilots: number;
  /** Pilots with ≥ 1 event in the last 30 days */
  activePilots: number;
  /** activePilots / totalPilots × 100. 0 when totalPilots = 0 */
  activePilotsPercentage: Score100;
  /** Count of unique sessionId values across all tenant events */
  totalSessions: number;
  /** Sum of max durationSec per session, converted to hours */
  totalSimulatedHours: number;
  /** totalSessions / totalPilots. 0 when totalPilots = 0 */
  averageSessionsPerPilot: number;
}

export interface B2bKpisResponse extends B2bResponseBase {
  kpis: B2bOrganizationalKpis;
}

// ── 8.3 Performance endpoint ─────────────────────────────────────────────────

/**
 * Indicates which data source backed each metric.
 * "not_yet_collected" means the scoring pipeline has not yet produced Phase 2 data.
 */
export interface B2bPerformanceSources {
  passRate:            'Attempts';
  improvementVelocity: 'ClientEvents.metadata.pedagogical' | 'Attempts.score_trajectory';
  cognitiveMetrics:    'ClientEvents.metadata.cognitive'   | 'not_yet_collected';
}

export interface B2bPerformanceMetrics {
  /** Percentage of attempts marked correct. null when no attempts exist */
  passRate: Score100 | null;
  /**
   * Average score improvement over a pilot's attempt history.
   * Positive = improving; negative = regressing. null when < 2 attempts per pilot.
   * Source: Phase 2 improvementDelta when available, otherwise last−first score delta.
   */
  improvementVelocity: number | null;
  // Phase 2 cognitive / longitudinal — null until scoring pipeline provides them
  /** Average ms between end of ATC audio and first student vocalization */
  averageReactionTimeMs: Ms | null;
  /** Average composite operational readiness score (0–100) */
  averageOperationalReadinessScore: Score100 | null;
  /** Average stress resilience score under high-workload scenarios (0–100) */
  averageStressResilienceScore: Score100 | null;
  /** Data source labels — use to show "Estimated" vs "Measured" in the UI */
  _sources: B2bPerformanceSources;
}

export interface B2bPerformanceResponse extends B2bResponseBase {
  performance: B2bPerformanceMetrics;
}

// ── 8.4 Risk endpoint ────────────────────────────────────────────────────────

export interface B2bFailurePattern {
  /** The ICAO phraseology keyword that was missed */
  pattern: string;
  /** How many times it was missed across all tenant attempts */
  count:   number;
}

export interface B2bClearanceDeviation {
  /** Scenario ID (or phaseCode fallback) where deviations occurred */
  scenarioId:       string;
  /** Total clearance deviations accumulated across all attempts on this scenario */
  totalDeviations:  number;
}

export interface B2bFailedScenarioType {
  /** scenarioType label (e.g. "EMERGENCY L2") or level proxy ("L1") */
  scenarioType: string;
  failCount:    number;
}

export interface B2bRiskMetrics {
  /** Pilots with pass rate < highRiskThreshold over ≥ 3 attempts */
  highRiskPilotCount: number;
  /** The pass-rate threshold used to classify a pilot as high-risk (e.g. 0.50) */
  highRiskThreshold: number;
  /**
   * Count of pilots who triggered safety-critical mistakes in ≥ 2 distinct sessions.
   * null when no Phase 2 aeronautical metadata has been collected yet.
   */
  recurrentCriticalMistakes: number | null;
  /** Top 10 ICAO keywords most frequently missed across all tenant attempts */
  mostCommonFailurePatterns: B2bFailurePattern[];
  /** Top 5 scenarios ranked by total clearance deviations */
  topClearanceDeviations: B2bClearanceDeviation[];
  /** Top 5 scenario types / levels ranked by failure count */
  mostFailedScenarioTypes: B2bFailedScenarioType[];
}

export interface B2bRiskResponse extends B2bResponseBase {
  risk: B2bRiskMetrics;
}

// ── 8.5 Enriched user session (Phase 3) ──────────────────────────────────────

/**
 * The client-side AppState.user object after Phase 3 enrichment.
 * B2B fields are empty strings for standard B2C accounts.
 */
export interface IcaoUserSession {
  userId:               string;
  email:                string;
  name:                 string;
  role:                 string;
  status:               string;
  currentLevel:         number;
  currentCountry:       string;
  assignedGroupId:      string;
  totalLearningSeconds: number;
  createdAt:            string;
  lastLoginAt:          string;
  // B2B Phase 3 fields — empty string for B2C accounts
  companyId:    string;
  licenseType:  IcaoLicenseType | '';
  cohortId:     string; // semantic alias for assignedGroupId
  instructorId: string; // populated by apiGetMe group lookup for B2B users
}
