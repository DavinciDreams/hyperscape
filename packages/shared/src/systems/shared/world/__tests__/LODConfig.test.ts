import { describe, expect, it } from "vitest";
import {
  inferLOD1Path,
  inferLOD2Path,
  resolveLOD1ModelPath,
  resolveLOD2ModelPath,
} from "../LODConfig";

describe("LODConfig path resolution", () => {
  it("infers lod1 paths when no explicit path is provided", () => {
    expect(
      resolveLOD1ModelPath(
        "asset://models/mining-rocks/coal-rock/coal-rock.glb",
        undefined,
      ),
    ).toBe("asset://models/mining-rocks/coal-rock/coal-rock_lod1.glb");
  });

  it("infers lod2 paths when no explicit path is provided", () => {
    expect(
      resolveLOD2ModelPath(
        "asset://models/mining-rocks/coal-rock/coal-rock.glb",
        undefined,
      ),
    ).toBe("asset://models/mining-rocks/coal-rock/coal-rock_lod2.glb");
  });

  it("disables inference when a manifest explicitly sets lod paths to null", () => {
    expect(
      resolveLOD1ModelPath(
        "asset://models/mining-rocks/coal-rock/coal-rock.glb",
        null,
      ),
    ).toBeNull();
    expect(
      resolveLOD2ModelPath(
        "asset://models/mining-rocks/coal-rock/coal-rock.glb",
        null,
      ),
    ).toBeNull();
  });

  it("treats empty explicit paths as disabled", () => {
    expect(resolveLOD1ModelPath("asset://models/example.glb", "")).toBeNull();
    expect(
      resolveLOD2ModelPath("asset://models/example.glb", "   "),
    ).toBeNull();
  });

  it("prefers explicit lod paths when present", () => {
    expect(
      resolveLOD1ModelPath(
        "asset://models/mining-rocks/coal-rock/coal-rock.glb",
        "asset://models/mining-rocks/coal-rock/custom_lod1.glb",
      ),
    ).toBe("asset://models/mining-rocks/coal-rock/custom_lod1.glb");
    expect(
      resolveLOD2ModelPath(
        "asset://models/mining-rocks/coal-rock/coal-rock.glb",
        "asset://models/mining-rocks/coal-rock/custom_lod2.glb",
      ),
    ).toBe("asset://models/mining-rocks/coal-rock/custom_lod2.glb");
  });

  it("keeps the raw inference helpers unchanged", () => {
    expect(inferLOD1Path("trees/oak.glb")).toBe("trees/oak_lod1.glb");
    expect(inferLOD2Path("trees/oak.glb")).toBe("trees/oak_lod2.glb");
  });
});
