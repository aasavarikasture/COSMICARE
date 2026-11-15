import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../lib/auth/context';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api/client';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface Mission {
  id: number;
  code?: string;
  name: string;
  category?: string;
  destination?: string;
  phase?: string;
  planned_duration_days?: number;
  elapsed_duration_days?: number;
  crew_size?: number;
  radiation_environment?: string;
  crew?: { astronaut_id: number; user_id: number; name: string; callsign: string; seat: string; role_on_mission: string }[];
}

interface Astronaut {
  id: number;
  callsign?: string;
  full_name?: string;
  missions?: { id: number; name: string; phase: string; code: string }[];
}

interface HealthData {
  latest?: any;
  insights?: any[];
  risks?: any[];
  recommendations?: any[];
  mission?: any;
  statistics?: any;
  assessments?: any[];
}

interface Incident {
  id: number;
  mission_id: number;
  astronaut_id?: number | null;
  severity: string;
  title: string;
  description: string;
  status: string;
  assigned_to?: number | null;
  created_at: string;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  resolution_summary?: string;
  events?: { id: number; action: string; note: string; created_at: string }[];
  mission?: { id: number; name: string } | null;
  astronaut?: { id: number; callsign: string } | null;
}

const fmt = (v: unknown, d = 1) => (typeof v === 'number' ? v.toFixed(d) : String(v ?? '—'));
const fmtTime = (iso?: string | null) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

const healthStatusOf = (health?: HealthData, radiation?: any): 'critical' | 'attention' | 'normal' => {
  const insights = health?.insights || [];
  if (insights.some((i: any) => i.severity === 'critical' || i.severity === 'high')) return 'critical';
  if (radiation?.alerts?.some((a: any) => a.severity === 'critical' || a.severity === 'high')) return 'critical';
  if (insights.some((i: any) => i.severity === 'moderate' || i.severity === 'warning')) return 'attention';
  if (radiation?.alerts?.some((a: any) => a.severity === 'moderate')) return 'attention';
  return 'normal';
};

