import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { IncomingHttpHeaders } from "node:http";
import type { DatabaseSystem } from "../systems/DatabaseSystem/index.js";
import { storage } from "../database/schema.js";
import type { StreamCanonicalProvider } from "./delivery-config.js";

type StorageDb = ReturnType<DatabaseSystem["getDb"]>;

export const CANONICAL_PROVIDER_STATE_STORAGE_KEY =
  "streaming:canonical-provider-state";
export const CLOUDFLARE_LIFECYCLE_STORAGE_KEY =
  "streaming:cloudflare:lifecycle";
export const CLOUDFLARE_LAST_WEBHOOK_STORAGE_KEY =
  "streaming:cloudflare:last-webhook";

export type PersistedCanonicalProviderState = {
  activeProvider: StreamCanonicalProvider | null;
  primaryHealthySince: number | null;
  updatedAt: number;
};

export type PersistedCloudflareLifecycleState = {
  eventType: string | null;
  eventName: string | null;
  liveInputId: string | null;
  videoId: string | null;
  status: "connected" | "disconnected" | "errored" | "unknown";
  errorCode: string | null;
  errorMessage: string | null;
  occurredAt: number | null;
  receivedAt: number;
};

export type PersistedCloudflareWebhookState = {
  eventType: string | null;
  eventName: string | null;
  liveInputId: string | null;
  videoId: string | null;
  occurredAt: number | null;
  receivedAt: number;
};

export type PersistedStreamingAuthorityState = {
  canonicalProviderState: PersistedCanonicalProviderState | null;
  cloudflareLifecycle: PersistedCloudflareLifecycleState | null;
  cloudflareLastWebhook: PersistedCloudflareWebhookState | null;
};

