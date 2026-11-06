# The app: builds the PWA and serves it with nginx. The relay is a separate image (relay/Dockerfile); docker-compose.yml runs both.
# Build context is the repo root, with the framework submodule checked out (git submodule update --init).
#   docker build --build-arg RELAY_URL=wss://relay.example.com -t little-lambs-app .

FROM node:22-alpine AS build
WORKDIR /src
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 CI=1
COPY . .
RUN test -f framework/package.json || (echo "framework/ is empty: run 'git submodule update --init' before building" && exit 1)
RUN npm ci --no-audit --no-fund
# The relay address is baked into the build: the page's security policy only allows connecting to it.
ARG RELAY_URL=ws://localhost:8787
ARG DEV_BUILD=false
RUN sed -i "s#^export const RELAY_URL = .*#export const RELAY_URL = '${RELAY_URL}';#" modules/daycare/constants.ts \
 && grep -n "^export const RELAY_URL" modules/daycare/constants.ts
RUN if [ "$DEV_BUILD" = "true" ]; then npm run build:dev; else npm run build && npm run verify; fi

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
