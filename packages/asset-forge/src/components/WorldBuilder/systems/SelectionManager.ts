/**
 * SelectionManager — Framework-agnostic selection & hover system extracted from
 * TileBasedTerrain.
 *
 * Handles:
 * - Selectable object registry with add/remove
 * - Spatial hash for O(1) hover culling instead of O(n) raycasts against every
 *   registered selectable
 * - Mouse hover detection (raycast, parent-chain walk for userData)
 * - Click-to-pick with the same raycast + parent-chain walk
 *
 * This is a plain class (no React hooks) suitable for any Three.js context.
 * TileBasedTerrain can delegate its `handleMouseMoveForHover` and
 * `handleClick` logic here.
 *
 * PERFORMANCE: The spatial hash partitions world-space XZ into cells so that
 * `updateHover` / `pick` only raycast against objects in nearby cells rather
 * than the entire selectable list. Grid resolution is configurable via
 * `cellSize` (default 256 world-units — roughly 2.5 terrain tiles).
 */

import { THREE } from "@/utils/webgpu-renderer";

// ======================== Public Types ========================

/** Metadata attached to a selectable object. */
export interface SelectableMeta {
  /** Domain type — "town", "building", "entity", "vegetation", etc. */
  type: string;
  /** Unique id within that type. */
  id: string;
  /** Arbitrary payload surfaced on hit results. */
  entityData?: Record<string, unknown>;
}

/** Result returned from `updateHover` or `pick`. */
export interface SelectionHit {
  type: string;
  id: string;
  /** World-space intersection point. */
  point: THREE.Vector3;
  /** The resolved Object3D that owns the selectable userData. */
  object: THREE.Object3D;
  /** Arbitrary payload from the registering call. */
  entityData?: Record<string, unknown>;
}

// ======================== Internal Types ========================

/** Internal record stored for every registered selectable. */
interface SelectableEntry {
  object: THREE.Object3D;
  meta: SelectableMeta;
  /** Spatial hash cell key when last inserted (for fast removal). */
  cellKey: string;
}

// ======================== Spatial Hash ========================

/**
 * Lightweight 2-D spatial hash over the XZ plane.
 *
 * Each cell stores a Set of SelectableEntry references. Objects are binned by
 * their `object.position` at registration time. For objects that move you can
 * call `removeSelectable` + `addSelectable` to re-bin.
 */
class SpatialHash {
  private readonly _cellSize: number;
  private readonly _invCellSize: number;
  private readonly _cells = new Map<string, Set<SelectableEntry>>();

  constructor(cellSize: number) {
    this._cellSize = cellSize;
    this._invCellSize = 1 / cellSize;
  }

  /** Compute the cell key for an XZ position. */
  keyFor(x: number, z: number): string {
    const cx = Math.floor(x * this._invCellSize);
    const cz = Math.floor(z * this._invCellSize);
    return `${cx},${cz}`;
  }

  /** Insert an entry into the cell covering its world position. */
  insert(entry: SelectableEntry): void {
    const key = entry.cellKey;
    let bucket = this._cells.get(key);
    if (!bucket) {
      bucket = new Set();
      this._cells.set(key, bucket);
    }
    bucket.add(entry);
  }

  /** Remove an entry from its recorded cell. */
  remove(entry: SelectableEntry): void {
    const bucket = this._cells.get(entry.cellKey);
    if (bucket) {
      bucket.delete(entry);
      if (bucket.size === 0) this._cells.delete(entry.cellKey);
    }
  }

  /**
   * Gather every entry whose cell is within `radius` cells of `(x, z)`.
   *
   * Returns entries from a neighbourhood of `(2*radius+1)^2` cells centred on
   * the camera-ray ground intersection. This is intentionally generous — the
   * raycaster does the precise filtering afterwards.
   */
  query(x: number, z: number, radius: number, out: SelectableEntry[]): void {
    const cx = Math.floor(x * this._invCellSize);
    const cz = Math.floor(z * this._invCellSize);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        const bucket = this._cells.get(key);
        if (bucket) {
          for (const entry of bucket) out.push(entry);
        }
      }
    }
  }

  clear(): void {
    this._cells.clear();
  }

  get size(): number {
    let n = 0;
    for (const bucket of this._cells.values()) n += bucket.size;
    return n;
  }

  get cellSize(): number {
    return this._cellSize;
  }
}

// ======================== Pre-allocated Pools ========================

const _mouse = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _groundHit = new THREE.Vector3();

// Reusable arrays — cleared before each use to avoid GC churn.
const _queryBuffer: SelectableEntry[] = [];
const _objBuffer: THREE.Object3D[] = [];

// ======================== SelectionManager ========================

export class SelectionManager {
  // --- Dependencies ---
  private _camera: THREE.Camera;
  private _container: HTMLElement;

  // --- Registry ---
  /** Map from Object3D → internal entry for O(1) removal. */
  private readonly _entries = new Map<THREE.Object3D, SelectableEntry>();

  // --- Spatial hash ---
  private readonly _hash: SpatialHash;

