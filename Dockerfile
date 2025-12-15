FROM node:20-bookworm-slim

WORKDIR /app

RUN npm install -g bun

RUN apt-get update && apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

RUN npx puppeteer browsers install chrome-headless-shell

COPY package*.json ./
RUN bun ci --ignore-scripts

COPY tsconfig.json ./
COPY start.sh ./
COPY src ./src

RUN bun run build
RUN chmod +x start.sh

EXPOSE 3000
CMD ["bun", "start"]
