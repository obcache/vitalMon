export type MetricSeverity = 'normal' | 'warning' | 'critical' | 'unavailable';

export type MetricCategory =
  | 'cpu'
  | 'gpu'
  | 'motherboard'
  | 'voltage'
  | 'fan'
  | 'disk'
  | 'network'
  | 'memory'
  | 'system';

export interface MetricSample {
  id: string;
  label: string;
  category: MetricCategory;
  unit: string;
  value: number | null;
  severity: MetricSeverity;
  warningThreshold?: number;
  criticalThreshold?: number;
  significantChange?: boolean;
  details?: string;
}

export interface MetricSet {
  timestamp: number;
  metrics: MetricSample[];
  hostname: string;
  ipAddress: string;
}

export interface SystemBuildInfo {
  hostname: string;
  ipAddress: string;
  os: string;
  cpu: string;
  motherboard: string;
  gpu: string;
  memory: string;
}

export interface MonitorThresholds {
  cpuTempWarnC: number;
  cpuTempCriticalC: number;
  gpuTempWarnC: number;
  gpuTempCriticalC: number;
  motherboardTempWarnC: number;
  motherboardTempCriticalC: number;
  diskUsedWarnPct: number;
  diskUsedCriticalPct: number;
  latencyWarnMs: number;
  latencyCriticalMs: number;
  jitterWarnMs: number;
  jitterCriticalMs: number;
  fanMinRpm: number;
  voltageDriftPct: number;
  significantChangePct: number;
}

export interface MonitorSettings {
  pollingRateMs: number;
  realtimePollingRateMs: number;
  latencyTarget: string;
  thresholds: MonitorThresholds;
}

export interface LogEvent {
  id: number;
  timestamp: number;
  type: 'start' | 'stop' | 'marker' | 'warning' | 'info' | 'import';
  source: string;
  message: string;
  sessionId?: string;
}

export interface LoggedReading {
  id: number;
  timestamp: number;
  hostname: string;
  ipAddress: string;
  system: SystemBuildInfo;
  metrics: MetricSample[];
  loggingReason: 'automatic' | 'manual' | 'imported';
  sessionId?: string;
}

export interface MonitorState {
  isLogging: boolean;
  loggingMode: 'none' | 'automatic' | 'manual';
  currentPollingRateMs: number;
  lastAutoReason?: string;
  activeSessionId?: string;
}

export interface DashboardSnapshot {
  state: MonitorState;
  settings: MonitorSettings;
  system: SystemBuildInfo;
  current?: MetricSet;
  recentSets: MetricSet[];
  loggedReadings: LoggedReading[];
  events: LogEvent[];
}

export interface ExportRequest {
  from: number;
  to: number;
}

export interface ExportPayload {
  schema: 'vitals-monitor.export.v1';
  exportedAt: number;
  range: ExportRequest;
  readings: LoggedReading[];
  events: LogEvent[];
}

export interface VitalsApi {
  getSnapshot: () => Promise<DashboardSnapshot>;
  setSettings: (settings: MonitorSettings) => Promise<DashboardSnapshot>;
  setManualLogging: (enabled: boolean) => Promise<DashboardSnapshot>;
  addMarker: (message: string) => Promise<DashboardSnapshot>;
  exportRange: (range: ExportRequest) => Promise<{ canceled: boolean; filePath?: string }>;
  importJson: (content: string) => Promise<DashboardSnapshot>;
  onSnapshot: (callback: (snapshot: DashboardSnapshot) => void) => () => void;
  window: {
    minimize: () => void;
    maximize: () => void;
    closeToTray: () => void;
    quit: () => void;
  };
}
