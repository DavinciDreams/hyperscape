/**
 * Equipment Processing Service
 * Manages Blender Docker-based equipment weight transfer jobs
 *
 * On initialization, checks for Docker availability and auto-builds
 * the blender-processor image if it doesn't exist. This means
 * `bun run dev:forge` is all you need — no manual docker build step.
 */

import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";

interface ProcessingJob {
  id: string;
  assetId: string;
  slot: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  message: string;
  outputPath: string | null;
  metadataPath: string | null;
  error: string | null;
  startedAt: number;
  completedAt: number | null;
}

interface ProcessingParams {
  assetId: string;
  slot: "body" | "legs" | "helmet" | "boots" | "gloves" | "cape" | "shield";
  offset?: number;
  maxInfluences?: number;
  smoothingPasses?: number;
  tier?: number;
}

interface EquipmentMetadata {
  version: number;
  tier: number;
  slot: string;
  activeBones: string[];
  orderedBoneNames: string[];
  hiddenBodyParts: string[];
  vertexCount: number;
  processingParams: {
    offset: number;
    maxInfluences: number;
    smoothingPasses: number;
  };
  pipelineVersion: string;
}

// Map pipeline step messages to progress percentages
const STEP_PROGRESS: Record<string, number> = {
  "STEP 1/9": 5,
  "STEP 2/9": 15,
  "STEP 3/9": 25,
  "STEP 4/9": 35,
  "STEP 5/9": 45,
  "STEP 6/9": 55,
  "STEP 7/9": 70,
  "STEP 8/9": 80,
  "STEP 9/9": 90,
  DONE: 100,
};

export class EquipmentProcessingService {
  private jobs = new Map<string, ProcessingJob>();
  private assetsDir: string;
  private referenceDir: string;
  private dockerImage: string;
  private dockerfileDir: string;
  private dockerReady = false;
  private dockerBuildPromise: Promise<void> | null = null;

  constructor(assetsDir: string, referenceDir: string) {
    this.assetsDir = assetsDir;
    this.referenceDir = referenceDir;
    this.dockerImage = "hyperscape-blender-processor:latest";
    // Dockerfile lives at <package-root>/docker/blender/
    this.dockerfileDir = path.resolve(referenceDir, "..", "docker", "blender");
  }

  /**
   * Initialize the service: check Docker is available, build image if needed.
   * Called once at server startup. Non-blocking — the build runs in background.
   */
  async initialize(): Promise<void> {
    // Check Docker is available
    if (!this.isDockerAvailable()) {
      console.warn(
        "⚠️  [EquipmentProcessing] Docker not found — Blender equipment processing will be unavailable. " +
          "Install Docker Desktop to enable this feature.",
      );
      return;
    }

    console.log("[EquipmentProcessing] Docker detected");

    // Check if image already exists
    if (this.isImageBuilt()) {
      console.log(
        `[EquipmentProcessing] Image ${this.dockerImage} already exists`,
      );
      this.dockerReady = true;
      return;
    }

    // Check if Dockerfile exists
    const dockerfilePath = path.join(this.dockerfileDir, "Dockerfile");
    if (!fs.existsSync(dockerfilePath)) {
      console.warn(
        `⚠️  [EquipmentProcessing] Dockerfile not found at ${dockerfilePath} — skipping image build`,
      );
      return;
    }

    // Build image in background (don't block server startup)
    console.log(
      `[EquipmentProcessing] Building Docker image ${this.dockerImage} in background...`,
    );
    this.dockerBuildPromise = this.buildDockerImage();
  }

