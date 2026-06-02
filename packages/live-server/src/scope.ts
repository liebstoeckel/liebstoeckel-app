import { extractManifest } from "./manifest";
import { buildAudienceScope, type AudienceScope } from "@liebstoeckel/plugin-sdk/authorize";

// Build the audience write-scope for a session straight from the deck's own embedded
// plugin manifest (ADR 0061) — the deck already carries it, so the relay needs no
// extra input to know which plugin fields an audience may write.
export function audienceScopeFromHtml(html: string): AudienceScope {
  return buildAudienceScope(extractManifest(html));
}
