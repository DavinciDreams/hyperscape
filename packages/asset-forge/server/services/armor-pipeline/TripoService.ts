/**
 * TripoService — Tripo 3D AI integration
 *
 * Handles model import, retexturing, stylization via Tripo's API.
 * Uses STS (Security Token Service) upload for 3D model files,
 * then chains import_model → texture_model/stylize_model tasks.
 *
 * API: https://api.tripo3d.ai/v2/openapi
 * Docs: https://platform.tripo3d.ai/docs
 */

import { createHmac, createHash } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  bucket: string;
  /** Full S3 object key (not a prefix — Tripo assigns the key) */
  objectKey: string;
  endpoint: string;
  region: string;
}

export interface TripoTaskStatus {
  taskId: string;
  type: string;
  status: "queued" | "running" | "success" | "failed" | "banned" | "expired";
  progress: number;
  resultModelUrl?: string;
  resultPbrUrl?: string;
  resultBaseUrl?: string;
  resultImageUrl?: string;
  error?: string;
  consumedCredit?: number;
}

interface TripoApiResponse<T = unknown> {
  code: number;
  data: T;
}

interface TripoTaskCreateResponse {
  task_id: string;
}

interface TripoTaskPollResponse {
  task_id: string;
  type: string;
  status: string;
  progress: number;
  input: Record<string, unknown>;
  output: {
    model?: string;
    base_model?: string;
    pbr_model?: string;
    rendered_image?: string;
  };
  create_time: number;
  consumed_credit?: number;
  // Error fields (present on failed tasks)
  error?: string;
  message?: string;
  task_error?: { message?: string };
}

// ---------------------------------------------------------------------------
// Minimal AWS Sig V4 for S3 PutObject (no SDK dependency)
// ---------------------------------------------------------------------------