  private isDockerAvailable(): boolean {
    try {
      execSync("docker info", { stdio: "ignore", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  private isImageBuilt(): boolean {
    try {
      const output = execSync(`docker images -q ${this.dockerImage}`, {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      return output.length > 0;
    } catch {
      return false;
    }
  }

  private buildDockerImage(): Promise<void> {
    return new Promise((resolve) => {
      const proc = spawn(
        "docker",
        [
          "build",
          "--platform",
          "linux/amd64",
          "-t",
          this.dockerImage,
          this.dockerfileDir,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );

      proc.stdout.on("data", (data: Buffer) => {
        const lines = data.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          console.log(`[EquipmentProcessing:build] ${line}`);
        }
      });

      proc.stderr.on("data", (data: Buffer) => {
        const text = data.toString().trim();
        if (text) {
          // Docker build progress goes to stderr, not all of it is errors
          console.log(`[EquipmentProcessing:build] ${text}`);
        }
      });

      proc.on("close", (code) => {
        if (code === 0) {
          this.dockerReady = true;
          console.log(
            `[EquipmentProcessing] Docker image ${this.dockerImage} built successfully`,
          );
        } else {
          console.error(
            `[EquipmentProcessing] Docker image build failed with code ${code}. ` +
              "Equipment processing will be unavailable.",
          );
        }
        this.dockerBuildPromise = null;
        resolve();
      });

      proc.on("error", (err) => {
        console.error(
          "[EquipmentProcessing] Docker build spawn error:",
          err.message,
        );
        this.dockerBuildPromise = null;
        resolve();
      });
    });
  }

  /** Returns whether Docker is ready to process equipment. */
  isReady(): boolean {
    return this.dockerReady;
  }

  /** Returns whether Docker is currently building the image. */
  isBuilding(): boolean {
    return this.dockerBuildPromise !== null;
  }

  startProcessing(params: ProcessingParams): string {
    if (!this.dockerReady) {
      const reason = this.dockerBuildPromise
        ? "Docker image is still building — please wait and try again"
        : "Docker is not available — install Docker Desktop to use equipment processing";
      throw new Error(reason);
    }

    const jobId = `equip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const {
      assetId,
      slot,
      offset = 0.05,
      maxInfluences = 4,
      smoothingPasses = 3,
      tier = 1,
    } = params;

    // Resolve the actual model filename from the asset directory
    const modelFilename = this.resolveModelFilename(assetId);
    if (!modelFilename) {
      throw new Error(`No GLB model found in asset directory for '${assetId}'`);
    }

    const outputFilename = `${assetId}-rigged.glb`;
    const outputPath = path.join(this.assetsDir, assetId, outputFilename);
    const metadataPath = outputPath.replace(".glb", ".equipment.json");

    const job: ProcessingJob = {
      id: jobId,
      assetId,
      slot,
      status: "pending",
      progress: 0,
      message: "Queued for processing",
      outputPath: null,
      metadataPath: null,
      error: null,
      startedAt: Date.now(),
      completedAt: null,
    };

    this.jobs.set(jobId, job);

    // Spawn Docker container
    this.runDockerProcess(job, {
      assetId,
      slot,
      offset,
      maxInfluences,
      smoothingPasses,
      tier,
      outputPath,
      metadataPath,
      modelFilename,
    });

    return jobId;
  }

  /**
   * Find the source model GLB file in the asset directory.
   * Prefers {assetId}.glb, falls back to first .glb file found (excluding rigged outputs).
   */
  private resolveModelFilename(assetId: string): string | null {
    const assetDir = path.join(this.assetsDir, assetId);
    if (!fs.existsSync(assetDir)) return null;

    const files = fs.readdirSync(assetDir);
    const glbFiles = files.filter(
      (f) => f.endsWith(".glb") && !f.includes("-rigged"),
    );

    // Prefer the canonical {assetId}.glb
    const canonical = `${assetId}.glb`;
    if (glbFiles.includes(canonical)) return canonical;

    // Fall back to first available GLB
    return glbFiles[0] || null;
  }

  private runDockerProcess(
    job: ProcessingJob,
    params: {
      assetId: string;
      slot: string;
      offset: number;
      maxInfluences: number;
      smoothingPasses: number;
      tier: number;
      outputPath: string;
      metadataPath: string;
      modelFilename: string;
    },
  ) {
    job.status = "processing";
    job.message = "Starting Blender container";

    // Mount the local scripts directory so pipeline changes are reflected
    // immediately without rebuilding the Docker image.
    const scriptsDir = path.join(this.dockerfileDir, "scripts");

    const dockerArgs = [
      "run",
      "--rm",
      "--platform",
      "linux/amd64",
      "-v",
      `${this.referenceDir}:/data/reference:ro`,
      "-v",
      `${this.assetsDir}:/data/gdd-assets`,
      "-v",
      `${scriptsDir}:/app/scripts:ro`,
      this.dockerImage,
      "--reference",
      "/data/reference/reference_body.vrm",
      "--equipment",
      `/data/gdd-assets/${params.assetId}/${params.modelFilename}`,
      "--output",
      `/data/gdd-assets/${params.assetId}/${params.assetId}-rigged.glb`,
      "--slot",
      params.slot,
      "--offset",
      String(params.offset),
      "--max-influences",
      String(params.maxInfluences),
      "--smoothing-passes",
      String(params.smoothingPasses),
      "--tier",
      String(params.tier),
    ];

    console.log(
      `[EquipmentProcessing] Starting job ${job.id}: docker ${dockerArgs.join(" ")}`,
    );

    const proc = spawn("docker", dockerArgs);

    // Track whether the pipeline completed successfully (printed "DONE")
    // Blender exits 0 even when the Python script raises an exception,
    // so we can't rely on exit code alone.
    let pipelineDone = false;
    const stderrChunks: string[] = [];

    proc.stdout.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        console.log(`[EquipmentProcessing:${job.id}] ${line}`);

        // Parse progress from pipeline output
        if (line.includes("[EQUIPMENT_PIPELINE]")) {
          const msg = line.split("[EQUIPMENT_PIPELINE]")[1].trim();
          job.message = msg;

          // Check for DONE marker — the only reliable success signal
          if (msg.includes("DONE")) {
            pipelineDone = true;
          }

          // Update progress based on step markers
          for (const [marker, progress] of Object.entries(STEP_PROGRESS)) {
            if (msg.includes(marker)) {
              job.progress = progress;
              break;
            }
          }
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        console.warn(`[EquipmentProcessing:${job.id}] stderr: ${text}`);
        // Collect stderr for error reporting (skip Docker platform warnings)
        if (!text.includes("does not match the detected host platform")) {
          stderrChunks.push(text);
        }
      }
    });

    proc.on("close", (code) => {
      if (code === 0 && pipelineDone) {
        job.status = "completed";
        job.progress = 100;
        job.message = "Processing complete";
        job.outputPath = params.outputPath;
        job.metadataPath = params.metadataPath;
        job.completedAt = Date.now();

        // Update asset metadata.json with equipment processing info
        this.updateAssetMetadata(
          params.assetId,
          params.outputPath,
          params.metadataPath,
        );

        console.log(
          `[EquipmentProcessing] Job ${job.id} completed successfully`,
        );
      } else {
        job.status = "failed";
        const lastStderr = stderrChunks.slice(-3).join("\n");
        if (code !== 0) {
          job.error = `Blender process exited with code ${code}`;
        } else {
          // Exit code 0 but pipeline didn't reach DONE — Python exception
          job.error = `Pipeline failed (Blender exited 0 but script errored)${lastStderr ? `: ${lastStderr}` : ""}`;
        }
        job.completedAt = Date.now();
        console.error(
          `[EquipmentProcessing] Job ${job.id} failed: ${job.error}`,
        );
      }
    });

    proc.on("error", (err) => {
      job.status = "failed";
      job.error = `Failed to start Docker: ${err.message}`;
      job.completedAt = Date.now();
      console.error(`[EquipmentProcessing] Job ${job.id} Docker error:`, err);
    });
  }

  private async updateAssetMetadata(
    assetId: string,
    outputPath: string,
    metadataPath: string,
  ) {
    const assetMetadataPath = path.join(
      this.assetsDir,
      assetId,
      "metadata.json",
    );

    try {
      let metadata: Record<string, unknown> = {};
      if (fs.existsSync(assetMetadataPath)) {
        const raw = await fs.promises.readFile(assetMetadataPath, "utf-8");
        metadata = JSON.parse(raw);
      }

      metadata.equipmentProcessing = {
        riggedModel: path.basename(outputPath),
        metadataFile: path.basename(metadataPath),
        processedAt: new Date().toISOString(),
        pipelineVersion: "blender-1.0",
      };

      await fs.promises.writeFile(
        assetMetadataPath,
        JSON.stringify(metadata, null, 2),
      );
      console.log(`[EquipmentProcessing] Updated metadata for ${assetId}`);
    } catch (error) {
      console.error(
        `[EquipmentProcessing] Failed to update metadata for ${assetId}:`,
        error,
      );
    }
  }

  getJobStatus(jobId: string): ProcessingJob | null {
    return this.jobs.get(jobId) || null;
  }

  async getEquipmentMetadata(
    assetId: string,
  ): Promise<EquipmentMetadata | null> {
    const metadataPath = path.join(
      this.assetsDir,
      assetId,
      `${assetId}-rigged.equipment.json`,
    );

    try {
      if (!fs.existsSync(metadataPath)) {
        return null;
      }
      const raw = await fs.promises.readFile(metadataPath, "utf-8");
      return JSON.parse(raw) as EquipmentMetadata;
    } catch {
      return null;
    }
  }

  getRiggedModelPath(assetId: string): string {
    return path.join(this.assetsDir, assetId, `${assetId}-rigged.glb`);
  }

  async hasRiggedModel(assetId: string): Promise<boolean> {
    return fs.existsSync(this.getRiggedModelPath(assetId));
  }
}
