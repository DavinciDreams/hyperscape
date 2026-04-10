/**
 * TownStageConfig — Configuration panel for the Towns generation stage
 */

import { RefreshCw } from "lucide-react";

import { ConfigField } from "../WizardSharedUI";

export function TownStageConfig({
  townSeed,
  onTownSeedChange,
  townCount,
  onTownCountChange,
  minTownSpacing,
  onMinTownSpacingChange,
}: {
  townSeed: number;
  onTownSeedChange: (n: number) => void;
  townCount: number;
  onTownCountChange: (n: number) => void;
  minTownSpacing: number;
  onMinTownSpacingChange: (n: number) => void;
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-text-primary">Towns</h4>
      <p className="text-[10px] text-text-tertiary">
        Generate towns with strategic placement: starter town near origin, one
        per biome, then fill remaining slots for coverage.
      </p>
      <div className="space-y-2">
        <ConfigField
          label="Seed"
          type="number"
          value={townSeed}
          onChange={onTownSeedChange}
          suffix={
            <button
              className="p-0.5 rounded hover:bg-bg-secondary text-text-tertiary"
              onClick={() =>
                onTownSeedChange(Math.floor(Math.random() * 999999))
              }
            >
              <RefreshCw size={10} />
            </button>
          }
        />
        <ConfigField
          label="Town Count"
          type="number"
          value={townCount}
          onChange={(v) => onTownCountChange(Math.max(1, Math.min(8, v)))}
          min={1}
          max={8}
        />
        <ConfigField
          label="Min Spacing (m)"
          type="number"
          value={minTownSpacing}
          onChange={(v) =>
            onMinTownSpacingChange(Math.max(200, Math.min(800, v)))
          }
          min={200}
          max={800}
        />
      </div>
    </div>
  );
}
