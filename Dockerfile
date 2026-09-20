# Build stage
FROM dhi.io/node:24-alpine-dev AS build

WORKDIR /opt/app

COPY --chown=1000:1000 . .

ENV NODE_OPTIONS=--max-old-space-size=4096

RUN npm ci;
RUN npm run build;

USER 1000

# Runtime stage. dhi.io's non-dev image ships no shell (no /bin/sh), which is
# fine here: Nitro's .output/server/index.mjs bundles the whole app (deps
# included) into self-contained files, and .output/public holds the static
# assets it serves itself - no node_modules, no CLI flags needed at runtime.
FROM dhi.io/node:24-alpine AS production

LABEL org.opencontainers.image.source=https://github.com/claudio-azevedo/Open-vCenter-Frontend
LABEL org.opencontainers.image.description="Open vCenter Frontend"
LABEL org.opencontainers.image.licenses=APACHE-2.0

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --chown=1000:1000 --from=build /opt/app/.output .

EXPOSE 3000

CMD ["node", "server/index.mjs"]
