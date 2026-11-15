import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth/context';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api/client';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

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
  events?: { id: number; action: string; note: string; created_at: string; actor_id?: number | null }[];
  mission?: { id: number; name: string } | null;
  astronaut?: { id: number; callsign: string } | null;
}

interface Mission { id: number; name: string; code?: string; phase?: string; }
interface Astronaut { id: number; callsign?: string; full_name?: string; missions?: { id: number; name: string }[] }

interface ReportData {
  mission: { id: number; name: string; code?: string; destination?: string; phase?: string };
  generated_at: string;
  crew: Array<{
    astronaut: { id: number; callsign: string; name: string };
    latest?: Record<string, any> | null;
    cumulative_dose_msv: number;
    risk_scores?: any[];
    insights?: any[];
    recommendations?: any[];
  }>;
  incidents: Array<{ id: number; title: string; severity: string; status: string; created_at: string }>;
  interventions: Array<{ id: number; category: string; outcome: string; description: string }>;
  limitations: string[];
  sources: string[];
}

const fmtTime = (iso?: string | null) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};
const fmt = (v: unknown, d = 1) => (typeof v === 'number' ? v.toFixed(d) : String(v ?? '—'));

export const MedicalDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [astronauts, setAstronauts] = useState<Astronaut[]>([]);
  const [selectedAstronautId, setSelectedAstronautId] = useState<number | null>(null);
  const [astronautHealth, setAstronautHealth] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedMission, setSelectedMission] = useState<number | ''>('');
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const canManageIncidents = user?.role === 'medical' || user?.role === 'mission_control';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [iRes, mRes, aRes] = await Promise.all([
        api.get<{ incidents: Incident[] }>('/incidents'),
        api.get<{ missions: Mission[] }>('/missions'),
        api.get<{ astronauts: Astronaut[] }>('/astronauts'),
      ]);
      if (!iRes.success) throw new Error(iRes.error || 'Failed to load incidents');
      if (!mRes.success) throw new Error(mRes.error || 'Failed to load missions');
      setIncidents(iRes.data?.incidents || []);
      setMissions(mRes.data?.missions || []);
      if (aRes.success) setAstronauts(aRes.data?.astronauts || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load medical dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadAstronautHealth = useCallback(async (id: number) => {
    setHealthLoading(true);
    setAstronautHealth(null);
    try {
      const res = await api.get<any>(`/astronauts/${id}/health`);
      if (res.success) setAstronautHealth(res.data);
      else setAstronautHealth({ __error: res.error || 'Failed to load health record' });
    } catch (e: any) {
      setAstronautHealth({ __error: e?.message || 'Failed to load health record' });
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAstronautId) loadAstronautHealth(selectedAstronautId);
  }, [selectedAstronautId, loadAstronautHealth]);

  const loadReport = useCallback(async (missionId: number) => {
    setReportLoading(true);
    setReportError(null);
    setReport(null);
    try {
      const res = await api.get<ReportData>(`/reports/${missionId}`);
      if (res.success && res.data) setReport(res.data);
      else setReportError(res.error || 'Failed to generate report');
    } catch (e: any) {
      setReportError(e?.message || 'Failed to generate report');
    } finally {
      setReportLoading(false);
    }
  }, []);

  const handleMissionChange = (missionId: string) => {
    const id = missionId ? Number(missionId) : '';
    setSelectedMission(id);
    if (id) loadReport(id);
    else { setReport(null); setReportError(null); }
  };

  const updateIncident = async (id: number, action: 'acknowledge' | 'resolve') => {
    setActionMsg(null);
    try {
      const res = action === 'acknowledge'
        ? await api.post(`/incidents/${id}/acknowledge`, {})
        : await api.post(`/incidents/${id}/resolve`, { note: 'Resolved by medical staff' });
      if (res.success) {
        setActionMsg(`Incident ${id} ${action === 'acknowledge' ? 'acknowledged' : 'resolved'}.`);
        const iRes = await api.get<{ incidents: Incident[] }>('/incidents');
        if (iRes.success) setIncidents(iRes.data?.incidents || []);
      } else {
        setActionMsg(res.error || `Failed to ${action} incident`);
      }
    } catch (e: any) {
      setActionMsg(e?.message || `Failed to ${action} incident`);
    }
  };

  const openIncidents = useMemo(() => incidents.filter((i) => ['new', 'acknowledged', 'under_review', 'action_required'].includes(i.status)), [incidents]);

  const downloadPdf = () => {
    if (!selectedMission) return;
    const base = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');
    window.open(`${base}/api/reports/${selectedMission}/pdf`, '_blank', 'noopener,noreferrer');
  };

  const handleLogout = async () => { await logout(); navigate('/', { replace: true }); };

  if (loading) {
    return (
      <section className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-silver text-sm">Loading medical dashboard…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-serif text-warm-ivory mb-2">Unable to load dashboard</h1>
          <p className="text-muted-silver text-sm mb-4">{error}</p>
          <div className="flex gap-2 justify-center"><Button onClick={load}>Retry</Button><Button variant="outline" onClick={handleLogout}>Sign out</Button></div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 className="text-3xl font-serif font-bold text-warm-ivory">Medical Dashboard</h1>
            <p className="text-muted-silver text-sm mt-1">Clinical review of assigned crew · {user?.full_name}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>Sign out</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl p-4 bg-surface/50 border border-border/20"><p className="text-xs text-muted-silver uppercase tracking-wider">Total incidents</p><p className="text-3xl font-bold text-warm-ivory">{incidents.length}</p></div>
          <div className="rounded-xl p-4 bg-surface/50 border border-border/20"><p className="text-xs text-muted-silver uppercase tracking-wider">Open incidents</p><p className="text-3xl font-bold text-warning">{openIncidents.length}</p></div>
          <div className="rounded-xl p-4 bg-surface/50 border border-border/20"><p className="text-xs text-muted-silver uppercase tracking-wider">Missions</p><p className="text-3xl font-bold text-warm-ivory">{missions.length}</p></div>
          <div className="rounded-xl p-4 bg-surface/50 border border-border/20"><p className="text-xs text-muted-silver uppercase tracking-wider">Assigned astronauts</p><p className="text-3xl font-bold text-warm-ivory">{astronauts.length}</p></div>
        </div>

        {actionMsg && <Alert variant={actionMsg.includes('Failed') ? 'destructive' : 'success'}>{actionMsg}</Alert>}

        <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
          <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Incidents & emergency workflow</h2>
          {incidents.length === 0 ? (
            <p className="text-muted-silver text-sm">No incidents for your assigned missions.</p>
          ) : (
            <ul className="space-y-3">
              {incidents.map((inc) => (
                <li key={inc.id} className={`rounded-lg p-4 bg-charcoal/30 border ${inc.severity === 'critical' ? 'border-restrained-red/40' : inc.severity === 'high' ? 'border-warning/40' : 'border-border/10'}`}>
                  <div className="flex flex-wrap justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-warm-ivory font-medium">#{inc.id} {inc.title}</p>
                      <p className="text-xs text-muted-silver mt-1">Severity: {inc.severity} · Status: {inc.status} · Created: {fmtTime(inc.created_at)}</p>
                      <p className="text-sm text-muted-silver/80 mt-2">{inc.description}</p>
                      {inc.resolution_summary && <p className="text-xs text-success mt-2">Resolution: {inc.resolution_summary}</p>}
                    </div>
                    {canManageIncidents && (
                      <div className="flex flex-wrap gap-2 items-start">
                        {['new', 'action_required'].includes(inc.status) && (
                          <Button variant="outline" size="sm" onClick={() => updateIncident(inc.id, 'acknowledge')}>Acknowledge</Button>
                        )}
                        {inc.status !== 'resolved' && (
                          <Button variant="outline" size="sm" onClick={() => updateIncident(inc.id, 'resolve')}>Resolve</Button>
                        )}
                      </div>
                    )}
                  </div>
                  {inc.events && inc.events.length > 0 && (
                    <div className="mt-3 border-t border-border/10 pt-2">
                      <p className="text-xs text-muted-silver/60 mb-1">Timeline</p>
                      <ul className="space-y-1 text-xs text-muted-silver/70">
                        {inc.events.map((ev) => <li key={ev.id}>{fmtTime(ev.created_at)} — {ev.action}{ev.note ? `: ${ev.note}` : ''}</li>)}
                      </ul>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
            <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Assigned crew records</h2>
            {astronauts.length === 0 ? (
              <p className="text-muted-silver text-sm">No astronauts assigned to your missions.</p>
            ) : (
              <div className="space-y-3">
                <label className="text-xs text-muted-silver">Select astronaut</label>
                <select value={selectedAstronautId ?? ''} onChange={(e) => setSelectedAstronautId(e.target.value ? Number(e.target.value) : null)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory">
                  <option value="">Select…</option>
                  {astronauts.map((a) => <option key={a.id} value={a.id}>{a.callsign || a.full_name} — {a.full_name}</option>)}
                </select>
                {healthLoading && <p className="text-sm text-muted-silver">Loading health record…</p>}
                {astronautHealth?.__error && <p className="text-sm text-restrained-red">{astronautHealth.__error}</p>}
                {astronautHealth && !astronautHealth.__error && (
                  <div className="space-y-3 text-sm">
                    <p className="text-muted-silver">Mission: {astronautHealth.mission?.name || '—'} ({astronautHealth.mission?.phase || '—'})</p>
                    {astronautHealth.latest ? (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-muted-silver">HR:</span> <span className="text-warm-ivory font-mono">{fmt(astronautHealth.latest.heart_rate)} bpm</span></div>
                        <div><span className="text-muted-silver">BP:</span> <span className="text-warm-ivory font-mono">{fmt(astronautHealth.latest.systolic,0)}/{fmt(astronautHealth.latest.diastolic,0)} mmHg</span></div>
                        <div><span className="text-muted-silver">SpO₂:</span> <span className="text-warm-ivory font-mono">{fmt(astronautHealth.latest.spo2)} %</span></div>
                        <div><span className="text-muted-silver">Sleep:</span> <span className="text-warm-ivory font-mono">{fmt(astronautHealth.latest.sleep_hours)} h</span></div>
                      </div>
                    ) : <p className="text-muted-silver text-xs">No latest telemetry sample.</p>}
                    {astronautHealth.insights?.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-silver uppercase tracking-wider mb-1">Recent insights</p>
                        <ul className="space-y-1">
                          {astronautHealth.insights.slice(0, 5).map((ins: any) => (
                            <li key={ins.id} className="text-xs text-muted-silver"><span className="text-warm-ivory">{ins.title}</span> — {ins.severity} ({ins.data_class})</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {astronautHealth.risks?.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-silver uppercase tracking-wider mb-1">Risk indicators (heuristic)</p>
                        <ul className="space-y-1 text-xs text-muted-silver">
                          {astronautHealth.risks.map((r: any, i: number) => <li key={i}>{r.domain}: {r.score}/100 (confidence {r.confidence})</li>)}
                        </ul>
                      </div>
                    )}
                    <p className="text-xs text-muted-silver/60">Data labels: telemetry simulated, observations derived/modelled, insights decision support (not diagnoses). Private mood details are shown only when the astronaut has opted in.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
            <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Mission reports & PDF export</h2>
            <p className="text-sm text-muted-silver mb-3">Generate a mission health report from current records. Reports clearly label simulated/modelled data and limitations.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-silver">Mission</label>
                <select value={selectedMission} onChange={(e) => handleMissionChange(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory">
                  <option value="">Select a mission</option>
                  {missions.map((m) => <option key={m.id} value={m.id}>{m.name}{m.code ? ` (${m.code})` : ''}</option>)}
                </select>
              </div>
              {reportLoading && <p className="text-sm text-muted-silver">Generating report…</p>}
              {reportError && <p className="text-sm text-restrained-red">{reportError}</p>}
              {report && (
                <div className="space-y-3 text-sm">
                  <p className="text-warm-ivory font-medium">{report.mission.name} — generated {fmtTime(report.generated_at)}</p>
                  <div>
                    <p className="text-xs text-muted-silver uppercase tracking-wider mb-1">Crew summary</p>
                    <ul className="space-y-1 text-xs text-muted-silver">
                      {report.crew.map((c) => (
                        <li key={c.astronaut.id}>{c.astronaut.name} ({c.astronaut.callsign}) · dose {fmt(c.cumulative_dose_msv)} mSv · risks {c.risk_scores?.length ?? 0} · insights {c.insights?.length ?? 0}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs text-muted-silver uppercase tracking-wider mb-1">Incidents</p>
                    {report.incidents.length === 0 ? <p className="text-xs text-muted-silver">None recorded.</p> : (
                      <ul className="space-y-1 text-xs text-muted-silver">{report.incidents.map((i) => <li key={i.id}>#{i.id} {i.title} — {i.severity} · {i.status}</li>)}</ul>
                    )}
                  </div>
                  {report.limitations?.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-silver uppercase tracking-wider mb-1">Limitations</p>
                      <ul className="space-y-1 text-xs text-muted-silver/70">{report.limitations.map((l, i) => <li key={i}>• {l}</li>)}</ul>
                    </div>
                  )}
                  <Button variant="outline" size="sm" onClick={downloadPdf}>Download PDF report</Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default MedicalDashboard;
