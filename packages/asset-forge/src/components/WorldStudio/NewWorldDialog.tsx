/**
 * NewWorldDialog — Simple modal for creating a new world project
 *
 * Just name + description. Generates with defaults, drops you into the editor.
 * All procgen settings are adjustable later in the editor's Procgen panel.
 */

import { Globe, Loader2, AlertTriangle } from "lucide-react";
import React, { useState, useCallback } from "react";

import { Modal, ModalHeader, ModalBody, ModalFooter } from "../common/Modal";
import { DEFAULT_CREATION_CONFIG } from "../WorldBuilder/types";
import { generateWorldFromConfig } from "../WorldBuilder/worldGeneration";
import { serializeWorld } from "../WorldBuilder/utils/worldPersistence";
import { createWorldProject } from "../../utils/worldProjectApi";

interface NewWorldDialogProps {
  teamId: string;
  gameId: string;
  onClose: () => void;
  onCreated: (projectId: string) => void;
}

export function NewWorldDialog({
  teamId,
  gameId,
  onClose,
  onCreated,
}: NewWorldDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    setError(null);

    try {
      // Generate world with defaults + random seed (runs on next tick for UI)
      const worldData = await new Promise<ReturnType<typeof serializeWorld>>(
        (resolve, reject) => {
          setTimeout(() => {
            try {
              const config = {
                ...DEFAULT_CREATION_CONFIG,
                seed: Math.floor(Math.random() * 2147483647),
              };
              const world = generateWorldFromConfig(config);
              resolve(serializeWorld(world));
            } catch (err) {
              reject(err);
            }
          }, 50);
        },
      );

      const project = await createWorldProject({
        teamId,
        gameId,
        name: name.trim(),
        description: description.trim() || undefined,
        worldData,
      });
      onCreated(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create world");
      setIsCreating(false);
    }
  }, [name, description, teamId, gameId, onCreated]);

  return (
    <Modal open onClose={onClose} size="sm">
      <ModalHeader onClose={onClose}>New World</ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-primary rounded text-text-primary focus:outline-none focus:border-primary/50 placeholder:text-text-tertiary"
              placeholder="My World"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && !isCreating)
                  handleCreate();
              }}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">
              Description
            </label>
            <textarea
              className="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-primary rounded text-text-primary focus:outline-none focus:border-primary/50 placeholder:text-text-tertiary resize-none"
              placeholder="A brief description of your world..."
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {isCreating && (
            <div className="flex items-center gap-2 p-3 bg-bg-tertiary rounded text-xs text-text-secondary">
              <Loader2 size={14} className="animate-spin text-primary" />
              <span>Generating terrain and creating world...</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <div className="flex items-center gap-2 w-full">
          <button
            className="flex-1 px-3 py-2 text-xs font-medium rounded bg-bg-tertiary border border-border-primary text-text-primary hover:bg-bg-secondary transition-colors"
            onClick={onClose}
            disabled={isCreating}
          >
            Cancel
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
          >
            {isCreating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Globe size={14} />
                Create World
              </>
            )}
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
