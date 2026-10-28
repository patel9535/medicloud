FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts
RUN mkdir -p /app/private-documents /data/private-documents && chown -R node:node /app /data/private-documents
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
