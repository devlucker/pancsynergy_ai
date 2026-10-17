import type {
  HealthResponse,
  ModelInfoResponse,
  DrugPairInput,
  SynergyPredictionOutput,
  BatchDrugPairInput,
  BatchSynergyPredictionOutput,
  ValidatedCombosResponse,
  ChemicalReactionInput,
  ChemicalPredictionResponse,
  ChemicalSamplePair,
  ServerStatusResponse,
  DrugLibraryResponse,
  ResolvedDrugInfo,
} from '@/types';

// Default to port 8081 if set in localStorage or environment, otherwise 8081 with fallback
const STORAGE_KEY = 'pancsynergy_api_url';
let currentBaseUrl =
  (typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY)) ||
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  'http://127.0.0.1:8081';

export function getApiBaseUrl(): string {
  return currentBaseUrl;
}

export function setApiBaseUrl(url: string): void {
  currentBaseUrl = url.replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, currentBaseUrl);
  }
}

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit, overrideBaseUrl?: string): Promise<T> {
  const base = overrideBaseUrl ? overrideBaseUrl.replace(/\/+$/, '') : currentBaseUrl;
  const url = `${base}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    });
  } catch (err) {
    throw new ApiError(0, `Network error: cannot reach ${url}`, String(err));
  }

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail;
    } catch {
      // ignore JSON parse failure
    }
    throw new ApiError(
      response.status,
      detail ?? `HTTP ${response.status} ${response.statusText}`,
      detail,
    );
  }

  return response.json() as Promise<T>;
}

// ─── Endpoint wrappers ────────────────────────────────────────────────────────

export const api = {
  health(overrideBaseUrl?: string): Promise<HealthResponse> {
    return request<HealthResponse>('/health', undefined, overrideBaseUrl);
  },

  modelInfo(overrideBaseUrl?: string): Promise<ModelInfoResponse> {
    return request<ModelInfoResponse>('/api/v1/info', undefined, overrideBaseUrl);
  },

  predict(pair: DrugPairInput, overrideBaseUrl?: string): Promise<SynergyPredictionOutput> {
    return request<SynergyPredictionOutput>('/api/v1/predict', {
      method: 'POST',
      body: JSON.stringify(pair),
    }, overrideBaseUrl);
  },

  predictBatch(batch: BatchDrugPairInput, overrideBaseUrl?: string): Promise<BatchSynergyPredictionOutput> {
    return request<BatchSynergyPredictionOutput>('/api/v1/predict/batch', {
      method: 'POST',
      body: JSON.stringify(batch),
    }, overrideBaseUrl);
  },

  validatedCombos(limit = 307, overrideBaseUrl?: string): Promise<ValidatedCombosResponse> {
    return request<ValidatedCombosResponse>(`/api/v1/combos/validated?limit=${limit}`, undefined, overrideBaseUrl);
  },

  // ─── Chemical & Reaction Prediction Endpoints ───

  predictReaction(input: ChemicalReactionInput, overrideBaseUrl?: string): Promise<ChemicalPredictionResponse> {
    return request<ChemicalPredictionResponse>('/api/v1/chemical/reaction-predict', {
      method: 'POST',
      body: JSON.stringify(input),
    }, overrideBaseUrl);
  },

  fetchChemicalSamples(overrideBaseUrl?: string): Promise<ChemicalSamplePair[]> {
    return request<ChemicalSamplePair[]>('/api/v1/chemical/samples', undefined, overrideBaseUrl);
  },

  fetchServerStatus(overrideBaseUrl?: string): Promise<ServerStatusResponse> {
    return request<ServerStatusResponse>('/api/v1/server/status', undefined, overrideBaseUrl);
  },

  fetchDrugLibrary(overrideBaseUrl?: string): Promise<DrugLibraryResponse> {
    return request<DrugLibraryResponse>('/api/v1/drugs/library', undefined, overrideBaseUrl);
  },

  resolveSmiles(query: string, overrideBaseUrl?: string): Promise<ResolvedDrugInfo> {
    const encoded = encodeURIComponent(query.trim());
    return request<ResolvedDrugInfo>(`/api/v1/chemical/resolve-smiles?query=${encoded}`, undefined, overrideBaseUrl);
  },

  async pingEndpoint(url: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = performance.now();
    try {
      const res = await fetch(`${url.replace(/\/+$/, '')}/health`, { method: 'GET' });
      const latencyMs = Math.round(performance.now() - start);
      return { ok: res.ok, latencyMs };
    } catch (e) {
      return { ok: false, latencyMs: 0, error: String(e) };
    }
  }
};

export { ApiError };
export const BASE_URL = currentBaseUrl;
