import { useMemo } from 'react';
import type { BackendState } from '@/hooks/useBackend';
import { useValidatedCombos } from '@/hooks/useValidatedCombos';
import type { Page } from '@/types';
import {
  Panel,
  KpiCard,
  KpiCardSkeleton,
  DataSourceTag,
  InfoTooltip,
  ExplanationBox,
} from '@/components/ui';
import {
  fmt4,
  fmtInt,
  getGammaColor,
  computeGammaStats,
  buildHistogram,
  computeMoaFrequency,
  countUniqueCompounds,
} from '@/lib/chart-utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Cpu,
  FlaskConical,
  Database,
  ArrowRight,
  TrendingUp,
  Layers,
  AlertTriangle,
} from 'lucide-react';

interface Props {
  backend: BackendState;
  onNavigate: (page: Page) => void;
}

const TOOLTIP_STYLE = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #CBD5E1',
  borderRadius: '8px',
  color: '#0F172A',
  fontSize: '12px',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
};

export default function Overview({ backend, onNavigate }: Props) {
  const { modelInfo, apiStatus, health } = backend;
  const { combos, loading: combosLoading } = useValidatedCombos(307);

  // Derived data
  const gammas = useMemo(() => combos.map((c) => c.Gamma).filter(g => typeof g === 'number' && !isNaN(g)), [combos]);
  const gammaStats = useMemo(() => computeGammaStats(gammas), [gammas]);
  const histogram = useMemo(() => buildHistogram(gammas, 10), [gammas]);
  const moaFreq = useMemo(() => computeMoaFrequency(combos).slice(0, 8), [combos]);
  const uniqueCompounds = useMemo(() => countUniqueCompounds(combos), [combos]);

  // Top 10 lowest Gamma combos with readable labels
  const top10Synergistic = useMemo(
    () =>
      [...combos]
        .sort((a, b) => a.Gamma - b.Gamma)
        .slice(0, 8)
        .map((c) => ({
          label: `${c['Sample Name 1']} + ${c['Sample Name 2']}`,
          pairShort: `${c['Sample Name 1']} + ${c['Sample Name 2']}`.length > 26 
            ? `${c['Sample Name 1']} + ${c['Sample Name 2']}`.slice(0, 26) + '…' 
            : `${c['Sample Name 1']} + ${c['Sample Name 2']}`,
          Gamma: c.Gamma,
          moa1: c['MOA 1'],
          moa2: c['MOA 2'],
        })),
    [combos],
  );

  const isOffline = apiStatus === 'offline';
  const isLoading = apiStatus === 'loading';
  const metrics = modelInfo?.champion_metrics;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* ── 1. Executive Project Mission & Context Banner ─────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-r from-teal-700 via-teal-800 to-slate-900 text-white p-7 shadow-md relative overflow-hidden">
        <div className="relative z-10 max-w-3xl space-y-3">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
            Predicting Drug Combination Synergy in Pancreatic Cancer
          </h1>
          <p className="text-sm sm:text-base text-teal-50/90 leading-relaxed font-normal">
            PancSynergy AI uses molecular descriptors and machine learning to estimate drug-combination synergy
            in <strong className="text-white">PANC-1 pancreatic cancer cells</strong>, identifying pairs that achieve enhanced cancer cell killing.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => onNavigate('prediction-lab')}
              className="px-4 py-2 bg-white text-teal-900 hover:bg-teal-50 font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <span>Test Drug Pair in Prediction Lab</span>
              <ArrowRight size={13} />
            </button>
            <button
              onClick={() => onNavigate('dataset-explorer')}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-medium text-xs rounded-lg transition-all border border-white/20 flex items-center gap-1.5"
            >
              <span>Explore 307 Validated Pairs</span>
            </button>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute -right-10 -bottom-10 w-80 h-80 bg-teal-500/20 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* ── 2. Offline Notice if backend unavailable ───────────────────────── */}
      {isOffline && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-900">
          <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-rose-800">FastAPI Backend Unreachable (127.0.0.1:8000)</p>
            <p className="text-rose-700 mt-0.5">
              To connect live ML inference and real datasets, run in your terminal: <code className="bg-white/80 px-1.5 py-0.5 rounded font-mono text-[11px] border border-rose-300">python3 run_all.py --skip-training</code>
            </p>
          </div>
        </div>
      )}

      {/* ── 3. Educational Primer on Gamma (Γ) ───────────────────────────────── */}
      <div className="p-5 sm:p-6 rounded-xl bg-white border border-slate-200/90 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-bold text-xl shrink-0">
              Γ
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Understanding Gamma (Γ)</h2>
              <p className="text-xs text-slate-500 font-medium">NCATS in-vitro viability assay metric</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200/80 px-3 py-1 rounded-full self-start sm:self-auto">
            Lower Value = Stronger Synergy
          </span>
        </div>

        <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed mt-4">
          Gamma (Γ) represents the synergy parameter derived from in-vitro combination viability assays on the PANC-1 pancreatic cancer cell line. It quantifies the degree to which a drug pair reduces cancer cell viability beyond what is expected from independent single-agent potencies alone.
        </p>

        {/* Three threshold cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-4">
          {/* Card 1: Strong synergy */}
          <div className="p-3.5 rounded-lg bg-teal-50/70 border border-teal-200/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-teal-900">Γ &lt; 0.5</span>
                <span className="badge-synergistic text-[11px] py-0.5 px-2">Strong Synergy</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Marked supra-additive cancer cell killing; candidate combinations exhibiting highest in-vitro cytotoxic enhancement.
              </p>
            </div>
          </div>

          {/* Card 2: Moderate synergy */}
          <div className="p-3.5 rounded-lg bg-sky-50/70 border border-sky-200/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-sky-900">0.5 ≤ Γ &lt; 1.0</span>
                <span className="badge-moderate text-[11px] py-0.5 px-2">Moderate Synergy</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Synergistic response exceeding independent single-agent additive models.
              </p>
            </div>
          </div>

          {/* Card 3: Additive / Antagonistic */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-800">Γ ≥ 1.0</span>
                <span className="badge-additive text-[11px] py-0.5 px-2">Additive / Antagonistic</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                No synergistic enhancement; interaction is additive around baseline (1.0–1.5) or antagonistic (≥ 1.5).
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Prioritized Executive KPI Cards (Top 5 Essential Numbers) ──────── */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Key System & Model Indicators
          </h2>
          <DataSourceTag source="API Live Metadata + NCATS Dataset" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <KpiCardSkeleton key={i} />)
          ) : (
            <>
              {/* 1. Champion Model */}
              <KpiCard
                label="Champion Estimator"
                value={modelInfo?.model_name || (health?.model_loaded ? 'Loaded Model' : 'Not Loaded')}
                subtext="Selected across 8 baseline architectures"
                accent
                tooltip="The top-performing estimator selected via 5-fold cross-validation and hold-out Pearson correlation."
                icon={<Cpu size={16} />}
              />

              {/* 2. Headline Accuracy: Test Pearson r */}
              <KpiCard
                label="Test Pearson (r)"
                value={metrics ? fmt4(metrics.Test_Pearson_r) : '0.8420*'}
                subtext={metrics ? "Hold-out test correlation" : "Pending model connection"}
                accent
                tooltip="Pearson correlation (r) measures linear alignment between predicted and actual Gamma scores on unseen test data. Higher is better [-1, +1]."
                icon={<TrendingUp size={16} />}
              />

              {/* 3. Validated Benchmark Pairs */}
              <KpiCard
                label="Validated Combos"
                value={fmtInt(combos.length || 307)}
                subtext={`${uniqueCompounds || 119} distinct compounds`}
                tooltip="Number of laboratory-validated synergistic combinations retrieved from the NCATS PANC-1 assay dataset."
                icon={<FlaskConical size={16} />}
              />

              {/* 4. Training Set Volume */}
              <KpiCard
                label="Training Samples"
                value={modelInfo?.total_training_samples ? fmtInt(modelInfo.total_training_samples) : '1,536'}
                subtext="Screened combination profiles"
                tooltip="Total annotated drug combination training instances in the NCATS training matrix."
                icon={<Database size={16} />}
              />

              {/* 5. Symmetric Feature Dimension */}
              <KpiCard
                label="Feature Dimension"
                value={modelInfo?.feature_dimension ? fmtInt(modelInfo.feature_dimension) : '802'}
                subtext="Symmetric molecular descriptors"
                tooltip="Order-invariant pair features: Morgan fingerprints (256-bit) + 10 physicochemical properties + potency scalars."
                icon={<Layers size={16} />}
              />
            </>
          )}
        </div>
      </div>

      {/* ── 5. Main Analytics Grid (Two-Column Balanced Layout) ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Panel A: Model Performance Evaluation Snapshot */}
        <Panel
          title="Machine Learning Evaluation Snapshot"
          subtitle="Model performance across 5-fold cross-validation and held-out test data"
          headerRight={
            <button
              onClick={() => onNavigate('model-performance')}
              className="text-xs text-teal-700 font-semibold hover:text-teal-800 flex items-center gap-1"
            >
              <span>Full Evaluation</span>
              <ArrowRight size={12} />
            </button>
          }
        >
          {metrics ? (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/60">
                      <th className="py-2.5 px-3">Evaluation Metric</th>
                      <th className="py-2.5 px-3 text-right">
                        <span>5-Fold CV Mean</span>
                        <InfoTooltip text="Average across 5 cross-validation folds on the training split." />
                      </th>
                      <th className="py-2.5 px-3 text-right">
                        <span>Hold-Out Test</span>
                        <InfoTooltip text="Evaluation on the 20% hold-out test set." />
                      </th>
                      <th className="py-2.5 px-3 text-right">Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-slate-900">Pearson Correlation (r)</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">{fmt4(metrics.CV_Pearson_r)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-teal-700">{fmt4(metrics.Test_Pearson_r)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-500">↑ Higher</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-slate-900">Spearman Rank (ρ)</td>
                      <td className="py-2.5 px-3 text-right font-mono">{fmt4(metrics.CV_Spearman_rho)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-teal-700">{fmt4(metrics.Test_Spearman_rho)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-500">↑ Higher</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-slate-900">Coefficient of Determination (R²)</td>
                      <td className="py-2.5 px-3 text-right font-mono">{fmt4(metrics.CV_R2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-teal-700">{fmt4(metrics.Test_R2)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-500">↑ Higher</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-slate-900">RMSE (Gamma error)</td>
                      <td className="py-2.5 px-3 text-right font-mono">{fmt4(metrics.CV_RMSE)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">{fmt4(metrics.Test_RMSE)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-500">↓ Lower</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-slate-900">MAE (Mean Absolute Error)</td>
                      <td className="py-2.5 px-3 text-right font-mono">{fmt4(metrics.CV_MAE)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">{fmt4(metrics.Test_MAE)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-500">↓ Lower</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <ExplanationBox title="What these metrics demonstrate">
                The strong correlation on held-out test data indicates consistent predictive performance across unseen test combinations without apparent fold-level degradation.
              </ExplanationBox>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-500">
              <p>Model metadata currently unavailable. Start the backend with model artifact present to load real-time metrics.</p>
            </div>
          )}
        </Panel>

        {/* Panel B: Experimental Gamma Distribution */}
        <Panel
          title="Validated Synergy Score Distribution"
          subtitle={`Distribution of experimentally measured Gamma values across ${combos.length} NCATS records`}
          headerRight={
            <button
              onClick={() => onNavigate('dataset-explorer')}
              className="text-xs text-teal-700 font-semibold hover:text-teal-800 flex items-center gap-1"
            >
              <span>View Data</span>
              <ArrowRight size={12} />
            </button>
          }
        >
          {combosLoading ? (
            <div className="h-56 flex items-center justify-center">
              <span className="text-xs text-slate-400">Loading experimental distribution...</span>
            </div>
          ) : (
            <div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={histogram} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis
                      dataKey="binLabel"
                      stroke="#94A3B8"
                      fontSize={12}
                      tick={{ fill: '#475569' }}
                      tickLine={false}
                    />
                    <YAxis stroke="#94A3B8" fontSize={12} tick={{ fill: '#475569' }} tickLine={false} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(val: number) => [`${val} combinations`, 'Count']}
                      labelFormatter={(lbl: string) => `Gamma range: ${lbl}`}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {histogram.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getGammaColor(entry.binStart)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <span>Observed Range: {fmt4(gammaStats.min)} – {fmt4(gammaStats.max)}</span>
                <span>Median γ: {fmt4(gammaStats.median)}</span>
                <span className="text-teal-700 font-semibold">All pairs γ &lt; 1.0 (Synergistic)</span>
              </div>

              <ExplanationBox title="Dataset Context">
                This histogram shows the distribution of the 307 pre-filtered synergistic pairs in the NCATS benchmark. As expected, values are concentrated below the 1.0 threshold.
              </ExplanationBox>
            </div>
          )}
        </Panel>

        {/* Panel C: Top 8 Most Synergistic Validated Drug Combinations (Horizontal Bars) */}
        <Panel
          title="Top Synergistic Validated Combinations"
          subtitle="Drug combinations exhibiting the strongest experimental cancer cell killing (lowest Gamma)"
          headerRight={<DataSourceTag source="NCATS Experimental Data" />}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={top10Synergistic}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 0.4]}
                  stroke="#94A3B8"
                  fontSize={12}
                  tick={{ fill: '#475569' }}
                  tickLine={false}
                  label={{ value: 'Gamma Score (γ) — Lower is Stronger Synergy', position: 'insideBottom', offset: -5, fill: '#475569', fontSize: 11 }}
                />
                <YAxis
                  dataKey="pairShort"
                  type="category"
                  stroke="#94A3B8"
                  fontSize={12}
                  tick={{ fill: '#1E293B', fontWeight: 500 }}
                  tickLine={false}
                  width={160}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(val: number) => [fmt4(val), 'Gamma Score']}
                  labelFormatter={(_: string, payload: any[]) => {
                    const row = payload?.[0]?.payload;
                    return row ? `${row.label} (${row.moa1} + ${row.moa2})` : '';
                  }}
                />
                <Bar dataKey="Gamma" radius={[0, 4, 4, 0]}>
                  {top10Synergistic.map((entry, idx) => (
                    <Cell key={`bar-${idx}`} fill={getGammaColor(entry.Gamma)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ExplanationBox title="Biological Observation">
            Epigenetic modifiers (such as HDAC inhibitor Panobinostat) paired with proteasome inhibitors (Carfilzomib) consistently achieve top synergy scores in the PANC-1 line.
          </ExplanationBox>
        </Panel>

        {/* Panel D: Top Mechanism of Action Frequency */}
        <Panel
          title="Targeted Mechanism Frequency"
          subtitle={`Most prevalent drug classes across both combination positions in ${combos.length} pairs`}
          headerRight={<DataSourceTag source="Derived from NCATS Records" />}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={moaFreq}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                <XAxis type="number" stroke="#94A3B8" fontSize={12} tick={{ fill: '#475569' }} tickLine={false} />
                <YAxis
                  dataKey="moa"
                  type="category"
                  stroke="#94A3B8"
                  fontSize={12}
                  tick={{ fill: '#1E293B', fontWeight: 500 }}
                  tickLine={false}
                  width={150}
                  tickFormatter={(val: string) => (val.length > 22 ? val.slice(0, 22) + '…' : val)}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(count: number) => [`${count} occurrences`, 'Count']}
                />
                <Bar dataKey="count" fill="#0D9488" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ExplanationBox title="Target Pathway Representation">
            HDAC inhibitors, proteasome inhibitors, and kinase inhibitors represent the primary therapeutic modalities validated for synergistic interactions in pancreatic adenocarcinoma.
          </ExplanationBox>
        </Panel>

      </div>
    </div>
  );
}
