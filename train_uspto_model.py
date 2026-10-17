"""
USPTO-50K Chemical Reaction Model Trainer
=========================================
Trains a machine learning model on the USPTO-50K dataset to classify reaction pathways
and predict reaction feasibility, optimal reaction conditions, and products for two chemical compound SMILES.

Reaction Classes in USPTO-50K:
 1: Heteroatom alkylation and arylation
 2: Acylation and related processes (e.g., Amide coupling, Esterification)
 3: C-C bond formation (e.g., Suzuki, Heck, Grignard)
 4: Heterocycle formation
 5: Protections
 6: Deprotections
 7: Reductions
 8: Oxidations
 9: Functional group interconversion (FGI)
 10: Functional group addition (FGA)
"""

import os
import sys
import time
import pickle
import logging
import numpy as np
import pandas as pd
from typing import Tuple, List, Optional

from sklearn.model_selection import train_test_split
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score, top_k_accuracy_score

import rdkit
from rdkit import Chem
from rdkit.Chem import rdMolDescriptors, Descriptors

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# USPTO-50K Standard Class Labels & Typical Conditions
USPTO_CLASS_NAMES = {
    1: "Heteroatom Alkylation / Arylation",
    2: "Acylation and Related Processes (Amide/Ester)",
    3: "C-C Bond Formation (Cross-coupling/Condensation)",
    4: "Heterocycle Formation",
    5: "Protections",
    6: "Deprotections",
    7: "Reductions",
    8: "Oxidations",
    9: "Functional Group Interconversion (FGI)",
    10: "Functional Group Addition (FGA)"
}

CLASS_CONDITIONS = {
    1: {
        "temperature": "50 - 80 °C",
        "solvent": "Acetonitrile (MeCN) or DMF",
        "catalyst_reagents": "K2CO3, Cs2CO3, or TEA; optional catalytic NaI/KI",
        "estimated_time": "4 - 12 hours",
        "expected_yield": "70 - 88%"
    },
    2: {
        "temperature": "0 °C to 25 °C (ambient)",
        "solvent": "Dichloromethane (DCM) or DMF",
        "catalyst_reagents": "HATU/EDC·HCl with DIPEA or DMAP",
        "estimated_time": "2 - 6 hours",
        "expected_yield": "80 - 95%"
    },
    3: {
        "temperature": "70 - 110 °C",
        "solvent": "1,4-Dioxane / Water or Toluene / EtOH",
        "catalyst_reagents": "Pd(dppf)Cl2 or Pd(PPh3)4 with K2CO3 / Na2CO3 (Suzuki-Miyaura)",
        "estimated_time": "6 - 16 hours",
        "expected_yield": "65 - 85%"
    },
    4: {
        "temperature": "80 - 140 °C",
        "solvent": "Toluene, Ethanol, or Acetic acid",
        "catalyst_reagents": "Acid catalyst (p-TsOH, AcOH) or Lewis acid",
        "estimated_time": "6 - 24 hours",
        "expected_yield": "60 - 82%"
    },
    5: {
        "temperature": "0 - 25 °C",
        "solvent": "DCM or THF",
        "catalyst_reagents": "Boc2O / Cbz-Cl / TBS-Cl with DMAP / Imidazole",
        "estimated_time": "2 - 8 hours",
        "expected_yield": "85 - 98%"
    },
    6: {
        "temperature": "0 - 25 °C",
        "solvent": "DCM or MeOH / Water",
        "catalyst_reagents": "TFA / HCl (for Boc/tBu) or H2/Pd-C (for Cbz/Bn)",
        "estimated_time": "1 - 4 hours",
        "expected_yield": "90 - 99%"
    },
    7: {
        "temperature": "0 - 50 °C",
        "solvent": "Methanol, THF, or Ethanol",
        "catalyst_reagents": "NaBH4, NaBH(OAc)3, LiAlH4, or H2 on Pd/C",
        "estimated_time": "2 - 8 hours",
        "expected_yield": "75 - 92%"
    },
    8: {
        "temperature": "0 - 25 °C",
        "solvent": "DCM, Water / Acetone",
        "catalyst_reagents": "mCPBA, Dess-Martin Periodinane (DMP), or KMnO4",
        "estimated_time": "2 - 6 hours",
        "expected_yield": "70 - 90%"
    },
    9: {
        "temperature": "25 - 80 °C",
        "solvent": "THF, DMF, or Pyridine",
        "catalyst_reagents": "SOCl2, PBr3, MsCl, or TsCl with base",
        "estimated_time": "3 - 8 hours",
        "expected_yield": "75 - 90%"
    },
    10: {
        "temperature": "0 - 65 °C",
        "solvent": "THF or Dichloromethane",
        "catalyst_reagents": "Lewis acid or Organometallic nucleophile",
        "estimated_time": "4 - 12 hours",
        "expected_yield": "65 - 85%"
    }
}


