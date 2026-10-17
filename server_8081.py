"""
PancSynergy AI - RESTful Backend Server running on Port 8081.
Provides:
  - Chemical & Physical Molecular Properties Calculation (RDKit, Open Babel, PubChem)
  - Reaction Product Prediction & Synthesis Kinetics (Estimated Duration / Time, Temperature, Solvents, Catalysts)
  - USPTO-50K Machine Learning Reaction Classification
  - PANC-1 Chemotherapy Synergy Prediction (Gamma score, High/Moderate/Low Synergy)
"""

import os
import sys
import argparse
import uvicorn

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.app import app
from backend.service import inference_service

def main():
    parser = argparse.ArgumentParser(description="PancSynergy RESTful Backend Server on Port 8081")
    parser.add_argument("--port", type=int, default=8081, help="Port to listen on (default: 8081)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host interface (default: 0.0.0.0)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for development")
    args = parser.parse_args()

    # Preload the synergy ML model if available
    try:
        inference_service.load_model()
    except Exception as e:
        print(f"[Warning] Could not preload synergy model: {e}")

    print("=" * 70)
    print("      PANCSYNERGY RESTFUL API SERVER (PORT 8081)")
    print("=" * 70)
    print(f" -> Active URL:                     http://127.0.0.1:{args.port}")
    print(f" -> API Swagger Documentation:      http://127.0.0.1:{args.port}/docs")
    print(f" -> ReDoc Documentation:            http://127.0.0.1:{args.port}/redoc")
    print(f" -> Health Endpoint:                http://127.0.0.1:{args.port}/health")
    print(f" -> Chemical & Reaction Endpoint:   http://127.0.0.1:{args.port}/api/v1/chemical/reaction-predict")
    print(f" -> Drug Synergy Predict Endpoint:  http://127.0.0.1:{args.port}/api/v1/predict")
    print("=" * 70)

    uvicorn.run(app, host=args.host, port=args.port, reload=args.reload)

if __name__ == "__main__":
    main()
