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
  status?: string;
  category?: string;
  destination?: string;
  phase?: string;
  planned_duration_days?: number;
  elapsed_duration_days?: number;
  crew_size?: number;
  environment?: { launch_date?: string; data_class?: string };
  radiation_environment?: string;
  crew?: { astronaut_id: number; user_id: number; name: string; callsign: string; seat: string; role_on_mission: string }[];
}

interface Astronaut {
  id: number;
  callsign?: string;
  name?: string;
  full_name?: string;
  missions?: { id: number; name: string; phase: string; code: string }[];
}

interface HealthData {
  latest?: any;
  observations?: any[];
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
  source?: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  assigned_to?: number | null;
  assigned_to_name?: string | null;
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
  try {
    const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/i.test(iso) ? iso : `${iso}Z`;
    return new Date(timestamp).toLocaleString();
  } catch {
    return iso;
  }
};

const OPEN_STATUSES = ['new', 'acknowledged', 'under_review', 'action_required'];

const incidentCategory = (incident: Incident): string => {
  const text = `${incident.title} ${incident.description}`.toLowerCase();
  if (/radiation|dose|solar particle/.test(text)) return 'Radiation exposure';
  if (/sleep|fatigue|recovery/.test(text)) return 'Sleep and recovery';
  if (/stress|wellness|mood/.test(text)) return 'Wellness monitoring';
  return 'Health monitoring';
};

