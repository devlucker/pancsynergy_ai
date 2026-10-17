import { useState, useEffect } from 'react';
import {
  Atom,
  Clock,
  Thermometer,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Server,
  Sparkles,
  Layers,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
  Zap,
  Database,
  Search,
  ArrowRight,
} from 'lucide-react';
import { api, getApiBaseUrl, setApiBaseUrl, ApiError } from '@/lib/api';
import { ALL_PANC1_DRUGS } from '@/lib/drug-library';
import type {
  ChemicalReactionInput,
  ChemicalPredictionResponse,
  ChemicalSamplePair,
  RDKitProperties,
  Page,
  DrugLibraryItem,
} from '@/types';

interface Props {
  onNavigate?: (page: Page) => void;
}

const DEFAULT_SERVER_URLS = [
  'http://127.0.0.1:8081',
  'http://127.0.0.1:8000',
  'http://localhost:8081',
];

function cleanChemString(str?: string): string {
  if (!str) return '';
  return str
    .replace(/\uFFFD\s*C/gi, '°C')
    .replace(/\uFFFD/g, '·')
    .replace(/\u00B0\s*C/gi, '°C');
}

export default function ReactionPropertiesLab({ onNavigate }: Props) {
  // Comprehensive Drug Library state
  const [drugLibrary, setDrugLibrary] = useState<DrugLibraryItem[]>(ALL_PANC1_DRUGS);

  // Server connection states
  const [activeServerUrl, setActiveServerUrl] = useState<string>(getApiBaseUrl());
  const [serverPing, setServerPing] = useState<{ ok: boolean; latencyMs: number } | null>(null);
  const [isPinging, setIsPinging] = useState<boolean>(false);

  // Form states
  const [smiles1, setSmiles1] = useState<string>('CC(=O)O');
  const [name1, setName1] = useState<string>('Acetic Acid');
  const [smiles2, setSmiles2] = useState<string>('CCN');
  const [name2, setName2] = useState<string>('Ethylamine');
  const [fetchPubchem, setFetchPubchem] = useState<boolean>(false);

  // Extra field state: SMILES formula resolver by name
  const [searchQuery1, setSearchQuery1] = useState('');
  const [resolving1, setResolving1] = useState(false);
  const [resolveFeedback1, setResolveFeedback1] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [searchQuery2, setSearchQuery2] = useState('');
  const [resolving2, setResolving2] = useState(false);
  const [resolveFeedback2, setResolveFeedback2] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Data states
  const [samples, setSamples] = useState<ChemicalSamplePair[]>([]);
  const [predicting, setPredicting] = useState<boolean>(false);
  const [result, setResult] = useState<ChemicalPredictionResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'properties' | 'pathways' | 'protocol' | 'ml'>('summary');
  const [propViewCompound, setPropViewCompound] = useState<'comp1' | 'comp2' | 'product'>('comp1');

  // Load transferred compounds from PredictionLab if available
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pancsynergy_transferred_pair');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.smiles_1 && parsed.smiles_2) {
          setSmiles1(parsed.smiles_1);
          if (parsed.name_1) setName1(parsed.name_1);
          setSmiles2(parsed.smiles_2);
          if (parsed.name_2) setName2(parsed.name_2);
          localStorage.removeItem('pancsynergy_transferred_pair');

          // Trigger automated analysis
          void (async () => {
            setPredicting(true);
            try {
              const data = await api.predictReaction({
                smiles_1: parsed.smiles_1,
                smiles_2: parsed.smiles_2,
                fetch_pubchem: false
              }, activeServerUrl);
              setResult(data);
            } catch (err: unknown) {
              console.error('Automated transferred prediction error:', err);
            } finally {
              setPredicting(false);
            }
          })();
        }
      }
    } catch (e) {
      console.warn('Could not read transferred pair from localStorage', e);
    }
  }, [activeServerUrl]);

  // Ping server and load samples on mount or URL change
  useEffect(() => {
    let isMounted = true;
    async function checkServer() {
      setIsPinging(true);
      const ping = await api.pingEndpoint(activeServerUrl);
      if (isMounted) {
        setServerPing(ping);
        setIsPinging(false);
      }
    }
    void checkServer();

    async function loadSamples() {
      try {
        const sampleData = await api.fetchChemicalSamples(activeServerUrl);
        if (isMounted && sampleData && sampleData.length > 0) {
          setSamples(sampleData);
        }
      } catch {
        // Fallback default samples if server is offline
        if (isMounted) {
          setSamples([
            {
              id: 'amide-coupling',
              label: 'Acetic Acid + Ethylamine',
              category: 'Amide Coupling',
              smiles_1: 'CC(=O)O',
              name_1: 'Acetic Acid',
              smiles_2: 'CCN',
              name_2: 'Ethylamine',
              expected_time: '2 - 6 hours',
              expected_reaction: 'Amide Coupling (Peptide Bond Formation)',
              description: 'Classic condensation forming N-ethylacetamide with high conversion.'
            },
            {
              id: 'esterification',
              label: 'Benzoic Acid + Ethanol',
              category: 'Esterification',
              smiles_1: 'C1=CC=C(C=C1)C(=O)O',
              name_1: 'Benzoic Acid',
              smiles_2: 'CCO',
              name_2: 'Ethanol',
              expected_time: '3 - 8 hours',
              expected_reaction: 'Esterification (Fischer / Steglich)',
              description: 'Acid-catalyzed ester synthesis yielding Ethyl Benzoate.'
            },
            {
              id: 'alkylation',
              label: 'Benzyl Chloride + Morpholine',
              category: 'Nucleophilic Substitution',
              smiles_1: 'C1=CC=C(C=C1)CCl',
              name_1: 'Benzyl Chloride',
              smiles_2: 'C1COCCN1',
              name_2: 'Morpholine',
              expected_time: '4 - 12 hours',
              expected_reaction: 'Nucleophilic Substitution',
              description: 'Alkylation of secondary amine with benzyl chloride.'
            }
          ]);
        }
      }

      try {
        const drugData = await api.fetchDrugLibrary(activeServerUrl);
        if (isMounted && drugData?.drugs?.length) {
          setDrugLibrary(drugData.drugs);
        }
      } catch {
        // Fallback to ALL_PANC1_DRUGS
      }
    }
    void loadSamples();

    return () => {
      isMounted = false;
    };
  }, [activeServerUrl]);

  // Handle switching server endpoint (e.g., port 8081 vs 8000)
  function handleServerChange(newUrl: string) {
    setActiveServerUrl(newUrl);
    setApiBaseUrl(newUrl);
  }

  // Load sample preset
  function handleSelectSample(s: ChemicalSamplePair) {
    setSmiles1(s.smiles_1);
    setName1(s.name_1);
    setSmiles2(s.smiles_2);
    setName2(s.name_2);
    setErrorMsg(null);
  }

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
      const res = await api.resolveSmiles(rawQuery, activeServerUrl);
      if (res && res.smiles) {
        if (compoundIndex === 1) {
          setName1(res.drug_name);
          setSmiles1(res.smiles);
          setResolveFeedback1({
            type: 'success',
            message: `✓ Resolved "${res.drug_name}" from ${res.source}! SMILES populated.`
          });
        } else {
          setName2(res.drug_name);
          setSmiles2(res.smiles);
          setResolveFeedback2({
            type: 'success',
            message: `✓ Resolved "${res.drug_name}" from ${res.source}! SMILES populated.`
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

  // Transfer compounds to Prediction Lab and trigger synergy scoring
  const handleSendToPredictionLab = () => {
    if (!smiles1.trim() || !smiles2.trim()) return;
    try {
      localStorage.setItem(
        'pancsynergy_to_prediction_lab',
        JSON.stringify({
          name_1: name1.trim() || 'Compound 1',
          smiles_1: smiles1.trim(),
          name_2: name2.trim() || 'Compound 2',
          smiles_2: smiles2.trim(),
          auto_predict: true,
        })
      );
    } catch (err) {
      console.warn('Could not store transferred pair', err);
    }
    if (onNavigate) {
      onNavigate('prediction-lab');
    }
  };

  // Trigger RESTful prediction
  async function handlePredict() {
    if (!smiles1.trim() || !smiles2.trim()) {
      setErrorMsg('Please provide valid SMILES strings for both reactants.');
      return;
    }

    setPredicting(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const payload: ChemicalReactionInput = {
        smiles_1: smiles1.trim(),
        smiles_2: smiles2.trim(),
        fetch_pubchem: fetchPubchem,
      };
      const data = await api.predictReaction(payload, activeServerUrl);
      setResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to communicate with RESTful backend at ${activeServerUrl}: ${msg}`);
    } finally {
      setPredicting(false);
    }
  }

  const primaryMatch = result?.predicted_reaction?.matched_reactions?.[0];
  const primaryProduct = primaryMatch?.products?.[0];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ─── Page Header ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-teal-600 text-white shadow-sm inline-flex">
              <Atom size={22} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Chemical Properties & Reaction Kinetics Lab
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                RESTful Architecture • Physical & Chemical Descriptors • Reaction Time & Synthetic Protocols • USPTO-50K ML Classification
              </p>
            </div>
          </div>
        </div>

        {/* Server Endpoint Switcher / Status Pill */}
        <div className="flex items-center gap-2 bg-white p-1.5 px-3 rounded-xl border border-slate-200 shadow-sm text-xs">
          <Server size={14} className="text-slate-400 shrink-0" />
          <span className="font-semibold text-slate-700">REST Server:</span>
          <select
            value={activeServerUrl}
            onChange={(e) => handleServerChange(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-800 rounded px-2 py-1 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {DEFAULT_SERVER_URLS.map((url) => (
              <option key={url} value={url}>
                {url} {url.includes('8081') ? '(Target Port 8081)' : url.includes('8000') ? '(Port 8000)' : ''}
              </option>
            ))}
          </select>

          {/* Status Indicator */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
            {isPinging ? (
              <RefreshCw size={12} className="animate-spin text-teal-600" />
            ) : serverPing?.ok ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Live ({serverPing.latencyMs}ms)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Offline
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Server Port 8081 Connection Banner (if offline) ─── */}
      {serverPing && !serverPing.ok && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-950">Backend Server Not Detected on {activeServerUrl}:</span>
            <p className="mt-1 text-amber-800">
              To launch the backend server on <strong>Port 8081</strong>, run the runner script in your project root:
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="bg-amber-100/80 px-2.5 py-1 rounded text-[11px] font-mono font-semibold text-amber-950 border border-amber-300">
                py -u server_8081.py --port 8081
              </code>
              <span className="text-amber-700">or double click:</span>
              <code className="bg-amber-100/80 px-2.5 py-1 rounded text-[11px] font-mono font-semibold text-amber-950 border border-amber-300">
                start_8081.bat
              </code>
            </div>
          </div>
        </div>
      )}

      {/* ─── Reactant Input Section ─── */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 space-y-4">
        {/* Sample selection pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Sparkles size={15} className="text-amber-500" />
            <span>Curated Sample Pairs:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {samples.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSelectSample(s)}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-teal-50 hover:text-teal-800 hover:border-teal-200 border border-slate-200/80 text-slate-700 transition font-medium"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Compound Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Compound 1 */}
          <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-200/60 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-teal-500" />
                Reactant 1 (Substrate)
              </span>
              <select
                onChange={(e) => {
                  const d = drugLibrary.find(x => x.drug_name === e.target.value);
                  if (d) {
                    setName1(d.drug_name);
                    setSmiles1(d.smiles);
                  }
                }}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 max-w-full sm:max-w-[200px] truncate focus:outline-none focus:ring-1 focus:ring-teal-500"
                defaultValue=""
              >
                <option value="" disabled>Select from {drugLibrary.length} oncology drugs...</option>
                {drugLibrary.slice().sort((a, b) => a.drug_name.localeCompare(b.drug_name)).map(d => (
                  <option key={d.drug_name} value={d.drug_name}>{d.drug_name}</option>
                ))}
              </select>
            </div>

            {/* Extra Field: Dynamic SMILES Formula Resolver by Name */}
            <div className="p-2.5 bg-teal-50/80 rounded-lg border border-teal-200/90 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-teal-900 flex items-center gap-1">
                  <Search size={12} className="text-teal-700" />
                  <span>Extra Field: Fetch SMILES by Drug Name</span>
                </label>
                <span className="text-[9px] text-teal-700 font-semibold uppercase tracking-wider">PubChem / Local</span>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Type any compound name (e.g. Gemcitabine, Aspirin...)"
                  value={searchQuery1}
                  onChange={(e) => setSearchQuery1(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleResolveSmiles(1); }}
                  className="text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-md w-full focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <button
                  type="button"
                  onClick={() => void handleResolveSmiles(1)}
                  disabled={resolving1 || !searchQuery1.trim()}
                  className="px-2.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-md text-[11px] font-semibold flex items-center gap-1 shrink-0 disabled:opacity-60 shadow-xs"
                >
                  {resolving1 ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
                  <span>Get SMILES</span>
                </button>
              </div>
              {resolveFeedback1 && (
                <div className={`text-[10px] p-1.5 rounded flex items-center gap-1 ${resolveFeedback1.type === 'success' ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'}`}>
                  <span>{resolveFeedback1.message}</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">Compound Name</label>
              <input
                type="text"
                value={name1}
                onChange={(e) => setName1(e.target.value)}
                placeholder="e.g. Acetic Acid or Benzoic Acid"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">SMILES String</label>
              <input
                type="text"
                value={smiles1}
                onChange={(e) => setSmiles1(e.target.value)}
                placeholder="e.g. CC(=O)O"
                className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-teal-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Compound 2 */}
          <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-200/60 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-500" />
                Reactant 2 (Coreactant)
              </span>
              <select
                onChange={(e) => {
                  const d = drugLibrary.find(x => x.drug_name === e.target.value);
                  if (d) {
                    setName2(d.drug_name);
                    setSmiles2(d.smiles);
                  }
                }}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 max-w-full sm:max-w-[200px] truncate focus:outline-none focus:ring-1 focus:ring-cyan-500"
                defaultValue=""
              >
                <option value="" disabled>Select from {drugLibrary.length} oncology drugs...</option>
                {drugLibrary.slice().sort((a, b) => a.drug_name.localeCompare(b.drug_name)).map(d => (
                  <option key={d.drug_name} value={d.drug_name}>{d.drug_name}</option>
                ))}
              </select>
            </div>

            {/* Extra Field: Dynamic SMILES Formula Resolver by Name */}
            <div className="p-2.5 bg-cyan-50/80 rounded-lg border border-cyan-200/90 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-cyan-900 flex items-center gap-1">
                  <Search size={12} className="text-cyan-700" />
                  <span>Extra Field: Fetch SMILES by Drug Name</span>
                </label>
                <span className="text-[9px] text-cyan-700 font-semibold uppercase tracking-wider">PubChem / Local</span>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Type any compound name (e.g. Cisplatin, Ethanol...)"
                  value={searchQuery2}
                  onChange={(e) => setSearchQuery2(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleResolveSmiles(2); }}
                  className="text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-md w-full focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => void handleResolveSmiles(2)}
                  disabled={resolving2 || !searchQuery2.trim()}
                  className="px-2.5 py-1.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded-md text-[11px] font-semibold flex items-center gap-1 shrink-0 disabled:opacity-60 shadow-xs"
                >
                  {resolving2 ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
                  <span>Get SMILES</span>
                </button>
              </div>
              {resolveFeedback2 && (
                <div className={`text-[10px] p-1.5 rounded flex items-center gap-1 ${resolveFeedback2.type === 'success' ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'}`}>
                  <span>{resolveFeedback2.message}</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">Compound Name</label>
              <input
                type="text"
                value={name2}
                onChange={(e) => setName2(e.target.value)}
                placeholder="e.g. Ethylamine or Ethanol"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">SMILES String</label>
              <input
                type="text"
                value={smiles2}
                onChange={(e) => setSmiles2(e.target.value)}
                placeholder="e.g. CCN"
                className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-cyan-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Options & Action Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <label className="flex items-center gap-2 text-xs text-slate-600 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={fetchPubchem}
              onChange={(e) => setFetchPubchem(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span>Query Live PubChem Metadata (PubChemPy)</span>
          </label>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {/* Button: Pass to Prediction Lab */}
            {onNavigate && (
              <button
                type="button"
                onClick={handleSendToPredictionLab}
                disabled={!smiles1.trim() || !smiles2.trim()}
                className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-60"
                title="Transfer these compounds to Prediction Lab and compute combination synergy (Gamma score)"
              >
                <FlaskConical size={14} />
                <span>Pass to Prediction Lab (Score Synergy)</span>
                <ArrowRight size={13} />
              </button>
            )}

            <button
              onClick={() => void handlePredict()}
              disabled={predicting}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-700 hover:from-teal-700 hover:to-cyan-800 text-white font-semibold text-xs rounded-xl shadow-sm hover:shadow transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {predicting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Processing Cheminformatics via REST...</span>
                </>
              ) : (
                <>
                  <Zap size={14} />
                  <span>Predict Reaction Kinetics & Properties</span>
                </>
              )}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* ─── Results Dashboard ─── */}
      {result && (
        <div className="space-y-6">
          {/* 🌟 KEY HIGHLIGHT 1: Estimated Combination Time & Reaction Feasibility Card */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
              <Clock size={160} />
            </div>

            <div className="relative z-10 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-teal-300 bg-teal-900/60 border border-teal-500/40 px-3 py-1 rounded-full">
                  <Clock size={13} className="text-teal-400" />
                  Reaction Kinetics & Duration
                </span>
                <span className="text-xs text-slate-300 font-mono">
                  Endpoint: {activeServerUrl}/api/v1/chemical/reaction-predict
                </span>
              </div>

              {/* Huge Highlight on Combination Time */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
                {/* 1. Time Duration */}
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10">
                  <div className="text-[11px] font-semibold text-teal-300 uppercase tracking-wider flex items-center gap-1 mb-1">
                    <Clock size={14} />
                    Combination Time Required
                  </div>
                  <div className="text-2xl font-extrabold text-white tracking-tight">
                    {cleanChemString(
                      primaryMatch?.conditions.estimated_time ||
                      result.ml_reaction_prediction?.model_conditions?.estimated_time ||
                      '2 - 6 hours'
                    )}
                  </div>
                  <p className="text-[11px] text-teal-200/80 mt-1">
                    Estimated duration for combination to reach completion
                  </p>
                </div>

                {/* 2. Reaction Feasibility / Type */}
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10">
                  <div className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider flex items-center gap-1 mb-1">
                    <Sparkles size={14} />
                    Reaction Transformation
                  </div>
                  <div className="text-base font-bold text-white truncate">
                    {cleanChemString(
                      primaryMatch?.reaction_type ||
                      result.ml_reaction_prediction?.predicted_class_name ||
                      'Amide Coupling (Peptide Bond Formation)'
                    )}
                  </div>
                  <p className="text-[11px] text-cyan-200/80 mt-1 truncate">
                    {cleanChemString(
                      primaryMatch?.description ||
                      'Carboxylic acid + Primary/Secondary Amine -> Amide + Water'
                    )}
                  </p>
                </div>

                {/* 3. Reaction Temperature */}
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10">
                  <div className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-1 mb-1">
                    <Thermometer size={14} />
                    Recommended Temperature
                  </div>
                  <div className="text-xl font-bold text-white">
                    {cleanChemString(
                      primaryMatch?.conditions.temperature_celsius ||
                      result.ml_reaction_prediction?.model_conditions?.temperature ||
                      '0 °C to 25 °C (ambient)'
                    )}
                  </div>
                  <p className="text-[11px] text-amber-200/80 mt-1">
                    Optimal kinetic temperature window
                  </p>
                </div>

                {/* 4. Expected Yield */}
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10">
                  <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider flex items-center gap-1 mb-1">
                    <Flame size={14} />
                    Expected Yield Range
                  </div>
                  <div className="text-xl font-bold text-white">
                    {cleanChemString(
                      primaryMatch?.conditions.expected_yield_range ||
                      result.ml_reaction_prediction?.model_conditions?.expected_yield ||
                      '80 - 95%'
                    )}
                  </div>
                  <p className="text-[11px] text-emerald-200/80 mt-1">
                    Isolated synthetic yield under standard conditions
                  </p>
                </div>
              </div>

              {/* Reaction Reagents and Solvent strip */}
              {(primaryMatch?.conditions || result.ml_reaction_prediction?.model_conditions) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs border-t border-white/10">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <span className="text-slate-400 font-medium">Recommended Solvent:</span>
                    <span className="text-white font-semibold">
                      {cleanChemString(
                        primaryMatch?.conditions.solvent ||
                        result.ml_reaction_prediction?.model_conditions?.solvent ||
                        'N,N-Dimethylformamide (DMF) or Dichloromethane (DCM)'
                      )}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <span className="text-slate-400 font-medium">Reagents / Catalyst:</span>
                    <span className="text-white font-semibold">
                      {cleanChemString(
                        primaryMatch?.conditions.catalyst_reagents ||
                        result.ml_reaction_prediction?.model_conditions?.catalyst_reagents ||
                        "HATU or HOBt / EDC·HCl with DIPEA (Hunig's base)"
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ─── Navigation Tabs for Detailed Analysis ─── */}
          <div className="flex items-center gap-2 border-b border-slate-200 text-xs font-semibold">
            {[
              { id: 'summary', label: 'Summary & Overview', icon: Layers },
              { id: 'properties', label: 'Chemical & Physical Properties', icon: Atom },
              { id: 'pathways', label: 'Reaction Pathways & Products', icon: FlaskConical },
              { id: 'protocol', label: 'Step-by-Step Synthetic Protocol', icon: CheckCircle2 },
              { id: 'ml', label: 'USPTO-50K ML Classification', icon: Sparkles },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition -mb-px ${
                    active
                      ? 'border-teal-600 text-teal-800 bg-white font-bold'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                  }`}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* ─── TAB 1: Summary & Reaction Pathway Overview ─── */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              {/* Product Card */}
              {primaryProduct ? (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-800 flex items-center gap-2">
                      <FlaskConical size={16} className="text-teal-600" />
                      Predicted Reaction Product
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                      Product Generated via Forward SMARTS
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 bg-slate-50 rounded-xl p-4 border border-slate-200/80">
                      <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                        Canonical Product SMILES:
                      </span>
                      <code className="text-xs font-mono font-semibold text-teal-950 bg-white p-2.5 rounded-lg border border-slate-200 block overflow-x-auto">
                        {primaryProduct.product_smiles}
                      </code>
                      <p className="text-xs text-slate-600 mt-2">
                        {primaryMatch?.description}
                      </p>
                    </div>

                    {/* Quick Product Properties */}
                    <div className="bg-teal-50/50 rounded-xl p-4 border border-teal-100 space-y-2">
                      <span className="text-xs font-bold text-teal-900 block">Product Descriptors</span>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-slate-500 block text-[10px]">Formula</span>
                          <span className="font-semibold text-slate-800 font-mono">
                            {primaryProduct.product_properties.molecular_formula || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Mol. Weight</span>
                          <span className="font-semibold text-slate-800">
                            {primaryProduct.product_properties.molecular_weight_g_mol} g/mol
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">LogP (Lipophilicity)</span>
                          <span className="font-semibold text-slate-800">
                            {primaryProduct.product_properties.logp_lipophilicity}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">TPSA</span>
                          <span className="font-semibold text-slate-800">
                            {primaryProduct.product_properties.tpsa_angstrom2} Å²
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                  {result.predicted_reaction.summary || 'No classic single-step condensation matched standard rules.'}
                </div>
              )}

              {/* Side by side comparison of reactants */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CompoundSummaryCard
                  title={`Reactant 1: ${name1 || 'Compound A'}`}
                  analysis={result.compound_1}
                  badgeColor="teal"
                />
                <CompoundSummaryCard
                  title={`Reactant 2: ${name2 || 'Compound B'}`}
                  analysis={result.compound_2}
                  badgeColor="cyan"
                />
              </div>
            </div>
          )}

          {/* ─── TAB 2: Comprehensive Chemical & Physical Properties ─── */}
          {activeTab === 'properties' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-700">Select Compound to Inspect:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPropViewCompound('comp1')}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                      propViewCompound === 'comp1'
                        ? 'bg-teal-600 text-white font-bold shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Reactant 1: {name1 || 'Compound 1'}
                  </button>
                  <button
                    onClick={() => setPropViewCompound('comp2')}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                      propViewCompound === 'comp2'
                        ? 'bg-cyan-600 text-white font-bold shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Reactant 2: {name2 || 'Compound 2'}
                  </button>
                  {primaryProduct && (
                    <button
                      onClick={() => setPropViewCompound('product')}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                        propViewCompound === 'product'
                          ? 'bg-emerald-600 text-white font-bold shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Predicted Product
                    </button>
                  )}
                </div>
              </div>

              {/* Comprehensive Property Grid */}
              {propViewCompound === 'comp1' && (
                <DetailedPropertyView
                  title={`Reactant 1: ${name1}`}
                  smiles={result.compound_1.input_smiles}
                  props={result.compound_1.rdkit_properties}
                  pubchem={result.compound_1.pubchem_metadata}
                />
              )}
              {propViewCompound === 'comp2' && (
                <DetailedPropertyView
                  title={`Reactant 2: ${name2}`}
                  smiles={result.compound_2.input_smiles}
                  props={result.compound_2.rdkit_properties}
                  pubchem={result.compound_2.pubchem_metadata}
                />
              )}
              {propViewCompound === 'product' && primaryProduct && (
                <DetailedPropertyView
                  title="Predicted Reaction Product"
                  smiles={primaryProduct.product_smiles}
                  props={primaryProduct.product_properties}
                />
              )}
            </div>
          )}

          {/* ─── TAB 3: Reaction Pathways & Products ─── */}
          {activeTab === 'pathways' && (
            <div className="space-y-4">
              {result.predicted_reaction.matched_reactions && result.predicted_reaction.matched_reactions.length > 0 ? (
                result.predicted_reaction.matched_reactions.map((rxn, idx) => (
                  <div key={idx} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <div>
                        <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wider">
                          Pathway #{idx + 1}
                        </span>
                        <h3 className="text-base font-bold text-slate-900">{rxn.reaction_type}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-teal-50 text-teal-800 font-semibold px-2.5 py-1 rounded-full border border-teal-200">
                          ⏱️ Duration: {rxn.conditions.estimated_time}
                        </span>
                        <span className="text-xs bg-emerald-50 text-emerald-800 font-semibold px-2.5 py-1 rounded-full border border-emerald-200">
                          Yield: {rxn.conditions.expected_yield_range}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600">{rxn.description}</p>

                    {/* Products generated */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-800">Generated Product(s):</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {rxn.products.map((p, pIdx) => (
                          <div key={pIdx} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-700">Product #{pIdx + 1}</span>
                              <span className="font-mono text-slate-600 font-semibold">
                                {p.product_properties.molecular_formula}
                              </span>
                            </div>
                            <code className="text-[11px] font-mono text-teal-900 bg-white p-2 rounded block overflow-x-auto border border-slate-200">
                              {p.product_smiles}
                            </code>
                            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                              <span>MW: {p.product_properties.molecular_weight_g_mol} g/mol</span>
                              <span>LogP: {p.product_properties.logp_lipophilicity}</span>
                              <span>TPSA: {p.product_properties.tpsa_angstrom2} Å²</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
                  No single-step reactions cataloged for this specific functional group pair.
                </div>
              )}
            </div>
          )}

          {/* ─── TAB 4: Step-by-Step Synthetic Protocol ─── */}
          {activeTab === 'protocol' && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-teal-600" />
                  <h3 className="text-sm font-bold text-slate-900">Recommended Laboratory Synthetic Protocol</h3>
                </div>
                <span className="text-xs text-slate-500 font-medium">Standard Organic Synthetic Guidelines</span>
              </div>

              {primaryMatch?.conditions.steps ? (
                <div className="space-y-3">
                  {primaryMatch.conditions.steps.map((step, sIdx) => (
                    <div
                      key={sIdx}
                      className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/70 text-xs text-slate-800"
                    >
                      <div className="w-6 h-6 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px] shadow-sm">
                        {sIdx + 1}
                      </div>
                      <div className="pt-0.5 leading-relaxed font-medium">
                        {step}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500">
                  Custom protocol not available for non-standard multi-step reaction.
                </div>
              )}
            </div>
          )}

          {/* ─── TAB 5: USPTO-50K ML Classification ─── */}
          {activeTab === 'ml' && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wider">
                    Machine Learning Model
                  </span>
                  <h3 className="text-base font-bold text-slate-900">USPTO-50K Patent Reaction Classifier</h3>
                </div>
                <span className="text-xs bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-mono font-semibold">
                  50,000+ Validated Reactions
                </span>
              </div>

              {result.ml_reaction_prediction ? (
                <div className="space-y-4">
                  {/* Predicted Class Card */}
                  <div className="bg-gradient-to-r from-teal-50 to-cyan-50 p-4 rounded-xl border border-teal-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <span className="text-xs text-teal-700 font-semibold block">Predicted Reaction Class</span>
                      <span className="text-lg font-extrabold text-teal-950">
                        {result.ml_reaction_prediction.predicted_class_name}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500 block">Model Confidence</span>
                      <span className="text-2xl font-black text-teal-700">
                        {(result.ml_reaction_prediction.confidence_score * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Top Candidate Classes Progress */}
                  <div className="space-y-3 pt-2">
                    <span className="text-xs font-bold text-slate-800 block">Candidate Reaction Classes:</span>
                    {result.ml_reaction_prediction.top_candidates.map((cand, cIdx) => (
                      <div key={cIdx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-800">{cand.class_name}</span>
                          <span className="font-mono text-slate-600 font-medium">
                            {(cand.probability * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-teal-600 h-2 rounded-full transition-all"
                            style={{ width: `${Math.max(cand.probability * 100, 3)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500">
                  USPTO Model weights not loaded or unavailable.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-Component: Compound Summary Card ───

interface CompoundSummaryCardProps {
  title: string;
  analysis: {
    input_smiles: string;
    rdkit_properties: RDKitProperties;
    pubchem_metadata?: {
      iupac_name?: string;
      pubchem_cid?: number;
      xlogp?: number;
    } | null;
  };
  badgeColor: 'teal' | 'cyan';
}

function CompoundSummaryCard({ title, analysis, badgeColor }: CompoundSummaryCardProps) {
  const p = analysis.rdkit_properties;
  const isTeal = badgeColor === 'teal';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <h4 className={`text-xs font-bold uppercase tracking-wider ${isTeal ? 'text-teal-800' : 'text-cyan-800'}`}>
          {title}
        </h4>
        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
          {p.molecular_formula || 'Formula'}
        </span>
      </div>

      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
        <span className="text-[10px] text-slate-500 block mb-0.5">SMILES:</span>
        <code className="text-xs font-mono font-semibold text-slate-800 block truncate">
          {analysis.input_smiles}
        </code>
      </div>

      {analysis.pubchem_metadata?.iupac_name && (
        <p className="text-[11px] text-slate-600 italic truncate">
          IUPAC: {analysis.pubchem_metadata.iupac_name}
        </p>
      )}

      {/* Metric Tiles */}
      <div className="grid grid-cols-3 gap-2 pt-1 text-center">
        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/80">
          <span className="text-[10px] text-slate-500 block">Mol. Weight</span>
          <span className="text-xs font-bold text-slate-800">{p.molecular_weight_g_mol}</span>
        </div>
        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/80">
          <span className="text-[10px] text-slate-500 block">LogP</span>
          <span className="text-xs font-bold text-slate-800">{p.logp_lipophilicity}</span>
        </div>
        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/80">
          <span className="text-[10px] text-slate-500 block">TPSA</span>
          <span className="text-xs font-bold text-slate-800">{p.tpsa_angstrom2} Å²</span>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-Component: Detailed Property View ───

interface DetailedPropertyViewProps {
  title: string;
  smiles: string;
  props: RDKitProperties;
  pubchem?: {
    pubchem_cid?: number;
    iupac_name?: string;
    inchikey?: string;
    synonyms_sample?: string[];
  } | null;
}

function DetailedPropertyView({ title, smiles, props, pubchem }: DetailedPropertyViewProps) {
  const propertyItems = [
    { label: 'Molecular Formula', value: props.molecular_formula, category: 'Identity' },
    { label: 'Molecular Weight', value: `${props.molecular_weight_g_mol} g/mol`, category: 'Physical' },
    { label: 'Exact Monoisotopic Mass', value: `${props.exact_mass} Da`, category: 'Physical' },
    { label: 'LogP (Octanol/Water Partition)', value: props.logp_lipophilicity, category: 'Physical' },
    { label: 'TPSA (Polar Surface Area)', value: `${props.tpsa_angstrom2} Å²`, category: 'Physical' },
    { label: 'Molar Refractivity', value: props.molar_refractivity, category: 'Physical' },
    { label: 'H-Bond Donors (HBD)', value: props.h_bond_donors, category: 'Structural' },
    { label: 'H-Bond Acceptors (HBA)', value: props.h_bond_acceptors, category: 'Structural' },
    { label: 'Rotatable Bonds', value: props.rotatable_bonds, category: 'Structural' },
    { label: 'Heavy Atom Count', value: props.heavy_atom_count, category: 'Structural' },
    { label: 'Ring Count', value: props.ring_count, category: 'Structural' },
    { label: 'Aromatic Rings', value: props.aromatic_ring_count, category: 'Structural' },
    { label: 'Fraction CSP3 (Saturation)', value: props.fraction_csp3, category: 'Structural' },
    { label: 'Formal Net Charge', value: props.formal_charge, category: 'Structural' },
    { label: 'Drug-likeness (QED Score)', value: props.drug_likeness_qed ?? 'N/A', category: 'Drug-Likeness' },
    {
      label: 'Lipinski Rule of 5 Violations',
      value: `${props.lipinski_ro5_violations ?? 0} violations`,
      category: 'Drug-Likeness',
      highlight: (props.lipinski_ro5_violations ?? 0) <= 1 ? 'pass' : 'fail'
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <p className="text-xs font-mono text-slate-500 mt-0.5 truncate max-w-xl">{smiles}</p>
        </div>
        <div className="flex items-center gap-2">
          {props.lipinski_compliant ? (
            <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-800 font-semibold px-2.5 py-1 rounded-full border border-emerald-200">
              <ShieldCheck size={13} className="text-emerald-600" />
              Lipinski Compliant (Drug-Like)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-800 font-semibold px-2.5 py-1 rounded-full border border-amber-200">
              <AlertTriangle size={13} className="text-amber-600" />
              Lipinski Violations Present
            </span>
          )}
        </div>
      </div>

      {/* PubChem live metadata if present */}
      {pubchem && (
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
          <div className="font-semibold text-slate-700 flex items-center gap-1.5">
            <Database size={13} className="text-teal-600" />
            <span>PubChem Database Registry</span>
            {pubchem.pubchem_cid && (
              <span className="text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded font-mono">
                CID: {pubchem.pubchem_cid}
              </span>
            )}
          </div>
          {pubchem.iupac_name && (
            <p className="text-slate-600 truncate">
              <strong className="text-slate-700">IUPAC:</strong> {pubchem.iupac_name}
            </p>
          )}
          {pubchem.inchikey && (
            <p className="text-slate-500 font-mono text-[11px] truncate">
              InChIKey: {pubchem.inchikey}
            </p>
          )}
        </div>
      )}

      {/* Comprehensive Properties Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {propertyItems.map((item, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-xl border text-xs transition ${
              item.highlight === 'pass'
                ? 'bg-emerald-50/60 border-emerald-200'
                : item.highlight === 'fail'
                ? 'bg-rose-50/60 border-rose-200'
                : 'bg-slate-50/60 border-slate-200/80 hover:bg-white'
            }`}
          >
            <span className="text-[10.5px] font-medium text-slate-500 block truncate">
              {item.label}
            </span>
            <span className="text-sm font-bold text-slate-800 block mt-1 truncate">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
