/**
 * useCameraControls — Camera controller hook extracted from TileBasedTerrain.
 *
 * Handles UE5-style fly camera (RMB hold/drag + WASD) and OrbitControls for
 * the World Studio viewport. All input handlers, pointer lock management, and
 * camera state are encapsulated here.
 *
 * PERFORMANCE: Pre-allocated Vector3 pool eliminates per-frame allocations in
 * updateCamera (previously 3-4 new THREE.Vector3() per frame = 180-240/sec).
 */

import { useRef, useCallback } from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { THREE } from "@/utils/webgpu-renderer";

// ============== Types ==============

export interface CameraState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  euler: THREE.Euler;
  moveSpeed: number;
  lookSpeed: number;
}

export interface CameraControlsConfig {
  worldSize: number;
  tileSize: number;
  onFlyModeChange?: (enabled: boolean) => void;
  onMoveSpeedChange?: (speed: number) => void;
  onViewportContextMenu?: (x: number, y: number) => void;
}

export interface CameraControlsReturn {
  // Refs exposed for TileBasedTerrain to use
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  cameraStateRef: React.MutableRefObject<CameraState>;
  orbitControlsRef: React.MutableRefObject<OrbitControls | null>;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  keysRef: React.MutableRefObject<Set<string>>;
  isPointerLockedRef: React.MutableRefObject<boolean>;
  rmbFlyActiveRef: React.MutableRefObject<boolean>;
  rmbDidFlyRef: React.MutableRefObject<boolean>;
  pendingOrbitCreateRef: React.MutableRefObject<number>;

  // Callbacks
  updateCamera: (deltaTime: number) => void;
  createOrbitControls: () => void;
  enterFlyMode: () => void;

  // Event handlers (attach to container / document)
  handleMouseMove: (event: MouseEvent) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  handleKeyUp: (event: KeyboardEvent) => void;
  handleMouseDown: (event: MouseEvent) => void;
  handleMouseUp: (event: MouseEvent) => void;
  handleWheel: (event: WheelEvent) => void;
  handleContextMenu: (event: MouseEvent) => void;
  handlePointerLockChange: () => void;

  /** Initialize orbit controls on an existing camera + container. Called once during scene setup. */
  initOrbitControls: (
    camera: THREE.PerspectiveCamera,
    container: HTMLDivElement,
    target: THREE.Vector3,
  ) => OrbitControls;

  /** Cleanup — dispose orbit controls + clear hold timer */
  dispose: () => void;
}

// ============== Pre-allocated Vector3 pool ==============
// Eliminates 3-4 new THREE.Vector3() per frame in updateCamera fly mode.

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _targetVelocity = new THREE.Vector3();
const _velocityDelta = new THREE.Vector3();

// Pre-allocated temps for createOrbitControls
const _savedPos = new THREE.Vector3();
const _savedQuat = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _spherical = new THREE.Spherical();

// ============== Hook ==============