function sha256hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function buildS3PutHeaders(params: {
  objectKey: string;
  body: Buffer;
  creds: StsCredentials;
}): { url: string; headers: Record<string, string> } {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const { endpoint, bucket, region } = params.creds;

  // Use path-style URL: endpoint/bucket/key
  const objectPath = `/${bucket}/${params.objectKey}`;
  const url = `${endpoint}${objectPath}`;
  const host = new URL(endpoint).host;

  const payloadHash = sha256hex(params.body);

  // Canonical headers (must be sorted by key)
  const headerEntries: [string, string][] = [
    ["content-length", params.body.length.toString()],
    ["content-type", "model/gltf-binary"],
    ["host", host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate],
    ["x-amz-security-token", params.creds.sessionToken],
  ];

  const signedHeaders = headerEntries.map(([k]) => k).join(";");
  const canonicalHeaders = headerEntries
    .map(([k, v]) => `${k}:${v}\n`)
    .join("");

  const canonicalRequest = [
    "PUT",
    objectPath,
    "", // query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(
    params.creds.secretAccessKey,
    dateStamp,
    region,
    "s3",
  );
  const signature = hmacSha256(signingKey, stringToSign).toString("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${params.creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {};
  for (const [k, v] of headerEntries) {
    headers[k] = v;
  }
  headers["authorization"] = authorization;

  return { url, headers };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** Tripo task IDs are alphanumeric — reject anything else to prevent path injection */
const TASK_ID_RE = /^[a-zA-Z0-9_-]+$/;

export class TripoService {
  private apiKey: string;
  private baseUrl = "https://api.tripo3d.ai/v2/openapi";
  private pollInterval: number;
  private maxPollTime: number;

  constructor(config: {
    tripoApiKey: string;
    pollIntervalMs?: number;
    maxPollTimeMs?: number;
  }) {
    this.apiKey = config.tripoApiKey;
    this.pollInterval = config.pollIntervalMs ?? 3000;
    this.maxPollTime = config.maxPollTimeMs ?? 600000; // 10 min
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  /** Check account balance — useful for debugging credit issues. */
  async getBalance(): Promise<{
    balance: number;
    raw: Record<string, unknown>;
  }> {
    const response = await fetch(`${this.baseUrl}/user/balance`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tripo balance check failed ${response.status}: ${text}`);
    }

    const json = (await response.json()) as TripoApiResponse<
      Record<string, unknown>
    >;
    console.log(`[Tripo] Balance response:`, JSON.stringify(json.data));
    return { balance: (json.data.balance as number) ?? 0, raw: json.data };
  }

  // -----------------------------------------------------------------------
  // STS Upload
  // -----------------------------------------------------------------------

  /**
   * Get temporary S3 credentials from Tripo for model upload.
   *
   * Endpoint: POST /upload/sts/token
   * Body: {"format": "glb"}
   * Returns: s3_host, sts_ak, sts_sk, session_token, resource_bucket, resource_uri
   */
  private async getStsCredentials(format = "glb"): Promise<StsCredentials> {
    console.log(`[Tripo] Getting STS credentials for format=${format}...`);

    const response = await fetch(`${this.baseUrl}/upload/sts/token`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ format }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tripo STS error ${response.status}: ${text}`);
    }

    const json = (await response.json()) as TripoApiResponse<{
      s3_host: string;
      sts_ak: string;
      sts_sk: string;
      session_token: string;
      resource_bucket: string;
      resource_uri: string;
    }>;

    if (json.code !== 0) {
      throw new Error(`Tripo STS failed: code=${json.code}`);
    }

    const d = json.data;
    console.log(
      `[Tripo] STS credentials received: bucket=${d.resource_bucket}, key=${d.resource_uri}, host=${d.s3_host}`,
    );

    // Extract region from S3 host (e.g. "s3.us-east-1.amazonaws.com" → "us-east-1")
    const hostMatch = d.s3_host.match(/s3[.-]([a-z0-9-]+)\./);
    const region = hostMatch?.[1] ?? "us-east-1";

    return {
      accessKeyId: d.sts_ak,
      secretAccessKey: d.sts_sk,
      sessionToken: d.session_token,
      bucket: d.resource_bucket,
      objectKey: d.resource_uri,
      endpoint: `https://${d.s3_host}`,
      region,
    };
  }

  /**
   * Upload a 3D model file to Tripo via STS S3 upload.
   * Returns the bucket/key reference for use in import_model.
   *
   * Flow: GET STS creds → PUT to S3 with Sig V4 → return {bucket, key}
   */
  async uploadModel(
    buffer: Buffer,
    _filename: string,
  ): Promise<{ bucket: string; key: string }> {
    console.log(
      `[Tripo] Uploading model (${(buffer.length / 1024).toFixed(0)}KB)...`,
    );

    // Tripo assigns the object key — we use resource_uri directly
    const creds = await this.getStsCredentials("glb");

    const { url, headers } = buildS3PutHeaders({
      objectKey: creds.objectKey,
      body: buffer,
      creds,
    });

    console.log(`[Tripo] S3 PUT to ${url.split("?")[0]} ...`);

    const response = await fetch(url, {
      method: "PUT",
      headers,
      body: buffer,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`S3 upload failed ${response.status}: ${text}`);
    }

    console.log(`[Tripo] Upload complete: ${creds.bucket}/${creds.objectKey}`);
    return { bucket: creds.bucket, key: creds.objectKey };
  }

  // -----------------------------------------------------------------------
  // Task Creation
  // -----------------------------------------------------------------------

  /** Create a Tripo task (generic). Returns task ID. */
  private async createTask(body: Record<string, unknown>): Promise<string> {
    console.log(`[Tripo] Creating task: ${body.type as string}`);

    const response = await fetch(`${this.baseUrl}/task`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tripo task creation failed ${response.status}: ${text}`);
    }

    const json =
      (await response.json()) as TripoApiResponse<TripoTaskCreateResponse>;

    if (json.code !== 0) {
      throw new Error(
        `Tripo task creation error: code=${json.code}, data=${JSON.stringify(json.data)}`,
      );
    }

    console.log(`[Tripo] Task created: ${json.data.task_id}`);
    return json.data.task_id;
  }

  /** Import a previously uploaded 3D model into Tripo. */
  async importModel(bucket: string, key: string): Promise<string> {
    return this.createTask({
      type: "import_model",
      file: {
        object: { bucket, key },
      },
    });
  }

  /** Retexture an imported/generated model (whole model or specific parts). */
  async textureModel(
    originalTaskId: string,
    options?: {
      textureQuality?: "standard" | "detailed";
      textureSeed?: number;
      /** Target specific parts (from mesh_segmentation). Omit to texture whole model. */
      partNames?: string[];
      /** Text prompt for per-part texturing. */
      textPrompt?: string;
    },
  ): Promise<string> {
    return this.createTask({
      type: "texture_model",
      original_model_task_id: originalTaskId,
      texture_quality: options?.textureQuality ?? "standard",
      ...(options?.textureSeed != null
        ? { texture_seed: options.textureSeed }
        : {}),
      ...(options?.partNames?.length ? { part_names: options.partNames } : {}),
      ...(options?.textPrompt ? { text_prompt: options.textPrompt } : {}),
    });
  }

  /** Segment a model into named parts (chest, shoulders, etc.) */
  async meshSegmentation(originalTaskId: string): Promise<string> {
    return this.createTask({
      type: "mesh_segmentation",
      original_model_task_id: originalTaskId,
    });
  }

  /** Reassemble model after per-part texturing. */
  async meshCompletion(
    originalTaskId: string,
    partNames?: string[],
  ): Promise<string> {
    return this.createTask({
      type: "mesh_completion",
      original_model_task_id: originalTaskId,
      ...(partNames?.length ? { part_names: partNames } : {}),
    });
  }

  /** Stylize a model with an artistic style. */
  async stylizeModel(originalTaskId: string, style?: string): Promise<string> {
    return this.createTask({
      type: "stylize_model",
      original_model_task_id: originalTaskId,
      ...(style ? { style } : {}),
    });
  }

  /** Generate a 3D model from a text prompt. */
  async textToModel(
    prompt: string,
    options?: {
      faceLimit?: number;
      pbr?: boolean;
      texture?: boolean;
      textureQuality?: "standard" | "detailed";
      modelVersion?: string;
      style?: string;
    },
  ): Promise<string> {
    return this.createTask({
      type: "text_to_model",
      prompt,
      model_version: options?.modelVersion ?? "v2.5-20250123",
      face_limit: options?.faceLimit ?? 10000,
      texture: options?.texture ?? true,
      pbr: options?.pbr ?? true,
      texture_quality: options?.textureQuality ?? "standard",
      ...(options?.style ? { style: options.style } : {}),
    });
  }

  /** Refine a draft model for higher quality. */
  async refineDraft(originalTaskId: string): Promise<string> {
    return this.createTask({
      type: "refine_draft",
      original_model_task_id: originalTaskId,
    });
  }

  // -----------------------------------------------------------------------
  // GLB Part Name Discovery
  // -----------------------------------------------------------------------

  /**
   * Download a segmented GLB and extract mesh/node names as part names.
   * After mesh_segmentation, the result GLB contains named meshes for each part.
   */
  async discoverPartNames(segmentationTaskId: string): Promise<string[]> {
    const { buffer } = await this.downloadResult(segmentationTaskId);

    // Parse GLB to extract mesh names using @gltf-transform/core
    const { NodeIO } = await import("@gltf-transform/core");
    const io = new NodeIO();
    const doc = await io.readBinary(new Uint8Array(buffer));

    // Collect unique mesh names
    const meshNames = doc
      .getRoot()
      .listMeshes()
      .map((m) => m.getName())
      .filter((n) => n && n.length > 0);

    // If no mesh names, try node names
    if (meshNames.length === 0) {
      const nodeNames = doc
        .getRoot()
        .listNodes()
        .map((n) => n.getName())
        .filter((n) => n && n.length > 0);
      console.log(`[Tripo] Discovered node names: ${nodeNames.join(", ")}`);
      return nodeNames;
    }

    console.log(`[Tripo] Discovered part names: ${meshNames.join(", ")}`);
    return meshNames;
  }

  // -----------------------------------------------------------------------
  // Segment + Per-Part Texture Pipeline
  // -----------------------------------------------------------------------

  /**
   * Upload shell → import → segment → discover parts.
   * Returns the segmentation task ID and part names.
   */
  async uploadAndSegment(
    glbBuffer: Buffer,
    filename: string,
  ): Promise<{
    importTaskId: string;
    segmentTaskId: string;
    partNames: string[];
  }> {
    // Upload to S3
    const { bucket, key } = await this.uploadModel(glbBuffer, filename);

    // Import
    const importTaskId = await this.importModel(bucket, key);
    console.log(`[Tripo] Waiting for import...`);
    await this.waitForCompletion(importTaskId);

    // Segment
    const segmentTaskId = await this.meshSegmentation(importTaskId);
    console.log(`[Tripo] Waiting for segmentation...`);
    await this.waitForCompletion(segmentTaskId);

    // Discover part names from the segmented GLB
    const partNames = await this.discoverPartNames(segmentTaskId);

    return { importTaskId, segmentTaskId, partNames };
  }

  /**
   * Texture parts sequentially with different prompts, then reassemble.
   * Each texture_model call targets specific parts and chains from the previous result.
   *
   * @param segmentTaskId - The segmentation task to build on
   * @param partPrompts - Array of {partNames, prompt} to texture
   * @returns The final mesh_completion task ID (poll this for result)
   */
  async texturePartsAndComplete(
    segmentTaskId: string,
    partPrompts: { partNames: string[]; prompt: string }[],
    options?: { textureQuality?: "standard" | "detailed" },
  ): Promise<{ textureTaskIds: string[]; completeTaskId: string }> {
    let currentTaskId = segmentTaskId;
    const textureTaskIds: string[] = [];

    // Chain: each texture_model builds on the previous result
    for (let i = 0; i < partPrompts.length; i++) {
      const { partNames, prompt } = partPrompts[i];
      console.log(
        `[Tripo] Texturing parts [${partNames.join(", ")}]: "${prompt}" (${i + 1}/${partPrompts.length})`,
      );

      const textureTaskId = await this.textureModel(currentTaskId, {
        partNames,
        textPrompt: prompt,
        textureQuality: options?.textureQuality,
      });

      // Wait for this texturing step to complete before starting next
      await this.waitForCompletion(textureTaskId);
      textureTaskIds.push(textureTaskId);
      currentTaskId = textureTaskId;
    }

    // Reassemble
    console.log(`[Tripo] Running mesh_completion to reassemble...`);
    const completeTaskId = await this.meshCompletion(currentTaskId);

    return { textureTaskIds, completeTaskId };
  }

  // -----------------------------------------------------------------------
  // Polling + Status
  // -----------------------------------------------------------------------

  /** Get the status of a Tripo task. */
  async getTaskStatus(taskId: string): Promise<TripoTaskStatus> {
    if (!TASK_ID_RE.test(taskId)) {
      throw new Error(`Invalid task ID format: ${taskId}`);
    }

    const response = await fetch(`${this.baseUrl}/task/${taskId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tripo task status error ${response.status}: ${text}`);
    }

    const json =
      (await response.json()) as TripoApiResponse<TripoTaskPollResponse>;

    if (json.code !== 0) {
      throw new Error(`Tripo status error: code=${json.code}`);
    }

    const d = json.data;
    const statusMap: Record<string, TripoTaskStatus["status"]> = {
      queued: "queued",
      running: "running",
      success: "success",
      failed: "failed",
      banned: "banned",
      expired: "expired",
    };

    // Extract error from multiple possible fields
    const errorMsg = d.error || d.message || d.task_error?.message || undefined;

    if (d.status === "failed" || d.status === "banned") {
      console.error(
        `[Tripo] Task ${d.task_id} raw response:`,
        JSON.stringify(d),
      );
    }

    return {
      taskId: d.task_id,
      type: d.type,
      status: statusMap[d.status] ?? "failed",
      progress: d.progress ?? 0,
      resultModelUrl: d.output?.model,
      resultPbrUrl: d.output?.pbr_model,
      resultBaseUrl: d.output?.base_model,
      resultImageUrl: d.output?.rendered_image,
      consumedCredit: d.consumed_credit,
      error: errorMsg,
    };
  }

  /** Poll until a task succeeds or fails. */
  async waitForCompletion(
    taskId: string,
    onProgress?: (status: TripoTaskStatus) => void,
  ): Promise<TripoTaskStatus> {
    const startTime = Date.now();

    while (true) {
      const status = await this.getTaskStatus(taskId);
      onProgress?.(status);

      console.log(
        `[Tripo] Task ${taskId} (${status.type}): ${status.status} (${status.progress}%)`,
      );

      if (status.status === "success") return status;
      if (
        status.status === "failed" ||
        status.status === "banned" ||
        status.status === "expired"
      ) {
        // Log full status for debugging
        console.error(
          `[Tripo] Task FAILED — full status:`,
          JSON.stringify(status),
        );
        throw new Error(
          `Tripo task ${status.status}: ${status.error ?? `No error message. Task type: ${status.type}, taskId: ${taskId}`}`,
        );
      }

      if (Date.now() - startTime > this.maxPollTime) {
        throw new Error(`Tripo task timeout after ${this.maxPollTime / 1000}s`);
      }

      await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
    }
  }

  // -----------------------------------------------------------------------
  // Download
  // -----------------------------------------------------------------------

  /**
   * Download a result GLB from a Tripo result URL.
   *
   * IMPORTANT: Tripo download URLs expire quickly (60s-5min).
   * Always re-fetch task status to get a fresh URL before downloading.
   */
  async downloadResult(
    taskId: string,
  ): Promise<{ buffer: Buffer; url: string }> {
    // Get fresh status for unexpired URL
    const status = await this.getTaskStatus(taskId);
    const url = status.resultModelUrl || status.resultPbrUrl;

    if (!url) {
      throw new Error("No download URL available for this task");
    }

    // Validate URL domain to prevent SSRF
    const parsedUrl = new URL(url);
    const hostOk =
      parsedUrl.hostname === "api.tripo3d.ai" ||
      parsedUrl.hostname.endsWith(".tripo3d.ai") ||
      // Tripo uses region-prefixed S3 hosts (e.g., s3.us-east-1.amazonaws.com)
      // Only allow *.s3*.amazonaws.com patterns, not bare s3.amazonaws.com
      /^[a-z0-9-]+\.s3[a-z0-9.-]*\.amazonaws\.com$/.test(parsedUrl.hostname);
    if (!hostOk) {
      throw new Error(
        `Refusing to download from untrusted domain: ${parsedUrl.hostname}`,
      );
    }

    console.log(`[Tripo] Downloading result from ${url.substring(0, 80)}...`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to download Tripo result: ${response.statusText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), url };
  }

  // -----------------------------------------------------------------------
  // Compound operations (convenience)
  // -----------------------------------------------------------------------

  /**
   * Full pipeline: upload shell → import → texture → return task ID.
   * Caller should poll the final texture task for completion.
   */
  async uploadAndTexture(
    glbBuffer: Buffer,
    filename: string,
    options?: {
      textureQuality?: "standard" | "detailed";
    },
  ): Promise<{ importTaskId: string; textureTaskId: string }> {
    // Step 1: Upload to S3
    const { bucket, key } = await this.uploadModel(glbBuffer, filename);

    // Step 2: Import model
    const importTaskId = await this.importModel(bucket, key);
    console.log(`[Tripo] Waiting for import to complete...`);
    await this.waitForCompletion(importTaskId);

    // Step 3: Start texture
    const textureTaskId = await this.textureModel(importTaskId, {
      textureQuality: options?.textureQuality,
    });

    return { importTaskId, textureTaskId };
  }
}
