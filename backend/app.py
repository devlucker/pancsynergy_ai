"""
FastAPI RESTful Application for PANC-1 Drug Combination Synergy Prediction.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.schemas import (
    DrugPairInput, 
    BatchDrugPairInput, 
    SynergyPredictionOutput, 
    BatchSynergyPredictionOutput,
    ModelInfoResponse,
    ChemicalReactionInput
)
from backend.service import inference_service
from data.data_loader import load_validated_combos

app = FastAPI(
    title="PANC-1 Drug Combination Synergy Prediction API",
    description="Machine Learning RESTful API for screening and predicting synergy scores (Gamma) of drug combinations in PANC-1 pancreatic cancer cell lines using molecular descriptors.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", tags=["Health"])
def health_check():
    """Verify API service status and model availability."""
    ready = inference_service.is_ready()
    return {
        "status": "online",
        "model_loaded": ready,
        "model_name": inference_service.artifact.get("model_name") if ready else None
    }

@app.get("/api/v1/info", response_model=ModelInfoResponse, tags=["Model Info"])
def get_model_info():
    """Get metadata on the trained champion model, features, and performance metrics."""
    if not inference_service.is_ready():
        raise HTTPException(status_code=503, detail="Model is not yet loaded. Please run model training.")
    
    art = inference_service.artifact
    return ModelInfoResponse(
        status="active",
        model_name=art["model_name"],
        target_metric=art["target"],
        total_training_samples=art["n_samples"],
        feature_dimension=art["feature_dim"],
        champion_metrics=art["metrics"]
    )

@app.post("/api/v1/predict", response_model=SynergyPredictionOutput, tags=["Synergy Prediction"])
def predict_synergy(pair: DrugPairInput):
    """
    Predict synergy score (Gamma) for a single combination pair of compounds.
    Accepts SMILES strings and optional potency (Log AC50).
    """
    if not inference_service.is_ready():
        raise HTTPException(status_code=503, detail="Model is not yet loaded.")
    
    try:
        res = inference_service.predict_pair(
            smiles_1=pair.smiles_1,
            smiles_2=pair.smiles_2,
            log_ac50_1=pair.log_ac50_1 or -6.0,
            log_ac50_2=pair.log_ac50_2 or -6.0
        )
        return SynergyPredictionOutput(
            drug_name_1=pair.drug_name_1,
            drug_name_2=pair.drug_name_2,
            predicted_gamma=res["predicted_gamma"],
            synergy_classification=res["synergy_classification"],
            is_synergistic=res["is_synergistic"],
            synergy_strength=res["synergy_strength"]
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Prediction error: {str(e)}")

@app.post("/api/v1/predict/batch", response_model=BatchSynergyPredictionOutput, tags=["Synergy Prediction"])
def predict_batch_synergy(batch: BatchDrugPairInput):
    """
    High-throughput virtual screening: predict synergy scores for a batch of drug combinations.
    """
    if not inference_service.is_ready():
        raise HTTPException(status_code=503, detail="Model is not yet loaded.")
    
    results = []
    syn_count = 0
    for pair in batch.pairs:
        res = inference_service.predict_pair(
            smiles_1=pair.smiles_1,
            smiles_2=pair.smiles_2,
            log_ac50_1=pair.log_ac50_1 or -6.0,
            log_ac50_2=pair.log_ac50_2 or -6.0
        )
        if res["is_synergistic"]:
            syn_count += 1
            
        results.append(SynergyPredictionOutput(
            drug_name_1=pair.drug_name_1,
            drug_name_2=pair.drug_name_2,
            predicted_gamma=res["predicted_gamma"],
            synergy_classification=res["synergy_classification"],
            is_synergistic=res["is_synergistic"],
            synergy_strength=res["synergy_strength"]
        ))
        
    return BatchSynergyPredictionOutput(
        total_screened=len(batch.pairs),
        synergistic_count=syn_count,
        predictions=results
    )

@app.get("/api/v1/combos/validated", tags=["Dataset Exploration"])
def get_validated_combos(limit: int = 50):
    """
    Retrieve top experimentally validated synergistic drug combinations in PANC-1 from NCATS dataset.
    """
    try:
        df = load_validated_combos()
        # Sort by lowest Gamma (highest synergy)
        df = df.sort_values(by="Gamma", ascending=True).head(limit)
        return {
            "total_validated": len(df),
            "combinations": df.to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

_chemical_pipeline = None

def get_chemical_pipeline():
    global _chemical_pipeline
    if _chemical_pipeline is None:
        from chemical_reaction_predictor import ChemicalPredictionPipeline
        _chemical_pipeline = ChemicalPredictionPipeline()
    return _chemical_pipeline

@app.get("/api/v1/server/status", tags=["System"])
def get_server_status():
    """Returns runtime status and supported capabilities."""
    ready = inference_service.is_ready()
    return {
        "status": "online",
        "service": "PancSynergy Chemical & Synergy RESTful API",
        "version": "1.0.0",
        "default_port": 8081,
        "synergy_model_loaded": ready,
        "capabilities": [
            "Molecular Chemical & Physical Descriptors (RDKit)",
            "Reaction Product & Kinetic Time Estimation (SMARTS & USPTO-50K)",
            "PubChemPy Live Metadata Query",
            "Open Babel 3D SDF Generation",
            "PANC-1 Drug Synergy Prediction"
        ]
    }

@app.get("/api/v1/chemical/samples", tags=["Chemical Reaction Prediction"])
def get_chemical_samples():
    """Provides curated sample reactant pairs with known reaction chemistry."""
    return [
        {
            "id": "amide-coupling",
            "label": "Acetic Acid + Ethylamine",
            "category": "Amide Coupling / Peptide Bond",
            "smiles_1": "CC(=O)O",
            "name_1": "Acetic Acid",
            "smiles_2": "CCN",
            "name_2": "Ethylamine",
            "expected_time": "2 - 6 hours",
            "expected_reaction": "Amide Coupling (Peptide Bond Formation)",
            "description": "Classic condensation forming N-ethylacetamide with high conversion."
        },
        {
            "id": "esterification",
            "label": "Benzoic Acid + Ethanol",
            "category": "Esterification",
            "smiles_1": "C1=CC=C(C=C1)C(=O)O",
            "name_1": "Benzoic Acid",
            "smiles_2": "CCO",
            "name_2": "Ethanol",
            "expected_time": "3 - 8 hours",
            "expected_reaction": "Esterification (Fischer / Steglich)",
            "description": "Acid-catalyzed ester synthesis yielding Ethyl Benzoate."
        },
        {
            "id": "alkylation",
            "label": "Benzyl Chloride + Morpholine",
            "category": "Nucleophilic Substitution",
            "smiles_1": "C1=CC=C(C=C1)CCl",
            "name_1": "Benzyl Chloride",
            "smiles_2": "C1COCCN1",
            "name_2": "Morpholine",
            "expected_time": "4 - 12 hours",
            "expected_reaction": "Nucleophilic Substitution (Amine Alkylation)",
            "description": "Alkylation of secondary amine morpholine with benzyl chloride."
        },
        {
            "id": "sulfonamide",
            "label": "Benzenesulfonyl Chloride + Methylamine",
            "category": "Sulfonamide Synthesis",
            "smiles_1": "C1=CC=C(C=C1)S(=O)(=O)Cl",
            "name_1": "Benzenesulfonyl Chloride",
            "smiles_2": "CN",
            "name_2": "Methylamine",
            "expected_time": "1 - 4 hours",
            "expected_reaction": "Sulfonamide Formation",
            "description": "Rapid nucleophilic displacement forming N-methylbenzenesulfonamide."
        },
        {
            "id": "chemo-duo",
            "label": "Gemcitabine + Cisplatin",
            "category": "PANC-1 Clinical Standard",
            "smiles_1": "C1=CN(C(=O)N=C1N)[C@H]2C([C@@H]([C@H](O2)CO)O)(F)F",
            "name_1": "Gemcitabine (dFdC)",
            "smiles_2": "N.N.[Cl-].[Cl-].[Pt+2]",
            "name_2": "Cisplatin",
            "expected_time": "Combination regimen (clinical synergy)",
            "expected_reaction": "Multi-agent DNA replication inhibition & crosslinking",
            "description": "Standard of care chemotherapeutic combination for pancreatic adenocarcinoma."
        }
    ]

@app.post("/api/v1/chemical/reaction-predict", tags=["Chemical Reaction Prediction"])
@app.post("/api/v1/reaction/predict", tags=["Chemical Reaction Prediction"])
def predict_chemical_reaction_api(input_data: ChemicalReactionInput):
    """
    Predict physical & chemical properties, reaction feasibility, products, duration (estimated time), 
    and recommended synthetic steps for two reactant SMILES using RDKit, PubChemPy, 
    Open Babel, and the trained USPTO ML model.
    """
    try:
        pipeline = get_chemical_pipeline()
        result = pipeline.analyze_two_compounds(
            input_data.smiles_1.strip(), 
            input_data.smiles_2.strip(), 
            fetch_pubchem=bool(input_data.fetch_pubchem)
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Chemical prediction failed: {str(e)}")

import json
import urllib.request
import urllib.parse
from pathlib import Path

DRUG_LIB_FILE = Path(__file__).resolve().parent.parent / "data" / "all_panc1_drugs.json"

@app.get("/api/v1/drugs/library", tags=["Drug Library"])
def get_drug_library():
    """Returns the full catalog of curated PANC-1 oncology drugs, SMILES, and Log AC50 potencies."""
    if DRUG_LIB_FILE.exists():
        try:
            with open(DRUG_LIB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            return {
                "total": len(data),
                "drugs": list(data.values())
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to read drug library: {str(e)}")
    return {"total": 0, "drugs": []}

@app.get("/api/v1/chemical/resolve-smiles", tags=["Chemical Reaction Prediction"])
def resolve_drug_smiles(query: str):
    """
    Dynamically resolve SMILES chemical formula from any drug or compound name.
    1. First checks local PANC-1 curated dataset (instant).
    2. If not found locally, queries PubChem live PUG REST API.
    3. Fallback to NIH Cactus Chemical Identifier Resolver.
    """
    clean_q = query.strip()
    if not clean_q:
        raise HTTPException(status_code=400, detail="Query string cannot be empty")
        
    # 1. Local PANC-1 drug library lookup
    if DRUG_LIB_FILE.exists():
        try:
            with open(DRUG_LIB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Exact match or case-insensitive match
            for key, info in data.items():
                if key.lower() == clean_q.lower() or info.get("drug_name", "").lower() == clean_q.lower():
                    return {
                        "found": True,
                        "drug_name": info.get("drug_name", key),
                        "smiles": info.get("smiles"),
                        "ac50": info.get("ac50", -6.0),
                        "classType": info.get("classType", "Oncology Agent"),
                        "source": "PANC-1 Curated Dataset"
                    }
            # Partial substring match in local library
            for key, info in data.items():
                if clean_q.lower() in key.lower() or clean_q.lower() in info.get("drug_name", "").lower():
                    return {
                        "found": True,
                        "drug_name": info.get("drug_name", key),
                        "smiles": info.get("smiles"),
                        "ac50": info.get("ac50", -6.0),
                        "classType": info.get("classType", "Oncology Agent"),
                        "source": "PANC-1 Curated Dataset (Matched)"
                    }
        except Exception:
            pass

    # 2. Live PubChem PUG REST API
    try:
        encoded_name = urllib.parse.quote(clean_q)
        url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{encoded_name}/property/CanonicalSMILES,ConnectivitySMILES,MolecularWeight,MolecularFormula,IUPACName/JSON"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (PancSynergy/1.0)"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            props = data["PropertyTable"]["Properties"][0]
            smi = props.get("ConnectivitySMILES") or props.get("CanonicalSMILES")
            if smi:
                return {
                    "found": True,
                    "drug_name": clean_q.title(),
                    "smiles": smi,
                    "ac50": -6.0,
                    "classType": "PubChem Resolved Compound",
                    "source": "PubChem Live API",
                    "molecular_weight": props.get("MolecularWeight"),
                    "molecular_formula": props.get("MolecularFormula"),
                    "iupac_name": props.get("IUPACName")
                }
    except Exception:
        pass

    # 3. Fallback to NIH Cactus
    try:
        cactus_url = f"https://cactus.nci.nih.gov/chemical/structure/{urllib.parse.quote(clean_q)}/smiles"
        req = urllib.request.Request(cactus_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=4) as resp:
            smi = resp.read().decode("utf-8").strip()
            if smi and not smi.startswith("<h1>") and len(smi) >= 3:
                return {
                    "found": True,
                    "drug_name": clean_q.title(),
                    "smiles": smi,
                    "ac50": -6.0,
                    "classType": "NIH Cactus Resolved",
                    "source": "NIH Cactus Chemical Resolver"
                }
    except Exception:
        pass

    raise HTTPException(
        status_code=404, 
        detail=f"Could not resolve SMILES for '{clean_q}'. Please enter or paste the valid SMILES structure manually."
    )



