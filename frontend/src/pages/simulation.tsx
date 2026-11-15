import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../lib/auth/context';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api/client';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

interface Mission { id: number; code?: string; name: string; phase?: string; destination?: string; category?: string; planned_duration_days?: number; elapsed_duration_days?: number; crew_size?: number; }

const SCENARIOS: { key: string; label: string; config: any }[] = [
  { key: 'nominal', label: 'Nominal Mission', config: { stress: 0.0, sleep_penalty: 0.0, anomaly_bias: 0.0, sensor_fault: false, comm_interruption: false, solar_event_day: null } },
  { key: 'gradual', label: 'Gradual Health Decline', config: { stress: 0.3, sleep_penalty: 0.6, anomaly_bias: 0.4, sensor_fault: false, comm_interruption: false, solar_event_day: null } },
  { key: 'acute', label: 'Acute Health Event', config: { stress: 0.8, sleep_penalty: 1.0, anomaly_bias: 1.4, sensor_fault: false, comm_interruption: false, solar_event_day: null } },
  { key: 'radiation', label: 'Radiation Event', config: { stress: 0.2, sleep_penalty: 0.2, anomaly_bias: 0.2, sensor_fault: false, comm_interruption: false, solar_event_day: 3, solar_event_dose_msv: 18.0 } },
  { key: 'sleep', label: 'Sleep Deterioration', config: { stress: 0.35, sleep_penalty: 1.4, anomaly_bias: 0.3, sensor_fault: false, comm_interruption: false, solar_event_day: null } },
  { key: 'comm', label: 'Communication Interruption', config: { stress: 0.2, sleep_penalty: 0.2, anomaly_bias: 0.2, sensor_fault: false, comm_interruption: true, solar_event_day: null } },
  { key: 'multi', label: 'Multiple Concurrent Concerns', config: { stress: 0.8, sleep_penalty: 0.9, anomaly_bias: 1.4, sensor_fault: true, comm_interruption: false, solar_event_day: 2, solar_event_dose_msv: 12.0 } },
];

const fmtTime = (iso?: string | null) => { if (!iso) return '—'; try { return new Date(iso).toLocaleString(); } catch { return iso; } };

