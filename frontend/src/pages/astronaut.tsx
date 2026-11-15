import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../lib/auth/context';
import { api } from '../lib/api/client';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

interface Snapshot {
  recorded_at?: string;
  heart_rate?: number;
  hrv?: number;
  systolic?: number;
  diastolic?: number;
  spo2?: number;
  resp_rate?: number;
  body_temp?: number;
  steps?: number;
  exercise_minutes?: number;
  sleep_hours?: number;
  sleep_quality?: number;
  recovery_score?: number;
  source?: string;
  sensor_status?: string;
}

interface HealthData {
  astronaut?: { id: number; callsign?: string; name?: string };
  mission?: {
    id: number; name: string; phase: string; destination: string; gravity_g?: number;
    comm_delay_seconds?: number; planned_duration_days?: number; elapsed_duration_days?: number;
  };
  latest?: Snapshot | null;
  series?: Snapshot[];
  baselines?: { metric: string; value: number; unit: string }[];
  observations?: { metric: string; value: number; unit: string; method?: string; recorded_at?: string; source_ref?: string }[];
  assessments?: any[];
  insights?: any[];
  risks?: any[];
  recommendations?: any[];
  statistics?: any;
  reference_ranges?: Record<string, any>;
  data_labels?: any;
}

const fmt = (v: unknown, digits = 1): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—');
const fmtTime = (iso?: string | null) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};
const shortTime = (iso?: string | null) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; }
};

function metricStatus(value?: number, ref?: { low?: number; high?: number }): { label: string; tone: string } {
  if (typeof value !== 'number' || !Number.isFinite(value) || !ref) return { label: 'Insufficient data', tone: 'text-muted-silver' };
  const low = typeof ref.low === 'number' ? ref.low : -Infinity;
  const high = typeof ref.high === 'number' ? ref.high : Infinity;
  if (value < low || value > high) {
    const marginLow = low === -Infinity ? 0 : low * 0.15;
    const marginHigh = high === Infinity ? 0 : high * 0.15;
    if (value < low - marginLow || value > high + marginHigh) return { label: 'Elevated / outside configured range', tone: 'text-warning' };
    return { label: 'Monitor', tone: 'text-warning' };
  }
  return { label: 'Within configured range', tone: 'text-success' };
}

function trendText(stat?: any): string {
  if (!stat?.available || typeof stat.slope_per_day !== 'number') return 'Insufficient data';
  const s = stat.slope_per_day;
  if (Math.abs(s) < 0.001) return 'Stable';
  return s > 0 ? `Rising (${s.toFixed(3)}/day)` : `Falling (${s.toFixed(3)}/day)`;
}

const CHALLENGES = [
  { key: 'radiation', title: 'Radiation Exposure', desc: 'Cumulative dose, modelled exposure trends, space-weather context, and mission projections.', target: 'radiation-section' },
  { key: 'microgravity', title: 'Microgravity', desc: 'Physiological adaptation to reduced gravity and operational implications.', target: 'physical-section' },
  { key: 'bone', title: 'Bone Density Loss', desc: 'Derived bone-health indicators, historical observations, and monitoring guidance.', target: 'bone-section' },
  { key: 'muscle', title: 'Muscle Deterioration', desc: 'Strength-related indicators, exercise context, and recovery trends.', target: 'muscle-section' },
  { key: 'cardio', title: 'Cardiovascular Changes', desc: 'Heart rate, blood pressure, HRV, and related trends over time.', target: 'cardio-section' },
  { key: 'sleep', title: 'Sleep Disturbances', desc: 'Sleep duration, quality, fatigue indicators, and recent assessments.', target: 'sleep-section' },
  { key: 'mental', title: 'Mental Health & Isolation', desc: 'Private wellness assessments, trends, and AI companion access.', target: 'mental-section' },
];

