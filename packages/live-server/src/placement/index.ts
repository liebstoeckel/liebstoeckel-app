// Shared machinery for stateful services (the relay, live source sync): Kubernetes
// leases for ownership, shard mapping, write-once state layout in object
// storage, the client protocol, readiness. Without Kubernetes (a self-hosted
// relay) the lease API is null and a single process owns everything.

export * from "./decide.ts";
export * from "./holder.ts";
export * from "./lease-api.ts";
export * from "./protocol.ts";
export * from "./readiness.ts";
export * from "./s3-layout.ts";
export * from "./shards.ts";