export const SimulationDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<number | null>(null);
  const [missionDetail, setMissionDetail] = useState<any>(null);
  const [scenarioKey, setScenarioKey] = useState('nominal');
  const [seed, setSeed] = useState(2026);
  const [running, setRunning] = useState(false);
  const [speedMs, setSpeedMs] = useState(4000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const intervalRef = useRef<any>(null);

  const handleLogout = async () => { await logout(); navigate('/', { replace: true }); };

  const loadMissions = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get<{ missions: Mission[] }>('/missions');
      if (!res.success) throw new Error(res.error || 'Failed to load missions');
      const ms = res.data?.missions || [];
      setMissions(ms);
      if (ms.length > 0 && !selectedMissionId) setSelectedMissionId(ms[0].id);
    } catch (e: any) {
      setError(e?.message || 'Failed to load missions');
    } finally {
      setLoading(false);
    }
  }, [selectedMissionId]);

  useEffect(() => { loadMissions(); }, [loadMissions]);

  const loadMissionDetail = useCallback(async (id: number) => {
    try {
      const [m, a, i] = await Promise.all([
        api.get<any>(`/missions/${id}`),
        api.get<any>(`/analytics/mission?mission_id=${id}`),
        api.get<any>('/incidents'),
      ]);
      if (m.success) setMissionDetail(m.data);
      if (a.success) setAnalytics(a.data);
      if (i.success) setIncidents((i.data?.incidents || []).filter((inc: any) => inc.mission_id === id));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (selectedMissionId) loadMissionDetail(selectedMissionId);
  }, [selectedMissionId, loadMissionDetail]);

  const applyScenario = async () => {
    if (!selectedMissionId) return;
    setMsg(null);
    const sc = SCENARIOS.find((s) => s.key === scenarioKey)!;
    try {
      const res = await api.post<any>(`/missions/${selectedMissionId}/scenario`, {
        name: sc.label,
        seed,
        ...sc.config,
      });
      if (res.success) {
        setMsg(`Scenario "${sc.label}" applied.`);
        setLastResult(res.data);
        await loadMissionDetail(selectedMissionId);
      } else {
        setMsg(res.error || 'Failed to apply scenario');
      }
    } catch (e: any) {
      setMsg(e?.message || 'Failed');
    }
  };

  const resetSimulation = async () => {
    if (!selectedMissionId) return;
    setRunning(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setSeed(2026);
    setScenarioKey('nominal');
    try {
      const res = await api.post<any>(`/missions/${selectedMissionId}/scenario`, {
        name: 'Baseline deterministic scenario',
        seed: 2026,
        stress: 0.0, sleep_penalty: 0.0, anomaly_bias: 0.0, sensor_fault: false, comm_interruption: false, solar_event_day: null,
      });
      if (res.success) {
        setMsg('Simulation reset to baseline.');
        setLastResult(res.data);
        await loadMissionDetail(selectedMissionId);
      } else {
        setMsg(res.error || 'Reset failed');
      }
    } catch (e: any) {
      setMsg(e?.message || 'Reset failed');
    }
  };

  const advanceOnce = async () => {
    if (!selectedMissionId) return;
    try {
      const res = await api.post<any>(`/missions/${selectedMissionId}/advance`);
      if (res.success) {
        setLastResult(res.data);
        await loadMissionDetail(selectedMissionId);
      } else {
        setMsg(res.error || 'Advance failed');
        setRunning(false);
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      }
    } catch (e: any) {
      setMsg(e?.message || 'Advance failed');
      setRunning(false);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
  };

  const toggleRun = () => {
    if (running) {
      setRunning(false);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    setRunning(true);
    intervalRef.current = setInterval(() => { advanceOnce(); }, speedMs);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (loading) return <section className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-silver text-sm">Loading simulation…</div></section>;
  if (error) return <section className="min-h-screen bg-background flex items-center justify-center p-8"><div className="max-w-md text-center"><h1 className="text-2xl font-serif text-warm-ivory mb-2">Unable to load</h1><p className="text-muted-silver text-sm mb-4">{error}</p><Button onClick={loadMissions}>Retry</Button></div></section>;

  return (
    <section className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-warm-ivory">Mission Simulation</h1>
            <p className="text-muted-silver text-sm mt-1">Deterministic, reproducible mission scenarios · {user?.full_name}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadMissions}>Refresh</Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>Sign Out</Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
            <label className="text-xs text-muted-silver">Mission</label>
            <select value={selectedMissionId ?? ''} onChange={(e) => setSelectedMissionId(e.target.value ? Number(e.target.value) : null)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory mt-1">
              {missions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            {missionDetail && (
              <div className="mt-3 text-xs text-muted-silver space-y-1">
                <p>Phase: {missionDetail.phase?.replace('_',' ')}</p>
                <p>Day: {missionDetail.elapsed_duration_days} / {missionDetail.planned_duration_days}</p>
                <p>Destination: {missionDetail.destination}</p>
                <p>Crew size: {missionDetail.crew_size}</p>
              </div>
            )}
          </div>
          <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
            <label className="text-xs text-muted-silver">Scenario</label>
            <select value={scenarioKey} onChange={(e) => setScenarioKey(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory mt-1">
              {SCENARIOS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <div className="mt-3">
              <label className="text-xs text-muted-silver">Seed</label>
              <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory mt-1" />
            </div>
            <div className="mt-3">
              <label className="text-xs text-muted-silver">Speed (ms)</label>
              <input type="number" value={speedMs} onChange={(e) => setSpeedMs(Number(e.target.value))} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory mt-1" />
            </div>
          </div>
          <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
            <p className="text-xs text-muted-silver uppercase tracking-wider mb-2">Controls</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={applyScenario}>Apply Scenario</Button>
              <Button size="sm" variant="outline" onClick={advanceOnce}>Advance 1 Day</Button>
              <Button size="sm" variant={running ? 'destructive' : 'default'} onClick={toggleRun}>{running ? 'Pause' : 'Run'}</Button>
              <Button size="sm" variant="ghost" onClick={resetSimulation}>Reset</Button>
            </div>
            {msg && <Alert className="mt-3" variant={msg.includes('fail') || msg.includes('Failed') ? 'destructive' : 'success'}>{msg}</Alert>}
            {lastResult && (
              <div className="mt-3 text-xs text-muted-silver/70">
                <p>Mission day: {lastResult.mission_day ?? missionDetail?.elapsed_duration_days}</p>
                <p>Phase: {lastResult.phase ?? missionDetail?.phase}</p>
                <p>Samples: {lastResult.samples ?? '—'}</p>
                {lastResult.crew_results && <p>Crew processed: {lastResult.crew_results.length}</p>}
              </div>
            )}
          </div>
        </div>

        {analytics && (
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
              <p className="text-xs text-muted-silver uppercase tracking-wider">Progress</p>
              <p className="text-2xl font-bold text-warm-ivory">{analytics.mission_duration?.progress_pct ?? '—'}%</p>
            </div>
            <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
              <p className="text-xs text-muted-silver uppercase tracking-wider">Incidents (open)</p>
              <p className="text-2xl font-bold text-warm-ivory">{analytics.incidents?.open ?? 0} / {analytics.incidents?.total ?? 0}</p>
            </div>
            <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
              <p className="text-xs text-muted-silver uppercase tracking-wider">Crew mean dose</p>
              <p className="text-2xl font-bold text-warm-ivory">{analytics.radiation?.crew_mean_cumulative_msv ?? '—'} mSv</p>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
            <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Risk Distribution</h2>
            {analytics?.risk_distribution && Object.keys(analytics.risk_distribution).length > 0 ? (
              <ul className="space-y-2 text-sm">
                {Object.entries(analytics.risk_distribution).map(([domain, v]: any) => (
                  <li key={domain} className="flex justify-between border-b border-border/10 pb-1">
                    <span className="text-muted-silver">{domain}</span>
                    <span className="text-warm-ivory font-mono">mean {v.mean} · max {v.max} · ≥50: {v.crew_above_50}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-muted-silver text-sm">No risk data.</p>}
          </div>
          <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
            <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Incidents</h2>
            {incidents.length === 0 ? <p className="text-muted-silver text-sm">No incidents for this mission.</p> : (
              <ul className="space-y-2 text-sm">
                {incidents.slice(0, 12).map((inc: any) => (
                  <li key={inc.id} className="border-b border-border/10 pb-1">
                    <div className="flex justify-between"><span className="text-warm-ivory">#{inc.id} {inc.title}</span><span className="text-xs text-muted-silver/60">{inc.status}</span></div>
                    <p className="text-xs text-muted-silver">{inc.severity} · {fmtTime(inc.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
          <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Crew</h2>
          {analytics?.crew && analytics.crew.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {analytics.crew.map((c: any) => (
                <li key={c.astronaut_id} className="border-b border-border/10 pb-2">
                  <div className="flex justify-between">
                    <span className="text-warm-ivory font-medium">{c.astronaut?.name || c.astronaut?.callsign || 'Crew member'} ({c.astronaut?.callsign || ''})</span>
                    <span className="text-xs text-muted-silver/60">top risk: {c.top_risk || '—'} ({c.max_risk_score != null ? Number(c.max_risk_score).toFixed(0) : '—'})</span>
                  </div>
                  <p className="text-xs text-muted-silver mt-1">HR {c.latest?.heart_rate != null ? Number(c.latest.heart_rate).toFixed(0) : '—'} · SpO₂ {c.latest?.spo2 != null ? Number(c.latest.spo2).toFixed(0) : '—'} · Sleep {c.latest?.sleep_hours != null ? Number(c.latest.sleep_hours).toFixed(1) : '—'} · Dose {c.cumulative_dose_msv != null ? Number(c.cumulative_dose_msv).toFixed(1) : '—'} mSv</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-muted-silver text-sm">No crew data.</p>}
        </div>
      </div>
    </section>
  );
};

export default SimulationDashboard;