import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Download,
  Gauge as GaugeIcon,
  Import,
  Maximize2,
  Minus,
  Pin,
  PinOff,
  Power,
  RefreshCw,
  Settings,
  Square,
  Upload,
  X
} from 'lucide-react';
import type {
  DashboardSnapshot,
  LogEvent,
  LoggedReading,
  MetricCategory,
  MetricSample,
  MetricSet,
  MonitorSettings
} from './shared/types';

const metricColors = ['#4ec9b0', '#dcdcaa', '#f48771', '#ce9178', '#569cd6', '#c586c0', '#b5cea8', '#d7ba7d'];

const categoryOrder: MetricCategory[] = ['cpu', 'gpu', 'motherboard', 'voltage', 'fan', 'disk', 'network', 'memory', 'system'];

export function App(): ReactElement {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<MonitorSettings>();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [hoverMetric, setHoverMetric] = useState<string>();
  const [pinnedMetric, setPinnedMetric] = useState<string>();
  const [exportFrom, setExportFrom] = useState(() => toDatetimeLocal(Date.now() - 60 * 60 * 1000));
  const [exportTo, setExportTo] = useState(() => toDatetimeLocal(Date.now()));
  const [markerText, setMarkerText] = useState('Manual marker');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let disposed = false;
    window.vitals.getSnapshot().then((next) => {
      if (!disposed) {
        setSnapshot(next);
        setSettingsDraft(next.settings);
      }
    });
    const unsubscribe = window.vitals.onSnapshot((next) => {
      setSnapshot(next);
      setSettingsDraft((current) => current ?? next.settings);
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const currentMetrics = snapshot?.current?.metrics ?? [];
  const sortedMetrics = useMemo(() => [...currentMetrics].sort(sortMetrics), [currentMetrics]);
  const leftMetrics = sortedMetrics.filter((metric) => ['cpu', 'motherboard', 'voltage', 'memory'].includes(metric.category));
  const rightMetrics = sortedMetrics.filter((metric) => ['gpu', 'fan', 'disk', 'network'].includes(metric.category));
  const activeMetricId = pinnedMetric ?? hoverMetric;
  const activeMetric = sortedMetrics.find((metric) => metric.id === activeMetricId);

  const toggleManualLogging = async (): Promise<void> => {
    const enabled = !(snapshot?.state.isLogging && snapshot.state.loggingMode === 'manual');
    setSnapshot(await window.vitals.setManualLogging(enabled));
  };

  const saveSettings = async (): Promise<void> => {
    if (!settingsDraft) {
      return;
    }
    setSnapshot(await window.vitals.setSettings(settingsDraft));
    setSettingsOpen(false);
  };

  const exportRange = async (): Promise<void> => {
    await window.vitals.exportRange({
      from: new Date(exportFrom).getTime(),
      to: new Date(exportTo).getTime()
    });
  };

  const importJson = async (file?: File): Promise<void> => {
    if (!file) {
      return;
    }
    const content = await file.text();
    setSnapshot(await window.vitals.importJson(content));
  };

  const addMarker = async (): Promise<void> => {
    setSnapshot(await window.vitals.addMarker(markerText));
  };

  if (!snapshot) {
    return <div className="boot">Vitals Monitor is initializing telemetry collectors...</div>;
  }

  return (
    <div className="app-shell">
      <TitleBar isLogging={snapshot.state.isLogging} />
      <main className="workspace">
        <GaugeRail
          title="System Overview"
          metrics={leftMetrics}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          onHover={setHoverMetric}
          onPin={setPinnedMetric}
          pinnedMetric={pinnedMetric}
        />

        <section className="chart-zone">
          <Toolbar
            snapshot={snapshot}
            markerText={markerText}
            setMarkerText={setMarkerText}
            onMarker={addMarker}
            onManualLogging={toggleManualLogging}
          />
          <MetricChart readings={snapshot.loggedReadings} recentSets={snapshot.recentSets} events={snapshot.events} />
          {activeMetric && (
            <MetricPopover
              metric={activeMetric}
              recentSets={snapshot.recentSets}
              pinned={pinnedMetric === activeMetric.id}
              onClose={() => {
                setPinnedMetric(undefined);
                setHoverMetric(undefined);
              }}
            />
          )}
          <div className="lower-grid">
            <EventTable events={snapshot.events} />
            <SensorTable metrics={sortedMetrics} />
            <ImportExport
              exportFrom={exportFrom}
              exportTo={exportTo}
              setExportFrom={setExportFrom}
              setExportTo={setExportTo}
              onExport={exportRange}
              onImportClick={() => fileInputRef.current?.click()}
            />
          </div>
        </section>

        <GaugeRail
          title="GPU / I/O"
          metrics={rightMetrics}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          onHover={setHoverMetric}
          onPin={setPinnedMetric}
          pinnedMetric={pinnedMetric}
        />
      </main>

      <StatusBar snapshot={snapshot} onSettings={() => setSettingsOpen(true)} />

      {settingsOpen && settingsDraft && (
        <SettingsPanel
          settings={settingsDraft}
          setSettings={setSettingsDraft}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden-file"
        onChange={(event) => void importJson(event.target.files?.[0])}
      />
    </div>
  );
}

function TitleBar({ isLogging }: { isLogging: boolean }): ReactElement {
  return (
    <header className="titlebar">
      <div className="brand">
        <Activity size={21} />
        <strong>Vitals Monitor</strong>
        <span className={isLogging ? 'title-pill logging' : 'title-pill'}>{isLogging ? 'Logging' : 'Monitoring'}</span>
      </div>
      <nav className="tabs">
        <button className="tab active">Dashboard</button>
        <button className="tab">Graphs</button>
        <button className="tab">Sensors</button>
        <button className="tab">Logging</button>
        <button className="tab">Alerts</button>
      </nav>
      <div className="window-controls">
        <button title="Minimize" onClick={() => window.vitals.window.minimize()}><Minus size={15} /></button>
        <button title="Maximize" onClick={() => window.vitals.window.maximize()}><Square size={13} /></button>
        <button className="danger" title="Close to tray" onClick={() => window.vitals.window.closeToTray()}><X size={16} /></button>
      </div>
    </header>
  );
}

function Toolbar({
  snapshot,
  markerText,
  setMarkerText,
  onMarker,
  onManualLogging
}: {
  snapshot: DashboardSnapshot;
  markerText: string;
  setMarkerText: (value: string) => void;
  onMarker: () => void;
  onManualLogging: () => void;
}): ReactElement {
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <label>Time Range</label>
        <select defaultValue="1h">
          <option value="15m">15 min</option>
          <option value="1h">1 hour</option>
          <option value="6h">6 hours</option>
        </select>
      </div>
      <div className="toolbar-group">
        <label>Resolution</label>
        <select value={String(snapshot.state.currentPollingRateMs)} disabled>
          <option value={String(snapshot.settings.realtimePollingRateMs)}>Realtime</option>
          <option value={String(snapshot.settings.pollingRateMs)}>Defined</option>
        </select>
      </div>
      <div className="logging-block">
        <span className={snapshot.state.isLogging ? 'dot hot' : 'dot'} />
        <div>
          <strong>{snapshot.state.isLogging ? `Logging ${snapshot.state.loggingMode}` : 'Monitoring only'}</strong>
          <small>{snapshot.state.currentPollingRateMs / 1000}s poll interval</small>
        </div>
      </div>
      <button className={snapshot.state.isLogging ? 'command danger-command' : 'command'} onClick={onManualLogging}>
        <Power size={16} />
        {snapshot.state.isLogging && snapshot.state.loggingMode === 'manual' ? 'Stop Logging' : 'Manual Logging'}
      </button>
      <input value={markerText} onChange={(event) => setMarkerText(event.target.value)} className="marker-input" />
      <button className="command" onClick={onMarker}><Pin size={15} /> Marker</button>
    </div>
  );
}

function GaugeRail({
  title,
  metrics,
  collapsed,
  setCollapsed,
  onHover,
  onPin,
  pinnedMetric
}: {
  title: string;
  metrics: MetricSample[];
  collapsed: Record<string, boolean>;
  setCollapsed: (next: Record<string, boolean>) => void;
  onHover: (id?: string) => void;
  onPin: (id?: string) => void;
  pinnedMetric?: string;
}): ReactElement {
  const groups = useMemo(() => groupByCategory(metrics), [metrics]);

  return (
    <aside className="gauge-rail">
      <div className="rail-title"><GaugeIcon size={15} /> {title}</div>
      {categoryOrder.filter((category) => groups[category]?.length).map((category) => {
        const key = `${title}.${category}`;
        const isCollapsed = collapsed[key] ?? false;
        return (
          <section className="rail-section" key={category}>
            <button className="section-toggle" onClick={() => setCollapsed({ ...collapsed, [key]: !isCollapsed })}>
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <span>{category}</span>
            </button>
            {!isCollapsed && groups[category].slice(0, 10).map((metric) => (
              <Gauge
                key={metric.id}
                metric={metric}
                pinned={pinnedMetric === metric.id}
                onHover={onHover}
                onPin={onPin}
              />
            ))}
          </section>
        );
      })}
    </aside>
  );
}

function Gauge({
  metric,
  pinned,
  onHover,
  onPin
}: {
  metric: MetricSample;
  pinned: boolean;
  onHover: (id?: string) => void;
  onPin: (id?: string) => void;
}): ReactElement {
  const value = metric.value ?? 0;
  const max = Math.max(metric.criticalThreshold ?? metric.warningThreshold ?? 100, value, metric.unit === 'RPM' ? 2500 : 100);
  const pct = Math.max(0, Math.min(1, value / max));
  const deg = `${pct * 260}deg`;

  return (
    <button
      className={`gauge ${metric.severity} ${pinned ? 'pinned' : ''}`}
      onMouseEnter={() => onHover(metric.id)}
      onMouseLeave={() => onHover(undefined)}
      onClick={() => onPin(pinned ? undefined : metric.id)}
      title={`${metric.label} trend`}
    >
      <span className="gauge-ring" style={{ '--deg': deg } as CSSProperties}>
        <span>{metric.value === null ? '--' : formatValue(metric.value)}</span>
        <small>{metric.unit}</small>
      </span>
      <span className="gauge-copy">
        <strong>{metric.label}</strong>
        <small>{metric.details ?? severityText(metric)}</small>
      </span>
      {pinned ? <PinOff size={13} /> : <Pin size={13} />}
    </button>
  );
}

function MetricPopover({
  metric,
  recentSets,
  pinned,
  onClose
}: {
  metric: MetricSample;
  recentSets: MetricSet[];
  pinned: boolean;
  onClose: () => void;
}): ReactElement {
  const values = recentSets.map((set) => ({
    time: set.timestamp,
    value: set.metrics.find((candidate) => candidate.id === metric.id)?.value ?? null
  }));

  return (
    <div className="metric-popover">
      <div className="popover-head">
        <strong>{metric.label}</strong>
        <button onClick={onClose}>{pinned ? <PinOff size={13} /> : <X size={13} />}</button>
      </div>
      <MiniSpark values={values.map((point) => point.value)} />
      <div className="spark-labels">
        {values.map((point) => (
          <span key={point.time}>{point.value === null ? '--' : `${formatValue(point.value)}${metric.unit}`}</span>
        ))}
      </div>
    </div>
  );
}

function MetricChart({
  readings,
  recentSets,
  events
}: {
  readings: LoggedReading[];
  recentSets: MetricSet[];
  events: LogEvent[];
}): ReactElement {
  const seriesSets = readings.length > 0
    ? readings.map((reading) => ({ timestamp: reading.timestamp, metrics: reading.metrics, hostname: reading.hostname, ipAddress: reading.ipAddress }))
    : recentSets;
  const selected = useMemo(() => selectChartMetrics(seriesSets), [seriesSets]);
  const start = seriesSets[0]?.timestamp ?? Date.now() - 60_000;
  const end = seriesSets.at(-1)?.timestamp ?? Date.now();

  return (
    <section className="main-chart">
      <div className="chart-header">
        <div>
          <strong>Logged Data Timeline</strong>
          <span>{readings.length ? `${readings.length} database readings` : 'No active log records yet; showing in-memory samples'}</span>
        </div>
        <div className="legend">
          {selected.map((metric, index) => <span key={metric.id}><i style={{ background: metricColors[index % metricColors.length] }} /> {metric.label}</span>)}
        </div>
      </div>
      <svg viewBox="0 0 1000 430" role="img" aria-label="Metric timeline chart">
        <defs>
          <linearGradient id="rangeFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#153450" stopOpacity="0.55" />
            <stop offset="1" stopColor="#153450" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {Array.from({ length: 11 }).map((_, index) => <line key={`vx${index}`} x1={50 + index * 90} y1="34" x2={50 + index * 90} y2="370" className="grid-line" />)}
        {Array.from({ length: 8 }).map((_, index) => <line key={`hy${index}`} x1="50" y1={50 + index * 45} x2="950" y2={50 + index * 45} className="grid-line" />)}
        {selected.map((metric, index) => (
          <path key={metric.id} d={pathForMetric(seriesSets, metric.id, start, end)} fill="none" stroke={metricColors[index % metricColors.length]} strokeWidth="2" />
        ))}
        {events.filter((event) => ['start', 'stop', 'marker'].includes(event.type)).map((event) => {
          const x = timeToX(event.timestamp, start, end);
          return (
            <g key={event.id}>
              <line x1={x} x2={x} y1="30" y2="385" className={`event-line ${event.type}`} />
              <text x={x + 5} y={event.type === 'stop' ? 54 : 38} className={`event-label ${event.type}`}>{event.type.toUpperCase()}</text>
            </g>
          );
        })}
        <rect x="50" y="390" width="900" height="24" fill="url(#rangeFill)" stroke="#3d5670" />
        <text x="50" y="425" className="axis-label">{formatTime(start)}</text>
        <text x="900" y="425" className="axis-label">{formatTime(end)}</text>
      </svg>
    </section>
  );
}

function EventTable({ events }: { events: LogEvent[] }): ReactElement {
  return (
    <section className="table-panel">
      <h2>Events</h2>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Time</th><th>Level</th><th>Source</th><th>Message</th></tr></thead>
          <tbody>
            {events.slice(0, 30).map((event) => (
              <tr key={event.id}>
                <td>{formatTime(event.timestamp)}</td>
                <td className={`event-type ${event.type}`}>{event.type}</td>
                <td>{event.source}</td>
                <td>{event.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SensorTable({ metrics }: { metrics: MetricSample[] }): ReactElement {
  return (
    <section className="table-panel">
      <h2>Sensors</h2>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Sensor</th><th>Value</th><th>State</th><th>Warn</th><th>Crit</th></tr></thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={metric.id}>
                <td>{metric.label}</td>
                <td className={metric.severity}>{metric.value === null ? 'N/A' : `${formatValue(metric.value)} ${metric.unit}`}</td>
                <td>{metric.significantChange ? 'changed' : metric.severity}</td>
                <td>{metric.warningThreshold ?? '--'}</td>
                <td>{metric.criticalThreshold ?? '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ImportExport({
  exportFrom,
  exportTo,
  setExportFrom,
  setExportTo,
  onExport,
  onImportClick
}: {
  exportFrom: string;
  exportTo: string;
  setExportFrom: (value: string) => void;
  setExportTo: (value: string) => void;
  onExport: () => void;
  onImportClick: () => void;
}): ReactElement {
  return (
    <section className="table-panel io-panel">
      <h2>Archive</h2>
      <label>From <input type="datetime-local" value={exportFrom} onChange={(event) => setExportFrom(event.target.value)} /></label>
      <label>To <input type="datetime-local" value={exportTo} onChange={(event) => setExportTo(event.target.value)} /></label>
      <button className="command" onClick={onExport}><Download size={15} /> Export JSON</button>
      <button className="command" onClick={onImportClick}><Upload size={15} /> Load JSON</button>
    </section>
  );
}

function StatusBar({ snapshot, onSettings }: { snapshot: DashboardSnapshot; onSettings: () => void }): ReactElement {
  return (
    <footer className="statusbar">
      <span><i className={snapshot.state.isLogging ? 'status-light hot' : 'status-light'} /> {snapshot.state.isLogging ? 'Recording' : 'Monitoring'}</span>
      <span>Host {snapshot.system.hostname}</span>
      <span>IP {snapshot.system.ipAddress}</span>
      <span>{snapshot.system.cpu}</span>
      <span>{snapshot.system.gpu}</span>
      <button onClick={onSettings}><Settings size={15} /> Settings</button>
      <button onClick={() => window.vitals.window.closeToTray()}><Import size={15} /> Tray</button>
    </footer>
  );
}

function SettingsPanel({
  settings,
  setSettings,
  onClose,
  onSave
}: {
  settings: MonitorSettings;
  setSettings: (settings: MonitorSettings) => void;
  onClose: () => void;
  onSave: () => void;
}): ReactElement {
  const update = (key: keyof MonitorSettings, value: string): void => {
    setSettings({ ...settings, [key]: key === 'latencyTarget' ? value : Number(value) });
  };
  const updateThreshold = (key: keyof MonitorSettings['thresholds'], value: string): void => {
    setSettings({ ...settings, thresholds: { ...settings.thresholds, [key]: Number(value) } });
  };

  return (
    <div className="drawer-backdrop">
      <aside className="settings-drawer">
        <div className="drawer-head">
          <h2>Settings</h2>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="settings-grid">
          <label>Default Polling (ms)<input type="number" min="2000" value={settings.pollingRateMs} onChange={(event) => update('pollingRateMs', event.target.value)} /></label>
          <label>Realtime Polling (ms)<input type="number" min="500" value={settings.realtimePollingRateMs} onChange={(event) => update('realtimePollingRateMs', event.target.value)} /></label>
          <label>Latency Target<input value={settings.latencyTarget} onChange={(event) => update('latencyTarget', event.target.value)} /></label>
          {Object.entries(settings.thresholds).map(([key, value]) => (
            <label key={key}>{labelize(key)}<input type="number" value={value} onChange={(event) => updateThreshold(key as keyof MonitorSettings['thresholds'], event.target.value)} /></label>
          ))}
        </div>
        <div className="drawer-actions">
          <button className="command" onClick={onClose}>Cancel</button>
          <button className="command primary" onClick={onSave}><RefreshCw size={15} /> Apply</button>
        </div>
      </aside>
    </div>
  );
}

function MiniSpark({ values }: { values: Array<number | null> }): ReactElement {
  const valid = values.filter((value): value is number => typeof value === 'number');
  const min = valid.length ? Math.min(...valid) : 0;
  const max = valid.length ? Math.max(...valid) : 1;
  const points = values.map((value, index) => {
    const x = 8 + index * 45;
    const y = value === null ? 40 : 72 - ((value - min) / Math.max(1, max - min)) * 58;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg className="spark" viewBox="0 0 200 84">
      <polyline points={points} fill="none" stroke="#4ec9b0" strokeWidth="3" />
      {points.split(' ').filter(Boolean).map((point) => {
        const [x, y] = point.split(',');
        return <circle key={point} cx={x} cy={y} r="3" fill="#dcdcaa" />;
      })}
    </svg>
  );
}

function groupByCategory(metrics: MetricSample[]): Record<string, MetricSample[]> {
  return metrics.reduce<Record<string, MetricSample[]>>((groups, metric) => {
    groups[metric.category] = groups[metric.category] ?? [];
    groups[metric.category].push(metric);
    return groups;
  }, {});
}

function sortMetrics(a: MetricSample, b: MetricSample): number {
  return categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) || a.label.localeCompare(b.label);
}

function selectChartMetrics(sets: Array<{ metrics: MetricSample[] }>): MetricSample[] {
  const latest = sets.at(-1)?.metrics ?? [];
  return latest
    .filter((metric) => metric.value !== null && ['cpu', 'gpu', 'network', 'disk', 'memory'].includes(metric.category))
    .sort((a, b) => severityScore(b) - severityScore(a))
    .slice(0, 8);
}

function pathForMetric(sets: Array<{ timestamp: number; metrics: MetricSample[] }>, id: string, start: number, end: number): string {
  const points = sets
    .map((set) => ({ timestamp: set.timestamp, value: set.metrics.find((metric) => metric.id === id)?.value }))
    .filter((point): point is { timestamp: number; value: number } => typeof point.value === 'number');
  if (points.length === 0) {
    return '';
  }
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  return points.map((point, index) => {
    const x = timeToX(point.timestamp, start, end);
    const y = 365 - ((point.value - min) / Math.max(1, max - min)) * 310;
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function timeToX(timestamp: number, start: number, end: number): number {
  return 50 + ((timestamp - start) / Math.max(1, end - start)) * 900;
}

function severityScore(metric: MetricSample): number {
  if (metric.severity === 'critical') return 3;
  if (metric.severity === 'warning') return 2;
  if (metric.significantChange) return 1;
  return 0;
}

function severityText(metric: MetricSample): string {
  if (metric.value === null) return 'Unavailable';
  if (metric.significantChange) return 'Significant change';
  return `${metric.severity} threshold`;
}

function formatValue(value: number): string {
  return Math.abs(value) >= 100 ? Math.round(value).toLocaleString() : value.toFixed(value % 1 === 0 ? 0 : 1);
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(timestamp);
}

function toDatetimeLocal(timestamp: number): string {
  const date = new Date(timestamp);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function labelize(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}
