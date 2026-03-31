/**
 * Command pattern for undo/redo — inspired by UE5's transaction system.
 *
 * Every mutation in World Studio goes through CommandHistory.execute().
 * Continuous operations (gizmo drag) use canMerge/merge to coalesce
 * into a single undo step.
 */

// ============== COMMAND INTERFACE ==============

export interface Command {
  readonly type: string;
  execute(): void;
  undo(): void;
  /** For continuous operations (dragging), merge with previous command of same type */
  canMerge?(other: Command): boolean;
  merge?(other: Command): void;
}

// ============== COMMAND HISTORY ==============

export type HistoryChangeListener = () => void;

export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistory: number;
  private listeners: Set<HistoryChangeListener> = new Set();

  constructor(maxHistory = 100) {
    this.maxHistory = maxHistory;
  }

  execute(cmd: Command): void {
    // Check if we can merge with the last command (continuous drag)
    const last = this.undoStack[this.undoStack.length - 1];
    if (last && last.canMerge?.(cmd)) {
      last.merge?.(cmd);
      cmd.execute();
    } else {
      cmd.execute();
      this.undoStack.push(cmd);
      if (this.undoStack.length > this.maxHistory) {
        this.undoStack.shift();
      }
    }

    // Clear redo stack on new action
    this.redoStack.length = 0;
    this.notify();
  }

  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo();
    this.redoStack.push(cmd);
    this.notify();
    return true;
  }

  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.execute();
    this.undoStack.push(cmd);
    this.notify();
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoCount(): number {
    return this.undoStack.length;
  }

  get redoCount(): number {
    return this.redoStack.length;
  }

  /** Read-only snapshot of the undo stack (oldest first) */
  getUndoEntries(): readonly Command[] {
    return this.undoStack;
  }

  /** Read-only snapshot of the redo stack (oldest first) */
  getRedoEntries(): readonly Command[] {
    return this.redoStack;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.notify();
  }

  subscribe(listener: HistoryChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

// ============== MOVE ENTITY COMMAND ==============

export interface MoveEntityTarget {
  /** The THREE.Object3D being moved */
  object3D: {
    position: {
      x: number;
      y: number;
      z: number;
      set(x: number, y: number, z: number): void;
    };
  };
  /** Callback to sync the new position back to state */
  onPositionChange?: (position: { x: number; y: number; z: number }) => void;
}

export class MoveEntityCommand implements Command {
  readonly type = "MoveEntity";
  private target: MoveEntityTarget;
  private oldPosition: { x: number; y: number; z: number };
  private newPosition: { x: number; y: number; z: number };
  private entityId: string;

  constructor(
    entityId: string,
    target: MoveEntityTarget,
    oldPosition: { x: number; y: number; z: number },
    newPosition: { x: number; y: number; z: number },
  ) {
    this.entityId = entityId;
    this.target = target;
    this.oldPosition = { ...oldPosition };
    this.newPosition = { ...newPosition };
  }

  execute(): void {
    const { x, y, z } = this.newPosition;
    this.target.object3D.position.set(x, y, z);
    this.target.onPositionChange?.(this.newPosition);
  }

  undo(): void {
    const { x, y, z } = this.oldPosition;
    this.target.object3D.position.set(x, y, z);
    this.target.onPositionChange?.(this.oldPosition);
  }

  /** Merge with another MoveEntity for the same entity (continuous drag) */
  canMerge(other: Command): boolean {
    return (
      other instanceof MoveEntityCommand && other.entityId === this.entityId
    );
  }

  merge(other: Command): void {
    if (other instanceof MoveEntityCommand) {
      this.newPosition = { ...other.newPosition };
    }
  }
}

// ============== ROTATE ENTITY COMMAND ==============

export class RotateEntityCommand implements Command {
  readonly type = "RotateEntity";
  private target: {
    object3D: {
      rotation: {
        x: number;
        y: number;
        z: number;
        set(x: number, y: number, z: number): void;
      };
    };
    onRotationChange?: (rotation: { x: number; y: number; z: number }) => void;
  };
  private oldRotation: { x: number; y: number; z: number };
  private newRotation: { x: number; y: number; z: number };
  private entityId: string;

  constructor(
    entityId: string,
    target: {
      object3D: {
        rotation: {
          x: number;
          y: number;
          z: number;
          set(x: number, y: number, z: number): void;
        };
      };
      onRotationChange?: (rotation: {
        x: number;
        y: number;
        z: number;
      }) => void;
    },
    oldRotation: { x: number; y: number; z: number },
    newRotation: { x: number; y: number; z: number },
  ) {
    this.entityId = entityId;
    this.target = target;
    this.oldRotation = { ...oldRotation };
    this.newRotation = { ...newRotation };
  }

  execute(): void {
    const { x, y, z } = this.newRotation;
    this.target.object3D.rotation.set(x, y, z);
    this.target.onRotationChange?.(this.newRotation);
  }

  undo(): void {
    const { x, y, z } = this.oldRotation;
    this.target.object3D.rotation.set(x, y, z);
    this.target.onRotationChange?.(this.oldRotation);
  }

  canMerge(other: Command): boolean {
    return (
      other instanceof RotateEntityCommand && other.entityId === this.entityId
    );
  }

  merge(other: Command): void {
    if (other instanceof RotateEntityCommand) {
      this.newRotation = { ...other.newRotation };
    }
  }
}

// ============== SCALE ENTITY COMMAND ==============

export class ScaleEntityCommand implements Command {
  readonly type = "ScaleEntity";
  private target: {
    object3D: {
      scale: {
        x: number;
        y: number;
        z: number;
        set(x: number, y: number, z: number): void;
      };
    };
    onScaleChange?: (scale: { x: number; y: number; z: number }) => void;
  };
  private oldScale: { x: number; y: number; z: number };
  private newScale: { x: number; y: number; z: number };
  private entityId: string;

  constructor(
    entityId: string,
    target: {
      object3D: {
        scale: {
          x: number;
          y: number;
          z: number;
          set(x: number, y: number, z: number): void;
        };
      };
      onScaleChange?: (scale: { x: number; y: number; z: number }) => void;
    },
    oldScale: { x: number; y: number; z: number },
    newScale: { x: number; y: number; z: number },
  ) {
    this.entityId = entityId;
    this.target = target;
    this.oldScale = { ...oldScale };
    this.newScale = { ...newScale };
  }

  execute(): void {
    const { x, y, z } = this.newScale;
    this.target.object3D.scale.set(x, y, z);
    this.target.onScaleChange?.(this.newScale);
  }

  undo(): void {
    const { x, y, z } = this.oldScale;
    this.target.object3D.scale.set(x, y, z);
    this.target.onScaleChange?.(this.oldScale);
  }

  canMerge(other: Command): boolean {
    return (
      other instanceof ScaleEntityCommand && other.entityId === this.entityId
    );
  }

  merge(other: Command): void {
    if (other instanceof ScaleEntityCommand) {
      this.newScale = { ...other.newScale };
    }
  }
}

// ============== PLACE ENTITY COMMAND ==============

export interface PlaceEntityTarget {
  entityType: string;
  entityData: Record<string, unknown>;
  onPlace: (data: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
}

export class PlaceEntityCommand implements Command {
  readonly type = "PlaceEntity";
  private target: PlaceEntityTarget;
  private entityId: string;

  constructor(entityId: string, target: PlaceEntityTarget) {
    this.entityId = entityId;
    this.target = target;
  }

  execute(): void {
    this.target.onPlace(this.target.entityData);
  }

  undo(): void {
    this.target.onRemove(this.entityId);
  }
}

// ============== DELETE ENTITY COMMAND ==============

export interface DeleteEntityTarget {
  entityType: string;
  entityData: Record<string, unknown>;
  onDelete: (id: string) => void;
  onRestore: (data: Record<string, unknown>) => void;
}

export class DeleteEntityCommand implements Command {
  readonly type = "DeleteEntity";
  private target: DeleteEntityTarget;
  private entityId: string;

  constructor(entityId: string, target: DeleteEntityTarget) {
    this.entityId = entityId;
    this.target = target;
  }

  execute(): void {
    this.target.onDelete(this.entityId);
  }

  undo(): void {
    this.target.onRestore(this.target.entityData);
  }
}

// ============== TERRAIN SCULPT COMMAND ==============

export interface TerrainSculptStroke {
  tileX: number;
  tileZ: number;
  strength: number;
  radius: number;
  deltaHeights: Float32Array;
}

export class TerrainSculptCommand implements Command {
  readonly type = "TerrainSculpt";
  private strokes: TerrainSculptStroke[];
  private onApply: (strokes: TerrainSculptStroke[]) => void;
  private onRevert: (strokes: TerrainSculptStroke[]) => void;

  constructor(
    strokes: TerrainSculptStroke[],
    onApply: (strokes: TerrainSculptStroke[]) => void,
    onRevert: (strokes: TerrainSculptStroke[]) => void,
  ) {
    this.strokes = strokes;
    this.onApply = onApply;
    this.onRevert = onRevert;
  }

  execute(): void {
    this.onApply(this.strokes);
  }

  undo(): void {
    this.onRevert(this.strokes);
  }

  /** Group all strokes from one continuous drag into a single undo step */
  canMerge(other: Command): boolean {
    return other instanceof TerrainSculptCommand;
  }

  merge(other: Command): void {
    if (other instanceof TerrainSculptCommand) {
      this.strokes = [...this.strokes, ...other.strokes];
    }
  }
}

// ============== BIOME PAINT COMMAND ==============

export interface BiomePaintStroke {
  tileX: number;
  tileZ: number;
  biomeId: string;
  previousBiomeId: string;
}

export class BiomePaintCommand implements Command {
  readonly type = "BiomePaint";
  private strokes: BiomePaintStroke[];
  private onApply: (strokes: BiomePaintStroke[]) => void;
  private onRevert: (strokes: BiomePaintStroke[]) => void;

  constructor(
    strokes: BiomePaintStroke[],
    onApply: (strokes: BiomePaintStroke[]) => void,
    onRevert: (strokes: BiomePaintStroke[]) => void,
  ) {
    this.strokes = strokes;
    this.onApply = onApply;
    this.onRevert = onRevert;
  }

  execute(): void {
    this.onApply(this.strokes);
  }

  undo(): void {
    this.onRevert(this.strokes);
  }

  canMerge(other: Command): boolean {
    return other instanceof BiomePaintCommand;
  }

  merge(other: Command): void {
    if (other instanceof BiomePaintCommand) {
      this.strokes = [...this.strokes, ...other.strokes];
    }
  }
}

// ============== DUPLICATE ENTITY COMMAND ==============

export interface DuplicateEntityTarget {
  entityType: string;
  entityData: Record<string, unknown>;
  onPlace: (data: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
}

export class DuplicateEntityCommand implements Command {
  readonly type = "DuplicateEntity";
  private target: DuplicateEntityTarget;
  private generatedId: string;

  constructor(target: DuplicateEntityTarget) {
    this.target = target;
    const rand = Math.random().toString(36).slice(2, 8);
    this.generatedId = `${target.entityType}-${Date.now()}-${rand}`;
  }

  execute(): void {
    const clonedData: Record<string, unknown> = { ...this.target.entityData };
    clonedData.id = this.generatedId;

    // Offset position by +1m on x and z
    const srcPos = this.target.entityData.position as
      | { x: number; y: number; z: number }
      | undefined;
    if (srcPos) {
      clonedData.position = { x: srcPos.x + 1, y: srcPos.y, z: srcPos.z + 1 };
    }

    this.target.onPlace(clonedData);
  }

  undo(): void {
    this.target.onRemove(this.generatedId);
  }
}

// ============== BATCH DELETE COMMAND ==============

export interface BatchDeleteEntry {
  entityId: string;
  entityType: string;
  entityData: Record<string, unknown>;
}

export interface BatchDeleteTarget {
  entries: BatchDeleteEntry[];
  onDelete: (id: string) => void;
  onRestore: (data: Record<string, unknown>) => void;
}

export class BatchDeleteCommand implements Command {
  readonly type = "BatchDelete";
  private target: BatchDeleteTarget;

  constructor(target: BatchDeleteTarget) {
    this.target = target;
  }

  execute(): void {
    for (const entry of this.target.entries) {
      this.target.onDelete(entry.entityId);
    }
  }

  undo(): void {
    // Restore in reverse order so dependencies are satisfied bottom-up
    for (let i = this.target.entries.length - 1; i >= 0; i--) {
      this.target.onRestore(this.target.entries[i].entityData);
    }
  }
}

// ============== MODIFY PROPERTY COMMAND ==============

export class ModifyPropertyCommand<T> implements Command {
  readonly type = "ModifyProperty";
  private entityId: string;
  private propertyPath: string;
  private oldValue: T;
  private newValue: T;
  private onApply: (entityId: string, path: string, value: T) => void;

  constructor(
    entityId: string,
    propertyPath: string,
    oldValue: T,
    newValue: T,
    onApply: (entityId: string, path: string, value: T) => void,
  ) {
    this.entityId = entityId;
    this.propertyPath = propertyPath;
    this.oldValue = oldValue;
    this.newValue = newValue;
    this.onApply = onApply;
  }

  execute(): void {
    this.onApply(this.entityId, this.propertyPath, this.newValue);
  }

  undo(): void {
    this.onApply(this.entityId, this.propertyPath, this.oldValue);
  }

  canMerge(other: Command): boolean {
    return (
      other instanceof ModifyPropertyCommand &&
      other.entityId === this.entityId &&
      other.propertyPath === this.propertyPath
    );
  }

  merge(other: Command): void {
    if (other instanceof ModifyPropertyCommand) {
      this.newValue = other.newValue as T;
    }
  }
}

// ============== SINGLETON ==============

/** Global command history instance for the editor */
export const commandHistory = new CommandHistory();
