import { apiClient } from "@/lib/api-client";

export type ConjureStartRequest = {
  prompt: string;
  speechTranscript?: string;
  type?: string;
  subtype?: string;
  quality?: string;
};

export type ConjureStartResponse = {
  conjureId?: string;
  assetId: string;
  status: string;
  message: string;
  prompt: string;
  speechTranscript?: string;
};

export type ConjureStatusResponse = {
  conjureId: string;
  status: string;
  progress: number;
  stages?: unknown;
  results: Record<string, unknown>;
  modelUrl: string | null;
  localPath: string | null;
  error?: string;
  createdAt?: string;
  completedAt?: string;
};

export async function startConjure(
  request: ConjureStartRequest,
): Promise<ConjureStartResponse> {
  const response = await apiClient.post<ConjureStartResponse>(
    "/api/conjure",
    request,
    {
      includeAuth: true,
      showErrorNotification: true,
      errorContext: "starting conjure",
    },
  );

  if (!response.ok || !response.data) {
    throw new Error(response.error || "Failed to start conjure");
  }

  return response.data;
}

export async function getConjureStatus(
  conjureId: string,
): Promise<ConjureStatusResponse> {
  const response = await apiClient.get<ConjureStatusResponse>(
    `/api/conjure/${encodeURIComponent(conjureId)}`,
    {
      includeAuth: true,
      showErrorNotification: false,
    },
  );

  if (!response.ok || !response.data) {
    throw new Error(response.error || "Failed to load conjure status");
  }

  return response.data;
}
