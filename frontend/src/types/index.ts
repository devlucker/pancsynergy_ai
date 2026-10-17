// ─── API Types mirroring backend schemas.py exactly ───────────────────────────

export interface HealthResponse {
  status: string;
  model_loaded: boolean;
  model_name: string | null;
}

// From trainer.py: the metrics dict stored in the artifact
export interface ChampionMetrics {
  Model: string;
  CV_RMSE: number;
  CV_MAE: number;
  CV_R2: number;
  CV_Pearson_r: number;
  CV_Spearman_rho: number;
  Test_RMSE: number;
  Test_MAE: number;
  Test_R2: number;
  Test_Pearson_r: number;
  Test_Spearman_rho: number;
  [key: string]: number | string; // allow dynamic access
}

export interface ModelInfoResponse {
  status: string;
  model_name: string;
  target_metric: string;
  total_training_samples: number;
  feature_dimension: number;
  champion_metrics: ChampionMetrics;
  synergy_threshold: string;
}

// DrugPairInput – matches backend schemas.py
export interface DrugPairInput {
  drug_name_1?: string;
  smiles_1: string;
  log_ac50_1?: number;
  drug_name_2?: string;
  smiles_2: string;
  log_ac50_2?: number;
}

// SynergyPredictionOutput – matches backend schemas.py
export interface SynergyPredictionOutput {
  drug_name_1: string;
  drug_name_2: string;
  predicted_gamma: number;
  synergy_classification: string;
  is_synergistic: boolean;
  synergy_strength: string;
}

// BatchDrugPairInput
export interface BatchDrugPairInput {
  pairs: DrugPairInput[];
}

// BatchSynergyPredictionOutput
export interface BatchSynergyPredictionOutput {
  total_screened: number;
  synergistic_count: number;
  predictions: SynergyPredictionOutput[];
}

// ValidatedCombo – from 307_synergisitc_combos.csv via the API
export interface ValidatedCombo {
  Gamma: number;
  'Sample Name 1': string;
  'Sample Name 2': string;
  'MOA 1': string;
  'MOA 2': string;
  [key: string]: string | number;
}

export interface ValidatedCombosResponse {
  total_validated: number;
  combinations: ValidatedCombo[];
}

// ─── Chemical & Reaction Prediction Types ────────────────────────────────────

export interface ChemicalReactionInput {
  smiles_1: string;
  smiles_2: string;
  fetch_pubchem?: boolean;
}

export interface RDKitProperties {
  canonical_smiles?: string;
  molecular_formula?: string;
  molecular_weight_g_mol?: number;
  exact_mass?: number;
  logp_lipophilicity?: number;
  tpsa_angstrom2?: number;
  molar_refractivity?: number;
  h_bond_donors?: number;
  h_bond_acceptors?: number;
  rotatable_bonds?: number;
  heavy_atom_count?: number;
  ring_count?: number;
  aromatic_ring_count?: number;
  fraction_csp3?: number;
  formal_charge?: number;
  drug_likeness_qed?: number | null;
  lipinski_ro5_violations?: number;
  lipinski_compliant?: boolean;
  error?: string;
}

export interface PubChemMetadata {
  pubchem_cid?: number;
  iupac_name?: string;
  pubchem_formula?: string;
  pubchem_weight?: number | string;
  xlogp?: number;
  charge?: number;
  inchikey?: string;
  synonyms_sample?: string[];
  status?: string;
}

export interface CompoundAnalysis {
  input_smiles: string;
  rdkit_properties: RDKitProperties;
  pubchem_metadata?: PubChemMetadata | null;
  openbabel_sdf_3d?: string | null;
}

export interface ReactionCondition {
  catalyst_reagents: string;
  solvent: string;
  temperature_celsius: string;
  estimated_time: string;
  expected_yield_range: string;
  steps: string[];
}

export interface ReactionProductItem {
  product_smiles: string;
  product_properties: RDKitProperties;
}

export interface ReactionMatch {
  reaction_type: string;
  description: string;
  conditions: ReactionCondition;
  products: ReactionProductItem[];
}

export interface PredictedReactionResult {
  status: string;
  summary?: string;
  matched_reaction_count?: number;
  matched_reactions?: ReactionMatch[];
  error?: string;
}

export interface MLCandidate {
  class_id: number;
  class_name: string;
  probability: number;
  conditions?: Record<string, string>;
}

export interface MLReactionPrediction {
  dataset_trained_on: string;
  predicted_class_id: number;
  predicted_class_name: string;
  confidence_score: number;
  top_candidates: MLCandidate[];
  model_conditions?: {
    catalyst_reagents?: string;
    solvent?: string;
    temperature?: string;
    estimated_time?: string;
    expected_yield?: string;
  };
}

export interface ChemicalPredictionResponse {
  compound_1: CompoundAnalysis;
  compound_2: CompoundAnalysis;
  predicted_reaction: PredictedReactionResult;
  ml_reaction_prediction?: MLReactionPrediction | null;
}

export interface ChemicalSamplePair {
  id: string;
  label: string;
  category: string;
  smiles_1: string;
  name_1: string;
  smiles_2: string;
  name_2: string;
  expected_time: string;
  expected_reaction: string;
  description: string;
}

export interface ServerStatusResponse {
  status: string;
  service: string;
  version: string;
  default_port: number;
  synergy_model_loaded: boolean;
  capabilities: string[];
}

// ─── UI / Internal Types ─────────────────────────────────────────────────────

export type Page =
  | 'overview'
  | 'prediction-lab'
  | 'reaction-properties'
  | 'cancer-impact'
  | 'model-performance'
  | 'dataset-explorer'
  | 'batch-screening'
  | 'methodology';

export type ApiStatus = 'loading' | 'online' | 'offline' | 'error';

// Batch screening row parsed from user-uploaded CSV
export interface BatchRow {
  id: number;
  smiles_1: string;
  smiles_2: string;
  drug_name_1: string;
  drug_name_2: string;
  log_ac50_1: number;
  log_ac50_2: number;
  isValid: boolean;
  validationError?: string;
}

export interface BatchResultRow extends BatchRow {
  result?: SynergyPredictionOutput;
  error?: string;
  status: 'pending' | 'success' | 'error';
}

export interface DrugLibraryItem {
  drug_name: string;
  smiles: string;
  ac50: number;
  classType: string;
}

export interface DrugLibraryResponse {
  total: number;
  drugs: DrugLibraryItem[];
}

export interface ResolvedDrugInfo {
  found: boolean;
  drug_name: string;
  smiles: string;
  ac50: number;
  classType: string;
  source: string;
  molecular_weight?: string | number;
  molecular_formula?: string;
  iupac_name?: string;
}


