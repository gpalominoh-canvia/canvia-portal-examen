FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

COPY package.json server.js ./
COPY public ./public

EXPOSE 3000
USER node

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/salud" || exit 1

CMD ["node", "server.js"]
