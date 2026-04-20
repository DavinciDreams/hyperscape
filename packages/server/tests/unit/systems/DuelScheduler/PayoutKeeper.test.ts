import { describe, expect, it } from "vitest";
import { claimDuePayoutJobIds } from "../../../../src/systems/DuelScheduler/PayoutKeeper.js";

function extractSqlText(query: unknown): string {
  if (!query || typeof query !== "object" || !("queryChunks" in query)) {
    return "";
  }

  const chunks = (query as { queryChunks?: unknown[] }).queryChunks;
  if (!Array.isArray(chunks)) {
    return "";
  }

  return chunks
    .flatMap((chunk) => {
      if (!chunk || typeof chunk !== "object" || !("value" in chunk)) {
        return [];
      }
      const value = (chunk as { value?: unknown }).value;
      return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : [];
    })
    .join(" ");
}

describe("claimDuePayoutJobIds", () => {
  it("builds a locking claim query with FOR UPDATE SKIP LOCKED", async () => {
    const capturedQueries: string[] = [];
    const tx = {
      execute: async (query: unknown) => {
        capturedQueries.push(extractSqlText(query));
        return { rows: [{ id: "job-1" }] };
      },
    } as Parameters<typeof claimDuePayoutJobIds>[0];

    const claimed = await claimDuePayoutJobIds(tx, 1_000, 1);

    expect(claimed).toEqual(["job-1"]);
    expect(capturedQueries[0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(capturedQueries[0]).toContain('"solana_payout_jobs"');
  });

  it("does not claim the same pending row twice across workers", async () => {
    const dueJobIds = ["job-1", "job-2"];
    const lockedJobIds = new Set<string>();

    const createTx = (): Parameters<typeof claimDuePayoutJobIds>[0] =>
      ({
        execute: async () => {
          const available = dueJobIds.filter((id) => !lockedJobIds.has(id));
          const claimed = available.slice(0, 1);
          for (const id of claimed) {
            lockedJobIds.add(id);
          }
          return {
            rows: claimed.map((id) => ({ id })),
          };
        },
      }) as Parameters<typeof claimDuePayoutJobIds>[0];

    expect(await claimDuePayoutJobIds(createTx(), 1_000, 1)).toEqual(["job-1"]);
    expect(await claimDuePayoutJobIds(createTx(), 1_000, 1)).toEqual(["job-2"]);
    expect(await claimDuePayoutJobIds(createTx(), 1_000, 1)).toEqual([]);
  });
});