export type SummarizedCloudflareLiveWebhook = {
  webhook: PersistedCloudflareWebhookState;
  lifecycle: PersistedCloudflareLifecycleState;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readFirstString(
  value: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!value) return null;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

function readNestedString(
  payload: Record<string, unknown> | null,
  candidates: string[][],
): string | null {
  for (const path of candidates) {
    let cursor: unknown = payload;
    for (const segment of path) {
      cursor = asRecord(cursor)?.[segment];
    }
    if (typeof cursor === "string" && cursor.trim().length > 0) {
      return cursor.trim();
    }
  }
  return null;
}

function readNestedTimestamp(
  payload: Record<string, unknown> | null,
  candidates: string[][],
): number | null {
  for (const path of candidates) {
    let cursor: unknown = payload;
    for (const segment of path) {
      cursor = asRecord(cursor)?.[segment];
    }
    if (typeof cursor === "number" && Number.isFinite(cursor)) {
      return cursor;
    }
    if (typeof cursor === "string" && cursor.trim().length > 0) {
      const numeric = Number(cursor);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
      const parsed = Date.parse(cursor);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function parseStoredJson<T>(rawValue: string | null | undefined): T | null {
  if (!rawValue) return null;
  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

async function readStoredJson<T>(
  db: StorageDb | null | undefined,
  key: string,
): Promise<T | null> {
  if (!db) return null;
  const rows = await db.select().from(storage).where(eq(storage.key, key)).limit(1);
  return parseStoredJson<T>(rows[0]?.value);
}

async function writeStoredJson(
  db: StorageDb | null | undefined,
  key: string,
  value: unknown,
): Promise<void> {
  if (!db) return;
  const now = Date.now();
  const payload = JSON.stringify(value);
  await db
    .insert(storage)
    .values({
      key,
      value: payload,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: storage.key,
      set: {
        value: payload,
        updatedAt: now,
      },
    });
}

function deriveLifecycleStatus(eventType: string | null) {
  const normalized = eventType?.trim().toLowerCase() ?? "";
  if (normalized.includes("disconnected")) {
    return "disconnected" as const;
  }
  if (normalized.includes("connected")) {
    return "connected" as const;
  }
  if (normalized.includes("error")) {
    return "errored" as const;
  }
  return "unknown" as const;
}

export function verifyCloudflareWebhookSecret(
  headers: IncomingHttpHeaders | Record<string, unknown>,
  secret: string | null | undefined,
): boolean {
  const expectedSecret = secret?.trim();
  if (!expectedSecret) {
    return false;
  }
  const rawHeader =
    headers["cf-webhook-auth"] ??
    headers["CF-WEBHOOK-AUTH"] ??
    headers["Cf-Webhook-Auth"];
  const receivedSecret = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (typeof receivedSecret !== "string" || receivedSecret.trim().length === 0) {
    return false;
  }
  const left = Buffer.from(receivedSecret.trim());
  const right = Buffer.from(expectedSecret);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function summarizeCloudflareLiveWebhook(params: {
  payload: unknown;
  receivedAt?: number;
}): SummarizedCloudflareLiveWebhook {
  const payload = asRecord(params.payload);
  const event = asRecord(payload?.event);
  const receivedAt = params.receivedAt ?? Date.now();
  const eventType =
    readNestedString(payload, [
      ["alert_type"],
      ["event", "type"],
      ["type"],
      ["eventType"],
    ]) ?? null;
  const eventName =
    readNestedString(payload, [["name"], ["event", "name"]]) ?? eventType;
  const liveInputId =
    readNestedString(payload, [
      ["event", "input_id"],
      ["event", "input_uid"],
      ["event", "live_input_id"],
      ["event", "live_input_uid"],
      ["input_id"],
      ["input_uid"],
      ["live_input_id"],
      ["live_input_uid"],
    ]) ?? null;
  const videoId = readNestedString(payload, [
    ["event", "video_id"],
    ["event", "video_uid"],
    ["video_id"],
    ["video_uid"],
  ]);
  const occurredAt = readNestedTimestamp(payload, [
    ["event", "timestamp"],
    ["event", "occurred_at"],
    ["timestamp"],
    ["occurred_at"],
  ]);
  const errorCode =
    readFirstString(event, ["error_code", "code"]) ??
    readFirstString(payload, ["error_code", "code"]);
  const errorMessage =
    readFirstString(event, ["error_message", "message"]) ??
    readFirstString(payload, ["error_message", "message"]);

  const webhook: PersistedCloudflareWebhookState = {
    eventType,
    eventName,
    liveInputId,
    videoId,
    occurredAt,
    receivedAt,
  };

  return {
    webhook,
    lifecycle: {
      ...webhook,
      status: deriveLifecycleStatus(eventType),
      errorCode,
      errorMessage,
    },
  };
}

export async function loadPersistedStreamingAuthorityState(
  db: StorageDb | null | undefined,
): Promise<PersistedStreamingAuthorityState> {
  return {
    canonicalProviderState: await readStoredJson<PersistedCanonicalProviderState>(
      db,
      CANONICAL_PROVIDER_STATE_STORAGE_KEY,
    ),
    cloudflareLifecycle: await readStoredJson<PersistedCloudflareLifecycleState>(
      db,
      CLOUDFLARE_LIFECYCLE_STORAGE_KEY,
    ),
    cloudflareLastWebhook: await readStoredJson<PersistedCloudflareWebhookState>(
      db,
      CLOUDFLARE_LAST_WEBHOOK_STORAGE_KEY,
    ),
  };
}

export async function persistCanonicalProviderState(
  db: StorageDb | null | undefined,
  state: PersistedCanonicalProviderState,
): Promise<void> {
  await writeStoredJson(db, CANONICAL_PROVIDER_STATE_STORAGE_KEY, state);
}

export async function persistCloudflareLifecycleState(
  db: StorageDb | null | undefined,
  state: PersistedCloudflareLifecycleState,
): Promise<void> {
  await writeStoredJson(db, CLOUDFLARE_LIFECYCLE_STORAGE_KEY, state);
}

export async function persistCloudflareWebhookState(
  db: StorageDb | null | undefined,
  state: PersistedCloudflareWebhookState,
): Promise<void> {
  await writeStoredJson(db, CLOUDFLARE_LAST_WEBHOOK_STORAGE_KEY, state);
}
