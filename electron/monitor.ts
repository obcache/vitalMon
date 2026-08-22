import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import { promisify } from 'node:util';
import ping from 'ping';
import * as si from 'systeminformation';
import { MetricsDatabase } from './database';
import type {
  DashboardSnapshot,
  ExportPayload,
  LogEvent,
  MetricSample,
  MetricSet,
  MonitorSettings,
  MonitorState,
  SystemBuildInfo
} from '../src/shared/types';

const execFileAsync = promisify(execFile);

export const defaultSettings: MonitorSettings = {
  pollingRateMs: 10_000,
  realtimePollingRateMs: 1_000,
  latencyTarget: '1.1.1.1',
  thresholds: {
    cpuTempWarnC: 85,
    cpuTempCriticalC: 95,
    gpuTempWarnC: 83,
    gpuTempCriticalC: 90,
    motherboardTempWarnC: 70,
    motherboardTempCriticalC: 85,
    diskUsedWarnPct: 85,
    diskUsedCriticalPct: 95,
    latencyWarnMs: 120,
    latencyCriticalMs: 250,
    jitterWarnMs: 30,
    jitterCriticalMs: 75,
    fanMinRpm: 400,
    voltageDriftPct: 7,
    significantChangePct: 15
  }
};

type LoggingMode = 'none' | 'automatic' | 'manual';

