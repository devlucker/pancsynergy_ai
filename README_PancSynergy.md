# PancSynergy AI

### Machine-learning-assisted screening of drug-combination synergy in PANC-1 pancreatic cancer cells

PancSynergy AI is a research-oriented application for estimating drug-combination synergy scores (Gamma, **Γ**) for pairs of compounds in the PANC-1 pancreatic cancer cell-line context. It combines molecular representations and single-agent potency inputs with a trained regression model, then presents predictions and dataset/model information through a web dashboard and REST API.

> **Research-use notice:** PancSynergy provides computational estimates from in-vitro data. Predictions are not experimental confirmation, clinical evidence, or medical advice. All candidate combinations require appropriate laboratory validation before any biological or clinical conclusions are drawn.

## Table of contents

- [Features](#features)
- [How it works](#how-it-works)
- [Gamma interpretation](#gamma-interpretation)
- [Technology stack](#technology-stack)
- [Repository structure](#repository-structure)
- [Setup and run](#setup-and-run)
- [REST API](#rest-api)
- [Model evaluation](#model-evaluation)
- [Data and reproducibility](#data-and-reproducibility)
- [Known limitations](#known-limitations)
- [Responsible use](#responsible-use)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Single-pair prediction:** submit two drug names, SMILES strings, and Log AC50 potency inputs to estimate Gamma.
- **Batch screening:** submit multiple candidate pairs through the batch API and review returned scores.
- **Validated-combination explorer:** inspect combinations from the NCATS PANC1 benchmark dataset.
- **Model-performance dashboard:** review cross-validation and held-out test metrics reported by the trained model artifact.
- **Dataset explorer:** view summary statistics and distributions for the available combination records.
- **Methodology page:** review the documented feature-engineering and modelling workflow.
- **REST API:** use the prediction and metadata endpoints directly or through the web frontend.

## How it works

1. **Input compounds.** Each drug is represented by a SMILES string and a single-agent potency value (`Log AC50 (M)`). Drug names are labels; the molecular structure and potency inputs feed the prediction pipeline.
2. **Extract molecular features.** SMILES strings are converted into Morgan/ECFP fingerprints (256 bits) and physicochemical descriptors such as molecular weight, LogP, TPSA, hydrogen-bond donors/acceptors, rotatable bonds, and ring counts. The implementation documents a 266-value vector per compound (256 fingerprint bits plus 10 descriptors).
3. **Build a symmetric pair representation.** The documented pair vector combines the per-drug vectors using element-wise sum, absolute difference, and element-wise product, plus four potency summary values. This is intended to make the representation independent of the order in which Drug A and Drug B are entered.
4. **Predict Gamma.** A trained regression model estimates a continuous Gamma value for the pair.
5. **Interpret the score.** The API returns the predicted score and its threshold-based classification. A model prediction should be treated as a candidate-screening signal, not an experimentally validated result.

The intended order-invariant pair-feature structure is:

```text
x_pair = [v_A + v_B,
          abs(v_A - v_B),
          v_A * v_B,
          min(p_A, p_B),
          max(p_A, p_B),
          abs(p_A - p_B),
          p_A + p_B]
```

Here, `v_A` and `v_B` are the compound feature vectors, and `p_A` and `p_B` are their Log AC50 inputs. The project documents 802 total pair features: three 266-dimensional symmetric feature blocks (798 values) and four potency-summary features.

## Gamma interpretation

The current inference service uses these ranges:

| Predicted Gamma (Γ) | API classification | Interpretation returned by API |
|---|---|---|
| `Γ < 0.5` | Synergistic | High Synergy |
| `0.5 ≤ Γ < 1.0` | Synergistic | Moderate Synergy |
| `1.0 ≤ Γ < 1.5` | Additive / Weak | Low / Additive |
| `Γ ≥ 1.5` | Antagonistic | Antagonistic |

The API marks a prediction as synergistic when `Γ < 1.0`. Lower Gamma values are interpreted as stronger synergy under this benchmark's definition. These labels describe the model's output; they do not establish statistical significance or laboratory confirmation.

## Technology stack

**Backend and modelling**

- Python
- FastAPI and Uvicorn
- Pydantic
- NumPy and pandas
- scikit-learn and SciPy
- RDKit for molecular representations/descriptors
- joblib for serialized model artifacts

**Frontend**

- React and TypeScript
- Vite
- Tailwind CSS
- Recharts for charts
- PapaParse for CSV handling
- Lucide React icons

## Repository structure

```text
pancsynergy_ai/
├── backend/          # FastAPI application, schemas, and prediction service
├── data/             # Dataset ingestion and generated raw/processed data
├── frontend/         # React + TypeScript web dashboard
├── models/           # Molecular feature extraction, training, and evaluation
├── saved_models/     # Serialized trained model artifact(s), when available
├── run_all.py        # Data checks, training/evaluation, API tests, and server startup
├── requirements.txt  # Python dependencies
├── start.bat         # Windows startup helper
└── README.md
```

The data loader can download the required NCATS source CSV files into `data/raw/` when they are missing. Processed data are written beneath `data/processed/`.

Dataset source: [NCATS PANC1 dataset](https://github.com/ncats/PANC1/tree/main/datasets).

## Setup and run

### Prerequisites

- Python 3 with a version supported by the listed dependencies, including RDKit.
- Node.js and npm for the frontend.
- Internet access for downloading source datasets when they are not already present.

### 1. Clone the repository

```bash
git clone https://github.com/devlucker/pancsynergy_ai.git
cd pancsynergy_ai
```

### 2. Create a Python environment and install dependencies

**macOS / Linux**

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

**Windows PowerShell**

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If PowerShell blocks environment activation, use Command Prompt and run `.venv\Scripts\activate.bat`, or follow your local Python environment policy. The dependency installation command is the same once the environment is active:

```bash
python -m pip install -r requirements.txt
```

### 3. Start the backend and model pipeline

From the repository root, with the virtual environment active:

```bash
python -u run_all.py
```

The orchestration script checks/downloads datasets, prepares the training data, trains and benchmarks the candidate models (unless training is explicitly skipped), loads the selected model, runs API self-tests, and starts the FastAPI server. First-time execution can take a while because model training and data preparation may run.

If a compatible trained artifact already exists at `saved_models/best_synergy_model.pkl`, training can be skipped:

```bash
python -u run_all.py --skip-training
```

To run the pipeline checks and API self-tests without leaving a persistent server running:

```bash
python -u run_all.py --test-only
```

`--test-only` does not automatically skip training. Combine it with `--skip-training` only when the saved model artifact exists and is compatible:

```bash
python -u run_all.py --skip-training --test-only
```

By default, the API binds to `127.0.0.1:8000`. The runner can select another available port if the preferred port is already occupied; use the URL printed in the Terminal output.

### 4. Open the API documentation

With the backend running, open the URL printed in Terminal. The default local addresses are:

- Swagger UI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- ReDoc: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
- Health check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

### 5. Start the frontend

Open a **second Terminal window** while the backend continues running:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

The frontend configuration file `frontend/.env.local` should contain the backend base URL, without a trailing slash:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Open the local URL printed by Vite (commonly `http://localhost:5173`). If the backend selected a different port, update `VITE_API_BASE_URL` in `frontend/.env.local` to match the backend URL and restart the frontend dev server.

Other frontend scripts, run from `frontend/`:

```bash
npm run build   # TypeScript project build and Vite production build
npm run lint    # ESLint checks
npm run preview # Preview the built frontend
```

## REST API

The following endpoints are defined by the backend:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | API status and whether the model is loaded |
| `GET` | `/api/v1/info` | Model metadata, feature dimension, training sample count, and metrics |
| `POST` | `/api/v1/predict` | Predict Gamma for one drug pair |
| `POST` | `/api/v1/predict/batch` | Predict Gamma for a list of pairs |
| `GET` | `/api/v1/combos/validated?limit=50` | Retrieve validated combinations, ordered by lower Gamma |

Interactive request/response schemas are available at `/docs` while the backend is running.

### Example prediction request

```json
{
  "drug_name_1": "Pralatrexate",
  "smiles_1": "NC1=NC(N)=C2N=C(CC(CC#C)C3=CC=C(C=C3)C(=O)N[C@@H](CCC(O)=O)C(O)=O)C=NC2=N1",
  "log_ac50_1": -7.27,
  "drug_name_2": "Daporinad",
  "smiles_2": "O=C(NCCCCC1CCN(CC1)C(=O)C2=CC=CC=C2)\\C=C\\C3=CN=CC=C3",
  "log_ac50_2": -7.53
}
```

Send it to `POST /api/v1/predict` as JSON. Example response shape:

```json
{
  "drug_name_1": "Pralatrexate",
  "drug_name_2": "Daporinad",
  "predicted_gamma": 0.8421,
  "synergy_classification": "Synergistic",
  "is_synergistic": true,
  "synergy_strength": "Moderate Synergy"
}
```

The numeric value above is an **illustrative response example**, not a guarantee of the output you will receive. Actual results depend on the model artifact, input structures, potency inputs, and preprocessing.

For batch prediction, send a JSON body containing a `pairs` array with the same fields as a single-pair request:

```json
{
  "pairs": [
    {
      "drug_name_1": "Drug A",
      "smiles_1": "VALID_SMILES_FOR_DRUG_A",
      "log_ac50_1": -6.0,
      "drug_name_2": "Drug B",
      "smiles_2": "VALID_SMILES_FOR_DRUG_B",
      "log_ac50_2": -6.0
    }
  ]
}
```

Replace the placeholder strings with valid molecular SMILES before sending the request.

## Model evaluation

The project explores regularized linear models (Ridge, Lasso, and ElasticNet), tree ensembles (including Random Forest, Extra Trees, and Gradient Boosting variants), and a Multi-Layer Perceptron. Candidate models are evaluated using five-fold cross-validation and a held-out test split. The selected model and evaluation metrics are stored with the saved model artifact and exposed by `GET /api/v1/info`.

The current dashboard has displayed the following metrics; rerun the pipeline and check `/api/v1/info` for values from the model artifact you're actually using.

| Metric | 5-fold CV mean | Held-out test |
|---|---:|---:|
| Pearson correlation | 0.5818 | 0.8016 |
| Spearman rank correlation | 0.5210 | 0.7188 |
| R² | 0.3168 | 0.5710 |
| RMSE | 0.1241 | 0.1147 |
| MAE | 0.0880 | 0.0812 |

These figures summarize predictive agreement for the reported evaluation setup. They do not, by themselves, prove generalization to every compound class or experimental setting. For rigorous validation, inspect the data split and model-selection procedure and check for related combinations across splits.

## Data and reproducibility

- The project uses the NCATS PANC1 dataset source linked above.
- If raw files are missing, the data-loader attempts to retrieve the required CSV files and saves them under `data/raw/`.
- `run_all.py` runs preprocessing/training and API self-tests. Re-running it without `--skip-training` can retrain the model and update the saved artifact/metrics.
- Keep the raw data, dependency versions, model artifact, and reported metrics aligned when reproducing results.

## Known limitations

- The model is built around PANC-1 in-vitro combination data; predictions should not be assumed to generalize to other cell lines, in-vivo experiments, or patients.
- Predictions are point estimates. The application does not provide calibrated prediction intervals or a guarantee of confidence.
- Results depend on correct SMILES, potency values, feature generation, the training data, and the serialized model version.
- A Gamma-based classification is a model interpretation, not proof of a biological mechanism, statistical significance, safety, or clinical efficacy.
- Candidate combinations require experimental validation before biological conclusions are made.

## Responsible use

PancSynergy AI is intended for computational research and educational demonstration only. It is not a diagnostic tool and must not be used to make clinical treatment decisions.

## Contributing

Issues and pull requests are welcome. When proposing changes, please describe the scientific or engineering motivation and include relevant testing or reproducibility information.

## License

No license file is currently included in this repository. Add an appropriate license before inviting others to reuse, modify, or redistribute the code.
