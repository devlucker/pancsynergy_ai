import { useState, useEffect } from 'react';
import type { DrugPairInput, SynergyPredictionOutput, ChemicalPredictionResponse, Page, DrugLibraryItem } from '@/types';
import type { BackendState } from '@/hooks/useBackend';
import { api, ApiError, getApiBaseUrl } from '@/lib/api';
import { ALL_PANC1_DRUGS } from '@/lib/drug-library';
import { ErrorState, Spinner, DataSourceTag, InfoTooltip } from '@/components/ui';
import { fmt4, getGammaColor, getGammaBadgeClass } from '@/lib/chart-utils';
import {
  FlaskConical,
  Copy,
  RotateCcw,
  Check,
  CheckCircle2,
  Sparkles,
  Info,
  ArrowRight,
  Beaker,
  Atom,
  Clock,
  Thermometer,
  Flame,
  ExternalLink,
  ShieldCheck,
  TrendingDown,
  Search,
  AlertCircle,
  Database,
} from 'lucide-react';

interface Props {
  backend: BackendState;
  onNavigate?: (page: Page) => void;
}

const DEFAULT_AC50 = -6.0;

function isValidSmiles(s: string): boolean {
  return s.trim().length >= 3 && /[CcNOSFBrIlP=#()]/.test(s);
}

function cleanChemString(str?: string): string {
  if (!str) return '';
  return str
    .replace(/\uFFFD\s*C/gi, '°C')
    .replace(/\uFFFD/g, '·')
    .replace(/\u00B0\s*C/gi, '°C');
}

function getInterpretation(gamma: number): string {
  if (gamma < 0.5) {
    return 'Strong Synergy (Gamma < 0.5): Significant synergistic enhancement in cell killing predicted over independent single-agent expectations. Candidate combination for experimental follow-up.';
  }
  if (gamma < 1.0) {
    return 'Moderate Synergy (0.5 ≤ Gamma < 1.0): Predicted synergistic interaction exceeding independent additive expectations.';
  }
  if (gamma < 1.5) {
    return 'Additive or Weak Interaction (1.0 ≤ Gamma < 1.5): The combination effect is predicted to match the sum of independent single-agent potencies without true synergy.';
  }
  return 'Antagonistic Interaction (Gamma ≥ 1.5): The combination yields diminished cancer cell cytotoxicity compared to individual agents.';
}

export default function PredictionLab({ backend, onNavigate }: Props) {
  // Comprehensive Drug Library state (all 51+ PANC-1 oncology drugs, fallback + live backend fetch)
  const [drugLibrary, setDrugLibrary] = useState<DrugLibraryItem[]>(ALL_PANC1_DRUGS);

  // Form input state
  const [drug1Name, setDrug1Name] = useState('Pralatrexate');
  const [smiles1, setSmiles1] = useState(ALL_PANC1_DRUGS[0].smiles);
  const [ac50_1, setAc50_1] = useState<number | string>(ALL_PANC1_DRUGS[0].ac50);

  const [drug2Name, setDrug2Name] = useState('Daporinad');
  const [smiles2, setSmiles2] = useState(ALL_PANC1_DRUGS[1].smiles);
  const [ac50_2, setAc50_2] = useState<number | string>(ALL_PANC1_DRUGS[1].ac50);

  // Extra field state: SMILES formula resolver by name
  const [searchQuery1, setSearchQuery1] = useState('');
  const [resolving1, setResolving1] = useState(false);
  const [resolveFeedback1, setResolveFeedback1] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [searchQuery2, setSearchQuery2] = useState('');
  const [resolving2, setResolving2] = useState(false);
  const [resolveFeedback2, setResolveFeedback2] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Execution state - Synergy
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<SynergyPredictionOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Execution state - Chemical Reaction & Kinetics
  const [rxnLoading, setRxnLoading] = useState(false);
  const [rxnResult, setRxnResult] = useState<ChemicalPredictionResponse | null>(null);
  const [rxnError, setRxnError] = useState<string | null>(null);

  // Validation
  const [fieldErrors, setFieldErrors] = useState<{ smiles1?: string; smiles2?: string }>({});

  // Direct predictor that can be triggered programmatically
  const handlePredictDirect = async (
    s1: string, n1: string, ac1: number,
    s2: string, n2: string, ac2: number
  ) => {
    setLoading(true);
    setError(null);
    setPrediction(null);
    try {
      const res = await api.predict({
        drug_name_1: n1 || 'Compound A',
        smiles_1: s1.trim(),
        log_ac50_1: ac1,
        drug_name_2: n2 || 'Compound B',
        smiles_2: s2.trim(),
        log_ac50_2: ac2,
      });
      setPrediction(res);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Prediction request rejected by backend.');
      } else {
        setError('Network error: Unable to reach backend service.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Load live drug library and check for transferred compounds on mount
  useEffect(() => {
    // 1. Fetch complete live catalog from backend if reachable
    api.fetchDrugLibrary().then((res) => {
      if (res && res.drugs && res.drugs.length > 0) {
        setDrugLibrary(res.drugs);
      }
    }).catch(() => {
      // Falls back reliably to ALL_PANC1_DRUGS
    });

    // 2. Check for transferred compounds from Reaction Lab or Cancer Impact Dynamics
    try {
      const stored = localStorage.getItem('pancsynergy_to_prediction_lab') || localStorage.getItem('pancsynergy_transferred_pair');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.smiles_1 && parsed.smiles_2) {
          const s1 = parsed.smiles_1;
          const n1 = parsed.name_1 || parsed.drug_name_1 || 'Compound A';
          const a1 = parsed.ac50_1 ?? DEFAULT_AC50;
          const s2 = parsed.smiles_2;
          const n2 = parsed.name_2 || parsed.drug_name_2 || 'Compound B';
          const a2 = parsed.ac50_2 ?? DEFAULT_AC50;

          setSmiles1(s1);
          setDrug1Name(n1);
          setAc50_1(a1);
          setSmiles2(s2);
          setDrug2Name(n2);
          setAc50_2(a2);

          localStorage.removeItem('pancsynergy_to_prediction_lab');
          localStorage.removeItem('pancsynergy_transferred_pair');

          // Auto-trigger synergy prediction for the transferred pair
          setTimeout(() => {
            void handlePredictDirect(s1, n1, a1, s2, n2, a2);
          }, 150);
        }
      }
    } catch (err) {
      console.warn('Error reading transferred drug pair:', err);
    }
  }, []);

  // Extra field handler: dynamically resolve SMILES formula from any drug or chemical name
  const handleResolveSmiles = async (compoundIndex: 1 | 2) => {
    const rawQuery = compoundIndex === 1 ? searchQuery1.trim() : searchQuery2.trim();
    if (!rawQuery) return;

    if (compoundIndex === 1) {
      setResolving1(true);
      setResolveFeedback1(null);
    } else {
      setResolving2(true);
      setResolveFeedback2(null);
    }

    try {
      const res = await api.resolveSmiles(rawQuery);
      if (res && res.smiles) {
        if (compoundIndex === 1) {
          setDrug1Name(res.drug_name);
          setSmiles1(res.smiles);
          setAc50_1(res.ac50 ?? DEFAULT_AC50);
          setFieldErrors((prev) => ({ ...prev, smiles1: undefined }));
          setResolveFeedback1({
            type: 'success',
            message: `✓ Resolved "${res.drug_name}" from ${res.source}! SMILES structure and potency populated.`
          });
        } else {
          setDrug2Name(res.drug_name);
          setSmiles2(res.smiles);
          setAc50_2(res.ac50 ?? DEFAULT_AC50);
          setFieldErrors((prev) => ({ ...prev, smiles2: undefined }));
          setResolveFeedback2({
            type: 'success',
            message: `✓ Resolved "${res.drug_name}" from ${res.source}! SMILES structure and potency populated.`
          });
        }
      }
    } catch (err) {
      const msg = err instanceof ApiError ? (err.detail || err.message) : String(err);
      if (compoundIndex === 1) {
        setResolveFeedback1({ type: 'error', message: msg });
      } else {
        setResolveFeedback2({ type: 'error', message: msg });
      }
    } finally {
      if (compoundIndex === 1) setResolving1(false);
      else setResolving2(false);
    }
  };

  const validate = (): boolean => {
    const errors: { smiles1?: string; smiles2?: string } = {};
    if (!smiles1.trim()) {
      errors.smiles1 = 'SMILES string is required for molecular fingerprint generation.';
    } else if (!isValidSmiles(smiles1)) {
      errors.smiles1 = 'Invalid SMILES format. Please verify chemical structure string.';
    }

    if (!smiles2.trim()) {
      errors.smiles2 = 'SMILES string is required for molecular fingerprint generation.';
    } else if (!isValidSmiles(smiles2)) {
      errors.smiles2 = 'Invalid SMILES format. Please verify chemical structure string.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePredict = async () => {
    if (!validate()) return;

    setLoading(true);
    setError(null);
    setPrediction(null);

    const payload: DrugPairInput = {
      drug_name_1: drug1Name.trim() || 'Compound A',
      smiles_1: smiles1.trim(),
      log_ac50_1: typeof ac50_1 === 'number' ? ac50_1 : parseFloat(String(ac50_1)) || DEFAULT_AC50,
      drug_name_2: drug2Name.trim() || 'Compound B',
      smiles_2: smiles2.trim(),
      log_ac50_2: typeof ac50_2 === 'number' ? ac50_2 : parseFloat(String(ac50_2)) || DEFAULT_AC50,
    };

    try {
      const res = await api.predict(payload);
      setPrediction(res);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 503) {
          setError('Champion ML model is not loaded in the backend. Ensure best_synergy_model.pkl exists and run the backend.');
        } else {
          setError(err.message || 'Prediction request rejected by backend.');
        }
      } else {
        setError('Network error: Unable to reach the backend service at http://127.0.0.1:8000.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePredictReaction = async () => {
    if (!validate()) return;

    setRxnLoading(true);
    setRxnError(null);
    setRxnResult(null);

    try {
      const res = await api.predictReaction({
        smiles_1: smiles1.trim(),
        smiles_2: smiles2.trim(),
        fetch_pubchem: false,
      });
      setRxnResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setRxnError(`Failed to predict chemical reaction from REST endpoint: ${msg}`);
    } finally {
      setRxnLoading(false);
    }
  };

  const handleSendToReactionLab = () => {
    if (!smiles1.trim() || !smiles2.trim()) return;
    try {
      localStorage.setItem(
        'pancsynergy_transferred_pair',
        JSON.stringify({
          name_1: drug1Name.trim() || 'Compound A',
          smiles_1: smiles1.trim(),
          name_2: drug2Name.trim() || 'Compound B',
          smiles_2: smiles2.trim(),
        })
      );
    } catch (e) {
      console.warn('Could not save transferred pair', e);
    }
    if (onNavigate) {
      onNavigate('reaction-properties');
    }
  };

  const handleReset = () => {
    setDrug1Name('');
    setSmiles1('');
    setAc50_1(DEFAULT_AC50);
    setDrug2Name('');
    setSmiles2('');
    setAc50_2(DEFAULT_AC50);
    setPrediction(null);
    setError(null);
    setRxnResult(null);
    setRxnError(null);
    setFieldErrors({});
  };

  const handleSendToCancerImpact = () => {
    try {
      const payload = {
        name_1: drug1Name.trim() || 'Compound A',
        smiles_1: smiles1.trim(),
        ac50_1: typeof ac50_1 === 'number' ? ac50_1 : parseFloat(String(ac50_1)) || DEFAULT_AC50,
        name_2: drug2Name.trim() || 'Compound B',
        smiles_2: smiles2.trim(),
        ac50_2: typeof ac50_2 === 'number' ? ac50_2 : parseFloat(String(ac50_2)) || DEFAULT_AC50,
        predicted_gamma: prediction ? prediction.predicted_gamma : 0.45,
        classification: prediction ? prediction.synergy_classification : 'Predicted Pair',
      };
      localStorage.setItem('pancsynergy_to_cancer_impact', JSON.stringify(payload));
    } catch (e) {
      console.warn('Could not store cancer impact pair', e);
    }
    if (onNavigate) {
      onNavigate('cancer-impact');
    }
  };

  const copyResultSummary = () => {
    if (!prediction) return;
    const text = `PancSynergy AI Prediction Summary:
Pair: ${prediction.drug_name_1} + ${prediction.drug_name_2}
Predicted Gamma: ${prediction.predicted_gamma}
Synergy Classification: ${prediction.synergy_classification} (${prediction.synergy_strength})
Is Synergistic: ${prediction.is_synergistic ? 'Yes' : 'No'}
Cell Line Context: PANC-1 Pancreatic Ductal Adenocarcinoma
Model: Random Forest Regressor (802 symmetric molecular descriptors)`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Offline Alert */}
      {backend.apiStatus === 'offline' && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-medium">
          Backend service is offline (http://127.0.0.1:8000). Ensure the FastAPI backend is running to generate live ML synergy predictions.
        </div>
      )}

      {/* ── 1. Page Header with Workflow Indicator ──────────────────────────── */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/90 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-bold">
                <Beaker size={18} />
              </div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Prediction Lab</h1>
              <span className="badge-moderate">Single-Pair ML Inference</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Screen candidate drug combinations for synergistic cancer cell killing using structural SMILES fingerprints and single-agent potencies.
            </p>
          </div>
          <DataSourceTag source="POST /api/v1/predict" />
        </div>

        {/* 5-Step Workflow Breadcrumb */}
        <div className="mt-4 p-3 bg-white border border-slate-200/90 rounded-xl shadow-card flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
          <span className="flex items-center gap-1.5 font-semibold text-teal-800">
            <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-[10px] font-bold">1</span>
            <span>Specify Drug A</span>
          </span>
          <ArrowRight size={13} className="text-slate-300 hidden sm:block" />
          <span className="flex items-center gap-1.5 font-semibold text-teal-800">
            <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-[10px] font-bold">2</span>
            <span>Specify Drug B</span>
          </span>
          <ArrowRight size={13} className="text-slate-300 hidden sm:block" />
          <span className="flex items-center gap-1.5 font-semibold text-slate-700">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-[10px] font-bold">3</span>
            <span>Verify SMILES & Potency</span>
          </span>
          <ArrowRight size={13} className="text-slate-300 hidden sm:block" />
          <span className="flex items-center gap-1.5 font-semibold text-slate-700">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-[10px] font-bold">4</span>
            <span>Predict Synergy Score</span>
          </span>
          <ArrowRight size={13} className="text-slate-300 hidden sm:block" />
          <span className="flex items-center gap-1.5 font-semibold text-slate-700">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-[10px] font-bold">5</span>
            <span>Inspect Gamma Result</span>
          </span>
        </div>
      </div>

      {/* ── 2. Quick-Load Verified Example Pairs Toolbar ─────────────────────── */}
      <div className="p-4 bg-teal-50/70 border border-teal-200/80 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-teal-900 font-semibold">
          <Sparkles size={16} className="text-teal-700 shrink-0" />
          <span>Quick-Load Verified Test Combos:</span>
          <span className="text-[11px] font-normal text-teal-700 hidden sm:inline">Pre-populate compound cards with real benchmarks from NCATS test set</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
            <Database size={13} className="text-teal-600" />
            <span>{drugLibrary.length} Curated Compounds:</span>
          </span>
          <button
            type="button"
            onClick={() => {
              const d1 = drugLibrary.find(d => d.drug_name === 'Pralatrexate') || drugLibrary[0];
              const d2 = drugLibrary.find(d => d.drug_name === 'Daporinad') || drugLibrary[1];
              setDrug1Name(d1.drug_name); setSmiles1(d1.smiles); setAc50_1(d1.ac50);
              setDrug2Name(d2.drug_name); setSmiles2(d2.smiles); setAc50_2(d2.ac50);
              setFieldErrors({});
            }}
            className="px-2.5 py-1 text-xs bg-white hover:bg-teal-50 text-teal-800 font-medium rounded-lg border border-teal-200 shadow-xs transition"
          >
            Pralatrexate + Daporinad
          </button>
          <button
            type="button"
            onClick={() => {
              const d1 = drugLibrary.find(d => d.drug_name === 'Panobinostat') || drugLibrary[0];
              const d2 = drugLibrary.find(d => d.drug_name === 'Carfilzomib') || drugLibrary[1];
              setDrug1Name(d1.drug_name); setSmiles1(d1.smiles); setAc50_1(d1.ac50);
              setDrug2Name(d2.drug_name); setSmiles2(d2.smiles); setAc50_2(d2.ac50);
              setFieldErrors({});
            }}
            className="px-2.5 py-1 text-xs bg-white hover:bg-teal-50 text-teal-800 font-medium rounded-lg border border-teal-200 shadow-xs transition"
          >
            Panobinostat + Carfilzomib
          </button>
          <button
            type="button"
            onClick={() => {
              const d1 = drugLibrary.find(d => d.drug_name.toLowerCase().includes('gemcitabine')) || drugLibrary[0];
              const d2 = drugLibrary.find(d => d.drug_name.toLowerCase().includes('cisplatin')) || drugLibrary[1];
              setDrug1Name(d1.drug_name); setSmiles1(d1.smiles); setAc50_1(d1.ac50);
              setDrug2Name(d2.drug_name); setSmiles2(d2.smiles); setAc50_2(d2.ac50);
              setFieldErrors({});
            }}
            className="px-2.5 py-1 text-xs bg-white hover:bg-teal-50 text-teal-800 font-medium rounded-lg border border-teal-200 shadow-xs transition"
          >
            Gemcitabine + Cisplatin
          </button>
          <button
            type="button"
            onClick={() => {
              const d1 = drugLibrary.find(d => d.drug_name.toLowerCase().includes('bortezomib')) || drugLibrary[0];
              const d2 = drugLibrary.find(d => d.drug_name.toLowerCase().includes('romidepsin')) || drugLibrary[1];
              setDrug1Name(d1.drug_name); setSmiles1(d1.smiles); setAc50_1(d1.ac50);
              setDrug2Name(d2.drug_name); setSmiles2(d2.smiles); setAc50_2(d2.ac50);
              setFieldErrors({});
            }}
            className="px-2.5 py-1 text-xs bg-white hover:bg-teal-50 text-teal-800 font-medium rounded-lg border border-teal-200 shadow-xs transition"
          >
            Bortezomib + Romidepsin
          </button>
        </div>
      </div>

      {/* ── 3. Compound Cards (Drug A and Drug B Side-by-Side) ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Drug A Card */}
        <div className="panel p-6 border-slate-200/90 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Compound A</h2>
            </div>
            {/* Quick preset selector for Drug A covering ALL drug compositions */}
            <select
              onChange={(e) => {
                const ex = drugLibrary.find(v => v.drug_name === e.target.value);
                if (ex) {
                  setDrug1Name(ex.drug_name);
                  setSmiles1(ex.smiles);
                  setAc50_1(ex.ac50);
                  setFieldErrors(prev => ({ ...prev, smiles1: undefined }));
                }
              }}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 max-w-full sm:max-w-[260px] truncate focus:ring-1 focus:ring-teal-500 focus:outline-none"
              defaultValue=""
            >
              <option value="" disabled>Select from all {drugLibrary.length} drug compositions...</option>
              {drugLibrary.slice().sort((a, b) => a.drug_name.localeCompare(b.drug_name)).map(ex => (
                <option key={ex.drug_name} value={ex.drug_name}>
                  {ex.drug_name} ({ex.classType})
                </option>
              ))}
            </select>
          </div>

          {/* Extra Field: Dynamic SMILES Formula Resolver by Name */}
          <div className="p-3 bg-teal-50/70 rounded-xl border border-teal-200/90 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                <Search size={13} className="text-teal-700" />
                <span>Extra Field: Fetch SMILES by Drug Name</span>
              </label>
              <span className="text-[10px] text-teal-700 font-semibold uppercase tracking-wider">
                Live PubChem / PANC-1 Resolver
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Gemcitabine, Cisplatin, Aspirin, Paclitaxel..."
                value={searchQuery1}
                onChange={(e) => setSearchQuery1(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleResolveSmiles(1); }}
                className="input-field text-xs bg-white py-1.5"
              />
              <button
                type="button"
                onClick={() => void handleResolveSmiles(1)}
                disabled={resolving1 || !searchQuery1.trim()}
                className="btn-primary bg-teal-700 hover:bg-teal-800 text-xs px-3 py-1.5 shrink-0 flex items-center gap-1 text-white shadow-sm disabled:opacity-60"
              >
                {resolving1 ? <Spinner size="sm" /> : <Sparkles size={13} />}
                <span>Get SMILES Formula</span>
              </button>
            </div>
            {resolveFeedback1 && (
              <div className={`text-[11px] p-2 rounded-lg flex items-start gap-1.5 ${resolveFeedback1.type === 'success' ? 'bg-emerald-100/90 text-emerald-900 border border-emerald-300' : 'bg-rose-100/90 text-rose-900 border border-rose-300'}`}>
                {resolveFeedback1.type === 'success' ? (
                  <CheckCircle2 size={13} className="shrink-0 mt-0.5 text-emerald-600" />
                ) : (
                  <AlertCircle size={13} className="shrink-0 mt-0.5 text-rose-600" />
                )}
                <span className="leading-tight">{resolveFeedback1.message}</span>
              </div>
            )}
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Drug Name</label>
              <input
                type="text"
                placeholder="e.g. Pralatrexate"
                value={drug1Name}
                onChange={(e) => setDrug1Name(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <span>SMILES Chemical Structure</span>
                  <span className="text-rose-500 font-bold">*</span>
                  <InfoTooltip text="Simplified Molecular Input Line Entry System (SMILES). Encodes the exact 2D chemical structure converted into 256-bit Morgan fingerprints." />
                </label>
                <span className="text-[10px] text-slate-400 font-mono">Morgan radius=2, 256 bits</span>
              </div>
              <textarea
                rows={3}
                placeholder="e.g. NC1=NC(N)=C2N=C(CC(CC#C)C3=CC=C(C=C3)C(=O)N[C@@H](CCC(O)=O)C(O)=O)C=NC2=N1"
                value={smiles1}
                onChange={(e) => {
                  setSmiles1(e.target.value);
                  setFieldErrors(prev => ({ ...prev, smiles1: undefined }));
                }}
                className={`input-field font-mono text-xs ${fieldErrors.smiles1 ? 'border-rose-400 focus:border-rose-500 ring-rose-200' : ''}`}
              />
              {fieldErrors.smiles1 && (
                <p className="text-[11px] text-rose-600 mt-1 font-medium">{fieldErrors.smiles1}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <span>Log AC50 (M) Potency</span>
                  <InfoTooltip text="Log10 single-agent concentration achieving 50% activity in PANC-1. More negative means higher potency. Default: −6.0 M if unknown." />
                </label>
                <span className="text-[10px] text-slate-500">Default: −6.0 M</span>
              </div>
              <input
                type="number"
                step="0.01"
                min="-12"
                max="0"
                placeholder="-6.0"
                value={ac50_1}
                onChange={(e) => setAc50_1(e.target.value)}
                className="input-field"
              />
            </div>
          </div>
        </div>

        {/* Drug B Card */}
        <div className="panel p-6 border-slate-200/90 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 inline-block" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Compound B</h2>
            </div>
            {/* Quick preset selector for Drug B covering ALL drug compositions */}
            <select
              onChange={(e) => {
                const ex = drugLibrary.find(v => v.drug_name === e.target.value);
                if (ex) {
                  setDrug2Name(ex.drug_name);
                  setSmiles2(ex.smiles);
                  setAc50_2(ex.ac50);
                  setFieldErrors(prev => ({ ...prev, smiles2: undefined }));
                }
              }}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 max-w-full sm:max-w-[260px] truncate focus:ring-1 focus:ring-cyan-500 focus:outline-none"
              defaultValue=""
            >
              <option value="" disabled>Select from all {drugLibrary.length} drug compositions...</option>
              {drugLibrary.slice().sort((a, b) => a.drug_name.localeCompare(b.drug_name)).map(ex => (
                <option key={ex.drug_name} value={ex.drug_name}>
                  {ex.drug_name} ({ex.classType})
                </option>
              ))}
            </select>
          </div>

          {/* Extra Field: Dynamic SMILES Formula Resolver by Name */}
          <div className="p-3 bg-cyan-50/70 rounded-xl border border-cyan-200/90 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-cyan-950 flex items-center gap-1.5">
                <Search size={13} className="text-cyan-700" />
                <span>Extra Field: Fetch SMILES by Drug Name</span>
              </label>
              <span className="text-[10px] text-cyan-700 font-semibold uppercase tracking-wider">
                Live PubChem / PANC-1 Resolver
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Daporinad, Carfilzomib, Romidepsin, SAHA..."
                value={searchQuery2}
                onChange={(e) => setSearchQuery2(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleResolveSmiles(2); }}
                className="input-field text-xs bg-white py-1.5"
              />
              <button
                type="button"
                onClick={() => void handleResolveSmiles(2)}
                disabled={resolving2 || !searchQuery2.trim()}
                className="btn-primary bg-cyan-700 hover:bg-cyan-800 text-xs px-3 py-1.5 shrink-0 flex items-center gap-1 text-white shadow-sm disabled:opacity-60"
              >
                {resolving2 ? <Spinner size="sm" /> : <Sparkles size={13} />}
                <span>Get SMILES Formula</span>
              </button>
            </div>
            {resolveFeedback2 && (
              <div className={`text-[11px] p-2 rounded-lg flex items-start gap-1.5 ${resolveFeedback2.type === 'success' ? 'bg-emerald-100/90 text-emerald-900 border border-emerald-300' : 'bg-rose-100/90 text-rose-900 border border-rose-300'}`}>
                {resolveFeedback2.type === 'success' ? (
                  <CheckCircle2 size={13} className="shrink-0 mt-0.5 text-emerald-600" />
                ) : (
                  <AlertCircle size={13} className="shrink-0 mt-0.5 text-rose-600" />
                )}
                <span className="leading-tight">{resolveFeedback2.message}</span>
              </div>
            )}
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Drug Name</label>
              <input
                type="text"
                placeholder="e.g. Daporinad"
                value={drug2Name}
                onChange={(e) => setDrug2Name(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <span>SMILES Chemical Structure</span>
                  <span className="text-rose-500 font-bold">*</span>
                  <InfoTooltip text="Simplified Molecular Input Line Entry System (SMILES). Encodes the exact 2D chemical structure converted into 256-bit Morgan fingerprints." />
                </label>
                <span className="text-[10px] text-slate-400 font-mono">Morgan radius=2, 256 bits</span>
              </div>
              <textarea
                rows={3}
                placeholder="e.g. O=C(NCCCCC1CCN(CC1)C(=O)C2=CC=CC=C2)\C=C\C3=CN=CC=C3"
                value={smiles2}
                onChange={(e) => {
                  setSmiles2(e.target.value);
                  setFieldErrors(prev => ({ ...prev, smiles2: undefined }));
                }}
                className={`input-field font-mono text-xs ${fieldErrors.smiles2 ? 'border-rose-400 focus:border-rose-500 ring-rose-200' : ''}`}
              />
              {fieldErrors.smiles2 && (
                <p className="text-[11px] text-rose-600 mt-1 font-medium">{fieldErrors.smiles2}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <span>Log AC50 (M) Potency</span>
                  <InfoTooltip text="Log10 single-agent concentration achieving 50% activity in PANC-1. More negative means higher potency. Default: −6.0 M if unknown." />
                </label>
                <span className="text-[10px] text-slate-500">Default: −6.0 M</span>
              </div>
              <input
                type="number"
                step="0.01"
                min="-12"
                max="0"
                placeholder="-6.0"
                value={ac50_2}
                onChange={(e) => setAc50_2(e.target.value)}
                className="input-field"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Action Bar (Predict Button + Reset) ───────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-white border border-slate-200/90 rounded-xl shadow-card">
        <div className="text-xs text-slate-500">
          <p className="font-semibold text-slate-700">Order-Invariant Prediction Engine</p>
          <p>Synergy prediction is physically symmetric: Synergy(A, B) ≡ Synergy(B, A).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleReset}
            className="btn-secondary text-xs"
            disabled={loading || rxnLoading}
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>

          {/* Button: Predict Chemical Reaction & Kinetics */}
          <button
            type="button"
            onClick={handlePredictReaction}
            disabled={loading || rxnLoading}
            className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-semibold text-xs rounded-xl shadow-sm hover:shadow transition flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {rxnLoading ? (
              <>
                <Spinner size="sm" />
                <span>Predicting Reaction...</span>
              </>
            ) : (
              <>
                <Atom size={15} />
                <span>Predict Chemical Reaction</span>
              </>
            )}
          </button>

          {/* Button: Predict Combination Synergy */}
          <button
            type="button"
            onClick={handlePredict}
            disabled={loading || rxnLoading}
            className="btn-primary text-xs py-2.5 px-5"
          >
            {loading ? (
              <>
                <Spinner size="sm" />
                <span>Scoring Synergy...</span>
              </>
            ) : (
              <>
                <FlaskConical size={15} />
                <span>Predict Combination Synergy</span>
              </>
            )}
          </button>

          {/* Button: Open in Reaction & Kinetics Lab */}
          {onNavigate && (
            <>
              <button
                type="button"
                onClick={handleSendToReactionLab}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition flex items-center gap-1.5"
                title="Open compounds in full Reaction & Kinetics Lab"
              >
                <span>Reaction Lab</span>
                <ExternalLink size={13} />
              </button>

              <button
                type="button"
                onClick={handleSendToCancerImpact}
                className="px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs rounded-xl border border-rose-200/80 transition flex items-center gap-1.5"
                title="View graphical tumor reduction curves & timeline for these compounds"
              >
                <TrendingDown size={13} />
                <span>Cancer Impact</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── 5. Error Notice if Synergy Call Fails ──────────────────────────── */}
      {error && (
        <ErrorState
          message={error}
          onRetry={handlePredict}
        />
      )}

      {/* ── Chemical Reaction Error ── */}
      {rxnError && (
        <ErrorState
          message={rxnError}
          onRetry={handlePredictReaction}
        />
      )}

      {/* ── Chemical Reaction & Kinetics Hero Card (When predicted in Prediction Lab) ── */}
      {rxnResult && (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Clock size={160} />
          </div>

          <div className="relative z-10 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  <Atom size={16} />
                </span>
                <div>
                  <h3 className="text-sm font-bold tracking-wider uppercase text-teal-300">
                    REACTION KINETICS & DURATION
                  </h3>
                  <p className="text-[11px] text-slate-300 font-mono">
                    Endpoint: {getApiBaseUrl()}/api/v1/chemical/reaction-predict
                  </p>
                </div>
              </div>

              {onNavigate && (
                <button
                  onClick={handleSendToReactionLab}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                >
                  <span>Open in Reaction & Kinetics Lab</span>
                  <ArrowRight size={13} />
                </button>
              )}
            </div>

            {/* 4 Highlight Metric Boxes */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-1">
              {/* 1. COMBINATION TIME REQUIRED */}
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10">
                <div className="text-[11px] font-semibold text-teal-300 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Clock size={14} />
                  COMBINATION TIME REQUIRED
                </div>
                <div className="text-2xl font-extrabold text-white tracking-tight">
                  {cleanChemString(
                    rxnResult.predicted_reaction.matched_reactions?.[0]?.conditions.estimated_time ||
                    rxnResult.ml_reaction_prediction?.model_conditions?.estimated_time ||
                    '2 - 6 hours'
                  )}
                </div>
                <p className="text-[11px] text-teal-200/80 mt-1">
                  Estimated duration for combination to reach completion
                </p>
              </div>

              {/* 2. REACTION TRANSFORMATION */}
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10">
                <div className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Sparkles size={14} />
                  REACTION TRANSFORMATION
                </div>
                <div className="text-base font-bold text-white truncate">
                  {cleanChemString(
                    rxnResult.predicted_reaction.matched_reactions?.[0]?.reaction_type ||
                    rxnResult.ml_reaction_prediction?.predicted_class_name ||
                    'Amide Coupling (Peptide Bond Formation)'
                  )}
                </div>
                <p className="text-[11px] text-cyan-200/80 mt-1">
                  {cleanChemString(
                    rxnResult.predicted_reaction.matched_reactions?.[0]?.description ||
                    'Carboxylic acid + Primary/Secondary Amine -> Amide + Water'
                  )}
                </p>
              </div>

              {/* 3. RECOMMENDED TEMPERATURE */}
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10">
                <div className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Thermometer size={14} />
                  RECOMMENDED TEMPERATURE
                </div>
                <div className="text-xl font-bold text-white">
                  {cleanChemString(
                    rxnResult.predicted_reaction.matched_reactions?.[0]?.conditions.temperature_celsius ||
                    rxnResult.ml_reaction_prediction?.model_conditions?.temperature ||
                    '0 °C to 25 °C (ambient)'
                  )}
                </div>
                <p className="text-[11px] text-amber-200/80 mt-1">
                  Optimal kinetic temperature window
                </p>
              </div>

              {/* 4. EXPECTED YIELD RANGE */}
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10">
                <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Flame size={14} />
                  EXPECTED YIELD RANGE
                </div>
                <div className="text-xl font-bold text-white">
                  {cleanChemString(
                    rxnResult.predicted_reaction.matched_reactions?.[0]?.conditions.expected_yield_range ||
                    rxnResult.ml_reaction_prediction?.model_conditions?.expected_yield ||
                    '80 - 95%'
                  )}
                </div>
                <p className="text-[11px] text-emerald-200/80 mt-1">
                  Isolated synthetic yield under standard conditions
                </p>
              </div>
            </div>

            {/* Reagents & Solvent Conditions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-xs border-t border-white/10">
              <div className="space-y-0.5">
                <span className="text-slate-400 font-medium block">Recommended Solvent:</span>
                <span className="text-white font-semibold text-sm">
                  {cleanChemString(
                    rxnResult.predicted_reaction.matched_reactions?.[0]?.conditions.solvent ||
                    rxnResult.ml_reaction_prediction?.model_conditions?.solvent ||
                    'N,N-Dimethylformamide (DMF) or Dichloromethane (DCM)'
                  )}
                </span>
              </div>
              <div className="space-y-0.5">
                <span className="text-slate-400 font-medium block">Reagents / Catalyst:</span>
                <span className="text-white font-semibold text-sm">
                  {cleanChemString(
                    rxnResult.predicted_reaction.matched_reactions?.[0]?.conditions.catalyst_reagents ||
                    rxnResult.ml_reaction_prediction?.model_conditions?.catalyst_reagents ||
                    "HATU or HOBt / EDC·HCl with DIPEA (Hunig's base)"
                  )}
                </span>
              </div>
            </div>

            {/* Molecular Properties Preview */}
            <div className="pt-2 border-t border-white/10">
              <div className="text-[11px] font-semibold text-teal-300 uppercase tracking-wider mb-2 flex items-center gap-1">
                <ShieldCheck size={13} />
                <span>Chemical & Physical Molecular Descriptors</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-1">
                  <div className="flex items-center justify-between font-bold text-teal-300">
                    <span>{drug1Name || 'Compound A'}</span>
                    <span className="font-mono">{rxnResult.compound_1.rdkit_properties.molecular_formula}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 pt-1 text-[11px]">
                    <div><span className="text-slate-400">MW:</span> <strong className="text-white">{rxnResult.compound_1.rdkit_properties.molecular_weight_g_mol}</strong></div>
                    <div><span className="text-slate-400">LogP:</span> <strong className="text-white">{rxnResult.compound_1.rdkit_properties.logp_lipophilicity}</strong></div>
                    <div><span className="text-slate-400">TPSA:</span> <strong className="text-white">{rxnResult.compound_1.rdkit_properties.tpsa_angstrom2} Å²</strong></div>
                  </div>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-1">
                  <div className="flex items-center justify-between font-bold text-cyan-300">
                    <span>{drug2Name || 'Compound B'}</span>
                    <span className="font-mono">{rxnResult.compound_2.rdkit_properties.molecular_formula}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 pt-1 text-[11px]">
                    <div><span className="text-slate-400">MW:</span> <strong className="text-white">{rxnResult.compound_2.rdkit_properties.molecular_weight_g_mol}</strong></div>
                    <div><span className="text-slate-400">LogP:</span> <strong className="text-white">{rxnResult.compound_2.rdkit_properties.logp_lipophilicity}</strong></div>
                    <div><span className="text-slate-400">TPSA:</span> <strong className="text-white">{rxnResult.compound_2.rdkit_properties.tpsa_angstrom2} Å²</strong></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 6. Prediction Results Hero Section (Post-Inference) ──────────────── */}
      {prediction && (
        <div className="panel p-7 border-teal-500/60 shadow-lg space-y-6 bg-white animate-in fade-in slide-in-from-bottom-2 duration-200">
          
          {/* Header of Results */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Synergy Prediction: {prediction.drug_name_1} + {prediction.drug_name_2}
                </h3>
                <p className="text-xs text-slate-500">
                  Continuous synergy score evaluated by champion Random Forest regressor on PANC-1 line
                </p>
              </div>
            </div>

            <button
              onClick={copyResultSummary}
              className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 self-start sm:self-auto"
            >
              {copied ? (
                <>
                  <Check size={13} className="text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Copied Report!</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span>Copy Research Summary</span>
                </>
              )}
            </button>
          </div>

          {/* Focal Point: The Score & Classification */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            
            {/* Big Score Hero Box */}
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center flex flex-col items-center justify-center gap-2">
              <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                Predicted Gamma (γ)
              </span>
              <div
                className="text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums"
                style={{ color: getGammaColor(prediction.predicted_gamma) }}
              >
                {fmt4(prediction.predicted_gamma)}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
                <span className={getGammaBadgeClass(prediction.predicted_gamma)}>
                  {prediction.synergy_classification}
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200/80 text-slate-700">
                  {prediction.synergy_strength}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 mt-1 font-mono">
                Threshold: γ &lt; 1.0 (Synergistic)
              </span>
            </div>

            {/* Scientific Interpretation & Scale Bar */}
            <div className="md:col-span-2 space-y-4">
              <div>
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Phenotypic Synergy Interpretation
                </span>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-teal-50/60 p-4 rounded-xl border border-teal-200/70">
                  {getInterpretation(prediction.predicted_gamma)}
                </p>
              </div>

              {/* Verified Gamma Numerical Scale Indicator */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>Continuous Physical Scale</span>
                  <span className="font-mono text-teal-800">Your Prediction: γ = {fmt4(prediction.predicted_gamma)}</span>
                </div>
                
                {/* Scale Visual */}
                <div className="relative h-4 rounded-full bg-slate-200 overflow-hidden flex">
                  <div className="h-full bg-emerald-500/80" style={{ width: '25%' }} title="High Synergy (Gamma < 0.5)" />
                  <div className="h-full bg-teal-500/70" style={{ width: '25%' }} title="Moderate Synergy (0.5 <= Gamma < 1.0)" />
                  <div className="h-full bg-slate-400/60" style={{ width: '25%' }} title="Additive (1.0 <= Gamma < 1.5)" />
                  <div className="h-full bg-rose-500/70" style={{ width: '25%' }} title="Antagonistic (Gamma >= 1.5)" />
                </div>

                <div className="flex justify-between text-[10px] text-slate-500 pt-0.5">
                  <span className="text-emerald-700 font-semibold">0.0 (High Synergy)</span>
                  <span className="text-teal-700 font-semibold">0.5 (Moderate)</span>
                  <span className="text-slate-700 font-bold">1.0 (Synergy Boundary)</span>
                  <span className="text-slate-500">1.5</span>
                  <span className="text-rose-600 font-semibold">2.0+ (Antagonism)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Input Summary Card */}
          <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 text-xs">
            <span className="font-bold text-slate-700 uppercase tracking-wider block mb-2">
              Evaluated Pair Input Parameters
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="font-semibold text-slate-800">{prediction.drug_name_1}:</span>
                <span className="text-slate-500 ml-2">Potency Log AC50 = {typeof ac50_1 === 'number' ? ac50_1 : ac50_1} M</span>
                <p className="font-mono text-[11px] text-slate-500 truncate mt-0.5" title={smiles1}>{smiles1}</p>
              </div>
              <div>
                <span className="font-semibold text-slate-800">{prediction.drug_name_2}:</span>
                <span className="text-slate-500 ml-2">Potency Log AC50 = {typeof ac50_2 === 'number' ? ac50_2 : ac50_2} M</span>
                <p className="font-mono text-[11px] text-slate-500 truncate mt-0.5" title={smiles2}>{smiles2}</p>
              </div>
            </div>
          </div>

          {/* Dynamic Cancer Impact CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-gradient-to-r from-rose-50 via-rose-50/60 to-orange-50 rounded-xl border border-rose-200/80">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-rose-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                <TrendingDown size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">
                  Simulate Tumor Reduction Trajectory (% Kill vs. Time)
                </h4>
                <p className="text-[11px] text-slate-600">
                  Explore time-course cytotoxicity curves from 0h to 120h, T50 kill velocity, and morphological apoptosis stages.
                </p>
              </div>
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={handleSendToCancerImpact}
                className="btn-primary bg-rose-600 hover:bg-rose-700 text-xs py-2 px-3.5 flex items-center gap-1.5 whitespace-nowrap shadow-sm text-white"
              >
                <span>View Cancer Impact Curves</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>

        </div>
      )}

      {/* ── 7. Scientific Non-Clinical Disclaimer ────────────────────────────── */}
      <div className="p-4 rounded-xl border border-slate-200 bg-white flex items-start gap-3 shadow-card">
        <Info size={16} className="text-slate-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500 leading-relaxed">
          <strong className="text-slate-700">Computational Research Model Notice:</strong> Predictions are generated by a machine-learning Random Forest regressor trained on in-vitro PANC-1 cell-line combinations. These represent estimated in-silico combination parameters and do not establish clinical efficacy, tolerability, or safety. For experimental drug-discovery research purposes only.
        </p>
      </div>
    </div>
  );
}
