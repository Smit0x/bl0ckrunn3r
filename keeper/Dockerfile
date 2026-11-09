FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY index.mjs ./

ENV NODE_ENV=production

CMD ["node", "index.mjs"]
