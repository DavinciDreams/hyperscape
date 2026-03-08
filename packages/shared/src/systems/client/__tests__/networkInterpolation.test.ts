import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "../../../extras/three/three";
import { ClientNetwork } from "../ClientNetwork";
import { TileInterpolator } from "../TileInterpolator";
import {
  InterpolationEngine,
  type InterpolationState as EngineInterpolationState,
} from "../network/InterpolationEngine";
import type { World } from "../../../types";
import type { Entity } from "../../../entities/Entity";

type MockEntity = Entity & {
  id: string;
  type: string;
  position: THREE.Vector3;
  node: {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
  };
  data: Record<string, unknown>;
};

type ClientNetworkHarness = ClientNetwork & {
  addInterpolationSnapshot: (
    entityId: string,
    changes: {
      p?: [number, number, number];
      q?: [number, number, number, number];
      v?: [number, number, number];
    },
  ) => void;
  interpolationStates: Map<string, unknown>;
  interpolateEntityPosition: (
    entity: Entity,
    state: unknown,
    renderTime: number,
    now: number,
    delta: number,
  ) => void;
};

type InterpolationEngineHarness = InterpolationEngine & {
  interpolateEntityPosition: (
    entity: Entity,
    state: EngineInterpolationState,
    renderTime: number,
    now: number,
    delta: number,
  ) => void;
};

const createEntity = (id: string): MockEntity =>
  ({
    id,
    type: "mob",
    position: new THREE.Vector3(),
    node: {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
    },
    data: {},
  }) as MockEntity;

const createWorld = (entity: MockEntity): World =>
  ({
    entities: {
      get: (id: string) => (id === entity.id ? entity : undefined),
      player: undefined,
    },
    frameBudget: null,
  }) as unknown as World;

describe("network interpolation wraparound", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps ClientNetwork interpolation chronological after the snapshot ring wraps", () => {
    const entity = createEntity("remote-client");
    const world = createWorld(entity);
    const network = new ClientNetwork(world) as ClientNetworkHarness;
    let currentTime = 0;
    const nowSpy = vi.spyOn(performance, "now");

    nowSpy.mockImplementation(() => currentTime);

    for (let index = 0; index < 12; index++) {
      currentTime = index * 50;
      network.addInterpolationSnapshot(entity.id, {
        p: [index, 0, 0],
        q: [0, 0, 0, 1],
      });
    }

    currentTime = 575;
    const state = network.interpolationStates.get(entity.id);

    expect(state).toBeDefined();

    network.interpolateEntityPosition(entity, state, 475, 575, 10);

    expect(entity.position.x).toBeGreaterThan(9);
    expect(entity.position.x).toBeLessThan(10);
  });

  it("keeps InterpolationEngine interpolation chronological after the snapshot ring wraps", () => {
    const entity = createEntity("remote-engine");
    const world = createWorld(entity);
    const engine = new InterpolationEngine(
      world,
      new TileInterpolator(),
    ) as InterpolationEngineHarness;
    let currentTime = 0;
    const nowSpy = vi.spyOn(performance, "now");

    nowSpy.mockImplementation(() => currentTime);

    for (let index = 0; index < 12; index++) {
      currentTime = index * 50;
      engine.addSnapshot(entity.id, {
        p: [index, 0, 0],
        q: [0, 0, 0, 1],
      });
    }

    currentTime = 575;
    const state = engine.states.get(entity.id);

    expect(state).toBeDefined();
    if (!state) {
      throw new Error("Expected interpolation state to exist");
    }

    engine.interpolateEntityPosition(entity, state, 475, 575, 10);

    expect(entity.position.x).toBeGreaterThan(9);
    expect(entity.position.x).toBeLessThan(10);
  });
});