export const MissionControlDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [missions, setMissions] = useState<Mission[]>([]);
  const [astronauts, setAstronauts] = useState<Astronaut[]>([]);
  const [healthMap, setHealthMap] = useState<Record<number, HealthData>>({});
  const [radiationMap, setRadiationMap] = useState<Record<number, any>>({});
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'crew' | 'alerts' | 'incidents' | 'missions' | 'analytics'>('overview');
  const [selectedAstronautId, setSelectedAstronautId] = useState<number | null>(null);
  const [selectedMissionId, setSelectedMissionId] = useState<number | null>(null);

  // filters
  const [missionFilter, setMissionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // incident form
  const [incMissionId, setIncMissionId] = useState<number | ''>('');
  const [incAstronautId, setIncAstronautId] = useState<number | ''>('');
  const [incSeverity, setIncSeverity] = useState('moderate');
  const [incTitle, setIncTitle] = useState('');
  const [incDescription, setIncDescription] = useState('');
  const [incMsg, setIncMsg] = useState<string | null>(null);
  const [incLoading, setIncLoading] = useState(false);

  // analytics
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, aRes, iRes] = await Promise.all([
        api.get<{ missions: Mission[] }>('/missions'),
        api.get<{ astronauts: Astronaut[] }>('/astronauts'),
        api.get<{ incidents: Incident[] }>('/incidents'),
      ]);
      if (!mRes.success) throw new Error(mRes.error || 'Failed to load missions');
      if (!aRes.success) throw new Error(aRes.error || 'Failed to load astronauts');
      const ms = mRes.data?.missions || [];
      const as = aRes.data?.astronauts || [];
      setMissions(ms);
      setAstronauts(as);
      if (iRes.success) setIncidents(iRes.data?.incidents || []);

      // fetch health + radiation per astronaut
      const hMap: Record<number, HealthData> = {};
      const rMap: Record<number, any> = {};
      await Promise.all(
        as.map(async (a) => {
          const [h, r] = await Promise.all([
            api.get<HealthData>(`/astronauts/${a.id}/health`),
            api.get<any>(`/radiation?astronaut_id=${a.id}`),
          ]);
          if (h.success && h.data) hMap[a.id] = h.data;
          if (r.success && r.data) rMap[a.id] = r.data;
        }),
      );
      setHealthMap(hMap);
      setRadiationMap(rMap);
      setLastSync(new Date().toISOString());
    } catch (e: any) {
      setError(e?.message || 'Failed to load Mission Control data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadAnalytics = async (missionId: number) => {
    setAnalyticsLoading(true);
    setAnalyticsData(null);
    try {
      const res = await api.get<any>(`/analytics/mission?mission_id=${missionId}`);
      if (res.success) setAnalyticsData(res.data);
    } catch {
      // ignore
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'analytics' && selectedMissionId) {
      loadAnalytics(selectedMissionId);
    }
  }, [activeTab, selectedMissionId]);

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incMissionId || !incTitle || !incDescription) return;
    setIncLoading(true);
    setIncMsg(null);
    try {
      const payload: any = {
        mission_id: Number(incMissionId),
        severity: incSeverity,
        title: incTitle,
        description: incDescription,
        source: 'manual',
      };
      if (incAstronautId) payload.astronaut_id = Number(incAstronautId);
      const res = await api.post('/incidents', payload);
      if (res.success) {
        setIncMsg('Incident created.');
        setIncTitle(''); setIncDescription('');
        // refresh incidents
        const iRes = await api.get<{ incidents: Incident[] }>('/incidents');
        if (iRes.success) setIncidents(iRes.data?.incidents || []);
      } else {
        setIncMsg(res.error || 'Failed to create incident');
      }
    } catch (err: any) {
      setIncMsg(err?.message || 'Failed to create incident');
    } finally {
      setIncLoading(false);
    }
  };

  const updateIncidentStatus = async (inc: Incident, status: string) => {
    try {
      await api.patch(`/incidents/${inc.id}`, { status, note: `Status set to ${status}` });
      const iRes = await api.get<{ incidents: Incident[] }>('/incidents');
      if (iRes.success) setIncidents(iRes.data?.incidents || []);
    } catch {
      // ignore
    }
  };

  const acknowledgeIncident = async (inc: Incident) => {
    try {
      await api.post(`/incidents/${inc.id}/acknowledge`, {});
      const iRes = await api.get<{ incidents: Incident[] }>('/incidents');
      if (iRes.success) setIncidents(iRes.data?.incidents || []);
    } catch {
      // ignore
    }
  };

  // derived
  const statusOf = (a: Astronaut) => healthStatusOf(healthMap[a.id], radiationMap[a.id]);

  const filteredAstronauts = useMemo(() => {
    return astronauts.filter((a) => {
      const name = (a.full_name || '').toLowerCase();
      const cs = (a.callsign || '').toLowerCase();
      if (search && !name.includes(search.toLowerCase()) && !cs.includes(search.toLowerCase())) return false;
      if (missionFilter !== 'all') {
        const mid = Number(missionFilter);
        const assigned = (a.missions || []).some((m) => m.id === mid);
        if (!assigned) return false;
      }
      if (statusFilter !== 'all') {
        if (statusOf(a) !== statusFilter) return false;
      }
      if (phaseFilter !== 'all') {
        const phases = (a.missions || []).map((m) => m.phase);
        if (!phases.includes(phaseFilter)) return false;
      }
      return true;
    });
  }, [astronauts, search, missionFilter, statusFilter, phaseFilter, healthMap, radiationMap]);

  const overview = useMemo(() => {
    const totalMissions = missions.length;
    const totalAstro = astronauts.length;
    let normal = 0, attention = 0, critical = 0;
    astronauts.forEach((a) => {
      const s = statusOf(a);
      if (s === 'normal') normal++;
      else if (s === 'attention') attention++;
      else critical++;
    });
    const activeIncidents = incidents.filter((i) => ['new', 'acknowledged', 'under_review', 'action_required'].includes(i.status)).length;
    const criticalAlerts = incidents.filter((i) => i.severity === 'critical' && ['new', 'acknowledged', 'under_review', 'action_required'].includes(i.status)).length;
    // recent health events from insights across astronauts
    const recentEvents: any[] = [];
    astronauts.forEach((a) => {
      const h = healthMap[a.id];
      (h?.insights || []).slice(0, 3).forEach((ins: any) => {
        recentEvents.push({ astronaut: a, insight: ins });
      });
    });
    recentEvents.sort((a, b) => (b.insight.created_at || '').localeCompare(a.insight.created_at || ''));
    return { totalMissions, totalAstro, normal, attention, critical, activeIncidents, criticalAlerts, recentEvents: recentEvents.slice(0, 10) };
  }, [missions, astronauts, healthMap, radiationMap, incidents]);

  const selectedAstronaut = astronauts.find((a) => a.id === selectedAstronautId) || null;
  const selectedHealth = selectedAstronautId ? healthMap[selectedAstronautId] : null;
  const selectedRadiation = selectedAstronautId ? radiationMap[selectedAstronautId] : null;

  const selectedAstronautIncidents = incidents.filter((i) => i.astronaut_id === selectedAstronautId);

  const chartData = useMemo(() => {
    const s = (selectedHealth as any)?.series || [];
    return s.slice(-60).map((snap: any) => ({
      time: snap.recorded_at ? new Date(snap.recorded_at).toLocaleTimeString() : '',
      hr: snap.heart_rate,
      spo2: snap.spo2,
      sleep: snap.sleep_hours,
    }));
  }, [selectedHealth]);

  const handleLogoutClick = handleLogout;

  if (loading) {
    return (
      <section className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-silver text-sm">Loading Mission Control…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-serif text-warm-ivory mb-2">Unable to load Mission Control</h1>
          <p className="text-muted-silver text-sm mb-4">{error}</p>
          <Button onClick={load}>Retry</Button>
        </div>
      </section>
    );
  }

  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'crew', label: 'Crew' },
    { key: 'alerts', label: 'Alerts' },
    { key: 'incidents', label: 'Incidents' },
    { key: 'missions', label: 'Missions' },
    { key: 'analytics', label: 'Analytics' },
  ];

  return (
    <section className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-warm-ivory">Mission Control</h1>
            <p className="text-muted-silver text-sm mt-1">
              Crew health monitoring · {user?.full_name} · Last sync {fmtTime(lastSync)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
            <Button variant="ghost" size="sm" onClick={handleLogoutClick}>Sign Out</Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-border/20 pb-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === t.key ? 'bg-warm-ivory text-deepblack' : 'text-muted-silver hover:text-warm-ivory'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
                <p className="text-xs text-muted-silver uppercase tracking-wider">Active missions</p>
                <p className="text-3xl font-bold text-warm-ivory">{overview.totalMissions}</p>
              </div>
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
                <p className="text-xs text-muted-silver uppercase tracking-wider">Astronauts monitored</p>
                <p className="text-3xl font-bold text-warm-ivory">{overview.totalAstro}</p>
              </div>
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
                <p className="text-xs text-muted-silver uppercase tracking-wider">Normal</p>
                <p className="text-3xl font-bold text-success">{overview.normal}</p>
              </div>
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
                <p className="text-xs text-muted-silver uppercase tracking-wider">Needs attention</p>
                <p className="text-3xl font-bold text-warning">{overview.attention}</p>
              </div>
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
                <p className="text-xs text-muted-silver uppercase tracking-wider">Critical</p>
                <p className="text-3xl font-bold text-restrained-red">{overview.critical}</p>
              </div>
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
                <p className="text-xs text-muted-silver uppercase tracking-wider">Active incidents</p>
                <p className="text-3xl font-bold text-warm-ivory">{overview.activeIncidents}</p>
              </div>
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
                <p className="text-xs text-muted-silver uppercase tracking-wider">Critical alerts</p>
                <p className="text-3xl font-bold text-restrained-red">{overview.criticalAlerts}</p>
              </div>
            </div>

            <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
              <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Recent health events</h2>
              {overview.recentEvents.length === 0 ? (
                <p className="text-muted-silver text-sm">No recent events.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {overview.recentEvents.map((ev: any, i: number) => (
                    <li key={i} className="border-b border-border/10 pb-2">
                      <div className="flex justify-between">
                        <span className="text-warm-ivory font-medium">{ev.astronaut.callsign} — {ev.insight.title}</span>
                        <span className="text-xs text-muted-silver/60">{fmtTime(ev.insight.created_at)}</span>
                      </div>
                      <p className="text-xs text-muted-silver mt-1">{ev.insight.summary}</p>
                      <p className="text-xs text-muted-silver/50">{ev.insight.severity} · {ev.insight.data_class}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* CREW */}
        {activeTab === 'crew' && (
          <div className="space-y-4">
            {/* filters */}
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-muted-silver">Search</label>
                <input value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" placeholder="name/callsign" />
              </div>
              <div>
                <label className="text-xs text-muted-silver">Mission</label>
                <select value={missionFilter} onChange={(e) => setMissionFilter(e.target.value)} className="rounded-md border border-input bg-background p-2 text-sm text-warm-ivory">
                  <option value="all">All</option>
                  {missions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-silver">Status</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-input bg-background p-2 text-sm text-warm-ivory">
                  <option value="all">All</option>
                  <option value="normal">Normal</option>
                  <option value="attention">Attention</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-silver">Phase</label>
                <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)} className="rounded-md border border-input bg-background p-2 text-sm text-warm-ivory">
                  <option value="all">All</option>
                  <option value="pre_mission">Pre-mission</option>
                  <option value="in_flight">In-flight</option>
                  <option value="post_mission">Post-mission</option>
                </select>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {/* crew list */}
              <div className="md:col-span-1 rounded-xl p-4 bg-surface/50 border border-border/20 max-h-[70vh] overflow-auto">
                <h2 className="text-lg font-serif font-bold text-warm-ivory mb-3">Crew</h2>
                {filteredAstronauts.length === 0 ? (
                  <p className="text-muted-silver text-sm">No astronauts match filters.</p>
                ) : (
                  <ul className="space-y-2">
                    {filteredAstronauts.map((a) => {
                      const st = statusOf(a);
                      const h = healthMap[a.id];
                      const latest = h?.latest;
                      return (
                        <li key={a.id}>
                          <button
                            onClick={() => setSelectedAstronautId(a.id)}
                            className={`w-full text-left rounded-md p-2 border transition-colors ${
                              selectedAstronautId === a.id ? 'border-warm-ivory bg-charcoal/40' : 'border-border/10 hover:bg-charcoal/20'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-warm-ivory font-medium">{a.callsign}</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                st === 'critical' ? 'bg-restrained-red/20 text-restrained-red' :
                                st === 'attention' ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'
                              }`}>{st}</span>
                            </div>
                            <p className="text-xs text-muted-silver">{a.full_name}</p>
                            {latest && (
                              <p className="text-xs text-muted-silver/60 mt-1">
                                HR {fmt(latest.heart_rate)} · SpO₂ {fmt(latest.spo2)} · Sleep {fmt(latest.sleep_hours)}
                              </p>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* detail */}
              <div className="md:col-span-2 rounded-xl p-6 bg-surface/50 border border-border/20">
                {!selectedAstronaut ? (
                  <p className="text-muted-silver text-sm">Select an astronaut to view operational health details.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-xl font-serif font-bold text-warm-ivory">
                          {selectedAstronaut.full_name} ({selectedAstronaut.callsign})
                        </h2>
                        <p className="text-sm text-muted-silver">
                          Missions: {(selectedAstronaut.missions || []).map((m) => `${m.name} (${m.phase})`).join(', ') || '—'}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${
                        statusOf(selectedAstronaut) === 'critical' ? 'bg-restrained-red/20 text-restrained-red' :
                        statusOf(selectedAstronaut) === 'attention' ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'
                      }`}>{statusOf(selectedAstronaut)}</span>
                    </div>

                    {selectedHealth?.latest && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div><p className="text-xs text-muted-silver">Heart Rate</p><p className="text-warm-ivory font-mono">{fmt(selectedHealth.latest.heart_rate)} BPM</p></div>
                        <div><p className="text-xs text-muted-silver">BP</p><p className="text-warm-ivory font-mono">{fmt(selectedHealth.latest.systolic,0)}/{fmt(selectedHealth.latest.diastolic,0)}</p></div>
                        <div><p className="text-xs text-muted-silver">SpO₂</p><p className="text-warm-ivory font-mono">{fmt(selectedHealth.latest.spo2)} %</p></div>
                        <div><p className="text-xs text-muted-silver">Temp</p><p className="text-warm-ivory font-mono">{fmt(selectedHealth.latest.body_temp)} °C</p></div>
                        <div><p className="text-xs text-muted-silver">Sleep</p><p className="text-warm-ivory font-mono">{fmt(selectedHealth.latest.sleep_hours)} h</p></div>
                        <div><p className="text-xs text-muted-silver">Recovery</p><p className="text-warm-ivory font-mono">{fmt(selectedHealth.latest.recovery_score)} %</p></div>
                        <div><p className="text-xs text-muted-silver">Steps</p><p className="text-warm-ivory font-mono">{fmt(selectedHealth.latest.steps,0)}</p></div>
                        <div><p className="text-xs text-muted-silver">Last update</p><p className="text-warm-ivory text-xs">{fmtTime(selectedHealth.latest.recorded_at)}</p></div>
                      </div>
                    )}

                    {selectedRadiation && (
                      <div className="border-t border-border/10 pt-3">
                        <h3 className="text-sm font-medium text-warm-ivory mb-2">Radiation (modelled)</h3>
                        <p className="text-sm text-muted-silver">
                          Cumulative {fmt(selectedRadiation.cumulative_dose_msv)} mSv · Rate {fmt(selectedRadiation.rate_msv_day)} mSv/day · Projected EOM {fmt(selectedRadiation.projected_end_of_mission_msv)} mSv
                        </p>
                        {selectedRadiation.alerts?.length > 0 && (
                          <ul className="mt-2 space-y-1 text-xs">
                            {selectedRadiation.alerts.map((a: any, i: number) => (
                              <li key={i} className="text-restrained-red">{a.title}: {a.detail}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {selectedHealth?.insights && selectedHealth.insights.length > 0 && (
                      <div className="border-t border-border/10 pt-3">
                        <h3 className="text-sm font-medium text-warm-ivory mb-2">Recent insights</h3>
                        <ul className="space-y-2 text-sm">
                          {selectedHealth.insights.slice(0, 6).map((ins: any) => (
                            <li key={ins.id} className="border-b border-border/10 pb-1">
                              <div className="flex justify-between">
                                <span className="text-warm-ivory">{ins.title}</span>
                                <span className="text-xs text-muted-silver/60">{ins.severity}</span>
                              </div>
                              <p className="text-xs text-muted-silver mt-1">{ins.summary}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedAstronautIncidents.length > 0 && (
                      <div className="border-t border-border/10 pt-3">
                        <h3 className="text-sm font-medium text-warm-ivory mb-2">Incidents</h3>
                        <ul className="space-y-1 text-sm">
                          {selectedAstronautIncidents.map((inc) => (
                            <li key={inc.id} className="text-muted-silver">
                              #{inc.id} {inc.title} — {inc.severity} · {inc.status}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {chartData.length > 0 && (
                      <div className="border-t border-border/10 pt-3">
                        <h3 className="text-sm font-medium text-warm-ivory mb-2">Vital trends (simulated)</h3>
                        <div className="h-56">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#aaa' }} />
                              <YAxis tick={{ fontSize: 10, fill: '#aaa' }} />
                              <Tooltip />
                              <Legend />
                              <Line type="monotone" dataKey="hr" name="HR" stroke="#7dd3fc" dot={false} />
                              <Line type="monotone" dataKey="spo2" name="SpO2" stroke="#a78bfa" dot={false} />
                              <Line type="monotone" dataKey="sleep" name="Sleep" stroke="#fbbf24" dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ALERTS */}
        {activeTab === 'alerts' && (
          <div className="space-y-4">
            <h2 className="text-xl font-serif font-bold text-warm-ivory">Centralized Alerts</h2>
            {(() => {
              const alerts: any[] = [];
              astronauts.forEach((a) => {
                const h = healthMap[a.id];
                (h?.insights || []).forEach((ins: any) => {
                  if (ins.severity === 'critical' || ins.severity === 'high' || ins.severity === 'moderate') {
                    alerts.push({ astronaut: a, insight: ins });
                  }
                });
                const r = radiationMap[a.id];
                (r?.alerts || []).forEach((al: any) => {
                  alerts.push({ astronaut: a, radiationAlert: al });
                });
              });
              // incidents
              incidents.forEach((inc) => {
                if (['new', 'acknowledged', 'under_review', 'action_required'].includes(inc.status)) {
                  const a = astronauts.find((x) => x.id === inc.astronaut_id);
                  alerts.push({ incident: inc, astronaut: a });
                }
              });
              if (alerts.length === 0) return <p className="text-muted-silver text-sm">No active alerts.</p>;
              return (
                <ul className="space-y-3">
                  {alerts.map((al, i) => {
                    const sev = al.incident?.severity || al.radiationAlert?.severity || al.insight?.severity;
                    const color = sev === 'critical' ? 'border-restrained-red/40' : sev === 'high' ? 'border-warning/40' : 'border-border/20';
                    return (
                      <li key={i} className={`rounded-xl p-4 bg-surface/50 border ${color}`}>
                        <div className="flex justify-between">
                          <span className="text-warm-ivory font-medium">
                            {al.incident ? `Incident: ${al.incident.title}` : al.radiationAlert ? al.radiationAlert.title : al.insight.title}
                          </span>
                          <span className="text-xs text-muted-silver/60">{fmtTime(al.incident?.created_at || al.radiationAlert?.at || al.insight?.created_at)}</span>
                        </div>
                        <p className="text-xs text-muted-silver mt-1">
                          Astronaut: {al.astronaut?.callsign || '—'} · Severity: {sev}
                        </p>
                        <p className="text-xs text-muted-silver/70 mt-1">
                          {al.incident ? al.incident.description : al.radiationAlert ? al.radiationAlert.detail : al.insight.summary}
                        </p>
                        {al.insight?.explanation && (
                          <p className="text-xs text-muted-silver/50 mt-1">
                            Why: {typeof al.insight.explanation === 'string' ? al.insight.explanation : JSON.stringify(al.insight.explanation)}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </div>
        )}

        {/* INCIDENTS */}
        {activeTab === 'incidents' && (
          <div className="space-y-6">
            <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
              <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Create Incident</h2>
              <form onSubmit={handleCreateIncident} className="space-y-3">
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-silver">Mission</label>
                    <select value={incMissionId} onChange={(e) => setIncMissionId(e.target.value ? Number(e.target.value) : '')} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory">
                      <option value="">Select mission</option>
                      {missions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-silver">Astronaut (optional)</label>
                    <select value={incAstronautId} onChange={(e) => setIncAstronautId(e.target.value ? Number(e.target.value) : '')} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory">
                      <option value="">None</option>
                      {astronauts.map((a) => <option key={a.id} value={a.id}>{a.callsign}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-silver">Severity</label>
                    <select value={incSeverity} onChange={(e) => setIncSeverity(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory">
                      <option value="info">Info</option>
                      <option value="low">Low</option>
                      <option value="moderate">Moderate</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-silver">Title</label>
                  <input value={incTitle} onChange={(e) => setIncTitle(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" />
                </div>
                <div>
                  <label className="text-xs text-muted-silver">Description</label>
                  <textarea value={incDescription} onChange={(e) => setIncDescription(e.target.value)} rows={3} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" />
                </div>
                {incMsg && <Alert variant={incMsg.includes('created') ? 'success' : 'destructive'}>{incMsg}</Alert>}
                <Button type="submit" disabled={incLoading}>{incLoading ? 'Creating…' : 'Create Incident'}</Button>
              </form>
            </div>

            <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
              <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Incidents</h2>
              {incidents.length === 0 ? (
                <p className="text-muted-silver text-sm">No incidents.</p>
              ) : (
                <ul className="space-y-3">
                  {incidents.map((inc) => (
                    <li key={inc.id} className="rounded-lg p-4 bg-charcoal/30 border border-border/10">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <p className="text-warm-ivory font-medium">#{inc.id} {inc.title}</p>
                          <p className="text-xs text-muted-silver">{inc.severity} · {inc.status} · {fmtTime(inc.created_at)}</p>
                          <p className="text-xs text-muted-silver/70 mt-1">{inc.description}</p>
                          {inc.resolution_summary && <p className="text-xs text-success mt-1">Resolution: {inc.resolution_summary}</p>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {inc.status === 'new' && (
                            <Button size="sm" variant="outline" onClick={() => acknowledgeIncident(inc)}>Acknowledge</Button>
                          )}
                          {inc.status !== 'resolved' && inc.status !== 'under_review' && (
                            <Button size="sm" variant="outline" onClick={() => updateIncidentStatus(inc, 'under_review')}>Under Review</Button>
                          )}
                          {inc.status !== 'resolved' && inc.status !== 'action_required' && (
                            <Button size="sm" variant="outline" onClick={() => updateIncidentStatus(inc, 'action_required')}>Action Required</Button>
                          )}
                          {inc.status !== 'resolved' && (
                            <Button size="sm" variant="outline" onClick={() => updateIncidentStatus(inc, 'resolved')}>Resolve</Button>
                          )}
                        </div>
                      </div>
                      {inc.events && inc.events.length > 0 && (
                        <div className="mt-2 border-t border-border/10 pt-2">
                          <p className="text-xs text-muted-silver/60 mb-1">History</p>
                          <ul className="space-y-1 text-xs text-muted-silver/70">
                            {inc.events.map((ev) => (
                              <li key={ev.id}>{fmtTime(ev.created_at)} — {ev.action} {ev.note && `(${ev.note})`}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* MISSIONS */}
        {activeTab === 'missions' && (
          <div className="space-y-4">
            <h2 className="text-xl font-serif font-bold text-warm-ivory">Mission Overview</h2>
            {missions.length === 0 ? (
              <p className="text-muted-silver text-sm">No missions available.</p>
            ) : (
              <ul className="space-y-3">
                {missions.map((m) => {
                  const openInc = incidents.filter((i) => i.mission_id === m.id && ['new','acknowledged','under_review','action_required'].includes(i.status)).length;
                  return (
                    <li key={m.id} className="rounded-xl p-4 bg-surface/50 border border-border/20">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <p className="text-warm-ivory font-medium">{m.name} {m.code ? `(${m.code})` : ''}</p>
                          <p className="text-xs text-muted-silver">{m.category} · {m.destination} · {m.phase?.replace('_',' ')}</p>
                          <p className="text-xs text-muted-silver/60 mt-1">
                            Duration: {m.elapsed_duration_days ?? '—'} / {m.planned_duration_days ?? '—'} days · Crew: {m.crew_size ?? m.crew?.length ?? '—'} · Open incidents: {openInc}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => { setSelectedMissionId(m.id); setActiveTab('analytics'); }}>Analytics</Button>
                      </div>
                      {m.crew && m.crew.length > 0 && (
                        <div className="mt-2 text-xs text-muted-silver/70">
                          Crew: {m.crew.map((c) => c.callsign).join(', ')}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-silver">Mission</label>
              <select
                value={selectedMissionId ?? ''}
                onChange={(e) => setSelectedMissionId(e.target.value ? Number(e.target.value) : null)}
                className="rounded-md border border-input bg-background p-2 text-sm text-warm-ivory"
              >
                <option value="">Select mission</option>
                {missions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            {analyticsLoading && <p className="text-muted-silver text-sm">Loading analytics…</p>}
            {analyticsData && (
              <div className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
                    <p className="text-xs text-muted-silver uppercase tracking-wider">Mission progress</p>
                    <p className="text-2xl font-bold text-warm-ivory">{analyticsData.mission_duration?.progress_pct ?? '—'}%</p>
                    <p className="text-xs text-muted-silver/60">{analyticsData.mission_duration?.elapsed_days} / {analyticsData.mission_duration?.planned_days} days</p>
                  </div>
                  <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
                    <p className="text-xs text-muted-silver uppercase tracking-wider">Incidents</p>
                    <p className="text-2xl font-bold text-warm-ivory">{analyticsData.incidents?.total ?? 0} (open {analyticsData.incidents?.open ?? 0})</p>
                  </div>
                  <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
                    <p className="text-xs text-muted-silver uppercase tracking-wider">Crew mean dose</p>
                    <p className="text-2xl font-bold text-warm-ivory">{analyticsData.radiation?.crew_mean_cumulative_msv ?? '—'} mSv</p>
                  </div>
                </div>

                {analyticsData.risk_distribution && Object.keys(analyticsData.risk_distribution).length > 0 && (
                  <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
                    <h3 className="text-lg font-serif font-bold text-warm-ivory mb-3">Risk distribution (heuristic)</h3>
                    <ul className="space-y-2 text-sm">
                      {Object.entries(analyticsData.risk_distribution).map(([domain, v]: any) => (
                        <li key={domain} className="flex justify-between border-b border-border/10 pb-1">
                          <span className="text-muted-silver">{domain}</span>
                          <span className="text-warm-ivory font-mono">mean {v.mean} · max {v.max} · crew≥50: {v.crew_above_50}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analyticsData.cross_domain?.available && (
                  <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
                    <h3 className="text-lg font-serif font-bold text-warm-ivory mb-2">Cross-domain correlation</h3>
                    <p className="text-sm text-muted-silver">
                      {analyticsData.cross_domain.label}: r = {analyticsData.cross_domain.r} (n={analyticsData.cross_domain.n}). Exploratory correlation on simulated data, not causal.
                    </p>
                  </div>
                )}

                {analyticsData.crew && analyticsData.crew.length > 0 && (
                  <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
                    <h3 className="text-lg font-serif font-bold text-warm-ivory mb-3">Crew health summary</h3>
                    <ul className="space-y-2 text-sm">
                      {analyticsData.crew.map((c: any) => (
                        <li key={c.astronaut_id} className="border-b border-border/10 pb-2">
                          <div className="flex justify-between">
                            <span className="text-warm-ivory font-medium">{c.astronaut.name} ({c.astronaut.callsign})</span>
                            <span className="text-xs text-muted-silver/60">top risk: {c.top_risk || '—'} ({fmt(c.max_risk_score)})</span>
                          </div>
                          <p className="text-xs text-muted-silver mt-1">
                            HR {fmt(c.latest?.heart_rate)} · SpO₂ {fmt(c.latest?.spo2)} · Sleep {fmt(c.latest?.sleep_hours)} · Dose {fmt(c.cumulative_dose_msv)} mSv
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {!analyticsLoading && !analyticsData && selectedMissionId && (
              <p className="text-muted-silver text-sm">Select a mission to view analytics.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default MissionControlDashboard;