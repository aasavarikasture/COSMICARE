import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Dataset = {
  id: number;
  title: string;
  identifier: string;
  source: string;
  source_url?: string;
  license?: string;
  modality?: string;
  description?: string;
  indicators?: string[];
  preprocessing?: string;
  record_count?: number;
  is_sample?: boolean;
  analysis?: any;
  created_at?: string;
  attribution_note?: string;
};

type AnalysisResponse = {
  dataset?: Dataset;
  analysis?: any;
  relevance?: Record<string, string>;
  limitations?: string[];
};

type ParsedSeriesPoint = Record<string, any> & { _xLabel: string; _xSort: number };

type SeriesKind = 'time_percent_change' | 'time_numeric' | 'category_count' | 'category_numeric';

function isPlainObject(v: any): v is Record<string, any> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function safeNumber(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const d = abs >= 100 || Number.isInteger(v) ? 0 : digits;
  return v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

function formatSigned(v: number, digits = 1): string {
  const s = formatNumber(Math.abs(v), digits);
  if (v > 0) return `+${s}`;
  if (v < 0) return `-${s}`;
  return '0';
}

function detectSeries(analysis: any): { kind: SeriesKind; points: ParsedSeriesPoint[]; xKey: string; yKey: string; unit?: string } | null {
  if (!isPlainObject(analysis) || !Array.isArray(analysis.series) || analysis.series.length === 0) return null;
  const rows = analysis.series.filter(isPlainObject);
  if (rows.length === 0) return null;

  const sample = rows[0];
  const hasMonth = 'month' in sample || 'Month' in sample;
  const hasBin = 'bin' in sample || 'category' in sample || 'group' in sample || 'label' in sample;
  const xKey = hasMonth
    ? ('month' in sample ? 'month' : 'Month')
    : hasBin
      ? ('bin' in sample ? 'bin' : 'category' in sample ? 'category' : 'group' in sample ? 'group' : 'label')
      : ('time' in sample ? 'time' : 'date' in sample ? 'date' : 'x' in sample ? 'x' : Object.keys(sample)[0]);

  const numericKeys = Object.keys(sample).filter((k) => k !== xKey && safeNumber(sample[k]) !== null);
  if (numericKeys.length === 0) return null;

  const preferredY =
    ['change_pct', 'change_percent', 'percent_change', 'pct_change', 'value', 'count', 'mean', 'daily', 'cumulative'].find((k) => k in sample) ||
    numericKeys[0];
  const yKey = preferredY;

  let kind: SeriesKind;
  if (hasBin || /count|frequency|(^|_)n($|_)/i.test(yKey)) {
    kind = /count|frequency|(^|_)n($|_)/i.test(yKey) ? 'category_count' : 'category_numeric';
  } else if (/change|pct|percent/i.test(yKey)) {
    kind = 'time_percent_change';
  } else {
    kind = 'time_numeric';
  }

  const points: ParsedSeriesPoint[] = rows
    .map((r, idx) => {
      const rawX = r[xKey];
      const nX = safeNumber(rawX);
      const xSort = nX !== null ? nX : idx;
      const xLabel = rawX === null || rawX === undefined || rawX === '' ? String(idx) : String(rawX);
      return { ...r, _xLabel: xLabel, _xSort: xSort } as ParsedSeriesPoint;
    })
    .sort((a, b) => a._xSort - b._xSort || a._xLabel.localeCompare(b._xLabel));

  const unit = typeof analysis.unit === 'string' ? analysis.unit : typeof analysis.units === 'string' ? analysis.units : undefined;
  return { kind, points, xKey, yKey, unit };
}

function domainLabel(dataset: Dataset, indicators: string[]): string {
  const text = `${dataset.title} ${dataset.description || ''} ${dataset.modality || ''} ${indicators.join(' ')}`.toLowerCase();
  if (/bone|bmd|density/.test(text)) return 'bone health';
  if (/radiation|dose|msv|sievert|exposure/.test(text)) return 'radiation exposure';
  if (/cardio|heart|hrv|blood pressure|pulse/.test(text)) return 'cardiovascular health';
  if (/sleep|actigraphy|insomnia|circadian/.test(text)) return 'sleep';
  if (/muscle|strength|atrophy/.test(text)) return 'muscle health';
  if (/nutrition|diet|calorie/.test(text)) return 'nutrition';
  if (/psych|mood|stress|cognitive/.test(text)) return 'behavioral health';
  return 'the selected indicators';
}

function metricLabel(dataset: Dataset, yKey: string, indicators: string[]): string {
  const indicator = indicators[0] || '';
  const text = `${indicator} ${dataset.title} ${yKey}`.toLowerCase();
  if (/bone_density_change_pct|bmd|bone/.test(text)) return 'Bone mineral density change';
  if (/sleep|hours/.test(text)) return 'Sleep duration';
  if (/radiation|dose|msv/.test(text)) return 'Radiation exposure';
  if (/heart|cardio/.test(text)) return 'Cardiovascular indicator';
  if (/change_pct|percent/.test(text)) return 'Percentage change';
  return indicator ? indicator.replace(/[_-]+/g, ' ') : yKey.replace(/[_-]+/g, ' ');
}

function yAxisLabel(kind: SeriesKind, label: string, unit?: string): string {
  if (kind === 'time_percent_change') return `${label} (%)`;
  if (kind === 'category_count') return 'Count';
  if (unit) return `${label} (${unit})`;
  return label;
}

function buildInterpretation(
  dataset: Dataset,
  analysis: any,
  seriesInfo: ReturnType<typeof detectSeries>,
  summary: any,
): string[] {
  const indicators = Array.isArray(dataset.indicators) ? dataset.indicators : [];
  const domain = domainLabel(dataset, indicators);
  const dataClass = isPlainObject(analysis)
    ? String(analysis.data_class || (dataset.is_sample ? 'sample' : 'imported_research'))
    : dataset.is_sample
      ? 'sample'
      : 'imported_research';
  const synthetic = dataset.is_sample || /sample|synthetic|illustrative|demo/i.test(dataClass);
  const lines: string[] = [];

  if (seriesInfo && seriesInfo.points.length > 0) {
    const vals = seriesInfo.points.map((p) => safeNumber(p[seriesInfo.yKey])).filter((v): v is number => v !== null);
    if (vals.length >= 2) {
      const start = vals[0];
      const end = vals[vals.length - 1];
      const delta = end - start;
      const xName = /month/i.test(seriesInfo.xKey) ? 'month' : 'time point';
      const label = metricLabel(dataset, seriesInfo.yKey, indicators);
      if (seriesInfo.kind === 'time_percent_change') {
        const direction = delta < 0 ? 'declines progressively' : delta > 0 ? 'increases progressively' : 'shows no net change';
        lines.push(
          `The available ${synthetic ? 'illustrative ' : ''}series ${direction} from ${xName} ${seriesInfo.points[0]._xLabel} (${formatSigned(start, 1)}%) to ${xName} ${seriesInfo.points[seriesInfo.points.length - 1]._xLabel} (${formatSigned(end, 1)}%).`,
        );
        lines.push(`This visualizes how ${label.toLowerCase()} can change over time in the context of ${domain}.`);
      } else if (seriesInfo.kind === 'category_count' || seriesInfo.kind === 'category_numeric') {
        const maxIdx = vals.indexOf(Math.max(...vals));
        const minIdx = vals.indexOf(Math.min(...vals));
        lines.push(
          `Across ${seriesInfo.points.length} reported categories, values range from ${formatNumber(vals[minIdx])} (${seriesInfo.points[minIdx]._xLabel}) to ${formatNumber(vals[maxIdx])} (${seriesInfo.points[maxIdx]._xLabel}).`,
        );
        lines.push(`The distribution summarizes the available ${domain} indicators without implying individual-level outcomes.`);
      } else {
        const direction = delta < 0 ? 'decreases overall' : delta > 0 ? 'increases overall' : 'is stable overall';
        lines.push(
          `The available ${synthetic ? 'illustrative ' : ''}series ${direction} from ${xName} ${seriesInfo.points[0]._xLabel} (${formatNumber(start)}) to ${xName} ${seriesInfo.points[seriesInfo.points.length - 1]._xLabel} (${formatNumber(end)}).`,
        );
        lines.push(`Observed changes describe the available ${domain} measurements/values only.`);
      }
    } else if (vals.length === 1) {
      lines.push(`Only one numeric data point is available (${formatNumber(vals[0])}), which is insufficient to establish a trend over time.`);
    }
  } else if (isPlainObject(summary) && Object.keys(summary).length > 0) {
    const groups = Object.keys(summary);
    lines.push(
      `Aggregated summary statistics are available for ${groups.length} group${groups.length === 1 ? '' : 's'} (${groups.join(', ')}), describing central tendency and spread for the imported ${domain} indicators.`,
    );
    if (Array.isArray(analysis?.metrics) && analysis.metrics.length) {
      lines.push(`Metrics represented: ${analysis.metrics.join(', ')}.`);
    }
  } else {
    lines.push(`Insufficient structured numerical data is available to generate a quantitative interpretation for ${domain}.`);
  }

  if (synthetic) {
    lines.push(
      'These values are synthetic/demonstration data and cannot establish actual astronaut outcomes, clinical findings, or official research results.',
    );
  } else {
    lines.push('Interpretation is limited to the imported/available aggregate data and cannot establish causation or individual clinical outcomes.');
  }
  return lines;
}

function buildLimitations(
  dataset: Dataset,
  analysis: any,
  endpointLimitations: string[] | undefined,
  summary: any,
  seriesInfo: ReturnType<typeof detectSeries>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s?: string) => {
    const t = (s || '').trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };

  const dataClass = isPlainObject(analysis) ? String(analysis.data_class || '') : '';
  const synthetic = dataset.is_sample || /sample|synthetic|illustrative|demo/i.test(dataClass);

  if (synthetic) add('Synthetic demonstration data: values are illustrative and not official NASA measurements or research findings.');
  if (dataset.source_url && synthetic)
    add('A public source/reference URL may be provided for context, but it is not the source of these synthetic demonstration values.');
  if (dataset.record_count !== undefined && dataset.record_count !== null) add(`Record/sample count (as stored): ${dataset.record_count}.`);
  if (!seriesInfo && !(isPlainObject(summary) && Object.keys(summary).length))
    add('No plottable numerical series or aggregate summary is available for visualization.');
  if (seriesInfo) {
    const vals = seriesInfo.points.map((p) => safeNumber(p[seriesInfo.yKey]));
    if (vals.some((v) => v === null)) add('Some series values are missing or non-numeric and were excluded from calculations/plots.');
    if (seriesInfo.points.length < 3) add('Few data points are available; trends should be interpreted cautiously.');
  }
  if (isPlainObject(analysis)) {
    if (typeof analysis.note === 'string' && analysis.note.trim()) add(`Dataset note: ${analysis.note.trim()}`);
    if (typeof analysis.limitation === 'string' && analysis.limitation.trim()) add(analysis.limitation.trim());
    if (analysis.skipped_rows !== undefined) add(`Import validation: ${analysis.skipped_rows} row(s) skipped during CSV parsing.`);
    if (Array.isArray(analysis.units) && analysis.units.length === 0) add('No explicit units were provided in the dataset; units are not inferred.');
  }
  if (!synthetic) add('Historical/imported datasets are aggregated context and are not live astronaut telemetry.');
  add('No causal claims or clinical diagnoses can be established from this analysis view.');
  (endpointLimitations || []).forEach(add);
  return out;
}

