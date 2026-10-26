# ---- SRLMS frontend: build static bundle, serve with nginx ----
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Vite bakes these into the bundle at BUILD time (pass with --build-arg / compose `args`).
ARG VITE_BACKEND_URL=http://localhost:4000
ARG VITE_TURN_URL=
ARG VITE_TURN_USERNAME=
ARG VITE_TURN_CREDENTIAL=
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL \
    VITE_TURN_URL=$VITE_TURN_URL \
    VITE_TURN_USERNAME=$VITE_TURN_USERNAME \
    VITE_TURN_CREDENTIAL=$VITE_TURN_CREDENTIAL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
