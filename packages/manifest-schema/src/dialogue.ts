/**
 * Dialogue-tree manifest schema.
 *
 * Core RPG primitive — NPC conversations, quest givers, tutorial
 * prompts, cinematic VO. A dialogue tree is a directed graph of
 * typed nodes:
 *
 * - `line`: NPC or narrator speaks a line, then auto-advances.
 * - `choice`: presents player-facing options, branches on pick.
 * - `branch`: scripted conditional jump based on a named predicate.
 * - `action`: fires a world event / side effect, then auto-advances.
 * - `end`: terminal node.
 *
 * Stored flat as `nodes: Record<NodeId, Node>` plus a `start`
 * pointer — same pattern as `ai-behavior.ts` for diff stability
 * and editor graph rendering.
 *
 * Localization: every user-facing string is a translation-key path,
 * not literal text. The runtime resolves via the localization
 * manifest at render time. Keeps authored dialogue files diffable
 * and lets translators work without colliding with authors.
 */

import { z } from "zod";

/**
 * Translation key matching `localization.ts` — dot-separated ASCII
 * identifier segments. Enforced here so authoring catches typos.
 */
const TranslationKey = z
  .string()
  .regex(
    /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/,
    "Dialogue text must be a translation key (dot-separated ASCII identifiers)",
  );

/** Node id within a dialogue tree — stable across edits. */
const NodeId = z.string().min(1);

const BaseNodeFields = {
  id: NodeId,
  /** Optional author label for the editor graph. */
  label: z.string().default(""),
};

/** `line` — speaker emits a localized string; runtime auto-advances to `next`. */
export const DialogueLineNodeSchema = z.object({
  ...BaseNodeFields,
  kind: z.literal("line"),
  speaker: z
    .string()
    .min(1)
    .describe("NPC id or reserved role like 'narrator'"),
  textKey: TranslationKey,
  /** Optional SFX/VFX hooks to play alongside the line. */
  sfxId: z.string().min(1).optional(),
  next: NodeId,
});
export type DialogueLineNode = z.infer<typeof DialogueLineNodeSchema>;

/** Player-facing option on a `choice` node. */
export const DialogueChoiceOptionSchema = z.object({
  textKey: TranslationKey,
  next: NodeId,
  /** Hide option entirely if predicate fails; empty string = always visible. */
  showIf: z.string().default(""),
  /** Fires when player picks this option. */
  action: z.string().default(""),
});
export type DialogueChoiceOption = z.infer<typeof DialogueChoiceOptionSchema>;

export const DialogueChoiceNodeSchema = z.object({
  ...BaseNodeFields,
  kind: z.literal("choice"),
  promptKey: TranslationKey.optional(),
  options: z.array(DialogueChoiceOptionSchema).min(1),
});
export type DialogueChoiceNode = z.infer<typeof DialogueChoiceNodeSchema>;

export const DialogueBranchNodeSchema = z.object({
  ...BaseNodeFields,
  kind: z.literal("branch"),
  /** Predicate name — resolved at runtime against player/world state. */
  condition: z.string().min(1),
  ifTrue: NodeId,
  ifFalse: NodeId,
});
export type DialogueBranchNode = z.infer<typeof DialogueBranchNodeSchema>;

export const DialogueActionNodeSchema = z.object({
  ...BaseNodeFields,
  kind: z.literal("action"),
  /** Registered action name, e.g. `"quest.accept"` or `"inventory.give"`. */
  action: z.string().min(1),
  params: z
    .record(z.string().min(1), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
  next: NodeId,
});
export type DialogueActionNode = z.infer<typeof DialogueActionNodeSchema>;

export const DialogueEndNodeSchema = z.object({
  ...BaseNodeFields,
  kind: z.literal("end"),
});
export type DialogueEndNode = z.infer<typeof DialogueEndNodeSchema>;

export const DialogueNodeSchema = z.discriminatedUnion("kind", [
  DialogueLineNodeSchema,
  DialogueChoiceNodeSchema,
  DialogueBranchNodeSchema,
  DialogueActionNodeSchema,
  DialogueEndNodeSchema,
]);
export type DialogueNode = z.infer<typeof DialogueNodeSchema>;

/**
 * Collect every NodeId the given node references as a successor —
 * used by manifest-level refinements to verify reachability.
 */
function nextIds(node: DialogueNode): string[] {
  switch (node.kind) {
    case "line":
    case "action":
      return [node.next];
    case "choice":
      return node.options.map((o) => o.next);
    case "branch":
      return [node.ifTrue, node.ifFalse];
    case "end":
      return [];
  }
}

export const DialogueTreeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().default(""),
    start: NodeId,
    nodes: z.record(NodeId, DialogueNodeSchema),
  })
  .refine(({ start, nodes }) => start in nodes, {
    message: "tree `start` must reference a node in `nodes`",
  })
  .refine(
    ({ nodes }) => {
      for (const [nodeId, node] of Object.entries(nodes)) {
        if (node.id !== nodeId) return false;
      }
      return true;
    },
    { message: "each node's `id` field must equal its key in `nodes`" },
  )
  .refine(
    ({ nodes }) => {
      const ids = new Set(Object.keys(nodes));
      for (const node of Object.values(nodes)) {
        for (const nextId of nextIds(node)) {
          if (!ids.has(nextId)) return false;
        }
      }
      return true;
    },
    { message: "every successor NodeId must resolve to a node in `nodes`" },
  )
  .refine(({ nodes }) => Object.values(nodes).some((n) => n.kind === "end"), {
    message: "dialogue tree must contain at least one `end` node",
  });
export type DialogueTree = z.infer<typeof DialogueTreeSchema>;

export const DialogueManifestSchema = z
  .array(DialogueTreeSchema)
  .refine((list) => new Set(list.map((t) => t.id)).size === list.length, {
    message: "dialogue tree ids must be unique",
  });
export type DialogueManifest = z.infer<typeof DialogueManifestSchema>;
