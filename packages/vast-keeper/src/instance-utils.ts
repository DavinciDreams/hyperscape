export interface VastInstanceMetadata {
  id: number;
  actual_status: string;
  ssh_host?: string;
  ssh_port?: number;
  gpu_display_active?: boolean;
  start_date?: number;
}

export interface VastInstanceTarget {
  instanceId?: number;
  sshHost?: string;
  sshPort?: number;
}

export function parseOptionalInt(
  value: string | undefined,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function buildTargetFromEnv(env: NodeJS.ProcessEnv): VastInstanceTarget {
  return {
    instanceId: parseOptionalInt(
      env.VAST_TARGET_INSTANCE_ID ?? env.VAST_INSTANCE_ID,
    ),
    sshHost: env.VAST_TARGET_SSH_HOST ?? env.VAST_HOST,
    sshPort: parseOptionalInt(env.VAST_TARGET_SSH_PORT ?? env.VAST_PORT),
  };
}

export function isActiveInstance(instance: VastInstanceMetadata): boolean {
  return (
    instance.actual_status === "running" || instance.actual_status === "loading"
  );
}

function getStatusPriority(status: string): number {
  switch (status) {
    case "running":
      return 2;
    case "loading":
      return 1;
    default:
      return 0;
  }
}

function matchesTarget(
  instance: VastInstanceMetadata,
  target: VastInstanceTarget,
): boolean {
  if (target.instanceId !== undefined && instance.id === target.instanceId) {
    return true;
  }

  if (
    target.sshHost &&
    target.sshPort !== undefined &&
    instance.ssh_host === target.sshHost &&
    instance.ssh_port === target.sshPort
  ) {
    return true;
  }

  return false;
}

export function selectPrimaryInstance<T extends VastInstanceMetadata>(
  instances: T[],
  target: VastInstanceTarget,
): T | null {
  if (instances.length === 0) {
    return null;
  }

  const explicitMatch = instances.find((instance) =>
    matchesTarget(instance, target),
  );
  if (explicitMatch) {
    return explicitMatch;
  }

  return [...instances].sort((left, right) => {
    const statusDelta =
      getStatusPriority(right.actual_status) -
      getStatusPriority(left.actual_status);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const displayDelta =
      Number(Boolean(right.gpu_display_active)) -
      Number(Boolean(left.gpu_display_active));
    if (displayDelta !== 0) {
      return displayDelta;
    }

    const startDelta = (right.start_date ?? 0) - (left.start_date ?? 0);
    if (startDelta !== 0) {
      return startDelta;
    }

    return right.id - left.id;
  })[0];
}

export function partitionInstances<T extends VastInstanceMetadata>(
  instances: T[],
  target: VastInstanceTarget,
): { primary: T | null; extras: T[] } {
  const primary = selectPrimaryInstance(instances, target);

  if (!primary) {
    return { primary: null, extras: [] };
  }

  return {
    primary,
    extras: instances.filter((instance) => instance.id !== primary.id),
  };
}
