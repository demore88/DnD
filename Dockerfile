FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV DATA_DIR=/data PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
