import { MailPolicyRegistry } from "./MailPolicyRegistry.js";

export {
  MailPolicyNotLoadedError,
  MailPolicyRegistry,
  type CodCheckReason,
  type CodCheckResult,
  type ExpiryInput,
  type ExpiryState,
  type PostageInput,
  type PostageQuote,
  type SendCheckInput,
  type SendCheckReason,
  type SendCheckResult,
} from "./MailPolicyRegistry.js";

/**
 * Module-level singleton. Mail manifest is a single policy blob (not
 * an array), so this "singleton driver" carries the single live
 * policy; `PIEEditorSession.updateManifests({ mail })` can
 * live-dispatch authored edits. Stateless wrt per-player inbox /
 * attachment escrow (owned by MailSystem); `load()` just swaps the
 * policy reference.
 */
export const mailPolicyRegistry = new MailPolicyRegistry();
