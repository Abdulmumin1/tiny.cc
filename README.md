# tiny.cc

A web service that generates screenshots of websites on demand. It uses Puppeteer for headless browser rendering, stores screenshots in S3 for caching, and implements rate limiting with Redis.

## Installation

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run dev
```

## Deployment

This app is containerized with Docker for easy deployment.

1. Build the Docker image:
   ```bash
   docker build -t tiny-cc .
   ```

2. Run the container:
   ```bash
   docker run -p 3000:3000 --env-file .env tiny-cc
   ```

Ensure you have a `.env` file with required environment variables (see `.env.example`).