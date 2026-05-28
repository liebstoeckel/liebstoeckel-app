# syntax=docker/dockerfile:1
# Production image for the liebstoeckel WAN relay (packages/present-relay).
#
# The relay ships raw TypeScript run under Bun (no build/transpile step). It
# imports its sibling workspace package @liebstoeckel/live-server, so the image
# needs a FROZEN WORKSPACE INSTALL to resolve the @liebstoeckel/* symlinks at
# runtime. Build context is therefore the repo ROOT (the frozen install needs
# the lockfile and every workspace member's package.json present). The root
# .dockerignore trims node_modules / dist / .git from the context.
#
#   docker build -f packages/present-relay/Dockerfile -t <ref> .
#
# Config is entirely env-driven (see src/cli.ts): PORT, PRESENT_RELAY_TOKENS,
# PRESENT_RELAY_PUBLIC_URL. PORT is pinned below because the CLI binds a random
# port when it's unset.
FROM oven/bun:1.3.14
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile

# Pin the listen port (CLI defaults to a random port otherwise) and disable
# Bun's on-disk transpiler cache so the container runs cleanly under a
# read-only root filesystem (no scratch writes under $HOME/.bun).
ENV PORT=8080 \
    BUN_RUNTIME_TRANSPILER_CACHE_PATH=0

USER bun
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD bun -e "fetch('http://127.0.0.1:'+(Bun.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["bun", "packages/present-relay/src/cli.ts"]
