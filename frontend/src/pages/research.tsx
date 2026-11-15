import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../lib/auth/context';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api/client';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ResearchAnalysisView } from '@/components/research/ResearchAnalysisView';

interface Dataset { id: number; title: string; identifier: string; source: string; source_url: string; license: string; modality: string; description: string; indicators: string[]; preprocessing: string; record_count: number; is_sample: boolean; analysis: any; created_at: string; attribution_note: string; }

const fmtTime = (iso?: string | null) => { if (!iso) return '—'; try { return new Date(iso).toLocaleString(); } catch { return iso; } };

export const ResearchExplorer = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const canImport = user?.role === 'medical' || user?.role === 'admin';

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // import metadata form
  const [imTitle, setImTitle] = useState('');
  const [imIdentifier, setImIdentifier] = useState('');
  const [imSource, setImSource] = useState('');
  const [imSourceUrl, setImSourceUrl] = useState('');
  const [imLicense, setImLicense] = useState('');
  const [imModality, setImModality] = useState('');
  const [imDescription, setImDescription] = useState('');
  const [imIndicators, setImIndicators] = useState('');
  const [imMsg, setImMsg] = useState<string | null>(null);

  // csv upload
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvTitle, setCsvTitle] = useState('');
  const [csvSource, setCsvSource] = useState('');
  const [csvSourceUrl, setCsvSourceUrl] = useState('');
  const [csvLicense, setCsvLicense] = useState('');
  const [csvMsg, setCsvMsg] = useState<string | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);

  const handleLogout = async () => { await logout(); navigate('/', { replace: true }); };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [dRes, sRes] = await Promise.all([
        api.get<{ datasets: Dataset[] }>('/research/datasets'),
        api.get<{ sources: any[] }>('/research/sources'),
      ]);
      if (!dRes.success) throw new Error(dRes.error || 'Failed to load datasets');
      setDatasets(dRes.data?.datasets || []);
      if (sRes.success) setSources(sRes.data?.sources || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load research data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return datasets.filter((d) => {
      if (!q) return true;
      return d.title.toLowerCase().includes(q) || d.identifier.toLowerCase().includes(q) || (d.indicators || []).some((i) => i.toLowerCase().includes(q)) || d.source.toLowerCase().includes(q);
    });
  }, [datasets, search]);

  const selected = datasets.find((d) => d.id === selectedId) || null;

  const loadAnalysis = async (id: number) => {
    setAnalysisLoading(true); setAnalysis(null);
    try {
      const res = await api.get<any>(`/research/analysis?dataset_id=${id}`);
      if (res.success) setAnalysis(res.data);
    } catch { /* ignore */ } finally {
      setAnalysisLoading(false);
    }
  };

  useEffect(() => {
    if (selectedId) loadAnalysis(selectedId);
  }, [selectedId]);

  const handleImportMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imTitle || !imIdentifier) return;
    setImMsg(null);
    try {
      const payload = {
        title: imTitle, identifier: imIdentifier, source: imSource || 'User-provided', source_url: imSourceUrl,
        license: imLicense, modality: imModality, description: imDescription,
        indicators: imIndicators.split(',').map((s) => s.trim()).filter(Boolean),
      };
      const res = await api.post('/research/import', payload);
      if (res.success) {
        setImMsg('Dataset registered.');
        await load();
      } else {
        setImMsg(res.error || 'Import failed');
      }
    } catch (err: any) {
      setImMsg(err?.message || 'Import failed');
    }
  };

  const handleCsvUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) return;
    setCsvLoading(true); setCsvMsg(null);
    try {
      const form = new FormData();
      form.append('file', csvFile);
      const base = (import.meta as any).env?.VITE_API_BASE_URL || 'http://127.0.0.1:8001';
      const url = `${base}/api/research/import/csv?title=${encodeURIComponent(csvTitle || 'Imported CSV dataset')}&source=${encodeURIComponent(csvSource || 'User-provided research export')}&source_url=${encodeURIComponent(csvSourceUrl)}&license=${encodeURIComponent(csvLicense)}`;
      const token = api.getToken();
      const res = await fetch(url, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
      const data = await res.json();
      if (res.ok) {
        setCsvMsg('CSV imported.');
        setCsvFile(null);
        await load();
      } else {
        setCsvMsg(data?.detail || 'CSV import failed');
      }
    } catch (err: any) {
      setCsvMsg(err?.message || 'CSV import failed');
    } finally {
      setCsvLoading(false);
    }
  };

  if (loading) return <section className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-silver text-sm">Loading Research Explorer…</div></section>;
  if (error) return <section className="min-h-screen bg-background flex items-center justify-center p-8"><div className="max-w-md text-center"><h1 className="text-2xl font-serif text-warm-ivory mb-2">Unable to load</h1><p className="text-muted-silver text-sm mb-4">{error}</p><Button onClick={load}>Retry</Button></div></section>;

  return (
    <section className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-warm-ivory">Research Explorer</h1>
            <p className="text-muted-silver text-sm mt-1">Research datasets, source references, and synthetic demonstration notes · {user?.full_name}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>Sign Out</Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="md:col-span-2 rounded-xl p-4 bg-surface/50 border border-border/20">
            <label className="text-xs text-muted-silver">Search</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory mt-1" placeholder="title, identifier, indicator, source" />
          </div>
          <div className="rounded-xl p-4 bg-surface/50 border border-border/20">
            <p className="text-xs text-muted-silver uppercase tracking-wider">Datasets</p>
            <p className="text-2xl font-bold text-warm-ivory">{datasets.length}</p>
            <p className="text-xs text-muted-silver/60">{datasets.filter((d) => d.is_sample).length} synthetic samples · {datasets.filter((d) => !d.is_sample).length} imported records.</p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="md:col-span-1 rounded-xl p-4 bg-surface/50 border border-border/20 max-h-[70vh] overflow-auto">
            <h2 className="text-lg font-serif font-bold text-warm-ivory mb-3">Datasets</h2>
            {filtered.length === 0 ? <p className="text-muted-silver text-sm">No datasets.</p> : (
              <ul className="space-y-2">
                {filtered.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => setSelectedId(d.id)} className={`w-full text-left rounded-md p-2 border transition-colors ${selectedId === d.id ? 'border-warm-ivory bg-charcoal/40' : 'border-border/10 hover:bg-charcoal/20'}`}>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-warm-ivory font-medium text-sm truncate">{d.title}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${d.is_sample ? 'bg-warning/15 text-soft-amber border border-warning/40' : 'bg-celestial-blue/15 text-celestial-blue border border-celestial-blue/30'}`}>
                          {d.is_sample ? 'synthetic' : 'imported'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-silver truncate">{d.identifier}</p>
                      <p className="text-xs text-muted-silver/60 truncate">{(d.indicators || []).join(', ')}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="md:col-span-2 rounded-xl p-6 bg-surface/50 border border-border/20">
            {!selected ? <p className="text-muted-silver text-sm">Select a dataset to view details.</p> : (
              <div className="space-y-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h2 className="text-xl font-serif font-bold text-warm-ivory">{selected.title}</h2>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${selected.is_sample ? 'border-warning/40 bg-warning/15 text-soft-amber' : 'border-celestial-blue/40 bg-celestial-blue/15 text-celestial-blue'}`}>
                      {selected.is_sample ? 'synthetic demonstration' : 'research dataset'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-silver">{selected.identifier} · {selected.modality}</p>
                </div>
                {selected.is_sample && (
                  <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-soft-amber">
                    Synthetic demonstration data. This record is explicitly illustrative and not an official NASA dataset.
                  </div>
                )}
                <div className="grid md:grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-silver">Source</p><p className="text-warm-ivory">{selected.source}</p></div>
                  <div><p className="text-xs text-muted-silver">License</p><p className="text-warm-ivory">{selected.license}</p></div>
                  <div><p className="text-xs text-muted-silver">Record count</p><p className="text-warm-ivory">{selected.record_count}</p></div>
                  <div><p className="text-xs text-muted-silver">Imported</p><p className="text-warm-ivory">{fmtTime(selected.created_at)}</p></div>
                </div>
                {selected.source_url && <p className="text-xs text-muted-silver/70">URL: {selected.source_url}</p>}
                <p className="text-sm text-muted-silver">{selected.description}</p>
                <div>
                  <p className="text-xs text-muted-silver uppercase tracking-wider mb-1">Indicators</p>
                  <p className="text-sm text-warm-ivory">{(selected.indicators || []).join(', ') || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-silver uppercase tracking-wider mb-1">Preprocessing</p>
                  <p className="text-sm text-muted-silver">{selected.preprocessing}</p>
                </div>
                <p className="text-xs text-warning/80">{selected.attribution_note}</p>

                {analysisLoading && <p className="text-muted-silver text-sm">Loading analysis…</p>}
                {analysis && (
                  <ResearchAnalysisView dataset={selected} response={analysis} />
                )}
              </div>
            )}
          </div>
        </div>

        {canImport && (
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
              <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Register Dataset Metadata</h2>
              <form onSubmit={handleImportMeta} className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <div><label className="text-xs text-muted-silver">Title</label><input value={imTitle} onChange={(e) => setImTitle(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Identifier</label><input value={imIdentifier} onChange={(e) => setImIdentifier(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Source</label><input value={imSource} onChange={(e) => setImSource(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Source URL</label><input value={imSourceUrl} onChange={(e) => setImSourceUrl(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">License</label><input value={imLicense} onChange={(e) => setImLicense(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                  <div><label className="text-xs text-muted-silver">Modality</label><input value={imModality} onChange={(e) => setImModality(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                </div>
                <div><label className="text-xs text-muted-silver">Indicators (comma-separated)</label><input value={imIndicators} onChange={(e) => setImIndicators(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                <div><label className="text-xs text-muted-silver">Description</label><textarea value={imDescription} onChange={(e) => setImDescription(e.target.value)} rows={3} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                {imMsg && <Alert variant={imMsg.includes('registered') ? 'success' : 'destructive'}>{imMsg}</Alert>}
                <Button type="submit">Register</Button>
              </form>
            </div>

            <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
              <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Import Aggregated CSV</h2>
              <form onSubmit={handleCsvUpload} className="space-y-3">
                <div><label className="text-xs text-muted-silver">CSV file (columns: metric,value[,group])</label><input type="file" accept=".csv,text/csv" onChange={(e) => setCsvFile(e.target.files?.[0] || null)} className="w-full text-sm text-warm-ivory" /></div>
                <div><label className="text-xs text-muted-silver">Title</label><input value={csvTitle} onChange={(e) => setCsvTitle(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                <div><label className="text-xs text-muted-silver">Source</label><input value={csvSource} onChange={(e) => setCsvSource(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                <div><label className="text-xs text-muted-silver">Source URL</label><input value={csvSourceUrl} onChange={(e) => setCsvSourceUrl(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                <div><label className="text-xs text-muted-silver">License</label><input value={csvLicense} onChange={(e) => setCsvLicense(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-sm text-warm-ivory" /></div>
                {csvMsg && <Alert variant={csvMsg.includes('imported') ? 'success' : 'destructive'}>{csvMsg}</Alert>}
                <Button type="submit" disabled={csvLoading || !csvFile}>{csvLoading ? 'Importing…' : 'Import CSV'}</Button>
              </form>
            </div>
          </div>
        )}

        <div className="rounded-xl p-6 bg-surface/50 border border-border/20">
          <h2 className="text-xl font-serif font-bold text-warm-ivory mb-4">Research Sources</h2>
          <ul className="space-y-2 text-sm">
            {sources.map((s: any, i: number) => (
              <li key={i} className="border-b border-border/10 pb-2">
                <p className="text-warm-ivory font-medium">{s.name}</p>
                <p className="text-xs text-muted-silver">{s.note}</p>
                <p className="text-xs text-muted-silver/60">{s.access} · {s.url}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

export default ResearchExplorer;