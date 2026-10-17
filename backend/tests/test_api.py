"""
Unit and integration tests for FastAPI RESTful endpoints.
"""

import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from fastapi.testclient import TestClient
from backend.app import app


client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"

def test_validated_combos():
    response = client.get("/api/v1/combos/validated?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert "combinations" in data
    assert len(data["combinations"]) > 0

def test_single_prediction():
    payload = {
        "drug_name_1": "Pralatrexate",
        "smiles_1": "NC1=NC(N)=C2N=C(CC(CC#C)C3=CC=C(C=C3)C(=O)N[C@@H](CCC(O)=O)C(O)=O)C=NC2=N1",
        "log_ac50_1": -7.27,
        "drug_name_2": "Daporinad",
        "smiles_2": "O=C(NCCCCC1CCN(CC1)C(=O)C2=CC=CC=C2)\\C=C\\C3=CN=CC=C3",
        "log_ac50_2": -7.53
    }
    response = client.post("/api/v1/predict", json=payload)
    if response.status_code == 200:
        data = response.json()
        assert "predicted_gamma" in data
        assert "is_synergistic" in data
        assert "synergy_classification" in data

def test_server_status():
    response = client.get("/api/v1/server/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert data["default_port"] == 8081

def test_chemical_samples():
    response = client.get("/api/v1/chemical/samples")
    assert response.status_code == 200
    samples = response.json()
    assert len(samples) >= 3

def test_chemical_reaction_and_properties():
    payload = {
        "smiles_1": "CC(=O)O",
        "smiles_2": "CCN",
        "fetch_pubchem": False
    }
    response = client.post("/api/v1/chemical/reaction-predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "compound_1" in data
    assert "compound_2" in data
    assert "predicted_reaction" in data
    # Verify chemical/physical properties
    assert "molecular_weight_g_mol" in data["compound_1"]["rdkit_properties"]
    assert "logp_lipophilicity" in data["compound_1"]["rdkit_properties"]
    # Verify reaction duration/time estimation
    rxn = data["predicted_reaction"]
    assert rxn["status"] == "Reaction predicted successfully"
    assert len(rxn["matched_reactions"]) > 0
    assert "estimated_time" in rxn["matched_reactions"][0]["conditions"]

if __name__ == "__main__":
    print("Running API tests...")
    test_health_endpoint()
    print("Health check passed.")
    test_server_status()
    print("Server status endpoint passed.")
    test_chemical_samples()
    print("Chemical samples passed.")
    test_chemical_reaction_and_properties()
    print("Chemical reaction & properties prediction passed.")
    test_validated_combos()
    print("Validated combos passed.")
    test_single_prediction()
    print("Single prediction passed.")
    print("All API tests completed successfully!")

