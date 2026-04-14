/**
 * CameraController — Framework-agnostic camera controller extracted from useCameraControls.
 *
 * Handles UE5-style fly camera (RMB hold/drag + WASD), orbit controls, and player
 * preview mode (ground-locked WASD walk with mouse look). All input handlers, pointer
 * lock management, and camera state are encapsulated here.
 *
 * This is a plain class (no React hooks) suitable for use in any Three.js context.
 * The React hook `useCameraControls` can be refactored to delegate to this class.
 *
 * PERFORMANCE: Pre-allocated Vector3/Euler/Quaternion pool eliminates per-frame
 * allocations in updateCamera (previously 3-4 new THREE.Vector3() per frame).
 */

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { THREE } from "@/utils/webgpu-renderer";

// ============== Types ==============

export interface CameraControllerConfig {
  /** World size in tiles. Used for movement clamping. */
  worldSize: number;
  /** Tile size in world units (meters). Used for movement clamping. */
  tileSize: number;
  /** Minimum orbit distance. Default: 20 */
  minDistance?: number;
  /** Maximum orbit distance. Default: 3000 */
  maxDistance?: number;
  /** Enable orbit damping. Default: true */
  enableDamping?: boolean;
  /** Orbit damping factor. Default: 0.1 */
  dampingFactor?: number;
  /** Initial fly speed in units/sec. Default: 200 */
  initialFlySpeed?: number;
  /** Mouse look sensitivity. Default: 0.002 */
  lookSpeed?: number;

  // Callbacks
  onFlyModeChange?: (enabled: boolean) => void;
  onMoveSpeedChange?: (speed: number) => void;
  onViewportContextMenu?: (x: number, y: number) => void;
  onPlayerModeChange?: (enabled: boolean) => void;
  /** Terrain height sampler for player mode ground lock. */
  getTerrainHeight?: (sceneX: number, sceneZ: number) => number;
}

export interface CameraState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  euler: THREE.Euler;
  moveSpeed: number;
  lookSpeed: number;
}

// ============== Pre-allocated math objects (zero per-frame GC) ==============

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

// Player mode XZ movement
const _playerForward = new THREE.Vector3();
const _playerRight = new THREE.Vector3();

// Player mode constants
const PLAYER_EYE_HEIGHT = 1.7; // meters
const PLAYER_WALK_SPEED = 5; // m/s
const PLAYER_SPRINT_SPEED = 15; // m/s
const PLAYER_FOV = 60;

// ============== Class ==============

