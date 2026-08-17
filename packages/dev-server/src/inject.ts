// The loader tag definition moved to the CLI so the scaffold template and the
// scaffold-migration registry (which auto-adds it to older decks) share one
// source of truth; re-exported here for the server/drawer code and existing
// importers.
export { DEV_ATTR, DEV_LOADER_TAG, addDevLoaderTag, hasDevLoaderTag } from "@liebstoeckel/cli/dev-loader";
