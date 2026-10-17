"""
Pydantic Schemas for PANC1 Synergy RESTful API.
"""

from typing import List, Optional
from pydantic import BaseModel, Field

class DrugPairInput(BaseModel):
    drug_name_1: Optional[str] = Field(default="Drug A", description="Name of the first compound")
    smiles_1: str = Field(..., description="SMILES string representation of Drug 1")
    log_ac50_1: Optional[float] = Field(default=-6.0, description="Log AC50 (M) single-agent potency for Drug 1")
    
    drug_name_2: Optional[str] = Field(default="Drug B", description="Name of the second compound")
    smiles_2: str = Field(..., description="SMILES string representation of Drug 2")
    log_ac50_2: Optional[float] = Field(default=-6.0, description="Log AC50 (M) single-agent potency for Drug 2")

class BatchDrugPairInput(BaseModel):
    pairs: List[DrugPairInput] = Field(..., description="List of drug combination pairs to predict")

class SynergyPredictionOutput(BaseModel):
    drug_name_1: str
    drug_name_2: str
    predicted_gamma: float = Field(..., description="Predicted synergy score Gamma (lower = stronger synergy)")
    synergy_classification: str = Field(..., description="Synergistic, Additive, or Antagonistic")
    is_synergistic: bool = Field(..., description="True if predicted Gamma < 1.0 (synergy threshold)")
    synergy_strength: str = Field(..., description="High Synergy (Gamma < 0.5), Moderate Synergy (0.5 <= Gamma < 1.0), or Low/None")

class BatchSynergyPredictionOutput(BaseModel):
    total_screened: int
    synergistic_count: int
    predictions: List[SynergyPredictionOutput]

class ModelInfoResponse(BaseModel):
    status: str
    model_name: str
    target_metric: str
    total_training_samples: int
    feature_dimension: int
    champion_metrics: dict
    synergy_threshold: str = "Gamma < 1.0 is Synergistic; Gamma < 0.5 is High Synergy"

class ChemicalReactionInput(BaseModel):
    smiles_1: str = Field(..., description="SMILES string representation of Compound 1")
    smiles_2: str = Field(..., description="SMILES string representation of Compound 2")
    fetch_pubchem: Optional[bool] = Field(default=False, description="Query PubChem online metadata")