def get_morgan_fp(mol: Chem.Mol, n_bits: int = 512, radius: int = 2) -> np.ndarray:
    """Computes fixed-length Morgan fingerprint bit vector for a molecule."""
    arr = np.zeros((n_bits,), dtype=np.float32)
    if mol is None:
        return arr
    try:
        fp = rdMolDescriptors.GetMorganFingerprintAsBitVect(mol, radius, nBits=n_bits)
        for i in fp.GetOnBits():
            arr[i] = 1.0
    except Exception:
        pass
    return arr


def get_physicochemical_features(mol: Chem.Mol) -> np.ndarray:
    """Computes key physical and chemical property descriptors."""
    if mol is None:
        return np.zeros(7, dtype=np.float32)
    try:
        mw = Descriptors.MolWt(mol)
        logp = Descriptors.MolLogP(mol)
        tpsa = Descriptors.TPSA(mol)
        hbd = Descriptors.NumHDonors(mol)
        hba = Descriptors.NumHAcceptors(mol)
        rot_bonds = Descriptors.NumRotatableBonds(mol)
        rings = Descriptors.RingCount(mol)
        return np.array([mw, logp, tpsa, hbd, hba, rot_bonds, rings], dtype=np.float32)
    except Exception:
        return np.zeros(7, dtype=np.float32)


def featurize_reactant_pair(smiles1: str, smiles2: str, n_bits: int = 512) -> np.ndarray:
    """
    Featurizes two reactant SMILES into an order-invariant (symmetric) feature vector.
    Order invariance ensures (A + B) produces the exact same reaction prediction as (B + A).
    """
    m1 = Chem.MolFromSmiles(smiles1)
    m2 = Chem.MolFromSmiles(smiles2) if smiles2 else None

    fp1 = get_morgan_fp(m1, n_bits=n_bits)
    desc1 = get_physicochemical_features(m1)

    if m2 is not None:
        fp2 = get_morgan_fp(m2, n_bits=n_bits)
        desc2 = get_physicochemical_features(m2)
    else:
        fp2 = np.zeros_like(fp1)
        desc2 = np.zeros_like(desc1)

    # Order-invariant representation: sum, absolute difference, and element-wise product
    fp_sum = fp1 + fp2
    fp_diff = np.abs(fp1 - fp2)
    fp_prod = fp1 * fp2

    desc_sum = desc1 + desc2
    desc_diff = np.abs(desc1 - desc2)

    return np.concatenate([fp_sum, fp_diff, fp_prod, desc_sum, desc_diff])