  /**
   * Number of cells to query in each direction around the ground-plane
   * intersection. The effective search area is
   * `(2 * _queryCellRadius + 1)^2 * cellSize^2` world-units^2.
   *
   * A radius of 2 with the default 256 cell size gives a 1280 x 1280 m search
   * window — well beyond typical viewport frustum depth.
   */
  private _queryCellRadius = 2;

  // --- Hover throttle ---
  private _lastHoverTime = 0;
  /** Minimum ms between hover raycasts (~15 fps). */
  private _hoverThrottleMs = 66;

  // --- State ---
  private _disposed = false;

  // ------------------------------------------------------------------
  // Construction
  // ------------------------------------------------------------------

  /**
   * @param camera      The Three.js camera used for raycasting.
   * @param container   DOM element that receives mouse events (used for NDC
   *                    coordinate calculation).
   * @param cellSize    Spatial hash cell size in world-units. Larger values
   *                    mean fewer cells but more objects per query. Default 256.
   */
  constructor(camera: THREE.Camera, container: HTMLElement, cellSize = 256) {
    this._camera = camera;
    this._container = container;
    this._hash = new SpatialHash(cellSize);
  }

  // ------------------------------------------------------------------
  // Camera / Container hot-swap (for React re-renders)
  // ------------------------------------------------------------------

  set camera(cam: THREE.Camera) {
    this._camera = cam;
  }

  get camera(): THREE.Camera {
    return this._camera;
  }

  set container(el: HTMLElement) {
    this._container = el;
  }

  // ------------------------------------------------------------------
  // Registry
  // ------------------------------------------------------------------

  /**
   * Register an Object3D as selectable.
   *
   * The object's current world position is used for spatial hashing. If the
   * object has not been added to a scene yet (no valid world matrix), its
   * local `position` is used instead.
   *
   * Calling `addSelectable` with an already-registered object is a no-op.
   */
  addSelectable(obj: THREE.Object3D, meta: SelectableMeta): void {
    if (this._entries.has(obj)) return;

    // Derive world-space XZ for spatial binning.
    const pos = this._worldPosition(obj);
    const cellKey = this._hash.keyFor(pos.x, pos.z);

    const entry: SelectableEntry = { object: obj, meta, cellKey };
    this._entries.set(obj, entry);
    this._hash.insert(entry);

    // Also stamp userData so the parent-chain walk in _resolveHit still works
    // for objects registered via this manager.
    obj.userData.selectable = true;
    obj.userData.selectableType = meta.type;
    obj.userData.selectableId = meta.id;
    if (meta.entityData) {
      Object.assign(obj.userData, meta.entityData);
    }
  }

  /**
   * Unregister a previously-added selectable.
   *
   * No-op if the object was not registered.
   */
  removeSelectable(obj: THREE.Object3D): void {
    const entry = this._entries.get(obj);
    if (!entry) return;
    this._hash.remove(entry);
    this._entries.delete(obj);
  }

  /**
   * Re-bin an already-registered object into the correct spatial cell.
   *
   * Call this after the object has been moved in the scene so that subsequent
   * hover/pick queries find it efficiently.
   */
  updatePosition(obj: THREE.Object3D): void {
    const entry = this._entries.get(obj);
    if (!entry) return;

    const pos = this._worldPosition(obj);
    const newKey = this._hash.keyFor(pos.x, pos.z);
    if (newKey === entry.cellKey) return; // still in the same cell

    this._hash.remove(entry);
    entry.cellKey = newKey;
    this._hash.insert(entry);
  }

  // ------------------------------------------------------------------
  // Hover
  // ------------------------------------------------------------------

  /**
   * Perform a throttled hover raycast and return the topmost selectable hit,
   * or `null` if nothing was under the cursor.
   *
   * Intended to be called from a `mousemove` handler. The internal throttle
   * (~15 fps) prevents expensive raycasts on every pixel-move.
   */
  updateHover(event: MouseEvent): SelectionHit | null {
    const now = performance.now();
    if (now - this._lastHoverTime < this._hoverThrottleMs) return null;
    this._lastHoverTime = now;

    return this._raycastNearest(event);
  }

  // ------------------------------------------------------------------
  // Pick (click)
  // ------------------------------------------------------------------

  /**
   * Perform an immediate (un-throttled) raycast pick and return the topmost
   * selectable hit, or `null` if nothing was under the cursor.
   *
   * Intended to be called from a `click` / `pointerdown` handler.
   */
  pick(event: MouseEvent): SelectionHit | null {
    return this._raycastNearest(event);
  }

  // ------------------------------------------------------------------
  // Dispose
  // ------------------------------------------------------------------

