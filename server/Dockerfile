# ---- SRLMS API + WebSocket server ----
FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /app

# install production deps first (cached layer unless package files change)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# run as the unprivileged "node" user that ships with the image
USER node

EXPOSE 4000
# Platforms like Render inject PORT; the server reads process.env.PORT (default 4000).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
