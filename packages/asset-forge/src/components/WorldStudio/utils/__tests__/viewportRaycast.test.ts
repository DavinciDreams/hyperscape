import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * viewportRaycast tests
 *
 * The module imports THREE from "three/webgpu" and pre-allocates raycaster
 * objects at module scope, so we mock THREE to avoid WebGPU dependencies.
 * Tests focus on the NDC coordinate math and the raycast call delegation.
 */

// ── Use vi.hoisted so mock fns are available inside vi.mock factory ──

const {
  mockIntersectPlane,
  mockSetFromCamera,
  mockIntersectObjects,
  mockTarget,
} = vi.hoisted(() => ({
  mockIntersectPlane: vi.fn(),
  mockSetFromCamera: vi.fn(),
  mockIntersectObjects: vi.fn(),
  mockTarget: { x: 0, y: 0, z: 0 },
}));

vi.mock("three/webgpu", () => {
  class MockVector2 {
    x = 0;
    y = 0;
  }
  class MockVector3 {
    x = 0;
    y = 0;
    z = 0;
    clone() {
      return { ...this };
    }
  }
  class MockPlane {
    normal: MockVector3;
    constant: number;
    constructor(normal?: MockVector3, constant?: number) {
      this.normal = normal ?? new MockVector3();
      this.constant = constant ?? 0;
    }
  }
  class MockRaycaster {
    ray = { intersectPlane: mockIntersectPlane };
    setFromCamera = mockSetFromCamera;
    intersectObjects = mockIntersectObjects;
  }
  return {
    Raycaster: MockRaycaster,
    Vector2: MockVector2,
    Vector3: MockVector3,
    Plane: MockPlane,
  };
});

// Import after mocking
import { raycastToGround, raycastToMeshes } from "../viewportRaycast";

// ── Helpers ──

function makeMouseEvent(clientX: number, clientY: number): MouseEvent {
  return { clientX, clientY } as MouseEvent;
}

function makeContainer(
  left: number,
  top: number,
  width: number,
  height: number,
): HTMLElement {
  return {
    getBoundingClientRect: () => ({ left, top, width, height }),
  } as unknown as HTMLElement;
}

function makeCamera(): THREE.Camera {
  return {} as THREE.Camera;
}

// ── Tests ──

describe("raycastToGround", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts mouse position to correct NDC coordinates", () => {
    // Container at (0, 0) with size 800x600
    const container = makeContainer(0, 0, 800, 600);
    const camera = makeCamera();

    // Click at center of container => NDC (0, 0)
    mockIntersectPlane.mockReturnValue(mockTarget);
    raycastToGround(makeMouseEvent(400, 300), camera, container);

    // setFromCamera should have been called with a Vector2 that has
    // x = ((400 - 0) / 800) * 2 - 1 = 0
    // y = -((300 - 0) / 600) * 2 + 1 = 0
    expect(mockSetFromCamera).toHaveBeenCalledTimes(1);
    const mouseArg = mockSetFromCamera.mock.calls[0][0];
    expect(mouseArg.x).toBeCloseTo(0, 5);
    expect(mouseArg.y).toBeCloseTo(0, 5);
  });

  it("computes correct NDC for top-left corner", () => {
    const container = makeContainer(0, 0, 800, 600);
    const camera = makeCamera();

    mockIntersectPlane.mockReturnValue(mockTarget);
    raycastToGround(makeMouseEvent(0, 0), camera, container);

    const mouseArg = mockSetFromCamera.mock.calls[0][0];
    // x = ((0 - 0) / 800) * 2 - 1 = -1
    // y = -((0 - 0) / 600) * 2 + 1 = 1
    expect(mouseArg.x).toBeCloseTo(-1, 5);
    expect(mouseArg.y).toBeCloseTo(1, 5);
  });

  it("computes correct NDC for bottom-right corner", () => {
    const container = makeContainer(0, 0, 800, 600);
    const camera = makeCamera();

    mockIntersectPlane.mockReturnValue(mockTarget);
    raycastToGround(makeMouseEvent(800, 600), camera, container);

    const mouseArg = mockSetFromCamera.mock.calls[0][0];
    // x = ((800 - 0) / 800) * 2 - 1 = 1
    // y = -((600 - 0) / 600) * 2 + 1 = -1
    expect(mouseArg.x).toBeCloseTo(1, 5);
    expect(mouseArg.y).toBeCloseTo(-1, 5);
  });

  it("accounts for container offset", () => {
    const container = makeContainer(100, 50, 400, 300);
    const camera = makeCamera();

    // Click at container center: clientX=300, clientY=200
    // NDC x = ((300 - 100) / 400) * 2 - 1 = 0
    // NDC y = -((200 - 50) / 300) * 2 + 1 = 0
    mockIntersectPlane.mockReturnValue(mockTarget);
    raycastToGround(makeMouseEvent(300, 200), camera, container);

    const mouseArg = mockSetFromCamera.mock.calls[0][0];
    expect(mouseArg.x).toBeCloseTo(0, 5);
    expect(mouseArg.y).toBeCloseTo(0, 5);
  });

  it("computes correct NDC for quarter points", () => {
    const container = makeContainer(0, 0, 1000, 1000);
    const camera = makeCamera();

    // Click at (250, 750) => NDC (-0.5, -0.5)
    mockIntersectPlane.mockReturnValue(mockTarget);
    raycastToGround(makeMouseEvent(250, 750), camera, container);

    const mouseArg = mockSetFromCamera.mock.calls[0][0];
    // x = ((250) / 1000) * 2 - 1 = -0.5
    // y = -((750) / 1000) * 2 + 1 = -0.5
    expect(mouseArg.x).toBeCloseTo(-0.5, 5);
    expect(mouseArg.y).toBeCloseTo(-0.5, 5);
  });

  it("returns a Vector3 on hit", () => {
    const container = makeContainer(0, 0, 800, 600);
    const camera = makeCamera();

    // intersectPlane returns a truthy value on hit
    mockIntersectPlane.mockReturnValue(mockTarget);
    const result = raycastToGround(makeMouseEvent(400, 300), camera, container);

    // The function returns the pre-allocated _target Vector3 (not the mock return value)
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("x");
    expect(result).toHaveProperty("y");
    expect(result).toHaveProperty("z");
  });

  it("returns null when the ray misses the ground plane", () => {
    const container = makeContainer(0, 0, 800, 600);
    const camera = makeCamera();

    mockIntersectPlane.mockReturnValue(null);
    const result = raycastToGround(makeMouseEvent(400, 300), camera, container);

    expect(result).toBeNull();
  });

  it("calls setFromCamera with the camera argument", () => {
    const container = makeContainer(0, 0, 800, 600);
    const camera = makeCamera();

    mockIntersectPlane.mockReturnValue(null);
    raycastToGround(makeMouseEvent(400, 300), camera, container);

    expect(mockSetFromCamera.mock.calls[0][1]).toBe(camera);
  });
});