  /**
   * Release all internal state. The instance is unusable after this call.
   */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._entries.clear();
    this._hash.clear();
  }

  // ------------------------------------------------------------------
  // Query helpers
  // ------------------------------------------------------------------

  /** Number of currently registered selectables. */
  get count(): number {
    return this._entries.size;
  }

  /** Spatial hash cell size (read-only). */
  get cellSize(): number {
    return this._hash.cellSize;
  }

  /** Get/set the hover throttle interval in milliseconds. */
  get hoverThrottleMs(): number {
    return this._hoverThrottleMs;
  }

  set hoverThrottleMs(ms: number) {
    this._hoverThrottleMs = Math.max(0, ms);
  }

  /** Get/set how many cells outward to query from the ground hit point. */
  get queryCellRadius(): number {
    return this._queryCellRadius;
  }

  set queryCellRadius(r: number) {
    this._queryCellRadius = Math.max(0, Math.round(r));
  }

  /**
   * Return all registered Object3D → SelectableMeta pairs.
   * Useful for debug overlays.
   */
  allSelectables(): Array<{ object: THREE.Object3D; meta: SelectableMeta }> {
    const result: Array<{ object: THREE.Object3D; meta: SelectableMeta }> = [];
    for (const entry of this._entries.values()) {
      result.push({ object: entry.object, meta: entry.meta });
    }
    return result;
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  /**
   * Core raycast routine shared by `updateHover` and `pick`.
   *
   * 1. Convert the mouse event to NDC.
   * 2. Cast a ray from the camera.
   * 3. Intersect the ray with the ground plane to get a world-space XZ
   *    position for the spatial hash query.
   * 4. Gather candidate objects from the spatial hash neighbourhood.
   * 5. Raycast against only those candidates (recursive).
   * 6. Walk the parent chain of the closest hit to resolve selectable
   *    userData.
   */
  private _raycastNearest(event: MouseEvent): SelectionHit | null {
    if (this._disposed) return null;

    const camera = this._camera;
    const container = this._container;

    // 1. NDC mouse
    const rect = container.getBoundingClientRect();
    _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // 2. Set up raycaster
    _raycaster.setFromCamera(_mouse, camera);

    // 3. Ground-plane hit for spatial hash query centre.
    //    Adjust the plane height to something sensible (y=0 is a good
    //    default for most terrains). If the ray is nearly parallel to the
    //    plane the intersection may be very far away; in that case fall
    //    back to a brute-force raycast against all selectables.
    const hasGroundHit = _raycaster.ray.intersectPlane(
      _groundPlane,
      _groundHit,
    );

    // 4. Build candidate object list.
    _queryBuffer.length = 0;
    _objBuffer.length = 0;

    if (hasGroundHit) {
      this._hash.query(
        _groundHit.x,
        _groundHit.z,
        this._queryCellRadius,
        _queryBuffer,
      );
    }

    // Fallback: if the spatial query returned nothing (e.g. looking at the
    // sky, or all selectables are above/below the ground plane), test every
    // registered object so we never silently miss a hit.
    if (_queryBuffer.length === 0) {
      for (const entry of this._entries.values()) {
        _queryBuffer.push(entry);
      }
    }

    for (let i = 0; i < _queryBuffer.length; i++) {
      _objBuffer.push(_queryBuffer[i].object);
    }

    if (_objBuffer.length === 0) return null;

    // 5. Raycast against candidates (recursive = true so child meshes of
    //    groups are tested).
    const intersects = _raycaster.intersectObjects(_objBuffer, true);
    if (intersects.length === 0) return null;

    // 6. Resolve the hit.
    return this._resolveHit(intersects[0]);
  }

  /**
   * Walk the parent chain of the intersected object to find the first
   * ancestor with selectable `userData`, then build a `SelectionHit`.
   *
   * This mirrors the pattern used in TileBasedTerrain's `handleClick` and
   * `handleMouseMoveForHover`: the ray often hits a child mesh inside a
   * group, so we walk upward until we find the group that was registered.
   */
  private _resolveHit(intersection: THREE.Intersection): SelectionHit | null {
    let current: THREE.Object3D | null = intersection.object;

    while (current) {
      // Fast path: check the internal map first (O(1)).
      const entry = this._entries.get(current);
      if (entry) {
        return {
          type: entry.meta.type,
          id: entry.meta.id,
          point: intersection.point.clone(),
          object: current,
          entityData: entry.meta.entityData,
        };
      }

      // Slow path: check userData in case the object was registered
      // externally (e.g. via the legacy selectableObjectsRef array).
      const ud = current.userData as Record<string, unknown>;
      if (ud.selectable && ud.selectableType && ud.selectableId) {
        return {
          type: ud.selectableType as string,
          id: ud.selectableId as string,
          point: intersection.point.clone(),
          object: current,
          entityData: ud as Record<string, unknown>,
        };
      }

      current = current.parent;
    }

    return null;
  }

  /**
   * Get the world-space position of an object.
   *
   * Uses `getWorldPosition` if the object has a parent (meaning it's been
   * added to a scene graph and has a valid world matrix). Falls back to
   * `object.position` for objects not yet parented.
   */
  private _worldPosition(obj: THREE.Object3D): THREE.Vector3 {
    if (obj.parent) {
      const pos = new THREE.Vector3();
      obj.getWorldPosition(pos);
      return pos;
    }
    return obj.position;
  }
}
