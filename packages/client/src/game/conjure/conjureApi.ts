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

export type ConjurePlaceRequest = {
  assetId?: string;
  prompt?: string;
  position: { x: number; y: number; z: number };
  modelScale?: number;
};

export type ConjurePlaceResponse = {
  entityId: string;
  conjureId: string;
  itemId: string;
  modelUrl: string;
  position: { x: number; y: number; z: number };
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

export async function placeConjure(
  conjureId: string,
  request: ConjurePlaceRequest,
): Promise<ConjurePlaceResponse> {
  const response = await apiClient.post<ConjurePlaceResponse>(
    `/api/conjure/${encodeURIComponent(conjureId)}/place`,
    request,
    {
      includeAuth: true,
      showErrorNotification: true,
      errorContext: "placing conjure",
    },
  );

  if (!response.ok || !response.data) {
    throw new Error(response.error || "Failed to place conjure");
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