describe("raycastToMeshes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts mouse position to NDC and calls intersectObjects", () => {
    const container = makeContainer(0, 0, 800, 600);
    const camera = makeCamera();
    const meshes = [{} as THREE.Object3D];
    const intersection = { distance: 5, point: { x: 1, y: 0, z: 1 } };

    mockIntersectObjects.mockReturnValue([intersection]);
    const result = raycastToMeshes(
      makeMouseEvent(400, 300),
      camera,
      container,
      meshes,
    );

    expect(mockSetFromCamera).toHaveBeenCalledTimes(1);
    expect(mockIntersectObjects).toHaveBeenCalledWith(meshes, false);
    expect(result).toBe(intersection);
  });

  it("returns null when no intersections found", () => {
    const container = makeContainer(0, 0, 800, 600);
    const camera = makeCamera();

    mockIntersectObjects.mockReturnValue([]);
    const result = raycastToMeshes(
      makeMouseEvent(400, 300),
      camera,
      container,
      [],
    );

    expect(result).toBeNull();
  });

  it("returns the closest intersection (first in array)", () => {
    const container = makeContainer(0, 0, 800, 600);
    const camera = makeCamera();
    const meshes = [{} as THREE.Object3D, {} as THREE.Object3D];
    const closest = { distance: 2 };
    const farther = { distance: 10 };

    mockIntersectObjects.mockReturnValue([closest, farther]);
    const result = raycastToMeshes(
      makeMouseEvent(400, 300),
      camera,
      container,
      meshes,
    );

    expect(result).toBe(closest);
  });

  it("passes recursive flag to intersectObjects", () => {
    const container = makeContainer(0, 0, 800, 600);
    const camera = makeCamera();
    const meshes = [{} as THREE.Object3D];

    mockIntersectObjects.mockReturnValue([]);
    raycastToMeshes(makeMouseEvent(400, 300), camera, container, meshes, true);

    expect(mockIntersectObjects).toHaveBeenCalledWith(meshes, true);
  });

  it("defaults recursive to false", () => {
    const container = makeContainer(0, 0, 800, 600);
    const camera = makeCamera();
    const meshes = [{} as THREE.Object3D];

    mockIntersectObjects.mockReturnValue([]);
    raycastToMeshes(makeMouseEvent(400, 300), camera, container, meshes);

    expect(mockIntersectObjects).toHaveBeenCalledWith(meshes, false);
  });

  it("computes correct NDC for off-center click", () => {
    // Container offset at (200, 100) with size 600x400
    const container = makeContainer(200, 100, 600, 400);
    const camera = makeCamera();

    // Click at (350, 200) => local (150, 100)
    // NDC x = (150/600)*2 - 1 = -0.5
    // NDC y = -(100/400)*2 + 1 = 0.5
    mockIntersectObjects.mockReturnValue([]);
    raycastToMeshes(makeMouseEvent(350, 200), camera, container, []);

    const mouseArg = mockSetFromCamera.mock.calls[0][0];
    expect(mouseArg.x).toBeCloseTo(-0.5, 5);
    expect(mouseArg.y).toBeCloseTo(0.5, 5);
  });
});