export class VitalsMonitor extends EventEmitter {
  private settings: MonitorSettings;
  private state: MonitorState = {
    isLogging: false,
    loggingMode: 'none',
    currentPollingRateMs: defaultSettings.pollingRateMs
  };
  private system: SystemBuildInfo = {
    hostname: os.hostname(),
    ipAddress: this.getPrimaryIp(),
    os: `${os.type()} ${os.release()}`,
    cpu: os.cpus()[0]?.model ?? 'Unknown CPU',
    motherboard: 'Unknown motherboard',
    gpu: 'Unknown GPU',
    memory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`
  };
  private readonly recentSets: MetricSet[] = [];
  private readonly latencyHistory: number[] = [];
  private timer?: NodeJS.Timeout;
  private polling = false;
  private activeSessionId?: string;

  constructor(private readonly database: MetricsDatabase) {
    super();
    this.settings = this.database.loadSettings(defaultSettings);
    this.state.currentPollingRateMs = this.settings.pollingRateMs;
  }

  async start(): Promise<void> {
    await this.refreshSystemInfo();
    await this.pollOnce();
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  getSnapshot(): DashboardSnapshot {
    return {
      state: this.state,
      settings: this.settings,
      system: this.system,
      current: this.recentSets.at(-1),
      recentSets: [...this.recentSets],
      loggedReadings: this.database.getRecentReadings(),
      events: this.database.getEvents()
    };
  }

  setSettings(settings: MonitorSettings): DashboardSnapshot {
    this.settings = {
      ...settings,
      pollingRateMs: Math.max(2_000, Number(settings.pollingRateMs)),
      realtimePollingRateMs: Math.max(500, Number(settings.realtimePollingRateMs)),
      thresholds: { ...defaultSettings.thresholds, ...settings.thresholds }
    };
    this.database.saveSettings(this.settings);
    if (!this.state.isLogging) {
      this.state.currentPollingRateMs = this.settings.pollingRateMs;
    }
    this.scheduleNext();
    this.emitSnapshot();
    return this.getSnapshot();
  }

  setManualLogging(enabled: boolean): DashboardSnapshot {
    if (enabled && this.state.loggingMode !== 'manual') {
      this.startLogging('manual', 'Manual realtime logging enabled');
    } else if (!enabled && this.state.loggingMode === 'manual') {
      this.stopLogging('Manual realtime logging disabled');
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  addMarker(message: string): DashboardSnapshot {
    this.database.insertEvent({
      timestamp: Date.now(),
      type: 'marker',
      source: 'User',
      message: message.trim() || 'Manual marker',
      sessionId: this.activeSessionId
    });
    this.emitSnapshot();
    return this.getSnapshot();
  }

  exportRange(from: number, to: number): ExportPayload {
    return {
      schema: 'vitals-monitor.export.v1',
      exportedAt: Date.now(),
      range: { from, to },
      readings: this.database.getReadingsInRange(from, to),
      events: this.database.getEventsInRange(from, to)
    };
  }

  importJson(content: string): DashboardSnapshot {
    const payload = JSON.parse(content) as ExportPayload;
    if (payload.schema !== 'vitals-monitor.export.v1' || !Array.isArray(payload.readings)) {
      throw new Error('Unsupported Vitals Monitor export format.');
    }
    this.database.importPayload(payload);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  private async pollOnce(): Promise<void> {
    if (this.polling) {
      return;
    }
    this.polling = true;
    try {
      const set = await this.collectMetricSet();
      this.applyChangeDetection(set.metrics);
      this.recentSets.push(set);
      if (this.recentSets.length > 5) {
        this.recentSets.shift();
      }

      const warnings = set.metrics.filter((metric) => metric.severity === 'warning' || metric.severity === 'critical');
      const significant = set.metrics.filter((metric) => metric.significantChange);

      if (!this.state.isLogging && (warnings.length > 0 || significant.length > 0)) {
        const reason = warnings[0]?.label ?? significant[0]?.label ?? 'metric change';
        this.startLogging('automatic', `Automatic realtime logging started: ${reason}`);
        this.state.lastAutoReason = reason;
      }

      if (this.state.isLogging) {
        this.database.insertReading({
          timestamp: set.timestamp,
          hostname: set.hostname,
          ipAddress: set.ipAddress,
          system: this.system,
          metrics: set.metrics,
          loggingReason: this.state.loggingMode === 'manual' ? 'manual' : 'automatic',
          sessionId: this.activeSessionId
        });
      }

      if (this.state.loggingMode === 'automatic' && warnings.length === 0 && this.hasStabilized()) {
        this.stopLogging('Automatic realtime logging stopped: metrics stabilized');
      }

      this.emitSnapshot();
    } catch (error) {
      this.database.insertEvent({
        timestamp: Date.now(),
        type: 'warning',
        source: 'Monitor',
        message: error instanceof Error ? error.message : 'Metric polling failed',
        sessionId: this.activeSessionId
      });
      this.emitSnapshot();
    } finally {
      this.polling = false;
    }
  }

  private scheduleNext(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    const rate = this.state.isLogging ? this.settings.realtimePollingRateMs : this.settings.pollingRateMs;
    this.state.currentPollingRateMs = rate;
    this.timer = setTimeout(async () => {
      await this.pollOnce();
      this.scheduleNext();
    }, rate);
  }

  private startLogging(mode: Exclude<LoggingMode, 'none'>, message: string): void {
    this.activeSessionId = randomUUID();
    this.state = {
      ...this.state,
      isLogging: true,
      loggingMode: mode,
      currentPollingRateMs: this.settings.realtimePollingRateMs,
      activeSessionId: this.activeSessionId
    };
    this.database.insertEvent({
      timestamp: Date.now(),
      type: 'start',
      source: mode === 'manual' ? 'User' : 'Monitor',
      message,
      sessionId: this.activeSessionId
    });
    this.scheduleNext();
  }

  private stopLogging(message: string): void {
    const sessionId = this.activeSessionId;
    this.database.insertEvent({
      timestamp: Date.now(),
      type: 'stop',
      source: this.state.loggingMode === 'manual' ? 'User' : 'Monitor',
      message,
      sessionId
    });
    this.activeSessionId = undefined;
    this.state = {
      isLogging: false,
      loggingMode: 'none',
      currentPollingRateMs: this.settings.pollingRateMs
    };
    this.scheduleNext();
  }

  private emitSnapshot(): void {
    this.emit('snapshot', this.getSnapshot());
  }

  private async refreshSystemInfo(): Promise<void> {
    const [system, baseboard, cpu, graphics, mem, osInfo] = await Promise.all([
      si.system().catch(() => undefined),
      si.baseboard().catch(() => undefined),
      si.cpu().catch(() => undefined),
      si.graphics().catch(() => undefined),
      si.mem().catch(() => undefined),
      si.osInfo().catch(() => undefined)
    ]);
    this.system = {
      hostname: os.hostname(),
      ipAddress: this.getPrimaryIp(),
      os: osInfo ? `${osInfo.distro} ${osInfo.release}` : `${os.type()} ${os.release()}`,
      cpu: cpu?.brand ?? os.cpus()[0]?.model ?? 'Unknown CPU',
      motherboard: [baseboard?.manufacturer, baseboard?.model].filter(Boolean).join(' ') || system?.model || 'Unknown motherboard',
      gpu: graphics?.controllers?.map((gpu) => gpu.model).filter(Boolean).join(', ') || 'Unknown GPU',
      memory: mem?.total ? `${Math.round(mem.total / 1024 / 1024 / 1024)} GB` : `${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`
    };
  }

  private async collectMetricSet(): Promise<MetricSet> {
    const timestamp = Date.now();
    const [load, cpuTemp, mem, fsSize, graphics, network, hardwareSensors] = await Promise.all([
      si.currentLoad().catch(() => undefined),
      si.cpuTemperature().catch(() => undefined),
      si.mem().catch(() => undefined),
      si.fsSize().catch(() => []),
      si.graphics().catch(() => undefined),
      this.measureNetwork(),
      this.readHardwareSensors()
    ]);

    const metrics: MetricSample[] = [];
    const push = (metric: Omit<MetricSample, 'severity'>): void => {
      metrics.push(this.withSeverity(metric));
    };

    push({ id: 'cpu.load', label: 'CPU Load', category: 'cpu', unit: '%', value: round(load?.currentLoad), warningThreshold: 90, criticalThreshold: 98 });
    push({ id: 'memory.used', label: 'Memory Used', category: 'memory', unit: '%', value: mem?.total ? round((mem.used / mem.total) * 100) : null, warningThreshold: 85, criticalThreshold: 95 });
    push({ id: 'cpu.package', label: 'CPU Package', category: 'cpu', unit: 'C', value: round(cpuTemp?.main), warningThreshold: this.settings.thresholds.cpuTempWarnC, criticalThreshold: this.settings.thresholds.cpuTempCriticalC });
    (cpuTemp?.cores ?? []).forEach((core, index) => {
      push({ id: `cpu.core.${index}`, label: `CPU Core ${index + 1}`, category: 'cpu', unit: 'C', value: round(core), warningThreshold: this.settings.thresholds.cpuTempWarnC, criticalThreshold: this.settings.thresholds.cpuTempCriticalC });
    });

    graphics?.controllers?.forEach((gpu, index) => {
      push({ id: `gpu.${index}.temp`, label: `${gpu.model || `GPU ${index + 1}`} Temp`, category: 'gpu', unit: 'C', value: round(gpu.temperatureGpu), warningThreshold: this.settings.thresholds.gpuTempWarnC, criticalThreshold: this.settings.thresholds.gpuTempCriticalC });
      push({ id: `gpu.${index}.load`, label: `${gpu.model || `GPU ${index + 1}`} Load`, category: 'gpu', unit: '%', value: round(gpu.utilizationGpu), warningThreshold: 95, criticalThreshold: 99 });
      push({ id: `gpu.${index}.fan`, label: `${gpu.model || `GPU ${index + 1}`} Fan`, category: 'fan', unit: 'RPM', value: round(gpu.fanSpeed), warningThreshold: this.settings.thresholds.fanMinRpm, details: 'Low fan speed warning when active' });
    });

    fsSize.forEach((drive) => {
      push({ id: `disk.${drive.fs}`, label: `${drive.fs} Used`, category: 'disk', unit: '%', value: round(drive.use), warningThreshold: this.settings.thresholds.diskUsedWarnPct, criticalThreshold: this.settings.thresholds.diskUsedCriticalPct, details: drive.mount });
    });

    for (const sensor of hardwareSensors) {
      push(sensor);
    }

    push({ id: 'network.latency', label: `Latency ${this.settings.latencyTarget}`, category: 'network', unit: 'ms', value: network.latency, warningThreshold: this.settings.thresholds.latencyWarnMs, criticalThreshold: this.settings.thresholds.latencyCriticalMs });
    push({ id: 'network.jitter', label: 'Network Jitter', category: 'network', unit: 'ms', value: network.jitter, warningThreshold: this.settings.thresholds.jitterWarnMs, criticalThreshold: this.settings.thresholds.jitterCriticalMs });
    push({ id: 'network.packetLoss', label: 'Packet Loss', category: 'network', unit: '%', value: network.packetLoss, warningThreshold: 2, criticalThreshold: 8 });

    return { timestamp, metrics, hostname: this.system.hostname, ipAddress: this.system.ipAddress };
  }

  private withSeverity(metric: Omit<MetricSample, 'severity'>): MetricSample {
    if (metric.value === null || Number.isNaN(metric.value)) {
      return { ...metric, value: null, severity: 'unavailable' };
    }
    if (metric.category === 'fan' && metric.warningThreshold && metric.value > 0 && metric.value < metric.warningThreshold) {
      return { ...metric, severity: 'warning' };
    }
    if (metric.criticalThreshold !== undefined && metric.value >= metric.criticalThreshold) {
      return { ...metric, severity: 'critical' };
    }
    if (metric.warningThreshold !== undefined && metric.value >= metric.warningThreshold) {
      return { ...metric, severity: 'warning' };
    }
    return { ...metric, severity: 'normal' };
  }

  private applyChangeDetection(metrics: MetricSample[]): void {
    for (const metric of metrics) {
      if (metric.value === null) {
        continue;
      }
      const values = this.recentSets
        .map((set) => set.metrics.find((candidate) => candidate.id === metric.id)?.value)
        .filter((value): value is number => typeof value === 'number');
      if (values.length < 4) {
        continue;
      }
      const allValues = [...values, metric.value];
      const min = Math.min(...allValues);
      const max = Math.max(...allValues);
      const avg = allValues.reduce((sum, value) => sum + value, 0) / allValues.length;
      const changePct = avg === 0 ? 0 : ((max - min) / Math.abs(avg)) * 100;
      const floor = metric.unit === 'C' ? 4 : metric.unit === 'ms' ? 15 : metric.unit === 'RPM' ? 300 : 1;
      metric.significantChange = max - min >= floor && changePct >= this.settings.thresholds.significantChangePct;
      if (metric.significantChange && metric.severity === 'normal') {
        metric.severity = 'warning';
      }
    }
  }

  private hasStabilized(): boolean {
    if (this.recentSets.length < 5) {
      return false;
    }
    return this.recentSets.every((set) =>
      set.metrics.every((metric) => metric.severity === 'normal' || metric.severity === 'unavailable')
    );
  }

  private async measureNetwork(): Promise<{ latency: number | null; jitter: number | null; packetLoss: number | null }> {
    try {
      const result = await ping.promise.probe(this.settings.latencyTarget, { timeout: 2, min_reply: 1 });
      const latency = result.alive ? round(Number(result.time)) : null;
      const packetLoss = Number.parseFloat(String(result.packetLoss ?? '0')) || 0;
      if (latency !== null) {
        this.latencyHistory.push(latency);
        if (this.latencyHistory.length > 5) {
          this.latencyHistory.shift();
        }
      }
      const jitter = this.latencyHistory.length > 1 ? round(stddev(this.latencyHistory)) : 0;
      return { latency, jitter, packetLoss };
    } catch {
      return { latency: null, jitter: null, packetLoss: null };
    }
  }

  private async readHardwareSensors(): Promise<Omit<MetricSample, 'severity'>[]> {
    if (process.platform !== 'win32') {
      return [];
    }
    const command = `
      $namespaces = @('root\\LibreHardwareMonitor','root\\OpenHardwareMonitor')
      $items = @()
      foreach ($ns in $namespaces) {
        try {
          $items += Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction Stop |
            Where-Object { $_.SensorType -in @('Temperature','Voltage','Fan') } |
            Select-Object Name, Identifier, SensorType, Value
        } catch {}
      }
      $items | ConvertTo-Json -Compress
    `;
    try {
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { timeout: 2_500 });
      const parsed = JSON.parse(stdout.trim() || '[]') as Array<{ Name: string; Identifier?: string; SensorType: string; Value: number | null }>;
      const sensors = Array.isArray(parsed) ? parsed : [parsed];
      return sensors.map((sensor, index) => {
        const type = sensor.SensorType.toLowerCase();
        const category = type === 'voltage' ? 'voltage' : type === 'fan' ? 'fan' : sensor.Name.toLowerCase().includes('gpu') ? 'gpu' : 'motherboard';
        const unit = type === 'voltage' ? 'V' : type === 'fan' ? 'RPM' : 'C';
        const thresholds = this.settings.thresholds;
        return {
          id: `sensor.${sensor.Identifier || index}`.replace(/[^\w.-]/g, '_'),
          label: sensor.Name,
          category,
          unit,
          value: round(sensor.Value),
          warningThreshold: category === 'fan' ? thresholds.fanMinRpm : category === 'voltage' ? undefined : thresholds.motherboardTempWarnC,
          criticalThreshold: category === 'fan' || category === 'voltage' ? undefined : thresholds.motherboardTempCriticalC
        };
      });
    } catch {
      return [];
    }
  }

  private getPrimaryIp(): string {
    for (const entries of Object.values(os.networkInterfaces())) {
      for (const entry of entries ?? []) {
        if (entry.family === 'IPv4' && !entry.internal) {
          return entry.address;
        }
      }
    }
    return '127.0.0.1';
  }
}

function round(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

function stddev(values: number[]): number {
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
