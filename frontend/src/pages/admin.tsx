import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../lib/auth/context';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api/client';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

interface AdminUser { id: number; email: string; full_name: string; role: string; is_active: boolean; assignments?: { mission_id: number; mission: string; role: string }[]; }
interface Mission { id: number; code?: string; name: string; category?: string; destination?: string; phase?: string; planned_duration_days?: number; elapsed_duration_days?: number; crew_size?: number; crew?: { astronaut_id: number; user_id: number; name: string; callsign: string; seat: string; role_on_mission: string }[]; }
interface AuditLog { id: number; actor_id: number; actor_role: string; action: string; entity: string; entity_id: number; detail: string; ip: string; created_at: string; }

const fmtTime = (iso?: string | null) => { if (!iso) return '—'; try { return new Date(iso).toLocaleString(); } catch { return iso; } };

export const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [system, setSystem] = useState<any>(null);
  const [demoStatus, setDemoStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'missions' | 'audit' | 'system' | 'demo'>('overview');

  // user filters
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');

  // create user form
  const [cuEmail, setCuEmail] = useState('');
  const [cuPassword, setCuPassword] = useState('');
  const [cuName, setCuName] = useState('');
  const [cuRole, setCuRole] = useState('astronaut');
  const [cuCallsign, setCuCallsign] = useState('');
  const [cuMsg, setCuMsg] = useState<string | null>(null);
  const [cuLoading, setCuLoading] = useState(false);

  // mission create form
  const [cmName, setCmName] = useState('');
  const [cmCategory, setCmCategory] = useState('orbital');
  const [cmDestination, setCmDestination] = useState('');
  const [cmDuration, setCmDuration] = useState(30);
  const [cmPhase, setCmPhase] = useState('pre_mission');
  const [cmCrewSize, setCmCrewSize] = useState(4);
  const [cmMsg, setCmMsg] = useState<string | null>(null);
  const [cmLoading, setCmLoading] = useState(false);

  // assign
  const [assignMissionId, setAssignMissionId] = useState<number | ''>('');
  const [assignUserId, setAssignUserId] = useState<number | ''>('');
  const [assignRole, setAssignRole] = useState('crew');
  const [assignSeat, setAssignSeat] = useState('MS1');
  const [assignMsg, setAssignMsg] = useState<string | null>(null);

  // audit filter
  const [auditAction, setAuditAction] = useState('');

  // demo reset confirm
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const handleLogout = async () => { await logout(); navigate('/', { replace: true }); };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [uRes, mRes, aRes, sRes, dRes] = await Promise.all([
        api.get<{ users: AdminUser[] }>('/admin/users'),
        api.get<{ missions: Mission[] }>('/admin/missions'),
        api.get<{ logs: AuditLog[] }>('/admin/audit'),
        api.get<any>('/admin/system'),
        api.get<any>('/demo/status'),
      ]);
      if (!uRes.success) throw new Error(uRes.error || 'Failed to load users');
      if (!mRes.success) throw new Error(mRes.error || 'Failed to load missions');
      setUsers(uRes.data?.users || []);
      setMissions(mRes.data?.missions || []);
      if (aRes.success) setAuditLogs(aRes.data?.logs || []);
      if (sRes.success) setSystem(sRes.data);
      if (dRes.success) setDemoStatus(dRes.data);
      setLastSync(new Date().toISOString());
    } catch (e: any) {
      setError(e?.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadAudit = async () => {
    const res = await api.get<{ logs: AuditLog[] }>(`/admin/audit${auditAction ? `?action=${encodeURIComponent(auditAction)}` : ''}`);
    if (res.success) setAuditLogs(res.data?.logs || []);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cuEmail || !cuPassword || !cuName) return;
    setCuLoading(true); setCuMsg(null);
    try {
      const payload: any = { email: cuEmail, password: cuPassword, full_name: cuName, role: cuRole };
      if (cuRole === 'astronaut' && cuCallsign) payload.callsign = cuCallsign;
      const res = await api.post('/admin/users', payload);
      if (res.success) {
        setCuMsg('User created.');
        setCuEmail(''); setCuPassword(''); setCuName(''); setCuCallsign('');
        const uRes = await api.get<{ users: AdminUser[] }>('/admin/users');
        if (uRes.success) setUsers(uRes.data?.users || []);
      } else {
        setCuMsg(res.error || 'Failed to create user');
      }
    } catch (err: any) {
      setCuMsg(err?.message || 'Failed');
    } finally {
      setCuLoading(false);
    }
  };

  const toggleUserActive = async (u: AdminUser) => {
    try {
      await api.patch(`/admin/users/${u.id}`, { is_active: !u.is_active });
      const uRes = await api.get<{ users: AdminUser[] }>('/admin/users');
      if (uRes.success) setUsers(uRes.data?.users || []);
    } catch { /* ignore */ }
  };

  const changeUserRole = async (u: AdminUser, role: string) => {
    try {
      await api.patch(`/admin/users/${u.id}`, { role });
      const uRes = await api.get<{ users: AdminUser[] }>('/admin/users');
      if (uRes.success) setUsers(uRes.data?.users || []);
    } catch { /* ignore */ }
  };

  const handleCreateMission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmName) return;
    setCmLoading(true); setCmMsg(null);
    try {
      const payload = {
        name: cmName, category: cmCategory, destination: cmDestination,
        planned_duration_days: cmDuration, elapsed_duration_days: 0,
        phase: cmPhase, crew_size: cmCrewSize, gravity_g: 1.0,
        radiation_environment: 'leo', radiation_dose_rate_msv_day: 0.4,
        comm_delay_seconds: 0, exercise_available: true, medical_support: true,
        description: '', create_demo_crew: false,
      };
      const res = await api.post('/missions', payload);
      if (res.success) {
        setCmMsg('Mission created.');
        setCmName(''); setCmDestination('');
        const mRes = await api.get<{ missions: Mission[] }>('/admin/missions');
        if (mRes.success) setMissions(mRes.data?.missions || []);
      } else {
        setCmMsg(res.error || 'Failed to create mission');
      }
    } catch (err: any) {
      setCmMsg(err?.message || 'Failed');
    } finally {
      setCmLoading(false);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignMissionId || !assignUserId) return;
    setAssignMsg(null);
    try {
      const res = await api.post(`/missions/${assignMissionId}/assignments`, { user_id: Number(assignUserId), role_on_mission: assignRole, seat: assignSeat });
      if (res.success) {
        setAssignMsg('Assigned.');
        const mRes = await api.get<{ missions: Mission[] }>('/admin/missions');
        if (mRes.success) setMissions(mRes.data?.missions || []);
      } else {
        setAssignMsg(res.error || 'Failed');
      }
    } catch (err: any) {
      setAssignMsg(err?.message || 'Failed');
    }
  };

  const handleUnassign = async (missionId: number, userId: number) => {
    try {
      await api.delete(`/missions/${missionId}/assignments/${userId}`);
      const mRes = await api.get<{ missions: Mission[] }>('/admin/missions');
      if (mRes.success) setMissions(mRes.data?.missions || []);
    } catch { /* ignore */ }
  };

  const handleUpdateMissionPhase = async (m: Mission, phase: string) => {
    try {
      await api.patch(`/missions/${m.id}`, { phase });
      const mRes = await api.get<{ missions: Mission[] }>('/admin/missions');
      if (mRes.success) setMissions(mRes.data?.missions || []);
    } catch { /* ignore */ }
  };

  const handleResetDemo = async () => {
    if (!resetConfirm) { setResetConfirm(true); return; }
    setResetMsg(null);
    try {
      const res = await api.post('/demo/reset', {});
      if (res.success) {
        setResetMsg('Demo reset complete.');
        setResetConfirm(false);
        await load();
      } else {
        setResetMsg(res.error || 'Reset failed');
      }
    } catch (err: any) {
      setResetMsg(err?.message || 'Reset failed');
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = userSearch.toLowerCase();
      if (q && !u.full_name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      return true;
    });
  }, [users, userSearch, userRoleFilter]);

  const roleCounts = useMemo(() => {
    const c: Record<string, number> = {};
    users.forEach((u) => { c[u.role] = (c[u.role] || 0) + 1; });
    return c;
  }, [users]);

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'users', label: 'Users' },
    { key: 'missions', label: 'Missions' },
    { key: 'audit', label: 'Audit' },
    { key: 'system', label: 'System' },
    { key: 'demo', label: 'Demo' },
  ] as const;

  if (loading) return <section className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-silver text-sm">Loading Admin Dashboard…</div></section>;
  if (error) return <section className="min-h-screen bg-background flex items-center justify-center p-8"><div className="max-w-md text-center"><h1 className="text-2xl font-serif text-warm-ivory mb-2">Unable to load</h1><p className="text-muted-silver text-sm mb-4">{error}</p><Button onClick={load}>Retry</Button></div></section>;

  return (
    <section className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-warm-ivory">Admin Dashboard</h1>
            <p className="text-muted-silver text-sm mt-1">System administration · {user?.full_name} · Last sync {fmtTime(lastSync)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>Sign Out</Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6 border-b border-border/20 pb-2">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} className={`px-3 py-1.5 text-sm rounded-md transition-colors ${activeTab === t.key ? 'bg-warm-ivory text-deepblack' : 'text-muted-silver hover:text-warm-ivory'}`}>{t.label}</button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20"><p className="text-xs text-muted-silver uppercase tracking-wider">Total users</p><p className="text-3xl font-bold text-warm-ivory">{users.length}</p></div>
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20"><p className="text-xs text-muted-silver uppercase tracking-wider">Astronauts</p><p className="text-3xl font-bold text-warm-ivory">{roleCounts.astronaut || 0}</p></div>
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20"><p className="text-xs text-muted-silver uppercase tracking-wider">Medical</p><p className="text-3xl font-bold text-warm-ivory">{roleCounts.medical || 0}</p></div>
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20"><p className="text-xs text-muted-silver uppercase tracking-wider">Mission Control</p><p className="text-3xl font-bold text-warm-ivory">{roleCounts.mission_control || 0}</p></div>
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20"><p className="text-xs text-muted-silver uppercase tracking-wider">Admins</p><p className="text-3xl font-bold text-warm-ivory">{roleCounts.admin || 0}</p></div>
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20"><p className="text-xs text-muted-silver uppercase tracking-wider">Total missions</p><p className="text-3xl font-bold text-warm-ivory">{missions.length}</p></div>
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20"><p className="text-xs text-muted-silver uppercase tracking-wider">Active missions</p><p className="text-3xl font-bold text-warm-ivory">{missions.filter((m) => m.phase === 'in_flight').length}</p></div>
              <div className="rounded-xl p-4 bg-surface/50 border border-border/20"><p className="text-xs text-muted-silver uppercase tracking-wider">Audit entries</p><p className="text-3xl font-bold text-warm-ivory">{auditLogs.length}</p></div>
            </div>
            <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
              <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Recent audit activity</h2>
              {auditLogs.length === 0 ? <p className="text-muted-silver text-sm">No audit entries.</p> : (
                <ul className="space-y-2 text-sm">
                  {auditLogs.slice(0, 8).map((l) => (
                    <li key={l.id} className="border-b border-border/10 pb-1">
                      <div className="flex justify-between"><span className="text-warm-ivory">{l.action}</span><span className="text-xs text-muted-silver/60">{fmtTime(l.created_at)}</span></div>
                      <p className="text-xs text-muted-silver">{l.actor_role} · {l.entity}#{l.entity_id} · {l.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
              <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Create User</h2>
              <form onSubmit={handleCreateUser} className="space-y-3">
                <div className="grid md:grid-cols-4 gap-3">
                  <div><label className="text-xs text-muted-silver">Email</label><input value={cuEmail} onChange={(e) => setCuEmail(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Password</label><input type="password" value={cuPassword} onChange={(e) => setCuPassword(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Full name</label><input value={cuName} onChange={(e) => setCuName(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Role</label><select value={cuRole} onChange={(e) => setCuRole(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory"><option value="astronaut">Astronaut</option><option value="medical">Medical</option><option value="mission_control">Mission Control</option><option value="admin">Admin</option></select></div>
                </div>
                {cuRole === 'astronaut' && (
                  <div><label className="text-xs text-muted-silver">Callsign</label><input value={cuCallsign} onChange={(e) => setCuCallsign(e.target.value)} className="rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                )}
                {cuMsg && <Alert variant={cuMsg.includes('created') ? 'success' : 'destructive'}>{cuMsg}</Alert>}
                <Button type="submit" disabled={cuLoading}>{cuLoading ? 'Creating…' : 'Create User'}</Button>
              </form>
            </div>

            <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
              <div className="flex flex-wrap gap-3 items-end mb-4">
                <div><label className="text-xs text-muted-silver">Search</label><input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" placeholder="name/email" /></div>
                <div><label className="text-xs text-muted-silver">Role</label><select value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)} className="rounded-md border border-input bg-background p-2 text-sm text-warm-ivory"><option value="all">All</option><option value="astronaut">Astronaut</option><option value="medical">Medical</option><option value="mission_control">Mission Control</option><option value="admin">Admin</option></select></div>
              </div>
              {filteredUsers.length === 0 ? <p className="text-muted-silver text-sm">No users.</p> : (
                <ul className="space-y-3">
                  {filteredUsers.map((u) => (
                    <li key={u.id} className="rounded-lg p-4 bg-charcoal/30 border border-border/10">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <p className="text-warm-ivory font-medium">{u.full_name} <span className="text-xs text-muted-silver/60">({u.email})</span></p>
                          <p className="text-xs text-muted-silver">Role: {u.role} · {u.is_active ? 'Active' : 'Disabled'}</p>
                          {u.assignments && u.assignments.length > 0 && <p className="text-xs text-muted-silver/60 mt-1">Assignments: {u.assignments.map((a) => a.mission).join(', ')}</p>}
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <select value={u.role} onChange={(e) => changeUserRole(u, e.target.value)} className="rounded-md border border-input bg-background p-1 text-xs text-warm-ivory">
                            <option value="astronaut">astronaut</option>
                            <option value="medical">medical</option>
                            <option value="mission_control">mission_control</option>
                            <option value="admin">admin</option>
                          </select>
                          <Button size="sm" variant="outline" onClick={() => toggleUserActive(u)}>{u.is_active ? 'Disable' : 'Enable'}</Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {activeTab === 'missions' && (
          <div className="space-y-6">
            <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
              <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Create Mission</h2>
              <form onSubmit={handleCreateMission} className="space-y-3">
                <div className="grid md:grid-cols-4 gap-3">
                  <div><label className="text-xs text-muted-silver">Name</label><input value={cmName} onChange={(e) => setCmName(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Category</label><input value={cmCategory} onChange={(e) => setCmCategory(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Destination</label><input value={cmDestination} onChange={(e) => setCmDestination(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Phase</label><select value={cmPhase} onChange={(e) => setCmPhase(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory"><option value="pre_mission">pre_mission</option><option value="in_flight">in_flight</option><option value="post_mission">post_mission</option></select></div>
                  <div><label className="text-xs text-muted-silver">Duration (days)</label><input type="number" value={cmDuration} onChange={(e) => setCmDuration(Number(e.target.value))} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Crew size</label><input type="number" value={cmCrewSize} onChange={(e) => setCmCrewSize(Number(e.target.value))} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                </div>
                {cmMsg && <Alert variant={cmMsg.includes('created') ? 'success' : 'destructive'}>{cmMsg}</Alert>}
                <Button type="submit" disabled={cmLoading}>{cmLoading ? 'Creating…' : 'Create Mission'}</Button>
              </form>
            </div>

            <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
              <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Assign Astronaut to Mission</h2>
              <form onSubmit={handleAssign} className="space-y-3">
                <div className="grid md:grid-cols-4 gap-3">
                  <div><label className="text-xs text-muted-silver">Mission</label><select value={assignMissionId} onChange={(e) => setAssignMissionId(e.target.value ? Number(e.target.value) : '')} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory"><option value="">Select</option>{missions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
                  <div><label className="text-xs text-muted-silver">User</label><select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value ? Number(e.target.value) : '')} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory"><option value="">Select</option>{users.filter((u) => u.role === 'astronaut').map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
                  <div><label className="text-xs text-muted-silver">Role on mission</label><input value={assignRole} onChange={(e) => setAssignRole(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Seat</label><input value={assignSeat} onChange={(e) => setAssignSeat(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                </div>
                {assignMsg && <Alert variant={assignMsg.includes('Assigned') ? 'success' : 'destructive'}>{assignMsg}</Alert>}
                <Button type="submit">Assign</Button>
              </form>
            </div>

            <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
              <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Missions</h2>
              {missions.length === 0 ? <p className="text-muted-silver text-sm">No missions.</p> : (
                <ul className="space-y-3">
                  {missions.map((m) => (
                    <li key={m.id} className="rounded-lg p-4 bg-charcoal/30 border border-border/10">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <p className="text-warm-ivory font-medium">{m.name} {m.code ? `(${m.code})` : ''}</p>
                          <p className="text-xs text-muted-silver">{m.category} · {m.destination} · {m.phase?.replace('_',' ')}</p>
                          <p className="text-xs text-muted-silver/60 mt-1">Duration: {m.elapsed_duration_days ?? 0} / {m.planned_duration_days ?? 0} days · Crew: {m.crew_size ?? m.crew?.length ?? '—'}</p>
                          {m.crew && m.crew.length > 0 && <p className="text-xs text-muted-silver/60">Crew: {m.crew.map((c) => `${c.callsign}`).join(', ')}</p>}
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <select value={m.phase || 'pre_mission'} onChange={(e) => handleUpdateMissionPhase(m, e.target.value)} className="rounded-md border border-input bg-background p-1 text-xs text-warm-ivory">
                            <option value="pre_mission">pre_mission</option>
                            <option value="in_flight">in_flight</option>
                            <option value="post_mission">post_mission</option>
                          </select>
                          {m.crew && m.crew.map((c) => (
                            <Button key={c.user_id} size="sm" variant="ghost" onClick={() => handleUnassign(m.id, c.user_id)}>Unassign {c.callsign}</Button>
                          ))}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="flex gap-3 items-end">
              <div><label className="text-xs text-muted-silver">Action filter</label><input value={auditAction} onChange={(e) => setAuditAction(e.target.value)} className="rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" placeholder="admin." /></div>
              <Button size="sm" variant="outline" onClick={loadAudit}>Apply</Button>
            </div>
            <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
              <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Audit Logs</h2>
              {auditLogs.length === 0 ? <p className="text-muted-silver text-sm">No audit entries.</p> : (
                <ul className="space-y-2 text-sm">
                  {auditLogs.map((l) => (
                    <li key={l.id} className="border-b border-border/10 pb-2">
                      <div className="flex justify-between"><span className="text-warm-ivory font-medium">{l.action}</span><span className="text-xs text-muted-silver/60">{fmtTime(l.created_at)}</span></div>
                      <p className="text-xs text-muted-silver">Actor {l.actor_id} ({l.actor_role}) · {l.entity}#{l.entity_id}</p>
                      <p className="text-xs text-muted-silver/60">{l.detail} · IP {l.ip}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="space-y-4">
            <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
              <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">System Status</h2>
              {!system ? <p className="text-muted-silver text-sm">Unavailable.</p> : (
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between border-b border-border/10 pb-1"><span className="text-muted-silver">Environment</span><span className="text-warm-ivory font-mono">{system.environment}</span></li>
                  <li className="flex justify-between border-b border-border/10 pb-1"><span className="text-muted-silver">Database</span><span className="text-warm-ivory font-mono">{system.database}</span></li>
                  <li className="flex justify-between border-b border-border/10 pb-1"><span className="text-muted-silver">LLM provider</span><span className="text-warm-ivory font-mono">{system.llm_provider}</span></li>
                  <li className="flex justify-between border-b border-border/10 pb-1"><span className="text-muted-silver">LLM configured</span><span className="text-warm-ivory font-mono">{String(system.llm_configured)}</span></li>
                  <li className="flex justify-between border-b border-border/10 pb-1"><span className="text-muted-silver">Space weather enabled</span><span className="text-warm-ivory font-mono">{String(system.space_weather_enabled)}</span></li>
                  <li className="flex justify-between border-b border-border/10 pb-1"><span className="text-muted-silver">Secrets exposed</span><span className="text-warm-ivory font-mono">{String(system.secrets_exposed)}</span></li>
                </ul>
              )}
              {system?.notes && <ul className="mt-3 space-y-1 text-xs text-muted-silver/60">{system.notes.map((n: string, i: number) => <li key={i}>• {n}</li>)}</ul>}
            </div>
          </div>
        )}

        {activeTab === 'demo' && (
          <div className="space-y-4">
            <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
              <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Demo Status</h2>
              {!demoStatus ? <p className="text-muted-silver text-sm">Unavailable.</p> : (
                <>
                  <p className="text-sm text-muted-silver">Seeded: {String(demoStatus.seeded)}</p>
                  <p className="text-sm text-muted-silver">Missions: {demoStatus.missions?.length ?? 0}</p>
                  <p className="text-sm text-muted-silver mt-2">Demo accounts:</p>
                  <ul className="space-y-1 text-xs text-muted-silver/70">
                    {demoStatus.demo_accounts?.map((a: any, i: number) => <li key={i}>{a.role}: {a.email}</li>)}
                  </ul>
                  <p className="text-xs text-warning mt-2">Warning: {demoStatus.warning}</p>
                </>
              )}
            </div>
            <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
              <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Demo Reset</h2>
              <p className="text-sm text-muted-silver mb-3">Destructive: restores initial demo state.</p>
              {resetMsg && <Alert variant={resetMsg.includes('complete') ? 'success' : 'destructive'}>{resetMsg}</Alert>}
              <Button variant={resetConfirm ? 'destructive' : 'outline'} onClick={handleResetDemo}>{resetConfirm ? 'Confirm reset' : 'Reset demo data'}</Button>
              {resetConfirm && <Button variant="ghost" size="sm" onClick={() => setResetConfirm(false)} className="ml-2">Cancel</Button>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default AdminDashboard;