const healthStatusOf = (health?: HealthData, radiation?: any): 'critical' | 'attention' | 'normal' | 'unknown' => {
  if (!health?.latest) return 'unknown';
  const insights = health?.insights || [];
  if (insights.some((i: any) => i.severity === 'critical')) return 'critical';
  if (radiation?.alerts?.some((a: any) => a.severity === 'critical')) return 'critical';
  if (insights.some((i: any) => ['high', 'moderate', 'warning'].includes(i.severity))) return 'attention';
  if (radiation?.alerts?.some((a: any) => ['high', 'moderate'].includes(a.severity))) return 'attention';
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'crew' | 'alerts' | 'incidents' | 'missions' | 'analytics'>('overview');
  const [selectedAstronautId, setSelectedAstronautId] = useState<number | null>(null);
  const [selectedMissionId, setSelectedMissionId] = useState<number | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);

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

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [mRes, aRes, iRes] = await Promise.all([
        api.get<{ missions: Mission[] }>('/missions'),
        api.get<{ astronauts: Astronaut[] }>('/astronauts'),
        api.get<{ incidents: Incident[] }>('/incidents'),
      ]);
      if (!mRes.success) throw new Error(mRes.error || 'Failed to load missions');
      if (!aRes.success) throw new Error(aRes.error || 'Failed to load astronauts');
      if (!iRes.success) throw new Error(iRes.error || 'Failed to load incidents');
      const ms = mRes.data?.missions || [];
      const as = aRes.data?.astronauts || [];
      setMissions(ms);
      setAstronauts(as);
      setIncidents(iRes.data?.incidents || []);

      // fetch health + radiation per astronaut
      const hMap: Record<number, HealthData> = {};
      const rMap: Record<number, any> = {};
      await Promise.all(
        as.map(async (a) => {
          const [h, r] = await Promise.all([
            api.get<HealthData>(`/astronauts/${a.id}/health`),
            api.get<any>(`/radiation?astronaut_id=${a.id}`),
          ]);
          if (!h.success || !h.data) throw new Error(h.error || `Failed to load health data for ${a.callsign || a.id}`);
          if (!r.success || !r.data) throw new Error(r.error || `Failed to load radiation data for ${a.callsign || a.id}`);
          hMap[a.id] = h.data;
          rMap[a.id] = r.data;
        }),
      );
      setHealthMap(hMap);
      setRadiationMap(rMap);
      setLastSync(new Date().toISOString());
    } catch (e: any) {
      setError(e?.message || 'Failed to load Mission Control data');
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
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
    setActionLoadingId(inc.id);
    setActionMessage(null);
    try {
      const response = await api.patch(`/incidents/${inc.id}`, { status, note: `Status set to ${status}` });
      if (!response.success) throw new Error(response.error || `Unable to set incident to ${status}`);
      setActionMessage(`Incident #${inc.id} updated: ${status.replace('_', ' ')}.`);
      await load(true);
    } catch (e: any) {
      setActionMessage(e?.message || `Unable to set incident to ${status}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const acknowledgeIncident = async (inc: Incident) => {
    setActionLoadingId(inc.id);
    setActionMessage(null);
    try {
      const response = await api.post(`/incidents/${inc.id}/acknowledge`, {});
      if (!response.success) throw new Error(response.error || 'Unable to acknowledge incident');
      setActionMessage(`Incident #${inc.id} acknowledged.`);
      await load(true);
    } catch (e: any) {
      setActionMessage(e?.message || 'Unable to acknowledge incident');
    } finally {
      setActionLoadingId(null);
    }
  };

  // derived
  const statusOf = useCallback(
    (a: Astronaut) => healthStatusOf(healthMap[a.id], radiationMap[a.id]),
    [healthMap, radiationMap],
  );

  const filteredAstronauts = useMemo(() => {
    return astronauts.filter((a) => {
      const name = (a.name || a.full_name || '').toLowerCase();
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
  }, [astronauts, search, missionFilter, statusFilter, phaseFilter, statusOf]);

  const overview = useMemo(() => {
    const activeMissions = missions.filter((m) => m.status === 'active' && m.phase === 'in_flight').length;
    const upcomingMissions = missions.filter((m) => m.status === 'upcoming').length;
    const monitoredAstronauts = astronauts.filter((a) => Boolean(healthMap[a.id]?.latest)).length;
    let normal = 0, attention = 0, critical = 0, unknown = 0;
    astronauts.forEach((a) => {
      const s = statusOf(a);
      if (s === 'normal') normal++;
      else if (s === 'attention') attention++;
      else if (s === 'critical') critical++;
      else unknown++;
    });
    const openIncidents = incidents.filter((i) => OPEN_STATUSES.includes(i.status));
    const activeIncidents = openIncidents.length;
    const criticalAlerts = openIncidents.filter((i) => ['critical', 'high'].includes(i.severity)).length;
    const recentEvents: {
      id: string;
      at?: string;
      astronaut?: Astronaut;
      type: string;
      severity: string;
      description: string;
      dataClass: string;
      missionName?: string;
    }[] = [];
    const addEvent = (event: (typeof recentEvents)[number]) => recentEvents.push(event);
    astronauts.forEach((a) => {
      const h = healthMap[a.id];
      const latest = h?.latest;
      if (latest?.recorded_at) {
        addEvent({
          id: `telemetry-${a.id}-${latest.id ?? latest.recorded_at}`,
          at: latest.recorded_at,
          astronaut: a,
          type: 'Routine health check',
          severity: statusOf(a),
          description: `Simulated check recorded HR ${fmt(latest.heart_rate)} bpm, SpO₂ ${fmt(latest.spo2)}%, and sleep ${fmt(latest.sleep_hours)} h.`,
          dataClass: 'SYNTHETIC DEMONSTRATION DATA',
          missionName: h?.mission?.name,
        });
      }
      (h?.assessments || []).slice(0, 2).forEach((assessment: any) => {
        addEvent({
          id: `assessment-${assessment.id}`,
          at: assessment.created_at,
          astronaut: a,
          type: `${assessment.kind || 'crew'} assessment updated`,
          severity: 'info',
          description: 'An authorized assessment record was updated. Private notes and mood details are not shown here.',
          dataClass: 'authorized summary',
          missionName: h?.mission?.name,
        });
      });
      (h?.insights || []).slice(0, 2).forEach((insight: any) => {
        addEvent({
          id: `insight-${insight.id}`,
          at: insight.created_at,
          astronaut: a,
          type: insight.severity === 'info' || insight.severity === 'low' ? 'Monitoring update' : 'Health alert generated',
          severity: insight.severity,
          description: insight.summary,
          dataClass: insight.data_class || 'derived',
          missionName: h?.mission?.name,
        });
      });
      (radiationMap[a.id]?.events || []).slice(-2).forEach((event: any) => {
        addEvent({
          id: `radiation-${a.id}-${event.id}`,
          at: event.recorded_at,
          astronaut: a,
          type: 'Radiation monitoring update',
          severity: 'warning',
          description: `${event.event_label || 'Modelled radiation record'} · ${fmt(event.dose_increment_msv)} mSv increment (modelled).`,
          dataClass: 'modelled scenario',
          missionName: radiationMap[a.id]?.mission?.name,
        });
      });
    });
    incidents.forEach((incident) => {
      addEvent({
        id: `incident-${incident.id}`,
        at: incident.created_at,
        astronaut: astronauts.find((a) => a.id === incident.astronaut_id),
        type: 'Medical alert generated',
        severity: incident.severity,
        description: incident.description,
        dataClass: incident.source === 'synthetic_demo' ? 'SYNTHETIC DEMONSTRATION DATA' : incident.source || 'incident',
        missionName: missions.find((m) => m.id === incident.mission_id)?.name,
      });
      (incident.events || []).forEach((event) => {
        addEvent({
          id: `incident-event-${event.id}`,
          at: event.created_at,
          astronaut: astronauts.find((a) => a.id === incident.astronaut_id),
          type: event.action === 'acknowledged' ? 'Medical officer acknowledged alert' : `Incident ${event.action}`,
          severity: incident.severity,
          description: event.note || incident.title,
          dataClass: incident.source === 'synthetic_demo' ? 'SYNTHETIC DEMONSTRATION DATA' : incident.source || 'incident',
          missionName: missions.find((m) => m.id === incident.mission_id)?.name,
        });
      });
    });
    recentEvents.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    return {
      activeMissions,
      upcomingMissions,
      monitoredAstronauts,
      normal,
      attention,
      critical,
      unknown,
      activeIncidents,
      criticalAlerts,
      recentEvents: recentEvents.slice(0, 12),
    };
  }, [missions, astronauts, healthMap, radiationMap, incidents, statusOf]);

  const selectedAstronaut = astronauts.find((a) => a.id === selectedAstronautId) || null;
  const selectedHealth = selectedAstronautId ? healthMap[selectedAstronautId] : null;
  const selectedRadiation = selectedAstronautId ? radiationMap[selectedAstronautId] : null;
  const selectedMission = missions.find((m) => m.id === selectedHealth?.mission?.id) || null;
  const selectedAssignment = selectedMission?.crew?.find((c) => c.astronaut_id === selectedAstronautId);
  const stressIndicator = selectedHealth?.observations?.find(
    (observation: any) => observation.metric === 'simulated_stress_indicator',
  );

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
          <Button onClick={() => load()}>Retry</Button>
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
            <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogoutClick}>Sign Out</Button>
          </div>
        </div>

        <div className="mb-5 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-soft-amber">
            SYNTHETIC DEMONSTRATION DATA
          </p>
          <p className="mt-1 text-xs text-muted-silver">
            Fictional crew and simulated telemetry only. Radiation values are modelled scenario estimates, not dosimeter readings; no clinical diagnoses or NASA measurements are represented.
          </p>
        </div>

        {actionMessage && (
          <div className="mb-4">
            <Alert variant={actionMessage.includes('Unable') ? 'destructive' : 'success'}>
              {actionMessage}
            </Alert>
          </div>
        )}

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
                <p className="text-3xl font-bold text-warm-ivory">{overview.activeMissions}</p>
              </div>
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
                <p className="text-xs text-muted-silver uppercase tracking-wider">Astronauts monitored</p>
                <p className="text-3xl font-bold text-warm-ivory">{overview.monitoredAstronauts}</p>
              </div>
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
                <p className="text-xs text-muted-silver uppercase tracking-wider">Upcoming missions</p>
                <p className="text-3xl font-bold text-warm-ivory">{overview.upcomingMissions}</p>
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
                <p className="text-xs text-muted-silver uppercase tracking-wider">High / critical alerts</p>
                <p className="text-3xl font-bold text-restrained-red">{overview.criticalAlerts}</p>
              </div>
              {overview.unknown > 0 && (
                <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
                  <p className="text-xs text-muted-silver uppercase tracking-wider">Awaiting telemetry</p>
                  <p className="text-3xl font-bold text-muted-silver">{overview.unknown}</p>
                </div>
              )}
            </div>

            <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
              <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Recent health events</h2>
              {overview.recentEvents.length === 0 ? (
                <p className="text-muted-silver text-sm">No recent events.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {overview.recentEvents.map((ev) => (
                    <li key={ev.id} className="border-b border-border/10 pb-2">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-warm-ivory font-medium">
                          {ev.astronaut?.callsign || 'Mission'} — {ev.type}
                        </span>
                        <span className="text-xs text-muted-silver/60">{fmtTime(ev.at)}</span>
                      </div>
                      <p className="text-xs text-muted-silver mt-1">{ev.description}</p>
                      <p className="text-xs text-muted-silver/50">
                        {ev.severity} · {ev.dataClass}{ev.missionName ? ` · ${ev.missionName}` : ''}
                      </p>
                      {ev.astronaut && (
                        <button
                          className="mt-1 text-xs text-celestial-blue hover:underline"
                          onClick={() => {
                            setSelectedAstronautId(ev.astronaut!.id);
                            setActiveTab('crew');
                          }}
                        >
                          Open crew record
                        </button>
                      )}
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
                  <option value="unknown">Awaiting telemetry</option>
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
                                st === 'attention' ? 'bg-warning/20 text-warning' :
                                st === 'unknown' ? 'bg-border/20 text-muted-silver' : 'bg-success/20 text-success'
                              }`}>{st}</span>
                            </div>
                            <p className="text-xs text-muted-silver">{a.name || a.full_name}</p>
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
                          {selectedAstronaut.name || selectedAstronaut.full_name} ({selectedAstronaut.callsign})
                        </h2>
                        <p className="text-xs text-muted-silver/70">Astronaut ID #{selectedAstronaut.id}</p>
                        <p className="text-sm text-muted-silver">
                          Mission: {selectedMission?.name || '—'} · Role: {selectedAssignment?.role_on_mission || 'Crew'}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${
                        statusOf(selectedAstronaut) === 'critical' ? 'bg-restrained-red/20 text-restrained-red' :
                        statusOf(selectedAstronaut) === 'attention' ? 'bg-warning/20 text-warning' :
                        statusOf(selectedAstronaut) === 'unknown' ? 'bg-border/20 text-muted-silver' : 'bg-success/20 text-success'
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

                    {stressIndicator && (
                      <p className="text-xs text-soft-amber">
                        Simulated mission-load wellness indicator: {fmt(stressIndicator.value)} / 10 · not a private self-report or clinical assessment.
                      </p>
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
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xl font-serif font-bold text-warm-ivory">Operational Alerts</h2>
                <p className="text-xs text-muted-silver mt-1">Persistent alert lifecycle backed by incident records.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setActiveTab('incidents')}>Open incident desk</Button>
            </div>
            {incidents.length === 0 ? (
              <p className="text-muted-silver text-sm">No alert records are available.</p>
            ) : (
              <ul className="space-y-3">
                {incidents.map((incident) => {
                  const astronaut = astronauts.find((a) => a.id === incident.astronaut_id);
                  const mission = missions.find((m) => m.id === incident.mission_id);
                  const color = incident.severity === 'critical'
                    ? 'border-restrained-red/50'
                    : incident.severity === 'high'
                      ? 'border-warning/40'
                      : 'border-border/20';
                  return (
                    <li key={incident.id} className={`rounded-xl p-4 bg-surface/50 border ${color}`}>
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <p className="text-warm-ivory font-medium">Alert #{incident.id} · {incident.title}</p>
                          <p className="text-xs text-muted-silver mt-1">
                            {incidentCategory(incident)} · {astronaut?.callsign || 'Mission-level'} · {mission?.name || `Mission ${incident.mission_id}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-wide text-soft-amber">{incident.severity} · {incident.status.replace('_', ' ')}</p>
                          <p className="text-xs text-muted-silver/60">{fmtTime(incident.created_at)}</p>
                        </div>
                      </div>
                      <p className="text-sm text-muted-silver mt-3">{incident.description}</p>
                      <p className="text-xs text-muted-silver/70 mt-2">
                        Assigned responder: {incident.assigned_to_name || (incident.assigned_to ? `Staff #${incident.assigned_to}` : 'Unassigned')}
                      </p>
                      {incident.source === 'synthetic_demo' && (
                        <p className="mt-1 text-[10px] uppercase tracking-wider text-soft-amber">SYNTHETIC DEMONSTRATION DATA</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {astronaut && (
                          <Button size="sm" variant="outline" onClick={() => {
                            setSelectedAstronautId(astronaut.id);
                            setActiveTab('crew');
                          }}>
                            Open astronaut details
                          </Button>
                        )}
                        {incident.status === 'new' && (
                          <Button size="sm" variant="outline" disabled={actionLoadingId === incident.id} onClick={() => acknowledgeIncident(incident)}>
                            {actionLoadingId === incident.id ? 'Updating…' : 'Acknowledge'}
                          </Button>
                        )}
                        {incident.status !== 'resolved' && (
                          <Button size="sm" variant="outline" disabled={actionLoadingId === incident.id} onClick={() => updateIncidentStatus(incident, 'resolved')}>
                            Resolve
                          </Button>
                        )}
                        <button
                          className="text-xs text-celestial-blue hover:underline px-2"
                          onClick={() => {
                            setSelectedIncidentId(incident.id);
                            setActiveTab('incidents');
                          }}
                        >
                          View incident details
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="rounded-xl p-5 bg-surface/40 border border-border/10">
              <h3 className="text-sm font-medium text-warm-ivory">Automated monitoring signals</h3>
              <p className="text-xs text-muted-silver mt-1">
                Derived health insights and modelled radiation notifications are informative signals; acknowledgment and resolution are recorded on their associated incident above.
              </p>
              <ul className="mt-3 space-y-2">
                {astronauts.flatMap((astronaut) => {
                  const insights = (healthMap[astronaut.id]?.insights || [])
                    .filter((insight: any) => ['critical', 'high', 'moderate'].includes(insight.severity))
                    .map((insight: any) => ({
                      key: `insight-${insight.id}`,
                      title: insight.title,
                      detail: insight.summary,
                      severity: insight.severity,
                      at: insight.created_at,
                      kind: 'Derived health insight',
                    }));
                  const radiationAlerts = (radiationMap[astronaut.id]?.alerts || []).map((alert: any, index: number) => ({
                    key: `radiation-${astronaut.id}-${index}-${alert.at}`,
                    title: alert.title,
                    detail: alert.detail,
                    severity: alert.severity,
                    at: alert.at,
                    kind: 'Modelled radiation signal',
                  }));
                  return [...insights, ...radiationAlerts].map((signal) => (
                    <li key={signal.key} className="flex flex-wrap justify-between gap-2 border-t border-border/10 pt-2 text-xs">
                      <span className="text-warm-ivory">{astronaut.callsign} · {signal.kind}: {signal.title}</span>
                      <span className="text-muted-silver">{signal.severity} · {fmtTime(signal.at)}</span>
                      <p className="w-full text-muted-silver/70">{signal.detail}</p>
                    </li>
                  ));
                })}
              </ul>
            </div>
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
                          {inc.assigned_to_name && <p className="text-xs text-muted-silver/60 mt-1">Responder: {inc.assigned_to_name}</p>}
                          {inc.resolution_summary && <p className="text-xs text-success mt-1">Resolution: {inc.resolution_summary}</p>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {inc.status === 'new' && (
                            <Button size="sm" variant="outline" disabled={actionLoadingId === inc.id} onClick={() => acknowledgeIncident(inc)}>Acknowledge</Button>
                          )}
                          {inc.status !== 'resolved' && inc.status !== 'under_review' && (
                            <Button size="sm" variant="outline" disabled={actionLoadingId === inc.id} onClick={() => updateIncidentStatus(inc, 'under_review')}>Under Review</Button>
                          )}
                          {inc.status !== 'resolved' && inc.status !== 'action_required' && (
                            <Button size="sm" variant="outline" disabled={actionLoadingId === inc.id} onClick={() => updateIncidentStatus(inc, 'action_required')}>Action Required</Button>
                          )}
                          {inc.status !== 'resolved' && (
                            <Button size="sm" variant="outline" disabled={actionLoadingId === inc.id} onClick={() => updateIncidentStatus(inc, 'resolved')}>Resolve</Button>
                          )}
                        </div>
                      </div>
                      <details className="mt-2" open={selectedIncidentId === inc.id}>
                        <summary className="cursor-pointer text-xs text-celestial-blue hover:underline">Incident details and audit history</summary>
                        <p className="mt-2 text-xs text-muted-silver">Mission: {missions.find((mission) => mission.id === inc.mission_id)?.name || `#${inc.mission_id}`}</p>
                        <p className="text-xs text-muted-silver">Astronaut: {astronauts.find((astronaut) => astronaut.id === inc.astronaut_id)?.callsign || 'Mission-level'}</p>
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
                      </details>
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
                          <p className="text-xs text-muted-silver">{m.status || m.phase?.replace('_', ' ')} · {m.category} · {m.destination} · {m.phase?.replace('_',' ')}</p>
                          <p className="text-xs text-muted-silver/60 mt-1">
                            Duration: {m.elapsed_duration_days ?? '—'} / {m.planned_duration_days ?? '—'} days · Crew: {m.crew_size ?? m.crew?.length ?? '—'} · Open incidents: {openInc}
                          </p>
                          <p className="text-xs text-muted-silver/60">
                            Launch date: {m.environment?.launch_date || 'Not recorded'} · Expected duration: {m.planned_duration_days ?? '—'} days · Elapsed: {m.elapsed_duration_days ?? '—'} days
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