export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  readonly domElement: HTMLElement;

  // Orbit controls — created/destroyed as camera transitions between modes
  private _orbitControls: OrbitControls | null = null;

  // Camera state (fly mode orientation + position + velocity)
  private _state: CameraState;

  // Input state
  private readonly _keys = new Set<string>();
  private _isPointerLocked = false;

  // RMB-hold fly mode (UE5-style: hold = fly, quick click = context menu)
  private _isRmbHeld = false;
  private _rmbFlyActive = false;
  private _rmbStartPos = { x: 0, y: 0 };
  private _rmbHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private _rmbDidFly = false;
  private _flySkipMoves = 0;
  private _pendingOrbitCreate = 0;

  // Player preview mode
  private _playerMode = false;
  private _savedCameraFov = 75;
  private _getTerrainHeight: ((x: number, z: number) => number) | undefined;

  // Config
  private readonly _worldSize: number;
  private readonly _tileSize: number;
  private readonly _minDistance: number;
  private readonly _maxDistance: number;
  private readonly _enableDamping: boolean;
  private readonly _dampingFactor: number;

  // Callbacks
  private _onFlyModeChange?: (enabled: boolean) => void;
  private _onMoveSpeedChange?: (speed: number) => void;
  private _onViewportContextMenu?: (x: number, y: number) => void;
  private _onPlayerModeChange?: (enabled: boolean) => void;

  // Bound event handlers (stored for removeEventListener)
  private readonly _boundHandleMouseMove: (e: MouseEvent) => void;
  private readonly _boundHandleKeyDown: (e: KeyboardEvent) => void;
  private readonly _boundHandleKeyUp: (e: KeyboardEvent) => void;
  private readonly _boundHandleMouseDown: (e: MouseEvent) => void;
  private readonly _boundHandleMouseUp: (e: MouseEvent) => void;
  private readonly _boundHandleWheel: (e: WheelEvent) => void;
  private readonly _boundHandleContextMenu: (e: MouseEvent) => void;
  private readonly _boundHandlePointerLockChange: () => void;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    config: CameraControllerConfig,
  ) {
    this.camera = camera;
    this.domElement = domElement;

    this._worldSize = config.worldSize;
    this._tileSize = config.tileSize;
    this._minDistance = config.minDistance ?? 20;
    this._maxDistance = config.maxDistance ?? 3000;
    this._enableDamping = config.enableDamping ?? true;
    this._dampingFactor = config.dampingFactor ?? 0.1;

    this._onFlyModeChange = config.onFlyModeChange;
    this._onMoveSpeedChange = config.onMoveSpeedChange;
    this._onViewportContextMenu = config.onViewportContextMenu;
    this._onPlayerModeChange = config.onPlayerModeChange;
    this._getTerrainHeight = config.getTerrainHeight;

    this._state = {
      position: new THREE.Vector3().copy(camera.position),
      velocity: new THREE.Vector3(),
      euler: new THREE.Euler(0, 0, 0, "YXZ"),
      moveSpeed: config.initialFlySpeed ?? 200,
      lookSpeed: config.lookSpeed ?? 0.002,
    };

    // Sync initial euler from camera orientation
    this._state.euler.setFromQuaternion(camera.quaternion, "YXZ");

    // Bind event handlers
    this._boundHandleMouseMove = this.handleMouseMove.bind(this);
    this._boundHandleKeyDown = this.handleKeyDown.bind(this);
    this._boundHandleKeyUp = this.handleKeyUp.bind(this);
    this._boundHandleMouseDown = this.handleMouseDown.bind(this);
    this._boundHandleMouseUp = this.handleMouseUp.bind(this);
    this._boundHandleWheel = this.handleWheel.bind(this);
    this._boundHandleContextMenu = this.handleContextMenu.bind(this);
    this._boundHandlePointerLockChange =
      this._handlePointerLockChange.bind(this);

    // Attach listeners
    domElement.addEventListener("mousemove", this._boundHandleMouseMove);
    domElement.addEventListener("mousedown", this._boundHandleMouseDown);
    domElement.addEventListener("mouseup", this._boundHandleMouseUp);
    domElement.addEventListener("wheel", this._boundHandleWheel, {
      passive: false,
    });
    domElement.addEventListener("contextmenu", this._boundHandleContextMenu);
    document.addEventListener("keydown", this._boundHandleKeyDown);
    document.addEventListener("keyup", this._boundHandleKeyUp);
    document.addEventListener(
      "pointerlockchange",
      this._boundHandlePointerLockChange,
    );
  }

  // ============== Public accessors ==============

  get orbitControls(): OrbitControls | null {
    return this._orbitControls;
  }

  get state(): CameraState {
    return this._state;
  }

  get keys(): ReadonlySet<string> {
    return this._keys;
  }

  get isFlyMode(): boolean {
    return this._rmbFlyActive;
  }

  get isPlayerMode(): boolean {
    return this._playerMode;
  }

  get isPointerLocked(): boolean {
    return this._isPointerLocked;
  }

  /** Whether RMB fly mode was used in the current mouse interaction (for context menu suppression). */
  get didFly(): boolean {
    return this._rmbDidFly;
  }

  /** Read and auto-reset the didFly flag. */
  consumeDidFly(): boolean {
    const val = this._rmbDidFly;
    this._rmbDidFly = false;
    return val;
  }

  get moveSpeed(): number {
    return this._state.moveSpeed;
  }

  set moveSpeed(speed: number) {
    this._state.moveSpeed = speed;
  }

  /** Update the terrain height sampler (e.g., when terrain regenerates). */
  set getTerrainHeight(
    fn: ((sceneX: number, sceneZ: number) => number) | undefined,
  ) {
    this._getTerrainHeight = fn;
  }

  // ============== Orbit controls lifecycle ==============

  /**
   * Initialize orbit controls for the first time.
   * Called once during scene setup (not during fly-to-orbit transitions).
   */
  initOrbitControls(target: THREE.Vector3): OrbitControls {
    const controls = new OrbitControls(this.camera, this.domElement);
    controls.target.copy(target);
    controls.enableDamping = this._enableDamping;
    controls.dampingFactor = this._dampingFactor;
    controls.screenSpacePanning = true;
    controls.minDistance = this._minDistance;
    controls.maxDistance = this._maxDistance;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: -1 as THREE.MOUSE, // RMB handled manually for fly mode
    };
    controls.update();
    this._orbitControls = controls;

    // Sync initial euler from orbit position
    this._state.euler.setFromQuaternion(this.camera.quaternion, "YXZ");
    return controls;
  }

  /**
   * Create a fresh OrbitControls synced to the current camera position.
   * Called from the animation loop AFTER pointer-lock events have settled.
   *
   * IMPORTANT: OrbitControls constructor internally calls this.update() with
   * target=(0,0,0), which calls camera.lookAt(0,0,0) and CORRUPTS the camera
   * rotation. We save camera state before construction and restore it after.
   */
  private _createOrbitControls(): void {
    // Dispose any existing controls (safety — should already be null)
    if (this._orbitControls) {
      this._orbitControls.dispose();
    }

    // --- Save camera state BEFORE OrbitControls constructor corrupts it ---
    _savedPos.copy(this._state.position);
    const savedEuler = this._state.euler.clone();
    _savedQuat.setFromEuler(savedEuler);

    // Constructor calls update() -> lookAt(0,0,0) -> corrupts camera rotation
    const controls = new OrbitControls(this.camera, this.domElement);

    // --- Restore camera state that constructor corrupted ---
    this.camera.position.copy(_savedPos);
    this.camera.quaternion.copy(_savedQuat);

    controls.enableDamping = this._enableDamping;
    controls.dampingFactor = this._dampingFactor;
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
    this.camera.position.copy(_savedPos);
    this.camera.quaternion.copy(_savedQuat);

    // Now apply constraints for future user interactions
    controls.minDistance = this._minDistance;
    controls.maxDistance = this._maxDistance;

    this._orbitControls = controls;
  }

  // ============== Mode transitions ==============

  /**
   * Enter fly mode (RMB + WASD).
   * Destroys orbit controls and requests pointer lock.
   */
  enterFlyMode(): void {
    if (this._rmbFlyActive || this._playerMode) return;
    this._rmbFlyActive = true;
    this._rmbDidFly = true;
    // Skip first 2 mouse-move events — macOS pointer lock fires bogus movementY
    this._flySkipMoves = 2;

    // Sync euler from current camera orientation
    this._state.euler.setFromQuaternion(this.camera.quaternion, "YXZ");
    this._state.position.copy(this.camera.position);

    // Destroy orbit controls entirely — when fly mode exits, a fresh instance
    // is created. This eliminates all stale internal state (damping inertia,
    // spherical deltas, pan offsets, event listener state).
    if (this._orbitControls) {
      this._orbitControls.dispose();
      this._orbitControls = null;
    }

    // Request pointer lock (transient activation from recent mousedown is valid ~5s)
    this.domElement.requestPointerLock();

    this._onFlyModeChange?.(true);
  }

  /**
   * Exit fly mode. Called internally on RMB release or pointer lock loss.
   * Defers OrbitControls creation by 5 frames so pointer-lock cursor-jump events settle.
   */
  private _exitFlyMode(): void {
    const wasFlying = this._rmbFlyActive;
    this._isRmbHeld = false;
    this._rmbFlyActive = false;

    // Zero out fly velocity so it doesn't bleed into orbit mode
    this._state.velocity.set(0, 0, 0);

    // Exit pointer lock if active
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    if (wasFlying) {
      // Don't create OrbitControls now — pointer lock exit is async and
      // the browser will fire cursor-jump mousemove events. Defer creation
      // by 5 frames in the animation loop so all events settle first.
      // Camera holds perfectly still during those frames.
      this._pendingOrbitCreate = 5;
      this._onFlyModeChange?.(false);
    }
  }

  /**
   * Enter player preview mode: ground-locked, WASD walk, mouse look always active.
   * Press Escape to exit.
   */
  enterPlayerMode(): void {
    if (this._playerMode) return;

    // Save current FOV to restore on exit
    this._savedCameraFov = this.camera.fov;
    this.camera.fov = PLAYER_FOV;
    this.camera.updateProjectionMatrix();

    // Sync state from current camera
    this._state.euler.setFromQuaternion(this.camera.quaternion, "YXZ");
    this._state.position.copy(this.camera.position);
    this._state.velocity.set(0, 0, 0);

    // Destroy orbit controls
    if (this._orbitControls) {
      this._orbitControls.dispose();
      this._orbitControls = null;
    }

    this._playerMode = true;
    this._flySkipMoves = 2;

    // Request pointer lock for mouse look
    this.domElement.requestPointerLock();

    this._onPlayerModeChange?.(true);
  }

  /** Exit player preview mode and return to orbit camera. */
  exitPlayerMode(): void {
    if (!this._playerMode) return;
    this._playerMode = false;

    this.camera.fov = this._savedCameraFov;
    this.camera.updateProjectionMatrix();

    this._state.velocity.set(0, 0, 0);

    // Exit pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    // Defer orbit controls creation (same as fly->orbit transition)
    this._pendingOrbitCreate = 5;
    this._onPlayerModeChange?.(false);
  }

  // ============== Per-frame update ==============

  /**
   * Call per frame with delta time (seconds).
   * Handles fly mode movement, player mode movement, orbit controls update,
   * and deferred orbit controls creation.
   */
  update(dt: number): void {
    if (this._playerMode) {
      this._updatePlayerMode(dt);
    } else if (this._rmbFlyActive) {
      this._updateFlyMode(dt);
    } else if (this._pendingOrbitCreate > 0) {
      // Transition: camera holds perfectly still while pointer-lock
      // cursor-jump events settle. After enough frames, create OrbitControls.
      this._pendingOrbitCreate--;
      if (this._pendingOrbitCreate === 0) {
        this._createOrbitControls();
      }
    } else if (this._orbitControls && this._orbitControls.enabled) {
      // Orbit mode: OrbitControls drives the camera, sync state for tile loading.
      this._orbitControls.update();
      this._state.position.copy(this.camera.position);
      this._state.euler.setFromQuaternion(this.camera.quaternion, "YXZ");
    }
  }

  private _updatePlayerMode(dt: number): void {
    const state = this._state;
    const keys = this._keys;

    const isSprinting = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const speed = isSprinting ? PLAYER_SPRINT_SPEED : PLAYER_WALK_SPEED;

    // Forward direction projected onto XZ plane
    _playerForward.set(0, 0, -1).applyEuler(state.euler);
    _playerForward.y = 0;
    _playerForward.normalize();

    _playerRight.set(1, 0, 0).applyEuler(state.euler);
    _playerRight.y = 0;
    _playerRight.normalize();

    _targetVelocity.set(0, 0, 0);
    if (keys.has("KeyW") || keys.has("ArrowUp"))
      _targetVelocity.add(_playerForward);
    if (keys.has("KeyS") || keys.has("ArrowDown"))
      _targetVelocity.sub(_playerForward);
    if (keys.has("KeyA") || keys.has("ArrowLeft"))
      _targetVelocity.sub(_playerRight);
    if (keys.has("KeyD") || keys.has("ArrowRight"))
      _targetVelocity.add(_playerRight);

    if (_targetVelocity.length() > 0) {
      _targetVelocity.normalize().multiplyScalar(speed);
    }

    state.velocity.lerp(_targetVelocity, 1 - Math.exp(-10 * dt));
    _velocityDelta.copy(state.velocity).multiplyScalar(dt);
    state.position.add(_velocityDelta);

    // Clamp to world bounds
    const worldSizeMeters = this._worldSize * this._tileSize;
    const margin = this._tileSize;
    state.position.x = Math.max(
      margin,
      Math.min(worldSizeMeters - margin, state.position.x),
    );
    state.position.z = Math.max(
      margin,
      Math.min(worldSizeMeters - margin, state.position.z),
    );

    // Ground lock: sample terrain height and set Y
    if (this._getTerrainHeight) {
      const terrainY = this._getTerrainHeight(
        state.position.x,
        state.position.z,
      );
      state.position.y = terrainY + PLAYER_EYE_HEIGHT;
    }

    this.camera.position.copy(state.position);
    this.camera.quaternion.setFromEuler(state.euler);
  }

  private _updateFlyMode(dt: number): void {
    const state = this._state;
    const keys = this._keys;

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
    if (keys.has("ShiftLeft") || keys.has("ShiftRight") || keys.has("KeyQ")) {
      _targetVelocity.sub(_up);
    }

    if (_targetVelocity.length() > 0) {
      _targetVelocity.normalize().multiplyScalar(state.moveSpeed);
    }

    state.velocity.lerp(_targetVelocity, 1 - Math.exp(-10 * dt));

    // Apply velocity without allocating — use pre-allocated temp
    _velocityDelta.copy(state.velocity).multiplyScalar(dt);
    state.position.add(_velocityDelta);

    // Clamp to world bounds
    const worldSizeMeters = this._worldSize * this._tileSize;
    const margin = this._tileSize * 2;
    state.position.x = Math.max(
      -margin,
      Math.min(worldSizeMeters + margin, state.position.x),
    );
    state.position.z = Math.max(
      -margin,
      Math.min(worldSizeMeters + margin, state.position.z),
    );
    state.position.y = Math.max(10, Math.min(2000, state.position.y));

    this.camera.position.copy(state.position);
    this.camera.quaternion.setFromEuler(state.euler);
  }

  // ============== Navigation ==============

  /**
   * Teleport camera to a world position. Pass close=true for entity-level zoom.
   * Updates both camera state and orbit controls target.
   */
  navigateTo(x: number, z: number, close?: boolean): void {
    const viewHeight = close ? 35 : 150;
    this._state.position.set(x, viewHeight, z);
    this.camera.position.set(x, viewHeight, z);
    if (this._orbitControls) {
      this._orbitControls.target.set(x, 0, z);
      this._orbitControls.update();
    }
  }

  /**
   * Animate camera to focus on a world position with a given bounding radius.
   * Uses ease-out cubic interpolation over 300ms.
   */
  focusOn(target: THREE.Vector3, radius: number): void {
    const ctrl = this._orbitControls;
    if (!ctrl) return;

    // Calculate camera distance to frame the object
    const fov = this.camera.fov * (Math.PI / 180);
    const distance = Math.max(radius * 2.5, 10) / Math.tan(fov / 2);

    // Animate orbit target and camera position
    const startTarget = ctrl.target.clone();
    const startPos = this.camera.position.clone();
    const endTarget = target.clone();
    const endPos = target
      .clone()
      .add(
        this.camera.position
          .clone()
          .sub(ctrl.target)
          .normalize()
          .multiplyScalar(distance),
      );

    const duration = 300; // ms
    const startTime = performance.now();

    const animateFocus = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      ctrl.target.lerpVectors(startTarget, endTarget, ease);
      this.camera.position.lerpVectors(startPos, endPos, ease);
      ctrl.update();
      if (t < 1) requestAnimationFrame(animateFocus);
    };
    animateFocus();
  }

  // ============== Interaction mode ==============

  /**
   * Set interaction mode to prevent OrbitControls from conflicting with editing tools.
   * 'orbit' = normal camera controls (left-click rotates)
   * 'tool'  = editing mode (left-click disabled on orbit, middle dolly, right pan)
   * 'gizmo' = transform gizmo active (left disabled for gizmo, middle orbit, right pan)
   */
  setInteractionMode(mode: "orbit" | "tool" | "gizmo"): void {
    const ctrl = this._orbitControls;
    if (!ctrl) return;
    // RMB always reserved for fly mode — never assign to OrbitControls
    if (mode === "gizmo") {
      ctrl.mouseButtons = {
        LEFT: -1 as THREE.MOUSE,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: -1 as THREE.MOUSE,
      };
    } else if (mode === "tool") {
      ctrl.mouseButtons = {
        LEFT: -1 as THREE.MOUSE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: -1 as THREE.MOUSE,
      };
    } else {
      ctrl.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: -1 as THREE.MOUSE,
      };
    }
  }

  // ============== Event handlers ==============

  handleMouseMove(event: MouseEvent): void {
    // Drag threshold to enter fly mode immediately (before hold timer fires)
    if (this._isRmbHeld && !this._rmbFlyActive) {
      const dx = event.clientX - this._rmbStartPos.x;
      const dy = event.clientY - this._rmbStartPos.y;
      if (dx * dx + dy * dy > 100) {
        // Cancel hold timer (drag activated first)
        if (this._rmbHoldTimer) {
          clearTimeout(this._rmbHoldTimer);
          this._rmbHoldTimer = null;
        }
        this.enterFlyMode();
      }
      return;
    }

    if (!this._rmbFlyActive && !this._playerMode) return;

    // Skip initial events after entering fly/player mode — macOS pointer lock
    // produces a bogus large movementY that snaps the camera downward
    if (this._flySkipMoves > 0) {
      this._flySkipMoves--;
      return;
    }

    const state = this._state;
    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    state.euler.y -= movementX * state.lookSpeed;
    state.euler.x -= movementY * state.lookSpeed;

    // Clamp vertical rotation
    state.euler.x = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, state.euler.x),
    );
  }

  handleKeyDown(event: KeyboardEvent): void {
    this._keys.add(event.code);

    // [ / ] keys adjust fly speed (trackpad-friendly alternative to scroll wheel)
    if (this._rmbFlyActive) {
      if (event.code === "BracketLeft" || event.code === "BracketRight") {
        const factor = event.code === "BracketLeft" ? 0.8 : 1.25;
        const newSpeed = Math.max(
          20,
          Math.min(2000, this._state.moveSpeed * factor),
        );
        this._state.moveSpeed = newSpeed;
        this._onMoveSpeedChange?.(newSpeed);
      }
    }
  }

  handleKeyUp(event: KeyboardEvent): void {
    this._keys.delete(event.code);
  }

  /**
   * Handle RMB mousedown — start hold timer + drag tracking for fly mode.
   * UE5 behavior: quick click = context menu, hold (~300ms) or drag = fly mode.
   */
  handleMouseDown(event: MouseEvent): void {
    if (event.button === 2) {
      this._isRmbHeld = true;
      this._rmbDidFly = false;
      this._rmbStartPos = { x: event.clientX, y: event.clientY };

      // Start hold timer — activates fly mode after 300ms even without mouse movement.
      // 300ms is long enough that a quick trackpad two-finger tap registers as a
      // right-click (context menu) rather than accidentally entering fly mode.
      this._rmbHoldTimer = setTimeout(() => {
        this._rmbHoldTimer = null;
        if (this._isRmbHeld) {
          this.enterFlyMode();
        }
      }, 300);
    }
  }

  /** Handle RMB mouseup — exit fly mode or trigger context menu. */
  handleMouseUp(event: MouseEvent): void {
    if (event.button === 2 && this._isRmbHeld) {
      // Cancel hold timer if it hasn't fired yet (quick click)
      if (this._rmbHoldTimer) {
        clearTimeout(this._rmbHoldTimer);
        this._rmbHoldTimer = null;
      }

      const wasFlying = this._rmbFlyActive;
      this._isRmbHeld = false;
      this._rmbFlyActive = false;

      // Zero out fly velocity so it doesn't bleed into orbit mode
      this._state.velocity.set(0, 0, 0);

      // Exit pointer lock if active
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }

      if (wasFlying) {
        // Don't create OrbitControls now — pointer lock exit is async and
        // the browser will fire cursor-jump mousemove events. Defer creation
        // by 5 frames in the animation loop so all events settle first.
        this._pendingOrbitCreate = 5;
        this._onFlyModeChange?.(false);
      } else {
        // Quick click (no fly) — trigger custom context menu
        this._onViewportContextMenu?.(event.clientX, event.clientY);
      }
    }
  }

  /** Handle scroll wheel — speed adjustment during fly, zoom in orbit. */
  handleWheel(event: WheelEvent): void {
    if (this._rmbFlyActive) {
      // During fly: adjust moveSpeed (persists across sessions)
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.8 : 1.25; // 20% steps
      const newSpeed = Math.max(
        20,
        Math.min(2000, this._state.moveSpeed * factor),
      );
      this._state.moveSpeed = newSpeed;
      this._onMoveSpeedChange?.(newSpeed);
    }
    // In orbit mode: OrbitControls handles zoom automatically
  }

  /** Always suppress native contextmenu from the viewport. */
  handleContextMenu(event: MouseEvent): void {
    if (!this.domElement.contains(event.target as Node)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  /** Internal pointer lock change handler. */
  private _handlePointerLockChange(): void {
    this._isPointerLocked = document.pointerLockElement === this.domElement;

    // Handle pointer lock exit (Escape key or programmatic)
    if (!this._isPointerLocked) {
      if (this._playerMode) {
        // Exit player mode when pointer lock is lost (Escape key)
        this.exitPlayerMode();
      } else if (this._rmbFlyActive) {
        // Handle unexpected pointer lock exit during fly mode
        this._exitFlyMode();
      }
    }
  }

  // ============== Cleanup ==============

  /** Remove all event listeners and dispose orbit controls. */
  dispose(): void {
    // Clear hold timer
    if (this._rmbHoldTimer) {
      clearTimeout(this._rmbHoldTimer);
      this._rmbHoldTimer = null;
    }

    // Dispose orbit controls
    if (this._orbitControls) {
      this._orbitControls.dispose();
      this._orbitControls = null;
    }

    // Remove event listeners
    this.domElement.removeEventListener(
      "mousemove",
      this._boundHandleMouseMove,
    );
    this.domElement.removeEventListener(
      "mousedown",
      this._boundHandleMouseDown,
    );
    this.domElement.removeEventListener("mouseup", this._boundHandleMouseUp);
    this.domElement.removeEventListener("wheel", this._boundHandleWheel);
    this.domElement.removeEventListener(
      "contextmenu",
      this._boundHandleContextMenu,
    );
    document.removeEventListener("keydown", this._boundHandleKeyDown);
    document.removeEventListener("keyup", this._boundHandleKeyUp);
    document.removeEventListener(
      "pointerlockchange",
      this._boundHandlePointerLockChange,
    );
  }
}
