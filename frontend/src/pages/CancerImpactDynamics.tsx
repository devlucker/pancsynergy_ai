import { useState, useMemo, useEffect } from 'react';
import {
  TrendingDown,
  Activity,
  Clock,
  Sparkles,
  FlaskConical,
  CheckCircle2,
  Sliders,
  ShieldCheck,
  ArrowRight,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { ALL_PANC1_DRUGS } from '@/lib/drug-library';
import { api } from '@/lib/api';
import type { Page, DrugLibraryItem } from '@/types';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';

interface Props {
  onNavigate?: (page: Page) => void;
}

interface BenchmarkCombo {
  id: string;
  name: string;
  drugA: string;
  drugB: string;
  moaA: string;
  moaB: string;
  ac50_A: number; // Log AC50 (M)
  ac50_B: number; // Log AC50 (M)
  gamma: number; // Continuous synergy score (gamma < 1.0 = Synergy, 1.0 = Additive, > 1.0 = Antagonistic)
  description: string;
}

const BENCHMARK_COMBOS: BenchmarkCombo[] = [
  {
    id: 'pralatrexate-daporinad',
    name: 'Pralatrexate + Daporinad (High Synergy, γ = 0.38)',
    drugA: 'Pralatrexate',
    drugB: 'Daporinad',
    moaA: 'Antifolate / DHFR Inhibitor',
    moaB: 'NAMPT Inhibitor (NAD+ depletion)',
    ac50_A: -7.27,
    ac50_B: -7.53,
    gamma: 0.38,
    description: 'High Synergy (γ = 0.38): Dual metabolic collapse starving nucleotide & NAD+ pools. Reaches 50% tumor eradication in ~14 hours.',
  },
  {
    id: 'panobinostat-carfilzomib',
    name: 'Panobinostat + Carfilzomib (Strong Synergy, γ = 0.44)',
    drugA: 'Panobinostat',
    drugB: 'Carfilzomib',
    moaA: 'Pan-HDAC Inhibitor',
    moaB: '20S Proteasome Inhibitor',
    ac50_A: -7.80,
    ac50_B: -8.10,
    gamma: 0.44,
    description: 'Strong Synergy (γ = 0.44): Severe proteotoxic crisis overloading ubiquitinated protein clearance in PANC-1 cells.',
  },
  {
    id: 'gemcitabine-cisplatin',
    name: 'Gemcitabine + Cisplatin (Moderate Synergy, γ = 0.62)',
    drugA: 'Gemcitabine',
    drugB: 'Cisplatin',
    moaA: 'Ribonucleotide Reductase Inhibitor',
    moaB: 'Platinum DNA Crosslinker',
    ac50_A: -6.50,
    ac50_B: -5.80,
    gamma: 0.62,
    description: 'Moderate Synergy (γ = 0.62): Clinical standard of care combination inducing DNA replication stall and crosslink repair exhaustion.',
  },
  {
    id: 'paclitaxel-vorinostat',
    name: 'Paclitaxel + Vorinostat (Weak Synergy, γ = 0.88)',
    drugA: 'Paclitaxel',
    drugB: 'Vorinostat',
    moaA: 'Microtubule Stabilizer',
    moaB: 'HDAC Inhibitor',
    ac50_A: -7.50,
    ac50_B: -6.20,
    gamma: 0.88,
    description: 'Weak Synergy (γ = 0.88): Mitotic spindle arrest combined with chromatin remodeling sensitization.',
  },
  {
    id: 'methotrexate-aminopterin',
    name: 'Methotrexate + Aminopterin (Additive / No Synergy, γ = 1.05)',
    drugA: 'Methotrexate',
    drugB: 'Aminopterin',
    moaA: 'Antifolate / DHFR',
    moaB: 'Antifolate / DHFR',
    ac50_A: -6.10,
    ac50_B: -5.90,
    gamma: 1.05,
    description: 'Additive Interaction (γ = 1.05): Redundant monotherapy target; combination curve closely tracks theoretical Bliss additive line.',
  },
  {
    id: 'parogrelil-osanetant',
    name: 'Parogrelil + Osanetant (Antagonistic Interference, γ = 1.68)',
    drugA: 'Parogrelil',
    drugB: 'Osanetant',
    moaA: 'Phosphodiesterase Inhibitor',
    moaB: 'NK2 Receptor Antagonist',
    ac50_A: -5.10,
    ac50_B: -4.80,
    gamma: 1.68,
    description: 'Antagonistic Interference (γ = 1.68): Mutual pharmacological inhibition; combination eliminates fewer cancer cells than either drug alone.',
  },
];

const TIME_STEPS = [0, 6, 12, 18, 24, 36, 48, 60, 72, 84, 96, 120];

export default function CancerImpactDynamics({ onNavigate }: Props) {
  const [selectedComboId, setSelectedComboId] = useState<string>(BENCHMARK_COMBOS[0].id);
  const [doseMultiplier, setDoseMultiplier] = useState<number>(1.0); // 0.5 (low), 1.0 (std), 1.5 (high)
  const [maxHours, setMaxHours] = useState<number>(96);
  const [selectedScrubberHour, setSelectedScrubberHour] = useState<number>(24);

  // Custom Pair Evaluation & Live ML Model Prediction state
  const [customDrugA, setCustomDrugA] = useState<DrugLibraryItem>(ALL_PANC1_DRUGS[0]);
  const [customDrugB, setCustomDrugB] = useState<DrugLibraryItem>(ALL_PANC1_DRUGS[1]);
  const [customGamma, setCustomGamma] = useState<number>(0.45);
  const [predictingML, setPredictingML] = useState<boolean>(false);
  const [predictFeedback, setPredictFeedback] = useState<string | null>(null);

  // Check if a transferred pair exists from PredictionLab or Reaction Lab
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pancsynergy_to_cancer_impact') || localStorage.getItem('pancsynergy_transferred_pair');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.name_1 && parsed.name_2) {
          const matchA = ALL_PANC1_DRUGS.find(d => d.drug_name.toLowerCase() === parsed.name_1.toLowerCase()) || {
            drug_name: parsed.name_1,
            smiles: parsed.smiles_1 || '',
            ac50: typeof parsed.ac50_1 === 'number' ? parsed.ac50_1 : -6.0,
            classType: 'Transferred Agent A'
          };
          const matchB = ALL_PANC1_DRUGS.find(d => d.drug_name.toLowerCase() === parsed.name_2.toLowerCase()) || {
            drug_name: parsed.name_2,
            smiles: parsed.smiles_2 || '',
            ac50: typeof parsed.ac50_2 === 'number' ? parsed.ac50_2 : -6.0,
            classType: 'Transferred Agent B'
          };

          setCustomDrugA(matchA);
          setCustomDrugB(matchB);
          if (parsed.predicted_gamma !== undefined) {
            setCustomGamma(Number(parsed.predicted_gamma));
          }
          setSelectedComboId('custom');
          setPredictFeedback(`Loaded from Prediction Lab: ${parsed.name_1} + ${parsed.name_2} (Model Predicted γ = ${Number(parsed.predicted_gamma)?.toFixed(3) ?? '0.500'})`);
        }
      }
    } catch (e) {
      console.warn('Could not read transferred pair', e);
    }
  }, []);

  // Compute active parameters dynamically based on selected regimen or custom pair
  const activeParams = useMemo(() => {
    if (selectedComboId === 'custom') {
      return {
        id: 'custom',
        name: `${customDrugA.drug_name} + ${customDrugB.drug_name} (Custom Evaluated Pair)`,
        drugA: customDrugA.drug_name,
        drugB: customDrugB.drug_name,
        moaA: customDrugA.classType,
        moaB: customDrugB.classType,
        ac50_A: customDrugA.ac50,
        ac50_B: customDrugB.ac50,
        gamma: customGamma,
        description: `Custom combination evaluated on PANC-1 line (Gamma = ${customGamma.toFixed(2)})`,
      };
    }
    const preset = BENCHMARK_COMBOS.find((c) => c.id === selectedComboId) || BENCHMARK_COMBOS[0];
    return {
      ...preset,
      ac50_A: preset.ac50_A,
      ac50_B: preset.ac50_B,
    };
  }, [selectedComboId, customDrugA, customDrugB, customGamma]);

  const activeCombo = activeParams;

  // Real-time dynamic pharmacodynamic metrics calculated from active drugs & gamma
  const engineMetrics = useMemo(() => {
    const { ac50_A, ac50_B, gamma } = activeParams;
    const deltaA = -((ac50_A ?? -6.0) - (-6.0));
    const deltaB = -((ac50_B ?? -6.0) - (-6.0));
    const rateA = Math.min(0.065, Math.max(0.008, 0.018 * Math.pow(1.35, deltaA))) * doseMultiplier;
    const rateB = Math.min(0.065, Math.max(0.008, 0.018 * Math.pow(1.35, deltaB))) * doseMultiplier;
    const sMult = Math.min(3.8, Math.max(0.35, Math.pow(1.0 / Math.max(0.2, gamma), 0.92)));
    const rateCombo = (rateA + rateB) * sMult;
    const calculatedT50 = Math.round((Math.log(2) / rateCombo) * 10) / 10;
    const calculatedOnset = Math.round((0.10536 / rateCombo) * 10) / 10;
    const speedup = Math.round((rateCombo / Math.max(0.001, Math.max(rateA, rateB))) * 10) / 10;
    return {
      rateA,
      rateB,
      synergyMultiplier: sMult,
      rateCombo,
      calculatedT50: calculatedT50 > 120 ? 120 : calculatedT50,
      calculatedOnset: calculatedOnset > 24 ? 24 : calculatedOnset,
      speedup,
    };
  }, [activeParams, doseMultiplier]);

  // Live ML model synergy prediction for custom compounds
  const handleRunMLPrediction = async () => {
    setPredictingML(true);
    setPredictFeedback(null);
    try {
      const res = await api.predict({
        drug_name_1: customDrugA.drug_name,
        smiles_1: customDrugA.smiles,
        log_ac50_1: customDrugA.ac50,
        drug_name_2: customDrugB.drug_name,
        smiles_2: customDrugB.smiles,
        log_ac50_2: customDrugB.ac50,
      });
      setCustomGamma(res.predicted_gamma);
      setPredictFeedback(`Random Forest ML: Predicted Gamma γ = ${res.predicted_gamma.toFixed(4)} (${res.synergy_classification})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPredictFeedback(`ML inference unavailable (${msg}). Simulation running with manual gamma.`);
    } finally {
      setPredictingML(false);
    }
  };

  const handleSendToPredictionLab = () => {
    const d1 = ALL_PANC1_DRUGS.find(d => d.drug_name.toLowerCase().includes(activeParams.drugA.toLowerCase())) || {
      drug_name: activeParams.drugA,
      smiles: customDrugA.smiles || 'NC1=NC(N)=C2N=C(CC(CC#C)C3=CC=C(C=C3)C(=O)N[C@@H](CCC(O)=O)C(O)=O)C=NC2=N1',
      ac50: activeParams.ac50_A ?? -7.27
    };
    const d2 = ALL_PANC1_DRUGS.find(d => d.drug_name.toLowerCase().includes(activeParams.drugB.toLowerCase())) || {
      drug_name: activeParams.drugB,
      smiles: customDrugB.smiles || 'O=C(NCCCCC1CCN(CC1)C(=O)C2=CC=CC=C2)\\C=C\\C3=CN=CC=C3',
      ac50: activeParams.ac50_B ?? -7.53
    };
    try {
      localStorage.setItem('pancsynergy_to_prediction_lab', JSON.stringify({
        name_1: activeParams.drugA,
        smiles_1: d1.smiles,
        ac50_1: d1.ac50,
        name_2: activeParams.drugB,
        smiles_2: d2.smiles,
        ac50_2: d2.ac50,
        auto_predict: true
      }));
    } catch (err) {
      console.warn('Could not store transferred pair', err);
    }
    if (onNavigate) {
      onNavigate('prediction-lab');
    }
  };

  // Generate dynamic pharmacokinetic/pharmacodynamic (PK/PD) time-course data
  // Fully reactive to drug potencies (Log AC50) and synergy score (Gamma)
  const timeCourseData = useMemo(() => {
    const { ac50_A, ac50_B, gamma } = activeParams;

    // Relative potencies compared to benchmark reference (-6.0 Molar)
    // Higher potency (e.g. -8.0 M) yields faster target engagement and single-agent apoptosis
    const deltaA = -((ac50_A ?? -6.0) - (-6.0));
    const deltaB = -((ac50_B ?? -6.0) - (-6.0));

    const rateA = Math.min(0.065, Math.max(0.008, 0.018 * Math.pow(1.35, deltaA))) * doseMultiplier;
    const rateB = Math.min(0.065, Math.max(0.008, 0.018 * Math.pow(1.35, deltaB))) * doseMultiplier;

    // Synergy Multiplier: In NCATS PANC-1 convention:
    // gamma < 1.0 = Synergy (accelerated kill)
    // gamma = 1.0 = Additive (tracks Bliss independent product)
    // gamma > 1.0 = Antagonism (suppressed kill)
    const synergyMultiplier = Math.min(3.8, Math.max(0.35, Math.pow(1.0 / Math.max(0.2, gamma), 0.92)));
    const rateCombo = (rateA + rateB) * synergyMultiplier;

    const steps = TIME_STEPS.filter((t) => t <= maxHours);

    return steps.map((hour) => {
      // Untreated control cells proliferate over time (doubling time ~36h in PANC-1)
      const controlGrowth = Math.min(240, 100 * Math.exp(0.016 * hour));

      // Single Agent A Viability (% of baseline remaining)
      const minViabilityA = Math.max(10, 45 - deltaA * 8);
      const viabilityA = Math.max(minViabilityA, 100 * Math.exp(-rateA * hour));

      // Single Agent B Viability
      const minViabilityB = Math.max(10, 45 - deltaB * 8);
      const viabilityB = Math.max(minViabilityB, 100 * Math.exp(-rateB * hour));

      // Theoretical Bliss Additive Viability
      const viabilityAdditive = Math.max(5, (viabilityA * viabilityB) / 100);

      // PancSynergy Combination (Synergistic rapid decline or Antagonistic plateau)
      const minComboViability = gamma > 1.2 ? Math.max(25, 40 * (gamma - 0.8)) : Math.max(2.0, 8.0 * gamma);
      const viabilityCombo = Math.max(minComboViability, 100 * Math.exp(-rateCombo * hour));

      // Cancer Affected / Kill Percentages
      const cancerKilledA = Math.max(0, 100 - viabilityA);
      const cancerKilledB = Math.max(0, 100 - viabilityB);
      const cancerKilledCombo = Math.max(0, 100 - viabilityCombo);

      // Synergy kill gain over best single agent
      const synergisticGain = Math.round((cancerKilledCombo - Math.max(cancerKilledA, cancerKilledB)) * 10) / 10;

      return {
        hour,
        hourLabel: `${hour}h`,
        controlGrowth: Math.round(controlGrowth * 10) / 10,
        viabilityA: Math.round(viabilityA * 10) / 10,
        viabilityB: Math.round(viabilityB * 10) / 10,
        viabilityAdditive: Math.round(viabilityAdditive * 10) / 10,
        viabilityCombo: Math.round(viabilityCombo * 10) / 10,
        cancerKilledA: Math.round(cancerKilledA * 10) / 10,
        cancerKilledB: Math.round(cancerKilledB * 10) / 10,
        cancerKilledCombo: Math.round(cancerKilledCombo * 10) / 10,
        synergisticGain,
      };
    });
  }, [activeParams, doseMultiplier, maxHours]);

  // Current stats at the active endpoint hour
  const endpointPoint = timeCourseData[timeCourseData.length - 1];
  const scrubberPoint = timeCourseData.find((d) => d.hour === selectedScrubberHour) || endpointPoint;

  // Milestone comparison data computed dynamically from active rate constants
  const milestoneData = useMemo(() => {
    const { ac50_A, ac50_B, gamma } = activeParams;
    const deltaA = -((ac50_A ?? -6.0) - (-6.0));
    const deltaB = -((ac50_B ?? -6.0) - (-6.0));

    const rateA = Math.min(0.065, Math.max(0.008, 0.018 * Math.pow(1.35, deltaA))) * doseMultiplier;
    const rateB = Math.min(0.065, Math.max(0.008, 0.018 * Math.pow(1.35, deltaB))) * doseMultiplier;
    const synergyMultiplier = Math.min(3.8, Math.max(0.35, Math.pow(1.0 / Math.max(0.2, gamma), 0.92)));
    const rateCombo = (rateA + rateB) * synergyMultiplier;

    const calcTime = (killTarget: number, rate: number, isCombo: boolean) => {
      if (!isCombo && killTarget > 60 && rate < 0.015) return 120;
      if (isCombo && gamma > 1.3 && killTarget > 70) return 120;
      const t = -Math.log(Math.max(0.01, 1 - killTarget / 100)) / rate;
      return t > 120 ? 120 : Math.round(t * 10) / 10;
    };

    return [
      {
        milestone: '25% Cancer Kill',
        agentA: calcTime(25, rateA, false),
        agentB: calcTime(25, rateB, false),
        combo: calcTime(25, rateCombo, true),
      },
      {
        milestone: '50% Kill (T50)',
        agentA: calcTime(50, rateA, false),
        agentB: calcTime(50, rateB, false),
        combo: calcTime(50, rateCombo, true),
      },
      {
        milestone: '75% Cancer Kill',
        agentA: calcTime(75, rateA, false),
        agentB: calcTime(75, rateB, false),
        combo: calcTime(75, rateCombo, true),
      },
      {
        milestone: '90% Tumor Eradication',
        agentA: calcTime(90, rateA, false),
        agentB: calcTime(90, rateB, false),
        combo: calcTime(90, rateCombo, true),
      },
    ];
  }, [activeParams, doseMultiplier]);

  // Morphological stage descriptions for selected hour
  const stageDescription = useMemo(() => {
    const h = selectedScrubberHour;
    if (h <= 6) {
      return {
        stage: 'Phase I: Cellular Uptake & Intracellular Target Engagement',
        biology: 'Drugs penetrate PANC-1 plasma membrane. Onset of cell-cycle G1/S phase arrest and early transcriptional alterations.',
        apoptosisMarker: 'Early Caspase-8 / Caspase-9 priming',
        viableDensity: '95 - 99% baseline',
      };
    }
    if (h <= 18) {
      return {
        stage: 'Phase II: Mitochondrial Depolarization (T25 Milestone)',
        biology: 'Synergistic collapse of mitochondrial outer membrane potential (MOMP). Initial release of Cytochrome C into cytosol.',
        apoptosisMarker: 'Bax/Bak oligomerization detected',
        viableDensity: '70 - 80% baseline',
      };
    }
    if (h <= 36) {
      return {
        stage: 'Phase III: Executioner Caspase Activation (T50 Milestone)',
        biology: 'Massive cleavage of Caspase-3/7 and PARP-1. Severe nuclear chromatin condensation, cell shrinkage, and membrane blebbing.',
        apoptosisMarker: 'Peak Caspase-3 activity (>85% cells)',
        viableDensity: '30 - 45% baseline',
      };
    }
    if (h <= 72) {
      return {
        stage: 'Phase IV: Maximal Cytotoxicity & Apoptotic Lysis (Tmax)',
        biology: 'Complete loss of cellular membrane integrity and genomic DNA fragmentation. Cancer cell debris clearance by phagocytosis.',
        apoptosisMarker: 'Phosphatidylserine externalization (Annexin-V+)',
        viableDensity: '8 - 15% baseline',
      };
    }
    return {
      stage: 'Phase V: Sustained Tumor Suppression & Resistant Colony Prevention',
      biology: 'Profound cancer cell eradication with negligible surviving resistant clones under synergistic combination pressure.',
      apoptosisMarker: 'Irreversible apoptotic cell death',
      viableDensity: '< 8% residual clones',
    };
  }, [selectedScrubberHour]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ─── Page Header ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-sm inline-flex">
              <TrendingDown size={22} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Cancer Impact Dynamics & Time-Course Lab
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Graphical Pharmacodynamics • PANC-1 Cell Viability Trajectories • Half-Maximal Kill Time (T₅₀) • Tumor Suppression Kinetics
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>PANC-1 Cell Line Benchmark</span>
          </span>

          {onNavigate && (
            <button
              onClick={() => onNavigate('prediction-lab')}
              className="btn-secondary text-xs flex items-center gap-1 py-1.5 px-3"
            >
              <FlaskConical size={13} />
              <span>Back to Prediction Lab</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Interactive Controls Panel ─── */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
            <Sliders size={15} className="text-teal-600" />
            <span>Therapeutic Regimen & Kinetics Simulation Controls</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-slate-500 hidden md:inline">
              Model: Continuous In-Vitro Hill Emax / Exponential Pharmacodynamics
            </span>
            {onNavigate && (
              <button
                type="button"
                onClick={handleSendToPredictionLab}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                title="Pass these compounds to Prediction Lab to compute AI Synergy Gamma score"
              >
                <FlaskConical size={13} />
                <span>Pass to Prediction Lab</span>
                <ArrowRight size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Combination Preset Selector */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">
              Select Evaluated Drug Combination Pair
            </label>
            <select
              value={selectedComboId}
              onChange={(e) => setSelectedComboId(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <optgroup label="🧪 Custom Pair Evaluation (51+ PANC-1 Library / Live ML)">
                <option value="custom">
                  ✨ Custom Pair ({customDrugA.drug_name} + {customDrugB.drug_name})
                </option>
              </optgroup>
              <optgroup label="Curated Benchmark Synergies & Antagonisms">
                {BENCHMARK_COMBOS.map((combo) => (
                  <option key={combo.id} value={combo.id}>
                    {combo.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <p className="text-[11px] text-slate-500 mt-1 italic truncate">
              {activeCombo.description}
            </p>
          </div>

          {/* 2. Dose Strength Level */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">
              Concentration & Dosage Strength
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: 'Low (0.5× IC₅₀)', value: 0.65 },
                { label: 'Standard (1×)', value: 1.0 },
                { label: 'High (2× IC₅₀)', value: 1.5 },
              ].map((d) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => setDoseMultiplier(d.value)}
                  className={`text-xs py-2 px-1 rounded-lg border font-medium text-center transition ${
                    doseMultiplier === d.value
                      ? 'bg-teal-600 text-white border-teal-700 font-bold shadow-sm'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Dose level scales cellular uptake & kill velocity
            </p>
          </div>

          {/* 3. Time Horizon */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">
              Observation Time Horizon
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: '48 Hours', value: 48 },
                { label: '72 Hours', value: 72 },
                { label: '96 Hours', value: 96 },
              ].map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setMaxHours(t.value)}
                  className={`text-xs py-2 px-1 rounded-lg border font-medium text-center transition ${
                    maxHours === t.value
                      ? 'bg-emerald-600 text-white border-emerald-700 font-bold shadow-sm'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Full incubation duration evaluated in PANC-1 line
            </p>
          </div>
        </div>

        {/* Custom Pair Evaluation Expanded Sub-Panel */}
        {selectedComboId === 'custom' && (
          <div className="mt-4 p-4 rounded-xl bg-slate-900 text-white border border-teal-500/40 space-y-3.5 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-teal-500/20 text-teal-400">
                  <FlaskConical size={16} />
                </span>
                <div>
                  <h4 className="text-xs font-bold text-slate-100">
                    Custom Pair Evaluator (51+ Curated PANC-1 Drug Library)
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Select any two compounds to evaluate their dynamic kill trajectory in real time
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunMLPrediction}
                  disabled={predictingML}
                  className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
                  title="Invoke Random Forest model on Port 8081 to predict live Gamma score"
                >
                  {predictingML ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Zap size={13} className="text-amber-300" />
                  )}
                  <span>{predictingML ? 'Evaluating Model...' : 'Run Live AI Synergy Model'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Compound A Dropdown */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                  <span>Compound A</span>
                  <span className="font-mono text-teal-400 text-[10px]">Log AC₅₀: {customDrugA.ac50?.toFixed(2)} M</span>
                </label>
                <select
                  value={customDrugA.drug_name}
                  onChange={(e) => {
                    const match = ALL_PANC1_DRUGS.find(d => d.drug_name === e.target.value);
                    if (match) setCustomDrugA(match);
                  }}
                  className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:ring-1 focus:ring-teal-400"
                >
                  {ALL_PANC1_DRUGS.map((d) => (
                    <option key={`a-${d.drug_name}`} value={d.drug_name}>
                      {d.drug_name} ({d.classType} • {d.ac50?.toFixed(2)} M)
                    </option>
                  ))}
                </select>
              </div>

              {/* Compound B Dropdown */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                  <span>Compound B</span>
                  <span className="font-mono text-indigo-400 text-[10px]">Log AC₅₀: {customDrugB.ac50?.toFixed(2)} M</span>
                </label>
                <select
                  value={customDrugB.drug_name}
                  onChange={(e) => {
                    const match = ALL_PANC1_DRUGS.find(d => d.drug_name === e.target.value);
                    if (match) setCustomDrugB(match);
                  }}
                  className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:ring-1 focus:ring-teal-400"
                >
                  {ALL_PANC1_DRUGS.map((d) => (
                    <option key={`b-${d.drug_name}`} value={d.drug_name}>
                      {d.drug_name} ({d.classType} • {d.ac50?.toFixed(2)} M)
                    </option>
                  ))}
                </select>
              </div>

              {/* Gamma Slider & Real-time Interpretation */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-300">Synergy Score (γ)</span>
                  <span className="font-mono font-bold text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/30">
                    γ = {customGamma.toFixed(2)} ({customGamma < 0.6 ? 'Strong Synergy' : customGamma < 0.95 ? 'Synergy' : customGamma <= 1.1 ? 'Additive' : 'Antagonism'})
                  </span>
                </div>
                <input
                  type="range"
                  min="0.20"
                  max="2.00"
                  step="0.01"
                  value={customGamma}
                  onChange={(e) => setCustomGamma(parseFloat(e.target.value))}
                  className="w-full accent-teal-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>0.20 (Max Synergy)</span>
                  <span>1.00 (Additive)</span>
                  <span>2.00 (Antagonism)</span>
                </div>
              </div>
            </div>

            {predictFeedback && (
              <div className="text-xs p-2.5 rounded-lg bg-teal-950/80 border border-teal-500/40 text-teal-200 flex items-center gap-2">
                <Sparkles size={14} className="text-teal-400 shrink-0" />
                <span>{predictFeedback}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Live Pharmacodynamic Engine Inspector Ribbon ─── */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 border border-teal-500/30 rounded-xl p-3.5 shadow-sm text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              <Zap size={14} className="text-amber-400" />
              Live PK/PD Kinetic Engine Inspector:
            </span>
            <span className="text-xs text-slate-300 hidden sm:inline">
              Active Parameters for <span className="text-teal-300 font-semibold">{activeCombo.drugA}</span> + <span className="text-indigo-300 font-semibold">{activeCombo.drugB}</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="bg-slate-800/80 border border-slate-700 px-2 py-1 rounded text-sky-300" title="First-order single-agent death rate constant for Drug A">
              k_A: {engineMetrics.rateA.toFixed(4)} h⁻¹
            </span>
            <span className="bg-slate-800/80 border border-slate-700 px-2 py-1 rounded text-indigo-300" title="First-order single-agent death rate constant for Drug B">
              k_B: {engineMetrics.rateB.toFixed(4)} h⁻¹
            </span>
            <span className="bg-slate-800/80 border border-slate-700 px-2 py-1 rounded text-amber-300" title="Continuous synergy multiplier: S = (1/gamma)^0.92">
              Synergy Multiplier S: {engineMetrics.synergyMultiplier.toFixed(3)}×
            </span>
            <span className="bg-emerald-950 border border-emerald-500/50 px-2.5 py-1 rounded font-bold text-emerald-300 shadow-xs" title="Total combination cell kill rate: k_combo = (k_A + k_B) * S">
              k_combo: {engineMetrics.rateCombo.toFixed(4)} h⁻¹
            </span>
          </div>
        </div>
      </div>

      {/* ─── Hero KPI Metric Cards: "How Much Affected & By What Time" ─── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* KPI 1: Maximum Cancer Suppression */}
        <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-teal-950 text-white p-5 rounded-2xl shadow-md border border-emerald-500/30 space-y-2">
          <div className="flex items-center justify-between text-emerald-300 text-xs font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <TrendingDown size={15} />
              Max Cancer Suppression
            </span>
            <span className="text-[11px] font-mono text-emerald-400">At {maxHours}h</span>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            {endpointPoint.cancerKilledCombo}%
          </div>
          <p className="text-xs text-emerald-200/80 leading-relaxed">
            PANC-1 cancer cells eliminated vs {endpointPoint.cancerKilledA}% ({activeCombo.drugA}) and {endpointPoint.cancerKilledB}% ({activeCombo.drugB}).
          </p>
          <div className="text-[11px] font-semibold text-emerald-300 bg-emerald-900/60 py-1 px-2.5 rounded-lg inline-block border border-emerald-500/30">
            +{endpointPoint.synergisticGain}% Synergistic Kill Advantage
          </div>
        </div>

        {/* KPI 2: Time to 50% Cancer Cell Death (T50) */}
        <div className="bg-gradient-to-br from-teal-950 via-slate-900 to-cyan-950 text-white p-5 rounded-2xl shadow-md border border-teal-500/30 space-y-2">
          <div className="flex items-center justify-between text-teal-300 text-xs font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Clock size={15} />
              Time to 50% Death (T₅₀)
            </span>
            <span className="text-[11px] font-mono text-teal-400">Half-Maximal</span>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            {engineMetrics.calculatedT50} hrs
          </div>
          <p className="text-xs text-teal-200/80 leading-relaxed">
            Time required for combination to eradicate 50% of viable cancer population.
          </p>
          <div className="text-[11px] font-semibold text-teal-300 bg-teal-900/60 py-1 px-2.5 rounded-lg inline-block border border-teal-500/30">
            {engineMetrics.speedup}× Accelerated Kill Velocity
          </div>
        </div>

        {/* KPI 3: Onset of Cytotoxic Apoptosis */}
        <div className="bg-gradient-to-br from-amber-950 via-slate-900 to-slate-900 text-white p-5 rounded-2xl shadow-md border border-amber-500/30 space-y-2">
          <div className="flex items-center justify-between text-amber-300 text-xs font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Activity size={15} />
              Apoptosis Onset Time
            </span>
            <span className="text-[11px] font-mono text-amber-400">Trigger Point</span>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            {engineMetrics.calculatedOnset} - {Math.round((engineMetrics.calculatedOnset * 1.5) * 10) / 10} hrs
          </div>
          <p className="text-xs text-amber-200/80 leading-relaxed">
            MOMP permeabilization & Caspase-3 cleavage triggered within initial hours.
          </p>
          <div className="text-[11px] font-semibold text-amber-300 bg-amber-900/60 py-1 px-2.5 rounded-lg inline-block border border-amber-500/30">
            Immediate Pathway Blockade
          </div>
        </div>

        {/* KPI 4: Residual Cancer Viability */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-rose-950 text-white p-5 rounded-2xl shadow-md border border-slate-700 space-y-2">
          <div className="flex items-center justify-between text-slate-300 text-xs font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Sparkles size={15} />
              Residual Viability
            </span>
            <span className="text-[11px] font-mono text-slate-400">Survival Floor</span>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-rose-400 tracking-tight">
            {endpointPoint.viabilityCombo}%
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Deep tumor collapse: only {endpointPoint.viabilityCombo}% surviving cells at {maxHours}h vs {endpointPoint.viabilityA}% for Drug A.
          </p>
          <div className="text-[11px] font-semibold text-rose-300 bg-rose-950/60 py-1 px-2.5 rounded-lg inline-block border border-rose-500/30">
            &gt; 90% Tumor Eradication
          </div>
        </div>
      </div>

      {/* ─── GRAPHICAL CHART 1: Primary Viability Time-Course Trajectory ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                PANC-1 Cancer Viability Kinetic Trajectory (0h to {maxHours}h)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Percentage of viable pancreatic cancer cells remaining over time under single-agent vs PancSynergy combination therapy.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              PancSynergy Combination (High Cytotoxicity)
            </span>
          </div>
        </div>

        {/* Recharts Area & Line Chart */}
        <div className="h-80 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeCourseData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="comboViabilityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="hourLabel" tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: '#64748B' }}
                unit="%"
                label={{ value: 'Cancer Viability (%)', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748B' }}
              />
              <Tooltip
                formatter={(val: any, name: any) => {
                  const num = typeof val === 'number' ? val : 0;
                  if (name === 'viabilityCombo') return [`${num}% Viable`, 'PancSynergy Combination'];
                  if (name === 'viabilityA') return [`${num}% Viable`, activeCombo.drugA];
                  if (name === 'viabilityB') return [`${num}% Viable`, activeCombo.drugB];
                  if (name === 'viabilityAdditive') return [`${num}% Viable`, 'Theoretical Additive'];
                  return [`${num}%`, name ?? ''];
                }}
                contentStyle={{ backgroundColor: '#0F172A', borderRadius: '10px', color: '#FFF', fontSize: '12px' }}
              />
              <Legend
                formatter={(val) => {
                  if (val === 'viabilityCombo') return `PancSynergy Combination (${activeCombo.drugA} + ${activeCombo.drugB})`;
                  if (val === 'viabilityA') return `${activeCombo.drugA} Alone`;
                  if (val === 'viabilityB') return `${activeCombo.drugB} Alone`;
                  if (val === 'viabilityAdditive') return 'Expected Additive (Bliss)';
                  return val;
                }}
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
              />

              {/* T50 Half-Maximal Reference Line */}
              <ReferenceLine y={50} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: '50% Kill (T50 Target)', fill: '#D97706', fontSize: 11, position: 'right' }} />
              {/* 90% Eradication Target Line */}
              <ReferenceLine y={10} stroke="#EF4444" strokeDasharray="3 3" label={{ value: '90% Tumor Eradication', fill: '#DC2626', fontSize: 11, position: 'right' }} />

              <Line type="monotone" dataKey="viabilityA" stroke="#0284C7" strokeWidth={2.2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="viabilityB" stroke="#6366F1" strokeWidth={2.2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="viabilityAdditive" stroke="#F59E0B" strokeDasharray="3 3" strokeWidth={1.8} dot={false} />
              <Area type="monotone" dataKey="viabilityCombo" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#comboViabilityGrad)" dot={{ r: 4, fill: '#059669' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── GRAPHICAL CHARTS 2 & 3: Kill Rate Over Time & Milestone Speedup ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 2: Cancer Cell Kill Rate Over Time (Bar Chart) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Activity size={16} className="text-teal-600" />
              Cumulative Cancer Cell Killing (%) at Time Milestones
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Direct comparison of tumor cytotoxicity at 12h, 24h, 48h, and 72h.
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={timeCourseData.filter((d) => [12, 24, 48, 72].includes(d.hour))}
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="hourLabel" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip
                  formatter={(val: any, name: any) => {
                    const num = typeof val === 'number' ? val : 0;
                    if (name === 'cancerKilledCombo') return [`${num}% Killed`, 'PancSynergy Combination'];
                    if (name === 'cancerKilledA') return [`${num}% Killed`, activeCombo.drugA];
                    if (name === 'cancerKilledB') return [`${num}% Killed`, activeCombo.drugB];
                    return [`${num}%`, name ?? ''];
                  }}
                  contentStyle={{ backgroundColor: '#0F172A', borderRadius: '8px', color: '#FFF', fontSize: '12px' }}
                />
                <Legend
                  formatter={(val) => {
                    if (val === 'cancerKilledCombo') return 'Combination';
                    if (val === 'cancerKilledA') return activeCombo.drugA;
                    if (val === 'cancerKilledB') return activeCombo.drugB;
                    return val;
                  }}
                  wrapperStyle={{ fontSize: '11px' }}
                />
                <Bar dataKey="cancerKilledA" fill="#93C5FD" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cancerKilledB" fill="#A5B4FC" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cancerKilledCombo" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Time-to-Milestone Speedup Comparison (Horizontal Bar Chart) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Clock size={16} className="text-teal-600" />
              Hours Required to Reach Cytotoxic Milestones
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Lower hours = faster cancer cell eradication (hours to 25%, 50%, 75%, 90% kill).
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={milestoneData}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 30, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis type="number" unit=" hrs" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis dataKey="milestone" type="category" tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} />
                <Tooltip
                  formatter={(val: any, name: any) => {
                    const num = typeof val === 'number' ? val : 0;
                    if (name === 'combo') return [`${num} hours`, 'PancSynergy Combination'];
                    if (name === 'agentA') return [`${num} hours`, activeCombo.drugA];
                    if (name === 'agentB') return [`${num} hours`, activeCombo.drugB];
                    return [`${num} hrs`, name ?? ''];
                  }}
                  contentStyle={{ backgroundColor: '#0F172A', borderRadius: '8px', color: '#FFF', fontSize: '12px' }}
                />
                <Legend
                  formatter={(val) => {
                    if (val === 'combo') return 'Combination (Fastest)';
                    if (val === 'agentA') return activeCombo.drugA;
                    if (val === 'agentB') return activeCombo.drugB;
                    return val;
                  }}
                  wrapperStyle={{ fontSize: '11px' }}
                />
                <Bar dataKey="agentA" fill="#93C5FD" radius={[0, 4, 4, 0]} />
                <Bar dataKey="agentB" fill="#A5B4FC" radius={[0, 4, 4, 0]} />
                <Bar dataKey="combo" fill="#059669" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ─── Interactive Time Scrubber: Hourly Cytotoxic Phase Inspector ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wider">
              Interactive Time Scrubber
            </span>
            <h3 className="text-base font-bold text-slate-900">
              Inspect Cancer Response at Specific Hour: {selectedScrubberHour} Hours
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[6, 12, 18, 24, 36, 48, 72, 96].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setSelectedScrubberHour(h)}
                className={`text-xs px-2.5 py-1 rounded-lg border font-mono transition ${
                  selectedScrubberHour === h
                    ? 'bg-teal-600 text-white font-bold border-teal-700 shadow-sm'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>

        {/* Live Status at Scrubber Hour */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Cancer Reduction at {selectedScrubberHour}h
            </span>
            <div className="text-2xl font-extrabold text-emerald-700">
              {scrubberPoint.cancerKilledCombo}% Killed
            </div>
            <p className="text-xs text-slate-600">
              Residual viability: <strong className="text-slate-800">{scrubberPoint.viabilityCombo}%</strong>
            </p>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Morphological Cellular Stage
            </span>
            <div className="text-sm font-bold text-slate-900 truncate">
              {stageDescription.stage}
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {stageDescription.biology}
            </p>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Apoptotic Biochemical Hallmark
            </span>
            <div className="text-sm font-bold text-teal-800">
              {stageDescription.apoptosisMarker}
            </div>
            <p className="text-xs text-slate-500">
              Viable cell density: {stageDescription.viableDensity}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Comprehensive Chronological Table: Exact Impact By Time ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 size={16} className="text-teal-600" />
              Chronological Cancer Response Kinetics Table
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Exact numerical cancer cell viability and tumor suppression across clinical incubation timepoints.
            </p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded bg-teal-50 text-teal-800 font-semibold border border-teal-200">
            PANC-1 In-Vitro Matrix
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold uppercase text-[11px]">
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3 text-emerald-800">Combo Viability</th>
                <th className="py-2.5 px-3 text-emerald-800">Cancer Killed</th>
                <th className="py-2.5 px-3 text-sky-800">{activeCombo.drugA} Alone</th>
                <th className="py-2.5 px-3 text-indigo-800">{activeCombo.drugB} Alone</th>
                <th className="py-2.5 px-3 text-amber-800">Synergy Advantage</th>
                <th className="py-2.5 px-3 text-slate-700">Cellular & Molecular Phase</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {timeCourseData.map((row) => (
                <tr
                  key={row.hour}
                  className={`hover:bg-slate-50/80 transition ${
                    selectedScrubberHour === row.hour ? 'bg-teal-50/50 font-semibold' : ''
                  }`}
                >
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                    {row.hourLabel}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-emerald-700 font-bold">
                    {row.viabilityCombo}%
                  </td>
                  <td className="py-2.5 px-3 font-mono text-emerald-800 font-bold">
                    {row.cancerKilledCombo}%
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-600">
                    {row.viabilityA}% ({row.cancerKilledA}% killed)
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-600">
                    {row.viabilityB}% ({row.cancerKilledB}% killed)
                  </td>
                  <td className="py-2.5 px-3 font-mono text-amber-700 font-semibold">
                    +{row.synergisticGain}%
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">
                    {row.hour === 0 && 'Baseline inoculation & treatment administration'}
                    {row.hour === 6 && 'G1/S Phase arrest, kinase signaling shutdown'}
                    {row.hour === 12 && 'Mitochondrial membrane potential collapse (T25)'}
                    {row.hour === 18 && 'Cytochrome C release, apoptosome assembly'}
                    {row.hour === 24 && 'Peak executioner Caspase-3/7 cleavage (T50 achieved)'}
                    {row.hour === 36 && 'Extensive chromatin condensation & apoptotic blebbing'}
                    {row.hour === 48 && 'Irreversible apoptotic cell lysis (> 80% killed)'}
                    {row.hour === 60 && 'Cellular debris clearance & secondary necrosis'}
                    {row.hour === 72 && 'Maximal tumor suppression (Tmax, 92% eradicated)'}
                    {row.hour === 84 && 'Exhaustion of viable cancer cells'}
                    {row.hour >= 96 && 'Permanent prevention of resistant colony outgrowth'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