export function ResearchAnalysisView({ dataset, response }: { dataset: Dataset; response: AnalysisResponse | null }) {
  const payload = response?.analysis ?? dataset.analysis;
  const endpointLimitations = response?.limitations;

  const model = useMemo(() => {
    const indicators = Array.isArray(dataset.indicators) ? dataset.indicators : [];
    const analysisObj = isPlainObject(payload) ? payload : null;
    const analysisText = typeof payload === 'string' ? payload.trim() : null;
    const summary = analysisObj && isPlainObject(analysisObj.summary) ? analysisObj.summary : null;
    const seriesInfo = detectSeries(analysisObj);
    const summaryRawRows = Array.isArray(analysisObj?.summary?.raw_rows) ? analysisObj.summary.raw_rows : null;
    const interpretation = buildInterpretation(dataset, payload, seriesInfo, summary);
    const limitations = buildLimitations(dataset, payload, endpointLimitations, summary, seriesInfo);
    const dataClass = analysisObj
      ? String(analysisObj.data_class || (dataset.is_sample ? 'sample' : 'imported_research'))
      : dataset.is_sample
        ? 'sample'
        : 'imported_research';

    const keyIndicators: { label: string; value: string; note?: string }[] = [];
    if (seriesInfo) {
      const vals = seriesInfo.points.map((p) => safeNumber(p[seriesInfo.yKey])).filter((v): v is number => v !== null);
      const label = metricLabel(dataset, seriesInfo.yKey, indicators);
      const isPct = seriesInfo.kind === 'time_percent_change';
      if (vals.length > 0) {
        keyIndicators.push({ label: 'Starting value', value: isPct ? `${formatSigned(vals[0], 1)}%` : formatNumber(vals[0]) });
        const byX = new Map(seriesInfo.points.map((p) => [String(p._xLabel), safeNumber(p[seriesInfo.yKey])]));
        for (const target of ['3', '6', '12']) {
          if (byX.has(target)) {
            const v = byX.get(target)!;
            if (v !== null) keyIndicators.push({ label: `Month ${target}`, value: isPct ? `${formatSigned(v, 1)}%` : formatNumber(v) });
          }
        }
        const end = vals[vals.length - 1];
        const endLabel = seriesInfo.points[seriesInfo.points.length - 1]._xLabel;
        keyIndicators.push({
          label: `Ending value (${seriesInfo.xKey}: ${endLabel})`,
          value: isPct ? `${formatSigned(end, 1)}%` : formatNumber(end),
        });
        const dir =
          end < vals[0]
            ? 'Progressive decline in the available series'
            : end > vals[0]
              ? 'Progressive increase in the available series'
              : 'No net change in the available series';
        keyIndicators.push({ label: 'Overall direction', value: dir });
      }
      keyIndicators.push({ label: 'Data points', value: String(seriesInfo.points.length) });
      if (seriesInfo.unit) keyIndicators.push({ label: 'Unit', value: seriesInfo.unit });
      keyIndicators.push({ label: 'Indicator', value: label });
    } else if (summary) {
      const groups = Object.entries(summary);
      keyIndicators.push({ label: 'Groups summarized', value: String(groups.length) });
      const first: any = groups[0]?.[1];
      if (first && typeof first === 'object') {
        if (first.n !== undefined) keyIndicators.push({ label: `n (${groups[0][0]})`, value: String(first.n) });
        if (first.mean !== undefined) keyIndicators.push({ label: `Mean (${groups[0][0]})`, value: String(first.mean) });
        if (first.median !== undefined) keyIndicators.push({ label: `Median (${groups[0][0]})`, value: String(first.median) });
      }
      if (analysisObj && Array.isArray(analysisObj.metrics) && analysisObj.metrics.length) {
        keyIndicators.push({ label: 'Metrics', value: analysisObj.metrics.join(', ') });
      }
      if (analysisObj && Array.isArray(analysisObj.units) && analysisObj.units.length) {
        keyIndicators.push({ label: 'Units', value: analysisObj.units.join(', ') });
      } else {
        keyIndicators.push({ label: 'Units', value: 'Not provided' });
      }
    } else if (analysisText) {
      keyIndicators.push({ label: 'Format', value: 'Plain-text analysis' });
    } else {
      keyIndicators.push({ label: 'Status', value: 'No structured analysis available' });
    }

    return { indicators, analysisObj, analysisText, summary, seriesInfo, interpretation, limitations, dataClass, keyIndicators };
  }, [dataset, payload, endpointLimitations]);

  const chartTitle = useMemo(() => {
    if (!model.seriesInfo) return '';
    const base = metricLabel(dataset, model.seriesInfo.yKey, model.indicators);
    return /bone/i.test(dataset.title + ' ' + model.indicators.join(' ')) && model.seriesInfo.kind === 'time_percent_change'
      ? 'Bone Mineral Density Trend'
      : `${base} ${model.seriesInfo.kind === 'category_count' ? 'Distribution' : 'Trend'}`;
  }, [dataset, model.seriesInfo, model.indicators]);

  const renderChart = () => {
    if (!model.seriesInfo) return null;
    const { points, yKey, xKey, kind } = model.seriesInfo;
    const label = metricLabel(dataset, yKey, model.indicators);
    const yLabel = yAxisLabel(kind, label, model.seriesInfo.unit);
    const chartData = points.map((p) => ({ ...p, x: p._xLabel, y: safeNumber(p[yKey]) })).filter((p) => p.y !== null);

    if (chartData.length === 0) {
      return (
        <div className="rounded-md border border-border/10 bg-charcoal/20 p-4 text-sm text-muted-silver">
          No plottable numeric values are available for this dataset.
        </div>
      );
    }

    if (kind === 'category_count' || kind === 'category_numeric') {
      return (
        <div>
          <h4 className="text-sm font-medium text-warm-ivory mb-2">{chartTitle}</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis
                  dataKey="x"
                  tick={{ fontSize: 11, fill: '#aaa' }}
                  label={{ value: 'Category', position: 'insideBottom', offset: -2, fill: '#aaa', fontSize: 11 }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#aaa' }}
                  label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#aaa', fontSize: 11 }}
                />
                <Tooltip />
                <Legend />
                <Bar dataKey="y" name={label} fill="#60a5fa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    return (
      <div>
        <h4 className="text-sm font-medium text-warm-ivory mb-2">{chartTitle}</h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="x"
                tick={{ fontSize: 11, fill: '#aaa' }}
                label={{ value: /month/i.test(xKey) ? 'Month' : xKey, position: 'insideBottom', offset: -2, fill: '#aaa', fontSize: 11 }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#aaa' }}
                label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#aaa', fontSize: 11 }}
                domain={['auto', 'auto']}
              />
              <Tooltip />
              <Legend />
              {kind === 'time_percent_change' && (
                <ReferenceLine y={0} stroke="#666" strokeDasharray="4 4" label={{ value: 'Baseline (0%)', fill: '#888', fontSize: 10 }} />
              )}
              <Line
                type="monotone"
                dataKey="y"
                name={
                  label +
                  (kind === 'time_percent_change' ? ' (%)' : model.seriesInfo.unit ? ` (${model.seriesInfo.unit})` : '')
                }
                stroke="#60a5fa"
                dot
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {kind === 'time_percent_change' && (
          <p className="text-xs text-muted-silver/70 mt-1">
            Baseline shown at 0%. Negative values indicate a decrease relative to baseline; positive values indicate an increase.
          </p>
        )}
      </div>
    );
  };

  const synthetic = dataset.is_sample || /sample|synthetic|illustrative|demo/i.test(model.dataClass);
  const overviewTitle =
    model.seriesInfo &&
    /bone/i.test(dataset.title + ' ' + model.indicators.join(' ')) &&
    model.seriesInfo.kind === 'time_percent_change'
      ? 'Bone Mineral Density Trend'
      : dataset.title;

  const hasRenderable = !!(
    model.seriesInfo ||
    model.summary ||
    model.analysisText ||
    (model.analysisObj && Object.keys(model.analysisObj).length > 0)
  );
  const hasRawRows = !!(model.summaryRawRows && model.summaryRawRows.length);

  if (!payload || (isPlainObject(payload) && Object.keys(payload).length === 0) || (!hasRenderable && !model.analysisText)) {
    return (
      <div className="border-t border-border/10 pt-4 space-y-3">
        <h3 className="text-sm font-medium text-warm-ivory">Analysis</h3>
        <div className="rounded-md border border-border/10 bg-charcoal/20 p-4 text-sm text-muted-silver">
          Analysis is unavailable for this dataset. No structured analysis payload was returned.
        </div>
        {model.limitations.length > 0 && (
          <div>
            <p className="text-xs text-muted-silver uppercase tracking-wider mb-1">Data limitations</p>
            <ul className="space-y-1 text-xs text-muted-silver/70">
              {model.limitations.map((l, i) => (
                <li key={i}>• {l}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const unsupported =
    !model.seriesInfo &&
    !model.summary &&
    !model.analysisText &&
    model.analysisObj &&
    !Array.isArray(model.analysisObj.series) &&
    !model.analysisObj.note &&
    !model.analysisObj.metrics &&
    !model.analysisObj.data_class;

  return (
    <div className="border-t border-border/10 pt-4 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-serif font-bold text-warm-ivory">Analysis</h3>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${synthetic ? 'border-warning/40 bg-warning/15 text-soft-amber' : 'border-celestial-blue/40 bg-celestial-blue/15 text-celestial-blue'}`}
        >
          {synthetic ? 'Synthetic demonstration' : model.dataClass || 'Imported research'}
        </span>
      </div>

      <section className="space-y-2">
        <p className="text-xs text-muted-silver uppercase tracking-wider">Analysis overview</p>
        <h4 className="text-base font-medium text-warm-ivory">{overviewTitle}</h4>
        <p className="text-sm text-muted-silver">{dataset.description || `Analysis of available indicators for ${dataset.title}.`}</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          <div className="rounded-md border border-border/10 bg-charcoal/20 p-2">
            <p className="text-muted-silver/70">What is analysed</p>
            <p className="text-warm-ivory">
              {model.indicators.length ? model.indicators.join(', ') : metricLabel(dataset, model.seriesInfo?.yKey || 'value', model.indicators)}
            </p>
          </div>
          <div className="rounded-md border border-border/10 bg-charcoal/20 p-2">
            <p className="text-muted-silver/70">Data classification</p>
            <p className="text-warm-ivory">{synthetic ? 'Synthetic demonstration (not official NASA data)' : model.dataClass || 'Imported research'}</p>
          </div>
          <div className="rounded-md border border-border/10 bg-charcoal/20 p-2">
            <p className="text-muted-silver/70">Records / data points</p>
            <p className="text-warm-ivory">{dataset.record_count ?? (model.seriesInfo ? model.seriesInfo.points.length : '—')}</p>
          </div>
          <div className="rounded-md border border-border/10 bg-charcoal/20 p-2">
            <p className="text-muted-silver/70">Modality</p>
            <p className="text-warm-ivory">{dataset.modality || '—'}</p>
          </div>
        </div>
      </section>

      {model.keyIndicators.length > 0 && (
        <section>
          <p className="text-xs text-muted-silver uppercase tracking-wider mb-2">Key indicators</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {model.keyIndicators.map((k, i) => (
              <div key={i} className="rounded-md border border-border/10 bg-charcoal/20 p-2">
                <p className="text-[11px] text-muted-silver/70">{k.label}</p>
                <p className="text-sm text-warm-ivory font-medium break-words">{k.value}</p>
                {k.note && <p className="text-[11px] text-muted-silver/60">{k.note}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="text-xs text-muted-silver uppercase tracking-wider mb-2">Data visualization</p>
        {model.seriesInfo ? (
          renderChart()
        ) : model.summary ? (
          model.summaryRawRows ? (
          <div className="space-y-2">
              <p className="text-sm text-muted-silver">Aggregate summary statistics and raw imported rows (no time-series chart; each row is one sample/animal).</p>
              <div className="overflow-auto rounded-md border border-border/10">
                <table className="min-w-full text-xs text-left">
                  <thead className="bg-charcoal/40 text-muted-silver">
                    <tr>
                      <th className="px-3 py-2">Group</th>
                      <th className="px-3 py-2">n</th>
                      <th className="px-3 py-2">Mean</th>
                      <th className="px-3 py-2">Median</th>
                      <th className="px-3 py-2">SD</th>
                      <th className="px-3 py-2">Min</th>
                      <th className="px-3 py-2">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(model.summary).map(([group, stats]: any) => (
                      <tr key={group} className="border-t border-border/10 text-warm-ivory/90">
                        <td className="px-3 py-2 font-medium">{group}</td>
                        <td className="px-3 py-2">{stats?.n ?? '—'}</td>
                        <td className="px-3 py-2">{stats?.mean ?? '—'}</td>
                        <td className="px-3 py-2">{stats?.median ?? '—'}</td>
                        <td className="px-3 py-2">{stats?.sd ?? '—'}</td>
                        <td className="px-3 py-2">{stats?.min ?? '—'}</td>
                        <td className="px-3 py-2">{stats?.max ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details className="mt-2 text-xs text-muted-silver">
                <summary className="cursor-pointer text-warm-ivory underline">Show raw imported rows (derived fields)</summary>
                <div className="mt-2 overflow-auto rounded-md border border-border/10">
                  <table className="min-w-full text-xs text-left">
                    <thead className="bg-charcoal/40 text-muted-silver">
                      <tr>
                        <th className="px-3 py-2">Group</th>
                        <th className="px-3 py-2">Baseline BMD</th>
                        <th className="px-3 py-2">Post-HLS BMD</th>
                        <th className="px-3 py-2">Change %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.summaryRawRows.map((row: any, i: number) => (
                        <tr key={i} className="border-t border-border/10 text-warm-ivory/90">
                          <td className="px-3 py-2 font-medium">{row.group}</td>
                          <td className="px-3 py-2">{(row.baseline_regional_bmd ?? '—')}</td>
                          <td className="px-3 py-2">{(row.post_hls_regional_bmd ?? '—')}</td>
                          <td className="px-3 py-2">{row.post_hls_bmd_change_pct != null ? `${row.post_hls_bmd_change_pct.toFixed(2)}%` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          ) : (
            <div className="space-y-2">
            )
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-silver">Aggregate summary statistics (no time-series chart available in this dataset).</p>
            <div className="rounded-md border border-border/10 bg-charcoal/20 p-3 text-sm text-muted-silver whitespace-pre-wrap">{model.analysisText}</div>
          </div>
          </div>
        ) : (
          <div className="rounded-md border border-border/10 bg-charcoal/20 p-4 text-sm text-muted-silver">
            {unsupported
              ? 'This analysis format is not supported for charting. A structured summary could not be rendered from the available data.'
              : 'No chartable data is available for this dataset.'}
          </div>
        )}
      </section>

      <section>
        <p className="text-xs text-muted-silver uppercase tracking-wider mb-2">Interpretation</p>
        <div className="space-y-2 text-sm text-muted-silver">
          {model.interpretation.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        {synthetic && (
          <div className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-soft-amber">
            Classification: Synthetic demonstration. These values are invented for demonstration and are not official NASA data or measured astronaut
            findings.
          </div>
        )}
      </section>

      {model.limitations.length > 0 && (
        <section>
          <p className="text-xs text-muted-silver uppercase tracking-wider mb-2">Data limitations</p>
          <ul className="space-y-1 text-xs text-muted-silver/70">
            {model.limitations.map((l, i) => (
              <li key={i}>• {l}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