export function useCameraControls(
  config: CameraControlsConfig,
): CameraControlsReturn {
  const {
    worldSize,
    tileSize,
    onFlyModeChange,
    onMoveSpeedChange,
    onViewportContextMenu,
  } = config;

  // Core refs
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitControlsRef = useRef<OrbitControls | null>(null);

  // Camera state for fly controls
  const cameraStateRef = useRef<CameraState>({
    position: new THREE.Vector3(0, 200, 0),
    velocity: new THREE.Vector3(),
    euler: new THREE.Euler(0, 0, 0, "YXZ"),
    moveSpeed: 200,
    lookSpeed: 0.002,
  });

  // Input state
  const keysRef = useRef<Set<string>>(new Set());
  const isPointerLockedRef = useRef(false);

  // RMB-hold fly mode (UE5-style: hold = fly, quick click = context menu)
  const isRmbHeldRef = useRef(false);
  const rmbFlyActiveRef = useRef(false);
  const rmbStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rmbHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rmbDidFlyRef = useRef(false);
  const flySkipMovesRef = useRef(0);
  const pendingOrbitCreateRef = useRef(0);

  // Create a fresh OrbitControls synced to the current camera position.
  // Called from the animation loop AFTER pointer-lock events have settled.
  //
  // IMPORTANT: OrbitControls constructor internally calls this.update() with
  // target=(0,0,0), which calls camera.lookAt(0,0,0) and CORRUPTS the camera
  // rotation. We save camera state before construction and restore it after.
  const createOrbitControls = useCallback(() => {
    const cam = cameraRef.current;
    const container = containerRef.current;
    if (!cam || !container) return;

    // Dispose any existing controls (safety — should already be null)
    if (orbitControlsRef.current) {
      orbitControlsRef.current.dispose();
    }

    // --- Save camera state BEFORE OrbitControls constructor corrupts it ---
    _savedPos.copy(cameraStateRef.current.position);
    const savedEuler = cameraStateRef.current.euler.clone();
    _savedQuat.setFromEuler(savedEuler);

    // Constructor calls update() → lookAt(0,0,0) → corrupts camera rotation
    const controls = new OrbitControls(cam, container);

    // --- Restore camera state that constructor corrupted ---
    cam.position.copy(_savedPos);
    cam.quaternion.copy(_savedQuat);

    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: -1 as THREE.MOUSE, // RMB handled manually for fly mode
    };

    // Orbit target = 200 units in front of where camera was looking
    _dir.set(0, 0, -1).applyEuler(savedEuler);
    controls.target.copy(_savedPos).add(_dir.multiplyScalar(200));

    // Compute safe maxPolarAngle that accommodates current camera angle.
    // Without this, update() would clamp phi and snap the camera upward.
    _offset.subVectors(_savedPos, controls.target);
    _spherical.setFromVector3(_offset);
    const currentPhi = _spherical.phi;
    controls.maxPolarAngle = Math.max(Math.PI / 2 - 0.05, currentPhi + 0.1);

    // No distance constraints yet — let first update() sync internal state
    controls.update();

    // Force-restore camera one final time as safety net against update() drift
    cam.position.copy(_savedPos);
    cam.quaternion.copy(_savedQuat);

    // Now apply constraints for future user interactions
    controls.minDistance = 20;
    controls.maxDistance = 3000;

    orbitControlsRef.current = controls;
  }, []);

  // Handle camera updates — fly mode (pointer lock) or orbit controls
  const updateCamera = useCallback(
    (deltaTime: number) => {
      const camera = cameraRef.current;
      const state = cameraStateRef.current;
      const keys = keysRef.current;
      const controls = orbitControlsRef.current;

      if (!camera) return;

      if (rmbFlyActiveRef.current) {
        // Fly mode: WASD + Q/E movement (UE5-style)
        // Uses pre-allocated vectors — zero per-frame allocations
        _forward.set(0, 0, -1).applyEuler(state.euler);
        _right.set(1, 0, 0).applyEuler(state.euler);
        _up.set(0, 1, 0);

        _targetVelocity.set(0, 0, 0);

        if (keys.has("KeyW") || keys.has("ArrowUp")) {
          _targetVelocity.add(_forward);
        }
        if (keys.has("KeyS") || keys.has("ArrowDown")) {
          _targetVelocity.sub(_forward);
        }
        if (keys.has("KeyA") || keys.has("ArrowLeft")) {
          _targetVelocity.sub(_right);
        }
        if (keys.has("KeyD") || keys.has("ArrowRight")) {
          _targetVelocity.add(_right);
        }
        if (keys.has("Space") || keys.has("KeyE")) {
          _targetVelocity.add(_up);
        }
        if (
          keys.has("ShiftLeft") ||
          keys.has("ShiftRight") ||
          keys.has("KeyQ")
        ) {
          _targetVelocity.sub(_up);
        }

        if (_targetVelocity.length() > 0) {
          _targetVelocity.normalize().multiplyScalar(state.moveSpeed);
        }

        state.velocity.lerp(_targetVelocity, 1 - Math.exp(-10 * deltaTime));

        // Apply velocity without allocating — use pre-allocated temp
        _velocityDelta.copy(state.velocity).multiplyScalar(deltaTime);
        state.position.add(_velocityDelta);

        // Clamp to world bounds
        const worldSizeMeters = worldSize * tileSize;
        const margin = tileSize * 2;
        state.position.x = Math.max(
          -margin,
          Math.min(worldSizeMeters + margin, state.position.x),
        );
        state.position.z = Math.max(
          -margin,
          Math.min(worldSizeMeters + margin, state.position.z),
        );
        state.position.y = Math.max(10, Math.min(2000, state.position.y));

        camera.position.copy(state.position);
        camera.quaternion.setFromEuler(state.euler);
      } else if (pendingOrbitCreateRef.current > 0) {
        // Transition: camera holds perfectly still while pointer-lock
        // cursor-jump events settle. After enough frames, create OrbitControls.
        pendingOrbitCreateRef.current--;
        if (pendingOrbitCreateRef.current === 0) {
          createOrbitControls();
        }
      } else if (controls && controls.enabled) {
        // Orbit mode: OrbitControls drives the camera, sync state for tile loading.
        controls.update();
        state.position.copy(camera.position);
        state.euler.setFromQuaternion(camera.quaternion, "YXZ");
      }
    },
    [worldSize, tileSize, createOrbitControls],
  );

  // Shared fly-mode activation (called by hold timer OR drag threshold)
  const enterFlyMode = useCallback(() => {
    if (rmbFlyActiveRef.current) return;
    rmbFlyActiveRef.current = true;
    rmbDidFlyRef.current = true;
    // Skip first 2 mouse-move events — macOS pointer lock fires bogus movementY
    flySkipMovesRef.current = 2;

    // Sync euler from current camera orientation
    const cam = cameraRef.current;
    if (cam) {
      cameraStateRef.current.euler.setFromQuaternion(cam.quaternion, "YXZ");
      cameraStateRef.current.position.copy(cam.position);
    }

    // Destroy orbit controls entirely — when fly mode exits, a fresh instance
    // is created. This eliminates all stale internal state (damping inertia,
    // spherical deltas, pan offsets, event listener state).
    const controls = orbitControlsRef.current;
    if (controls) {
      controls.dispose();
      orbitControlsRef.current = null;
    }

    // Request pointer lock (transient activation from recent mousedown is valid ~5s)
    containerRef.current?.requestPointerLock();

    onFlyModeChange?.(true);
  }, [onFlyModeChange]);

  // Handle mouse movement for camera look + RMB drag threshold
  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      // Drag threshold to enter fly mode immediately (before hold timer fires)
      if (isRmbHeldRef.current && !rmbFlyActiveRef.current) {
        const dx = event.clientX - rmbStartPosRef.current.x;
        const dy = event.clientY - rmbStartPosRef.current.y;
        if (dx * dx + dy * dy > 100) {
          // Cancel hold timer (drag activated first)
          if (rmbHoldTimerRef.current) {
            clearTimeout(rmbHoldTimerRef.current);
            rmbHoldTimerRef.current = null;
          }
          enterFlyMode();
        }
        return;
      }

      if (!rmbFlyActiveRef.current) return;

      // Skip initial events after entering fly mode — macOS pointer lock
      // produces a bogus large movementY that snaps the camera downward
      if (flySkipMovesRef.current > 0) {
        flySkipMovesRef.current--;
        return;
      }

      const state = cameraStateRef.current;
      const movementX = event.movementX || 0;
      const movementY = event.movementY || 0;

      state.euler.y -= movementX * state.lookSpeed;
      state.euler.x -= movementY * state.lookSpeed;

      // Clamp vertical rotation
      state.euler.x = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, state.euler.x),
      );
    },
    [enterFlyMode],
  );

  // Handle keyboard input
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      keysRef.current.add(event.code);

      // [ / ] keys adjust fly speed (trackpad-friendly alternative to scroll wheel)
      if (rmbFlyActiveRef.current) {
        if (event.code === "BracketLeft" || event.code === "BracketRight") {
          const factor = event.code === "BracketLeft" ? 0.8 : 1.25;
          const newSpeed = Math.max(
            20,
            Math.min(2000, cameraStateRef.current.moveSpeed * factor),
          );
          cameraStateRef.current.moveSpeed = newSpeed;
          onMoveSpeedChange?.(newSpeed);
        }
      }
    },
    [onMoveSpeedChange],
  );

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    keysRef.current.delete(event.code);
  }, []);

  // Handle RMB mousedown — start hold timer + drag tracking for fly mode
  // UE5 behavior: quick click = context menu, hold (~150ms) or drag = fly mode
  const handleMouseDown = useCallback(
    (event: MouseEvent) => {
      if (event.button === 2) {
        isRmbHeldRef.current = true;
        rmbDidFlyRef.current = false;
        rmbStartPosRef.current = { x: event.clientX, y: event.clientY };

        // Start hold timer — activates fly mode after 300ms even without mouse movement.
        // 300ms is long enough that a quick trackpad two-finger tap registers as a
        // right-click (context menu) rather than accidentally entering fly mode.
        rmbHoldTimerRef.current = setTimeout(() => {
          rmbHoldTimerRef.current = null;
          if (isRmbHeldRef.current) {
            enterFlyMode();
          }
        }, 300);
      }
    },
    [enterFlyMode],
  );

  // Handle RMB mouseup — exit fly mode or trigger context menu
  const handleMouseUp = useCallback(
    (event: MouseEvent) => {
      if (event.button === 2 && isRmbHeldRef.current) {
        // Cancel hold timer if it hasn't fired yet (quick click)
        if (rmbHoldTimerRef.current) {
          clearTimeout(rmbHoldTimerRef.current);
          rmbHoldTimerRef.current = null;
        }

        const wasFlying = rmbFlyActiveRef.current;
        isRmbHeldRef.current = false;
        rmbFlyActiveRef.current = false;

        // Zero out fly velocity so it doesn't bleed into orbit mode
        cameraStateRef.current.velocity.set(0, 0, 0);

        // Exit pointer lock if active
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }

        if (wasFlying) {
          // Don't create OrbitControls now — pointer lock exit is async and
          // the browser will fire cursor-jump mousemove events. Defer creation
          // by 5 frames in the animation loop so all events settle first.
          // Camera holds perfectly still during those frames.
          pendingOrbitCreateRef.current = 5;

          onFlyModeChange?.(false);
        } else {
          // Quick click (no fly) — trigger custom context menu
          onViewportContextMenu?.(event.clientX, event.clientY);
        }
      }
    },
    [onFlyModeChange, onViewportContextMenu],
  );

  // Handle scroll wheel — speed adjustment during fly, zoom in orbit
  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (rmbFlyActiveRef.current) {
        // During fly: adjust moveSpeed (persists across sessions)
        event.preventDefault();
        const factor = event.deltaY > 0 ? 0.8 : 1.25; // 20% steps
        const newSpeed = Math.max(
          20,
          Math.min(2000, cameraStateRef.current.moveSpeed * factor),
        );
        cameraStateRef.current.moveSpeed = newSpeed;
        onMoveSpeedChange?.(newSpeed);
      }
      // In orbit mode: OrbitControls handles zoom automatically
    },
    [onMoveSpeedChange],
  );

  // Always suppress native + React contextmenu from the viewport.
  // On macOS, contextmenu fires on mousedown (before fly mode can activate).
  // Instead, quick-click context menu is triggered manually from handleMouseUp.
  const handleContextMenu = useCallback((event: MouseEvent) => {
    if (!containerRef.current?.contains(event.target as Node)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, []);

  const handlePointerLockChange = useCallback(() => {
    isPointerLockedRef.current =
      document.pointerLockElement === containerRef.current;

    // Handle unexpected pointer lock exit (e.g., user pressed Esc while RMB held)
    if (!isPointerLockedRef.current && rmbFlyActiveRef.current) {
      isRmbHeldRef.current = false;
      rmbFlyActiveRef.current = false;
      cameraStateRef.current.velocity.set(0, 0, 0);

      // Defer OrbitControls creation (same as handleMouseUp path)
      pendingOrbitCreateRef.current = 5;
      onFlyModeChange?.(false);
    }
  }, [onFlyModeChange]);

  // Initialize orbit controls on a camera + container pair.
  // Called once during scene setup (not during fly-to-orbit transitions —
  // those use createOrbitControls which preserves camera orientation).
  const initOrbitControls = useCallback(
    (
      camera: THREE.PerspectiveCamera,
      container: HTMLDivElement,
      target: THREE.Vector3,
    ): OrbitControls => {
      const controls = new OrbitControls(camera, container);
      controls.target.copy(target);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.screenSpacePanning = true;
      controls.minDistance = 20;
      controls.maxDistance = 3000;
      controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: -1 as THREE.MOUSE, // RMB handled manually for fly mode
      };
      controls.update();
      orbitControlsRef.current = controls;
      // Sync initial euler from orbit position
      cameraStateRef.current.euler.setFromQuaternion(camera.quaternion, "YXZ");
      return controls;
    },
    [],
  );

  // Cleanup
  const dispose = useCallback(() => {
    if (rmbHoldTimerRef.current) {
      clearTimeout(rmbHoldTimerRef.current);
      rmbHoldTimerRef.current = null;
    }
    if (orbitControlsRef.current) {
      orbitControlsRef.current.dispose();
      orbitControlsRef.current = null;
    }
  }, []);

  return {
    cameraRef,
    cameraStateRef,
    orbitControlsRef,
    containerRef,
    keysRef,
    isPointerLockedRef,
    rmbFlyActiveRef,
    rmbDidFlyRef,
    pendingOrbitCreateRef,

    updateCamera,
    createOrbitControls,
    enterFlyMode,

    handleMouseMove,
    handleKeyDown,
    handleKeyUp,
    handleMouseDown,
    handleMouseUp,
    handleWheel,
    handleContextMenu,
    handlePointerLockChange,
    initOrbitControls,
    dispose,
  };
}