export const AstronautDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [astronautId, setAstronautId] = useState<number | null>(null);
  const [callsign, setCallsign] = useState('');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [radiation, setRadiation] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [aiStatus, setAiStatus] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string; meta?: any }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [assessmentKind, setAssessmentKind] = useState<'daily' | 'mental' | 'physical'>('daily');
  const [mood, setMood] = useState(''); const [stress, setStress] = useState(''); const [sleepQuality, setSleepQuality] = useState('');
  const [isolation, setIsolation] = useState(''); const [concentration, setConcentration] = useState(''); const [fatigue, setFatigue] = useState('');
  const [safetyConcern, setSafetyConcern] = useState(false); const [assessmentNotes, setAssessmentNotes] = useState('');
  const [assessmentMsg, setAssessmentMsg] = useState<string | null>(null); const [assessmentLoading, setAssessmentLoading] = useState(false);

  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const handleLogout = async () => { await logout(); navigate('/', { replace: true }); };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await api.me();
      if (!me.success || !me.data?.astronaut_profile?.id) {
        throw new Error(me.error || 'Unable to load astronaut profile. Please sign in again.');
      }
      const id = me.data.astronaut_profile.id as number;
      setAstronautId(id);
      setCallsign(me.data.astronaut_profile.callsign || '');
      const [h, r] = await Promise.all([
        api.get<HealthData>(`/astronauts/${id}/health`),
        api.get<any>(`/radiation?astronaut_id=${id}`),
      ]);
      if (!h.success || !h.data) throw new Error(h.error || 'Failed to load health data from backend');
      const hd = h.data;
      const mid = hd.mission?.id;
      if (mid) {
        const m = await api.get<any>(`/missions/${mid}`);
        if (m.success && m.data) {
          hd.mission = { ...(hd.mission as any), planned_duration_days: m.data.planned_duration_days, elapsed_duration_days: m.data.elapsed_duration_days } as any;
        }
        const fc = await api.get<any>(`/radiation/forecast?mission_id=${mid}`);
        if (fc.success && fc.data) setForecast(fc.data);
      }
      setHealth(hd);
      if (r.success && r.data) setRadiation(r.data);
      else setRadiation(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCompanion = useCallback(async () => {
    try {
      const s = await api.get<any>('/ai/status');
      if (s.success) setAiStatus(s.data);
      const c = await api.get<any>('/ai/conversations');
      if (c.success) setConversations(c.data?.conversations || []);
    } catch { /* optional */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCompanion(); }, [loadCompanion]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id) || sectionRefs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (hash) setTimeout(() => scrollTo(hash), 150);
  }, [location.hash, loading]);

  const runAnalysis = async () => {
    if (!astronautId) return;
    setRefreshing(true);
    setAnalysisError(null);
    try {
      const res = await api.post<any>(`/ai/analyze/${astronautId}`);
      if (res.success) {
        setAnalysisResult({ ...res.data, generated_at: new Date().toISOString() });
        await load();
        setTimeout(() => scrollTo('predictive-analysis-section'), 100);
      } else {
        setAnalysisError(res.error || 'Analysis request failed');
      }
    } catch (e: any) {
      setAnalysisError(e?.message || 'Analysis request failed');
    } finally {
      setRefreshing(false);
    }
  };

  const startNewConversation = () => { setActiveConversationId(null); setChatMessages([]); setChatError(null); };
  const openConversation = (conv: any) => {
    setActiveConversationId(conv.id);
    setChatMessages((conv.messages || []).map((m: any) => ({ role: m.role, content: m.content, meta: m.meta })));
    setChatError(null);
  };
  const sendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const msg = chatInput.trim();
    if (!msg) return;
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true); setChatError(null);
    try {
      const res = await api.post<any>('/ai/chat', { message: msg, conversation_id: activeConversationId ?? undefined });
      if (res.success && res.data) {
        setActiveConversationId(res.data.conversation_id);
        setChatMessages((prev) => [...prev, { role: 'assistant', content: res.data.reply, meta: { provider: res.data.provider, model: res.data.model, fallback: res.data.fallback, safety_escalation: res.data.safety_escalation } }]);
        await loadCompanion();
      } else setChatError(res.error || 'Chat request failed');
    } catch (err: any) { setChatError(err?.message || 'Chat request failed'); }
    finally { setChatLoading(false); }
  };
  const deleteConversation = async (id: number) => {
    await api.delete(`/ai/conversations/${id}`);
    if (activeConversationId === id) { setActiveConversationId(null); setChatMessages([]); }
    await loadCompanion();
  };

  const submitAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!astronautId) return;
    setAssessmentLoading(true); setAssessmentMsg(null);
    const answers: Record<string, any> = { safety_concern: safetyConcern };
    if (mood) answers.mood = Number(mood);
    if (stress) answers.stress = Number(stress);
    if (sleepQuality) answers.sleep_quality = Number(sleepQuality);
    if (isolation) answers.isolation = Number(isolation);
    if (concentration) answers.concentration = Number(concentration);
    if (fatigue) answers.fatigue = Number(fatigue);
    try {
      const res = await api.post(`/astronauts/${astronautId}/assessments`, {
        kind: assessmentKind, answers, notes: assessmentNotes, is_private: true,
      });
      if (res.success) {
        setAssessmentMsg('Assessment saved. Your private wellness record has been updated.');
        setMood(''); setStress(''); setSleepQuality(''); setIsolation(''); setConcentration(''); setFatigue(''); setSafetyConcern(false); setAssessmentNotes('');
        await load();
      } else setAssessmentMsg(res.error || 'Failed to save assessment');
    } catch (err: any) { setAssessmentMsg(err?.message || 'Failed to save assessment'); }
    finally { setAssessmentLoading(false); }
  };

  const latest = health?.latest || null;
  const mission = health?.mission;
  const series = health?.series || [];
  const ranges = health?.reference_ranges || {};

  const chartData = useMemo(() => series.slice(-60).map((s) => ({
    time: shortTime(s.recorded_at),
    full: s.recorded_at,
    hr: s.heart_rate,
    hrv: s.hrv,
    systolic: s.systolic,
    diastolic: s.diastolic,
    spo2: s.spo2,
    temp: s.body_temp,
    sleep: s.sleep_hours,
    recovery: s.recovery_score,
  })), [series]);

  const radiationChart = useMemo(() => {
    const s = radiation?.series || [];
    let cum = 0;
    return s.slice(-90).map((r: any) => {
      cum += Number(r.dose_increment_msv || 0);
      return { time: shortTime(r.recorded_at), daily: Number(r.dose_increment_msv || 0), cumulative: Number(cum.toFixed(2)) };
    });
  }, [radiation]);

  const boneObs = useMemo(() => (health?.observations || []).filter((o: any) => o.metric === 'bone_density').slice(-30), [health]);
  const muscleObs = useMemo(() => (health?.observations || []).filter((o: any) => o.metric === 'grip_strength' || o.metric === 'muscle_mass').slice(-30), [health]);
  const wellnessHistory = useMemo(() => (health?.assessments || []).filter((a: any) => a.kind === 'daily' || a.kind === 'mental').slice().reverse().slice(-30), [health]);

  const latestObservation = (metric: string) => {
    const obs = (health?.observations || []).filter((o: any) => o.metric === metric);
    return obs.length ? obs[obs.length - 1] : null;
  };
  const baselineOf = (metric: string) => (health?.baselines || []).find((b: any) => b.metric === metric);

  const MetricCard = ({ id, title, value, unit, refKey, statKey, explanation, recordedAt, source }: any) => {
    const ref = refKey ? ranges[refKey] : undefined;
    const stat = statKey ? health?.statistics?.[statKey] : undefined;
    const numeric = typeof value === 'number' ? value : undefined;
    const st = metricStatus(numeric, ref);
    return (
      <div id={id} className="rounded-lg border border-border/20 bg-charcoal/20 p-4">
        <p className="text-xs text-muted-silver uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-mono text-warm-ivory mt-1">{value ?? '—'} <span className="text-sm text-muted-silver">{unit}</span></p>
        <p className={`text-xs mt-1 ${st.tone}`}>Status: {st.label}</p>
        <p className="text-xs text-muted-silver/80 mt-1">Reference: {ref ? `${ref.low}–${ref.high} ${ref.unit}` : 'No configured reference available.'}</p>
        <p className="text-xs text-muted-silver/80">Trend: {trendText(stat)}</p>
        <p className="text-xs text-muted-silver/70 mt-1">{explanation}</p>
        <p className="text-xs text-muted-silver/50 mt-1">Last updated: {fmtTime(recordedAt || latest?.recorded_at)}{source ? ` · Source: ${source}` : ''}</p>
      </div>
    );
  };

  if (loading) return <section className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-silver text-sm">Loading your health dashboard…</div></section>;
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

  const recentSignals = analysisResult?.signals || (health?.insights || []).slice(0, 8).map((i: any) => ({ domain: i.domain, severity: i.severity, title: i.title, summary: i.summary, explanation: i.explanation, data_class: i.data_class, protocol: i.protocol }));
  const predInsights = (health?.insights || []).filter((i: any) => i.kind === 'prediction' || i.kind === 'trend');

  return (
    <section className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 className="text-3xl font-serif font-bold text-warm-ivory">Astronaut Health Dashboard</h1>
            <p className="text-muted-silver text-sm mt-1">Welcome, {user?.full_name} ({callsign || '—'}). Telemetry shown is simulated/modelled unless explicitly labelled otherwise.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={runAnalysis} disabled={refreshing}>{refreshing ? 'Running analysis…' : 'Run Predictive Analysis'}</Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>Sign out</Button>
          </div>
        </div>

        {mission && (
          <div className="rounded-xl p-5 bg-surface/50 border border-border/20 grid md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-xs text-muted-silver uppercase tracking-wider">Mission</p><p className="text-warm-ivory font-medium">{mission.name}</p></div>
            <div><p className="text-xs text-muted-silver uppercase tracking-wider">Destination / Phase</p><p className="text-warm-ivory font-medium">{mission.destination} · {mission.phase?.replace('_', ' ')}</p></div>
            <div><p className="text-xs text-muted-silver uppercase tracking-wider">Duration</p><p className="text-warm-ivory font-medium">{mission.elapsed_duration_days ?? '—'} / {mission.planned_duration_days ?? '—'} days</p></div>
            <div><p className="text-xs text-muted-silver uppercase tracking-wider">Last data sync</p><p className="text-warm-ivory font-medium">{fmtTime(latest?.recorded_at)}</p></div>
          </div>
        )}

        <div id="challenges-section" className="rounded-xl p-6 bg-surface/50 border border-border/20">
          <h2 className="text-xl font-serif font-bold text-warm-ivory mb-2">Mission Health Challenges</h2>
          <p className="text-sm text-muted-silver mb-4">Select a challenge to navigate to the relevant health information, available measurements, trends, and analysis in this dashboard.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CHALLENGES.map((c) => (
              <button key={c.key} type="button" onClick={() => scrollTo(c.target)} className="text-left rounded-lg p-4 border border-border/20 bg-charcoal/20 hover:bg-charcoal/40 hover:border-celestial-blue/40 focus:outline-none focus:ring-2 focus:ring-celestial-blue/50 transition-colors">
                <p className="text-warm-ivory font-medium">{c.title}</p>
                <p className="text-xs text-muted-silver mt-1">{c.desc}</p>
                <p className="text-xs text-celestial-blue mt-2">Open section →</p>
              </button>
            ))}
          </div>
        </div>

        <div id="physical-section" className="rounded-xl p-6 bg-surface/50 border border-border/20 space-y-4">
          <h2 className="text-xl font-serif font-bold text-warm-ivory">Physical Health Overview</h2>
          <p className="text-sm text-muted-silver">Available physiological measurements from the current mission context. Values are simulated telemetry unless labelled otherwise; compare against configured reference ranges and personal baselines.</p>
          {latest ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard title="Heart Rate" value={fmt(latest.heart_rate)} unit="bpm" refKey="heart_rate" statKey="heart_rate" explanation="Resting/activity heart rate from the latest simulated sample." recordedAt={latest.recorded_at} source={latest.source || 'simulated'} />
              <div id="cardio-section" className="contents">
                <MetricCard title="Blood Pressure" value={`${fmt(latest.systolic,0)}/${fmt(latest.diastolic,0)}`} unit="mmHg" refKey="systolic" statKey="heart_rate" explanation="Systolic/diastolic pressure. Cardiovascular adaptation in space can affect fluid distribution and orthostatic tolerance." recordedAt={latest.recorded_at} source={latest.source || 'simulated'} />
              </div>
              <MetricCard title="SpO₂" value={fmt(latest.spo2)} unit="%" refKey="spo2" statKey="spo2" explanation="Peripheral oxygen saturation estimate from simulated telemetry." recordedAt={latest.recorded_at} source={latest.source || 'simulated'} />
              <MetricCard title="Body Temperature" value={fmt(latest.body_temp,2)} unit="°C" refKey="body_temp" explanation="Body temperature estimate; persistent elevation may warrant clinical review." recordedAt={latest.recorded_at} source={latest.source || 'simulated'} />
              <MetricCard title="HRV" value={fmt(latest.hrv)} unit="ms" refKey="hrv" explanation="Heart rate variability is a recovery/stress indicator; individual baseline comparison is preferred." recordedAt={latest.recorded_at} source={latest.source || 'simulated'} />
              <MetricCard title="Respiratory Rate" value={fmt(latest.resp_rate)} unit="breaths/min" refKey="resp_rate" explanation="Breathing rate from latest sample." recordedAt={latest.recorded_at} source={latest.source || 'simulated'} />
              <div id="sleep-section-card" className="contents">
                <MetricCard title="Sleep Duration" value={fmt(latest.sleep_hours,2)} unit="h" refKey="sleep_hours" statKey="sleep_hours" explanation="Most recent recorded sleep duration (simulated)." recordedAt={latest.recorded_at} source={latest.source || 'simulated'} />
              </div>
              <MetricCard title="Recovery Score" value={fmt(latest.recovery_score)} unit="%" refKey="recovery_score" statKey="recovery_score" explanation="Composite recovery indicator derived from sleep/HRV/load signals (application index)." recordedAt={latest.recorded_at} source={latest.source || 'simulated'} />
            </div>
          ) : <p className="text-muted-silver text-sm">No telemetry samples available yet.</p>}
          <p className="text-xs text-muted-silver/60">Data labels: {health?.data_labels ? `telemetry ${health.data_labels.telemetry}, observations ${health.data_labels.observations}, insights ${health.data_labels.insights}` : 'simulated/derived/predicted as indicated.'}</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
            <h3 className="text-lg font-serif font-bold text-warm-ivory mb-2">Heart rate & blood pressure trends</h3>
            <p className="text-xs text-muted-silver mb-3">X-axis: date (recent samples). Y-axis: bpm / mmHg. Source: simulated telemetry series.</p>
            {chartData.length >= 2 ? (
              <div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#333" /><XAxis dataKey="time" tick={{ fontSize: 10, fill: '#aaa' }} /><YAxis tick={{ fontSize: 10, fill: '#aaa' }} /><Tooltip /><Legend /><Line type="monotone" dataKey="hr" name="Heart rate (bpm)" stroke="#7dd3fc" dot={false} /><Line type="monotone" dataKey="systolic" name="Systolic (mmHg)" stroke="#f87171" dot={false} /><Line type="monotone" dataKey="diastolic" name="Diastolic (mmHg)" stroke="#fb923c" dot={false} /></LineChart></ResponsiveContainer></div>
            ) : <p className="text-sm text-muted-silver">Insufficient historical data to generate this trend.</p>}
          </div>
          <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
            <h3 className="text-lg font-serif font-bold text-warm-ivory mb-2">SpO₂, sleep & recovery trends</h3>
            <p className="text-xs text-muted-silver mb-3">X-axis: date. Y-axis: % / hours / recovery score. Source: simulated telemetry series.</p>
            {chartData.length >= 2 ? (
              <div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#333" /><XAxis dataKey="time" tick={{ fontSize: 10, fill: '#aaa' }} /><YAxis tick={{ fontSize: 10, fill: '#aaa' }} /><Tooltip /><Legend /><Line type="monotone" dataKey="spo2" name="SpO₂ (%)" stroke="#a78bfa" dot={false} /><Line type="monotone" dataKey="sleep" name="Sleep (h)" stroke="#fbbf24" dot={false} /><Line type="monotone" dataKey="recovery" name="Recovery (%)" stroke="#34d399" dot={false} /></LineChart></ResponsiveContainer></div>
            ) : <p className="text-sm text-muted-silver">Insufficient historical data to generate this trend.</p>}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div id="bone-section" className="rounded-xl p-6 bg-surface/50 border border-border/20">
            <h2 className="text-xl font-serif font-bold text-warm-ivory mb-2">Bone Health</h2>
            <p className="text-sm text-muted-silver mb-3">Bone density values shown are derived/modelled observations (not DXA measurements) with recorded timestamps and sources where available.</p>
            {(() => { const obs = latestObservation('bone_density'); const base = baselineOf('bone_density'); const loss = obs && base ? ((obs.value - base.value) / base.value) * 100 : null; return (
              <div className="space-y-2 text-sm">
                <p className="text-muted-silver">Baseline: <span className="text-warm-ivory font-mono">{base ? `${fmt(base.value,3)} ${base.unit}` : '—'}</span></p>
                <p className="text-muted-silver">Latest observation: <span className="text-warm-ivory font-mono">{obs ? `${fmt(obs.value,3)} ${obs.unit}` : '—'}</span> {obs ? `(${fmtTime(obs.recorded_at)})` : ''}</p>
                <p className="text-muted-silver">Change vs baseline: <span className="text-warm-ivory font-mono">{loss !== null ? `${loss.toFixed(2)}%` : 'Insufficient data'}</span></p>
                <p className="text-xs text-muted-silver/70">Explanation: Mechanical unloading in microgravity can reduce bone density over time. Resistive exercise is a key countermeasure; trends should be reviewed with medical personnel.</p>
                {obs?.source_ref && <p className="text-xs text-muted-silver/50">Source: {obs.source_ref}</p>}
                {boneObs.length >= 2 ? (
                  <div className="h-48 mt-2"><ResponsiveContainer width="100%" height="100%"><LineChart data={boneObs.map((o: any) => ({ time: shortTime(o.recorded_at), value: o.value }))}><CartesianGrid strokeDasharray="3 3" stroke="#333" /><XAxis dataKey="time" tick={{ fontSize: 10, fill: '#aaa' }} /><YAxis tick={{ fontSize: 10, fill: '#aaa' }} domain={['auto','auto']} /><Tooltip /><Legend /><Line type="monotone" dataKey="value" name="Bone density (g/cm², derived)" stroke="#60a5fa" dot /></LineChart></ResponsiveContainer></div>
                ) : <p className="text-xs text-muted-silver mt-2">Insufficient historical data to generate this trend.</p>}
              </div>
            ); })()}
          </div>
          <div id="muscle-section" className="rounded-xl p-6 bg-surface/50 border border-border/20">
            <h2 className="text-xl font-serif font-bold text-warm-ivory mb-2">Muscle & Strength</h2>
            <p className="text-sm text-muted-silver mb-3">Strength indicators shown are simulated/derived assessments, not direct clinical dynamometry unless stated.</p>
            {(() => { const obs = latestObservation('grip_strength'); const base = baselineOf('grip_strength'); const loss = obs && base ? ((obs.value - base.value) / base.value) * 100 : null; return (
              <div className="space-y-2 text-sm">
                <p className="text-muted-silver">Baseline grip strength: <span className="text-warm-ivory font-mono">{base ? `${fmt(base.value,1)} ${base.unit}` : '—'}</span></p>
                <p className="text-muted-silver">Latest observation: <span className="text-warm-ivory font-mono">{obs ? `${fmt(obs.value,1)} ${obs.unit}` : '—'}</span> {obs ? `(${fmtTime(obs.recorded_at)})` : ''}</p>
                <p className="text-muted-silver">Change vs baseline: <span className="text-warm-ivory font-mono">{loss !== null ? `${loss.toFixed(2)}%` : 'Insufficient data'}</span></p>
                <p className="text-xs text-muted-silver/70">Explanation: Prolonged unloading can reduce muscle strength. Regular resistive exercise and adequate recovery support maintenance.</p>
                {muscleObs.length >= 2 ? (
                  <div className="h-48 mt-2"><ResponsiveContainer width="100%" height="100%"><LineChart data={muscleObs.map((o: any) => ({ time: shortTime(o.recorded_at), value: o.value }))}><CartesianGrid strokeDasharray="3 3" stroke="#333" /><XAxis dataKey="time" tick={{ fontSize: 10, fill: '#aaa' }} /><YAxis tick={{ fontSize: 10, fill: '#aaa' }} domain={['auto','auto']} /><Tooltip /><Legend /><Line type="monotone" dataKey="value" name="Grip strength (kg, modelled)" stroke="#f472b6" dot /></LineChart></ResponsiveContainer></div>
                ) : <p className="text-xs text-muted-silver mt-2">Insufficient historical data to generate this trend.</p>}
              </div>
            ); })()}
          </div>
        </div>

        <div id="sleep-section" className="rounded-xl p-6 bg-surface/50 border border-border/20">
          <h2 className="text-xl font-serif font-bold text-warm-ivory mb-2">Sleep & Fatigue</h2>
          <p className="text-sm text-muted-silver mb-3">Sleep duration/quality and fatigue-related indicators from telemetry and self-assessments (private).</p>
          <div className="grid md:grid-cols-3 gap-4 mb-4 text-sm">
            <div className="rounded-lg border border-border/20 p-3"><p className="text-xs text-muted-silver">Latest sleep</p><p className="text-warm-ivory font-mono text-xl">{fmt(latest?.sleep_hours,2)} h</p><p className="text-xs text-muted-silver/70">Trend: {trendText(health?.statistics?.sleep_hours)}</p></div>
            <div className="rounded-lg border border-border/20 p-3"><p className="text-xs text-muted-silver">Sleep quality (sample)</p><p className="text-warm-ivory font-mono text-xl">{fmt(latest?.sleep_quality,0)} / 100</p><p className="text-xs text-muted-silver/70">Application-derived index from simulated data.</p></div>
            <div className="rounded-lg border border-border/20 p-3"><p className="text-xs text-muted-silver">Recent assessments</p><p className="text-warm-ivory font-mono text-xl">{(health?.assessments || []).length}</p><p className="text-xs text-muted-silver/70">Includes daily/mental/physical self-reports.</p></div>
          </div>
          {chartData.length >= 2 ? (
            <div className="h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#333" /><XAxis dataKey="time" tick={{ fontSize: 10, fill: '#aaa' }} /><YAxis tick={{ fontSize: 10, fill: '#aaa' }} /><Tooltip /><Legend /><Line type="monotone" dataKey="sleep" name="Sleep (h)" stroke="#fbbf24" dot={false} /><Line type="monotone" dataKey="recovery" name="Recovery (%)" stroke="#34d399" dot={false} /></LineChart></ResponsiveContainer></div>
          ) : <p className="text-sm text-muted-silver">Insufficient historical data to generate this trend.</p>}
        </div>

        <div id="radiation-section" className="rounded-xl p-6 bg-surface/50 border border-border/20 space-y-4">
          <h2 className="text-xl font-serif font-bold text-warm-ivory">Radiation Intelligence</h2>
          <p className="text-sm text-muted-silver">Radiation values are clearly separated by type: measured/modelled exposure records, external observed space-weather context, scenario-based projections, and estimated indicators. No direct astronaut dosimeter measurements are claimed unless explicitly labelled.</p>
          {radiation ? (
            <>
              <div className="grid md:grid-cols-4 gap-4">
                <div className="rounded-lg border border-border/20 p-3"><p className="text-xs text-muted-silver">Cumulative exposure (modelled)</p><p className="text-2xl font-mono text-warm-ivory">{fmt(radiation.cumulative_dose_msv)} mSv</p><p className="text-xs text-muted-silver/60">Source: mission profile model</p></div>
                <div className="rounded-lg border border-border/20 p-3"><p className="text-xs text-muted-silver">Dose rate</p><p className="text-2xl font-mono text-warm-ivory">{fmt(radiation.rate_msv_day)} mSv/day</p><p className="text-xs text-muted-silver/60">Environment: {radiation.mission?.environment?.label || radiation.mission?.environment || '—'}</p></div>
                <div className="rounded-lg border border-border/20 p-3"><p className="text-xs text-muted-silver">Projected end-of-mission</p><p className="text-2xl font-mono text-warm-ivory">{fmt(radiation.projected_end_of_mission_msv)} mSv</p><p className="text-xs text-muted-silver/60">Assumes current modelled rate continues</p></div>
                <div className="rounded-lg border border-border/20 p-3"><p className="text-xs text-muted-silver">Remaining mission days</p><p className="text-2xl font-mono text-warm-ivory">{radiation.remaining_days ?? '—'}</p><p className="text-xs text-muted-silver/60">Reference: {radiation.reference?.source ? 'configured screening context' : 'no configured reference'}</p></div>
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border/20 p-4">
                  <h3 className="text-sm font-medium text-warm-ivory mb-2">Exposure history</h3>
                  <p className="text-xs text-muted-silver mb-2">X-axis: date. Y-axis: mSv (daily increment and cumulative). Source: modelled radiation records.</p>
                  {radiationChart.length >= 2 ? (
                    <div className="h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={radiationChart}><CartesianGrid strokeDasharray="3 3" stroke="#333" /><XAxis dataKey="time" tick={{ fontSize: 10, fill: '#aaa' }} /><YAxis tick={{ fontSize: 10, fill: '#aaa' }} /><Tooltip /><Legend /><Line type="monotone" dataKey="daily" name="Daily increment (mSv)" stroke="#f59e0b" dot={false} /><Line type="monotone" dataKey="cumulative" name="Cumulative (mSv)" stroke="#ef4444" dot={false} /></LineChart></ResponsiveContainer></div>
                  ) : <p className="text-sm text-muted-silver">Insufficient historical data to generate this trend.</p>}
                </div>
                <div className="rounded-lg border border-border/20 p-4 space-y-3">
                  <h3 className="text-sm font-medium text-warm-ivory">Radiation Intelligence Report</h3>
                  <div className="text-sm text-muted-silver space-y-1">
                    <p><span className="text-warm-ivory">Current Exposure:</span> {fmt(radiation.cumulative_dose_msv)} mSv cumulative (modelled).</p>
                    <p><span className="text-warm-ivory">Exposure Trend:</span> {radiationChart.length >= 2 ? (radiationChart[radiationChart.length - 1].cumulative >= radiationChart[Math.max(0, radiationChart.length - 8)].cumulative ? 'Increasing cumulative exposure (expected over mission time)' : 'Stable / insufficient change') : 'Insufficient data'}.</p>
                    <p><span className="text-warm-ivory">Mission Context:</span> {mission?.name || '—'}, {mission?.destination || '—'}, {mission?.elapsed_duration_days ?? '—'} of {mission?.planned_duration_days ?? '—'} planned days.</p>
                    <p><span className="text-warm-ivory">Assessment:</span> Modelled exposure is {fmt(radiation.cumulative_dose_msv)} mSv to date with projected end-of-mission exposure {fmt(radiation.projected_end_of_mission_msv)} mSv under current assumptions. This is a planning/monitoring indicator, not a clinical dose record.</p>
                    <p><span className="text-warm-ivory">Potential Concern:</span> {(radiation.alerts || []).length > 0 ? `${radiation.alerts.length} radiation alert(s) recorded; review details below.` : 'No radiation alert thresholds triggered in available records.'}</p>
                    <p><span className="text-warm-ivory">Recommendation:</span> Continue monitoring exposure trends and mission context. For any event or threshold concern, follow mission radiation procedures and consult medical/radiation officers. This is decision support, not an autonomous medical prescription.</p>
                    <p><span className="text-warm-ivory">Data Source:</span> Modelled mission radiation records{forecast?.observed_space_weather?.available ? '; observed geomagnetic context from NOAA SWPC when available' : '; external space-weather context unavailable or not retrieved'}.</p>
                    <p><span className="text-warm-ivory">Limitations:</span> No direct dosimeter measurement is claimed. Projections assume configured dose rate/scenario and can change with solar activity, shielding, or mission changes. Biological risk indicators, if shown, are estimates.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/20 p-4">
                <h3 className="text-sm font-medium text-warm-ivory mb-2">Space-weather context & projections</h3>
                <p className="text-sm text-muted-silver">Observed geomagnetic Kp: {forecast?.observed_space_weather?.available ? `${forecast.observed_space_weather.kp} (${forecast.observed_space_weather.source || 'external'})` : 'Unavailable.'}</p>
                <p className="text-sm text-muted-silver">Event forecast/scenario: {forecast?.event_forecast?.available ? `${forecast.event_forecast.estimated_event_dose_msv} mSv on mission day ${forecast.event_forecast.solar_event_day} (${forecast.event_forecast.data_class})` : 'No configured scenario event forecast.'}</p>
                {forecast?.event_forecast?.note && <p className="text-xs text-muted-silver/70 mt-1">{forecast.event_forecast.note}</p>}
                <p className="text-xs text-muted-silver/60 mt-2">Data classes: {JSON.stringify(radiation.data_classes || {})}</p>
              </div>

              {radiation.alerts?.length > 0 && (
                <div className="rounded-lg border border-border/20 p-4">
                  <h3 className="text-sm font-medium text-warm-ivory mb-2">Radiation alerts / events</h3>
                  <ul className="space-y-2 text-sm">
                    {radiation.alerts.map((a: any, i: number) => (
                      <li key={i} className="border-l-2 border-warning/50 pl-3"><p className="text-warm-ivory">{a.title} <span className="text-xs text-muted-silver/60">({a.severity}, {a.data_class})</span></p><p className="text-xs text-muted-silver">{a.detail}</p><p className="text-xs text-muted-silver/50">{fmtTime(a.at)}</p></li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : <p className="text-sm text-muted-silver">No radiation data available for the current mission context.</p>}
        </div>

        <div id="mental-section" className="rounded-xl p-6 bg-surface/50 border border-border/20 space-y-4">
          <h2 className="text-xl font-serif font-bold text-warm-ivory">Mental Wellness (Private)</h2>
          <p className="text-sm text-muted-silver">Self-assessments are private to you unless sharing preferences allow specific summaries. Scores reflect self-reported wellbeing, not clinical diagnoses.</p>
          <div className="grid lg:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-warm-ivory mb-2">Wellness assessment history & trends</h3>
              {wellnessHistory.length >= 2 ? (
                <div className="h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={wellnessHistory.map((a: any) => ({ time: shortTime(a.created_at), mood: a.scores?.mood ?? a.answers?.mood, stress: a.scores?.stress ?? a.answers?.stress, sleepq: a.scores?.sleep_quality ?? a.answers?.sleep_quality }))}><CartesianGrid strokeDasharray="3 3" stroke="#333" /><XAxis dataKey="time" tick={{ fontSize: 10, fill: '#aaa' }} /><YAxis domain={[0,10]} tick={{ fontSize: 10, fill: '#aaa' }} /><Tooltip /><Legend /><Line type="monotone" dataKey="mood" name="Mood" stroke="#34d399" dot /><Line type="monotone" dataKey="stress" name="Stress" stroke="#f87171" dot /><Line type="monotone" dataKey="sleepq" name="Sleep quality" stroke="#60a5fa" dot /></LineChart></ResponsiveContainer></div>
              ) : wellnessHistory.length === 1 ? <p className="text-sm text-muted-silver">Only one assessment recorded; more history is needed for trend charts.</p> : <p className="text-sm text-muted-silver">No wellness assessments recorded yet. Submit an assessment below to start tracking trends.</p>}
              {health?.assessments && health.assessments.length > 0 && (
                <ul className="mt-3 space-y-2 text-sm max-h-48 overflow-auto">
                  {health.assessments.slice(0, 8).map((a: any) => (
                    <li key={a.id} className="border-b border-border/10 pb-2"><div className="flex justify-between"><span className="text-warm-ivory capitalize">{a.kind}</span><span className="text-xs text-muted-silver/60">{fmtTime(a.created_at)}</span></div>{a.scores && <p className="text-xs text-muted-silver mt-1">{Object.entries(a.scores).map(([k,v]) => `${k}: ${String(v)}`).join(' · ')}</p>}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-warm-ivory mb-2">Submit private assessment</h3>
              <form onSubmit={submitAssessment} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-silver">Kind</label><select value={assessmentKind} onChange={(e) => setAssessmentKind(e.target.value as any)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory"><option value="daily">Daily</option><option value="mental">Mental</option><option value="physical">Physical</option></select></div>
                  <div><label className="text-xs text-muted-silver">Mood (1-10)</label><input type="number" min="1" max="10" value={mood} onChange={(e) => setMood(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Stress (1-10)</label><input type="number" min="1" max="10" value={stress} onChange={(e) => setStress(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Sleep quality (1-10)</label><input type="number" min="1" max="10" value={sleepQuality} onChange={(e) => setSleepQuality(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Isolation (1-10)</label><input type="number" min="1" max="10" value={isolation} onChange={(e) => setIsolation(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Fatigue (1-10)</label><input type="number" min="1" max="10" value={fatigue} onChange={(e) => setFatigue(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Concentration (1-10)</label><input type="number" min="1" max="10" value={concentration} onChange={(e) => setConcentration(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div className="flex items-center gap-2 pt-5"><input type="checkbox" id="safety" checked={safetyConcern} onChange={(e) => setSafetyConcern(e.target.checked)} /><label htmlFor="safety" className="text-xs text-muted-silver">I have a safety concern to flag</label></div>
                </div>
                <div><label className="text-xs text-muted-silver">Notes (private)</label><textarea value={assessmentNotes} onChange={(e) => setAssessmentNotes(e.target.value)} rows={2} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                {assessmentMsg && <Alert variant={assessmentMsg.includes('saved') ? 'success' : 'destructive'}>{assessmentMsg}</Alert>}
                <Button type="submit" disabled={assessmentLoading}>{assessmentLoading ? 'Saving…' : 'Save assessment'}</Button>
              </form>
            </div>
          </div>
        </div>

        <div id="ai-companion-section" className="rounded-xl p-6 bg-surface/50 border border-border/20">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-serif font-bold text-warm-ivory">AI Health Companion (Private)</h2>
            <div className="text-xs text-muted-silver/60">{aiStatus ? `Provider: ${aiStatus.provider} · ${aiStatus.model}` : 'Status unavailable'}</div>
          </div>
          <p className="text-sm text-muted-silver mb-4">Grounded in your COSMICARE records. Responses are decision support, not diagnoses. Conversations are private to your astronaut account.</p>
          <div className="grid md:grid-cols-4 gap-4 mb-4">
            <div className="md:col-span-1 border border-border/20 rounded-lg p-3 max-h-64 overflow-auto">
              <div className="flex justify-between items-center mb-2"><span className="text-xs text-muted-silver uppercase tracking-wider">Conversations</span><button type="button" onClick={startNewConversation} className="text-xs text-celestial-blue hover:underline">New</button></div>
              {conversations.length === 0 ? <p className="text-xs text-muted-silver">No conversations yet.</p> : (
                <ul className="space-y-1">{conversations.map((c: any) => (
                  <li key={c.id} className="flex justify-between items-center gap-2"><button type="button" onClick={() => openConversation(c)} className={`text-left text-xs truncate ${activeConversationId === c.id ? 'text-warm-ivory' : 'text-muted-silver hover:text-warm-ivory'}`}>{c.title}</button><button type="button" onClick={() => deleteConversation(c.id)} className="text-xs text-muted-silver/40 hover:text-restrained-red">×</button></li>
                ))}</ul>
              )}
            </div>
            <div className="md:col-span-3 border border-border/20 rounded-lg p-3 flex flex-col h-80">
              <div className="flex-1 overflow-auto space-y-3 mb-3">
                {chatMessages.length === 0 && <p className="text-xs text-muted-silver">Ask about readings, trends, radiation, sleep, or prepare a question for medical staff.</p>}
                {chatMessages.map((m, i) => (
                  <div key={i} className={`text-sm ${m.role === 'user' ? 'text-right' : 'text-left'}`}><div className={`inline-block rounded-lg px-3 py-2 max-w-[85%] ${m.role === 'user' ? 'bg-charcoal/60 text-warm-ivory' : 'bg-surface/60 text-warm-ivory border border-border/20'}`}><p className="whitespace-pre-wrap">{m.content}</p>{m.role === 'assistant' && m.meta && <p className="text-xs text-muted-silver/50 mt-1">{m.meta.provider} · {m.meta.model}{m.meta.fallback ? ' (fallback)' : ''}{m.meta.safety_escalation ? ` · safety: ${m.meta.safety_escalation}` : ''}</p>}</div></div>
                ))}
                {chatLoading && <p className="text-xs text-muted-silver">Thinking…</p>}
                {chatError && <p className="text-xs text-restrained-red">{chatError}</p>}
              </div>
              <form onSubmit={sendChat} className="flex gap-2">
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask your companion…" className="flex-1 rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" disabled={chatLoading} />
                <Button type="submit" size="sm" disabled={chatLoading || !chatInput.trim()}>Send</Button>
              </form>
            </div>
          </div>
        </div>

        <div id="predictive-analysis-section" className="rounded-xl p-6 bg-surface/50 border border-border/20 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h2 className="text-xl font-serif font-bold text-warm-ivory">Predictive Health Analysis</h2>
            <div className="text-xs text-muted-silver/60">{analysisResult?.generated_at ? `Last analysis run: ${fmtTime(analysisResult.generated_at)}` : 'Run analysis to generate the latest report.'}</div>
          </div>
          {analysisError && <Alert variant="destructive">{analysisError}</Alert>}
          <p className="text-sm text-muted-silver">This report is generated from available COSMICARE records (simulated telemetry, derived observations, self-reports, and model outputs). It is decision support, not a diagnosis. Uncertainty and missing data are stated explicitly.</p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border/20 p-4">
              <h3 className="text-sm font-medium text-warm-ivory mb-2">1. Current Status</h3>
              <p className="text-sm text-muted-silver">Latest available sample: HR {fmt(latest?.heart_rate)} bpm, BP {fmt(latest?.systolic,0)}/{fmt(latest?.diastolic,0)} mmHg, SpO₂ {fmt(latest?.spo2)}%, sleep {fmt(latest?.sleep_hours,2)} h, recovery {fmt(latest?.recovery_score)}% ({fmtTime(latest?.recorded_at)}). Mission: {mission?.name || '—'} ({mission?.phase?.replace('_',' ') || '—'}).</p>
            </div>
            <div className="rounded-lg border border-border/20 p-4">
              <h3 className="text-sm font-medium text-warm-ivory mb-2">2. Observed Trends</h3>
              <ul className="text-sm text-muted-silver space-y-1">
                <li>Heart rate: {trendText(health?.statistics?.heart_rate)} (based on {health?.statistics?.heart_rate?.samples ?? 0} samples).</li>
                <li>Sleep duration: {trendText(health?.statistics?.sleep_hours)}.</li>
                <li>SpO₂: {trendText(health?.statistics?.spo2)}.</li>
                <li>Recovery: {trendText(health?.statistics?.recovery_score)}.</li>
              </ul>
            </div>
            <div className="rounded-lg border border-border/20 p-4">
              <h3 className="text-sm font-medium text-warm-ivory mb-2">3. Potential Future Concerns</h3>
              {(predInsights.length > 0 || recentSignals.length > 0) ? (
                <ul className="text-sm text-muted-silver space-y-1">
                  {(predInsights.length ? predInsights : recentSignals).slice(0, 5).map((s: any, i: number) => (
                    <li key={i}><span className="text-warm-ivory">{s.title}</span> — {s.severity} ({s.data_class}). {s.summary}</li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-silver">No specific predictive concerns identified from current records. Continue routine monitoring.</p>}
            </div>
            <div className="rounded-lg border border-border/20 p-4">
              <h3 className="text-sm font-medium text-warm-ivory mb-2">4. Prediction</h3>
              {predInsights.length > 0 ? (
                <ul className="text-sm text-muted-silver space-y-1">
                  {predInsights.slice(0, 4).map((p: any, i: number) => <li key={i}>{p.summary}</li>)}
                </ul>
              ) : <p className="text-sm text-muted-silver">No model-generated prediction is available beyond current trend summaries. A prediction is shown only when sufficient historical data and a supported model output exist.</p>}
            </div>
            <div className="rounded-lg border border-border/20 p-4">
              <h3 className="text-sm font-medium text-warm-ivory mb-2">5. Confidence and Reliability</h3>
              {health?.risks && health.risks.length > 0 ? (
                <ul className="text-sm text-muted-silver space-y-1">
                  {health.risks.map((r: any, i: number) => <li key={i}>{r.domain}: score {r.score}/100, confidence {r.confidence} (heuristic indicator, {r.horizon_days}-day horizon). {r.rationale?.limitation || ''}</li>)}
                </ul>
              ) : <p className="text-sm text-muted-silver">Reliability depends on data quantity/quality and model assumptions. Where confidence is unavailable, results should be treated as preliminary.</p>}
            </div>
            <div className="rounded-lg border border-border/20 p-4">
              <h3 className="text-sm font-medium text-warm-ivory mb-2">6. Recommended Monitoring</h3>
              {health?.recommendations && health.recommendations.length > 0 ? (
                <ul className="text-sm text-muted-silver space-y-1">
                  {health.recommendations.slice(0, 6).map((r: any) => <li key={r.id}><span className="text-warm-ivory">{r.title}</span>: {r.detail} <span className="text-xs text-muted-silver/60">({r.priority}, {r.status})</span></li>)}
                </ul>
              ) : <p className="text-sm text-muted-silver">Continue routine monitoring of vitals, sleep, wellness assessments, and radiation exposure. Review with medical staff if symptoms or concerning trends appear.</p>}
            </div>
            <div className="rounded-lg border border-border/20 p-4">
              <h3 className="text-sm font-medium text-warm-ivory mb-2">7. Data Limitations</h3>
              <ul className="text-sm text-muted-silver space-y-1">
                <li>Telemetry is simulated unless explicitly marked as measured.</li>
                <li>Bone/muscle indicators may be derived/modelled observations, not direct clinical measurements.</li>
                <li>Radiation exposure shown is modelled; projections depend on mission assumptions and can change.</li>
                <li>Predictions are estimates with uncertainty and are not clinical diagnoses.</li>
                <li>Missing or sparse records limit trend and prediction reliability.</li>
              </ul>
            </div>
            <div className="rounded-lg border border-border/20 p-4">
              <h3 className="text-sm font-medium text-warm-ivory mb-2">8. Data Sources</h3>
              <ul className="text-sm text-muted-silver space-y-1">
                <li>Latest telemetry and historical series: `/api/astronauts/{astronautId}/health` (simulated samples).</li>
                <li>Baselines and derived observations: astronaut health record.</li>
                <li>Radiation records and forecast context: `/api/radiation` and `/api/radiation/forecast` (modelled/external context as indicated).</li>
                <li>Self-assessments: private astronaut submissions.</li>
                <li>Analysis engine: deterministic rules/statistical screening/predictive estimates via `/api/ai/analyze/{astronautId}`.</li>
              </ul>
              {analysisResult?.pipeline && <p className="text-xs text-muted-silver/60 mt-2">Pipeline: {Array.isArray(analysisResult.pipeline) ? analysisResult.pipeline.join(' → ') : String(analysisResult.pipeline)}</p>}
            </div>
          </div>
        </div>

        <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
          <h2 className="text-xl font-serif font-bold text-warm-ivory mb-2">Recent Insights, Risks & Recommendations</h2>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <h3 className="text-sm font-medium text-warm-ivory mb-2">Insights</h3>
              {health?.insights?.length ? <ul className="space-y-2">{health.insights.slice(0,8).map((i:any)=>(<li key={i.id} className="border-b border-border/10 pb-1"><p className="text-warm-ivory">{i.title}</p><p className="text-xs text-muted-silver">{i.severity} · {i.data_class} · {fmtTime(i.created_at)}</p><p className="text-xs text-muted-silver/70">{i.summary}</p></li>))}</ul> : <p className="text-muted-silver text-sm">No insights available yet. Run predictive analysis.</p>}
            </div>
            <div>
              <h3 className="text-sm font-medium text-warm-ivory mb-2">Risk indicators</h3>
              {health?.risks?.length ? <ul className="space-y-2">{health.risks.map((r:any,i:number)=>(<li key={i} className="border-b border-border/10 pb-1"><p className="text-warm-ivory">{r.domain}: {r.score}/100</p><p className="text-xs text-muted-silver">confidence {r.confidence} · {r.horizon_days}d</p></li>))}</ul> : <p className="text-muted-silver text-sm">No risk indicators available.</p>}
            </div>
            <div>
              <h3 className="text-sm font-medium text-warm-ivory mb-2">Recommendations</h3>
              {health?.recommendations?.length ? <ul className="space-y-2">{health.recommendations.slice(0,8).map((r:any)=>(<li key={r.id} className="border-b border-border/10 pb-1"><p className="text-warm-ivory">{r.title}</p><p className="text-xs text-muted-silver">{r.priority} · {r.status}</p><p className="text-xs text-muted-silver/70">{r.detail}</p></li>))}</ul> : <p className="text-muted-silver text-sm">No recommendations available.</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AstronautDashboard;
