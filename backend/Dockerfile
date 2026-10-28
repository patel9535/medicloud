FROM node:22.23.4-alpine3.24
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts
# npm is only needed to install dependencies during the image build. Removing
# its bundled dependency tree keeps package-manager CVEs out of the runtime.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    && mkdir -p /app/private-documents /data/private-documents \
    && chown -R node:node /app /data/private-documents
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