def prepare_dataset(csv_path: str, max_samples: int = 25000, n_bits: int = 512) -> Tuple[np.ndarray, np.ndarray]:
    """Loads USPTO_50K dataset and featurizes reaction reactants."""
    logger.info(f"Loading USPTO-50K dataset from {csv_path}...")
    df = pd.read_csv(csv_path)

    if len(df) > max_samples:
        logger.info(f"Subsampling {max_samples} balanced reactions for efficient training...")
        df, _ = train_test_split(df, train_size=max_samples, stratify=df["class"], random_state=42)
        df = df.reset_index(drop=True)

    X_list = []
    y_list = []

    logger.info(f"Extracting chemical features and reaction pairs for {len(df)} entries...")
    start_time = time.time()

    for idx, row in df.iterrows():
        rxn_str = row["reactions"]
        cls_label = int(row["class"])

        # Split reactants>>products
        parts = rxn_str.split(">>")
        if not parts or not parts[0]:
            continue

        reactants_part = parts[0]
        # Split individual reactant SMILES
        reactants = [r.strip() for r in reactants_part.split(".") if r.strip()]

        if len(reactants) >= 2:
            # Sort by heavy atom length to pick the two primary organic components
            reactants.sort(key=lambda s: len(s), reverse=True)
            r1, r2 = reactants[0], reactants[1]
        elif len(reactants) == 1:
            r1, r2 = reactants[0], ""
        else:
            continue

        feat = featurize_reactant_pair(r1, r2, n_bits=n_bits)
        X_list.append(feat)
        y_list.append(cls_label)

        if (idx + 1) % 5000 == 0:
            elapsed = time.time() - start_time
            logger.info(f"Processed {idx + 1} / {len(df)} samples ({elapsed:.1f}s)")

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.int64)
    logger.info(f"Featurization completed: Feature shape {X.shape}, Labels shape {y.shape}")
    return X, y


def train_and_save_model(csv_path: str, output_model_path: str, max_samples: int = 25000):
    """Trains the USPTO-50K reaction classifier and saves the artifact."""
    X, y = prepare_dataset(csv_path, max_samples=max_samples, n_bits=512)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.15, random_state=42, stratify=y
    )

    logger.info("Training HistGradientBoostingClassifier on USPTO-50K reaction dataset...")
    # Fast, multi-class histogram gradient booster with native early stopping
    model = HistGradientBoostingClassifier(
        max_iter=150,
        learning_rate=0.1,
        max_leaf_nodes=31,
        early_stopping=True,
        random_state=42
    )

    t0 = time.time()
    model.fit(X_train, y_train)
    train_time = time.time() - t0
    logger.info(f"Model training finished in {train_time:.1f}s")

    # Evaluation
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)

    acc = accuracy_score(y_test, y_pred)
    top2_acc = top_k_accuracy_score(y_test, y_prob, k=2, labels=model.classes_)
    top3_acc = top_k_accuracy_score(y_test, y_prob, k=3, labels=model.classes_)

    logger.info(f"Test Accuracy: {acc * 100:.2f}%")
    logger.info(f"Top-2 Accuracy: {top2_acc * 100:.2f}%")
    logger.info(f"Top-3 Accuracy: {top3_acc * 100:.2f}%")

    report = classification_report(
        y_test, y_pred,
        labels=model.classes_,
        target_names=[f"Class {c}: {USPTO_CLASS_NAMES.get(c, '')[:20]}" for c in model.classes_]
    )
    print("\n" + "=" * 70)
    print("           USPTO-50K CLASSIFICATION REPORT")
    print("=" * 70)
    print(report)

    # Save model payload
    payload = {
        "model": model,
        "classes": model.classes_,
        "class_names": USPTO_CLASS_NAMES,
        "class_conditions": CLASS_CONDITIONS,
        "metrics": {
            "test_accuracy": float(acc),
            "top2_accuracy": float(top2_acc),
            "top3_accuracy": float(top3_acc),
            "training_samples": len(X_train)
        }
    }

    os.makedirs(os.path.dirname(output_model_path), exist_ok=True)
    with open(output_model_path, "wb") as f:
        pickle.dump(payload, f)
    logger.info(f"Trained model saved successfully to: {output_model_path}")


if __name__ == "__main__":
    raw_csv = os.path.join("data", "raw", "USPTO_50K.csv")
    out_model = os.path.join("saved_models", "uspto_reaction_model.pkl")

    if not os.path.exists(raw_csv):
        print(f"Error: {raw_csv} not found.")
        sys.exit(1)

    train_and_save_model(raw_csv, out_model, max_samples=15000)
