import express, { type Request, type Response } from "express";
import puppeteer, { Browser } from "puppeteer";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const limiter = rateLimit({
  store: new RedisStore({
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as any,
  }),
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 25, // limit each IP to 25 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const app = express();
const port = process.env.PORT || 3000;

app.use(limiter);

const s3 = new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || "";

const streamToResponse = (s3Body: any, res: Response) => {
  if (s3Body instanceof Readable) {
    s3Body.pipe(res);
  } else {
    res.send(s3Body);
  }
};

let browserPromise: Promise<Browser> | null = null;

// async function getBrowser() {
//   if (!browserPromise) {
//     browserPromise = 
//   }
//   return browserPromise;
// }

app.get("/", async (req: Request, res: Response) => {
  const urlParam = req.query.url as string;

  if (!urlParam) {
    return res.status(400).send("Missing path parameter");
  }

  const normalizedUrl = new URL(urlParam).toString();
  console.log(normalizedUrl);

  // Parse parameters
  const widthParam = req.query.width as string | undefined;
  const heightParam = req.query.height as string | undefined;
  const qualityParam = req.query.quality as string | undefined;
  const sizeParam = req.query.size as string | undefined;

  let width = widthParam ? parseInt(widthParam) : 1280;
  let height = heightParam ? parseInt(heightParam) : 720;
  const quality = qualityParam ? parseInt(qualityParam) : 85;

  if (sizeParam) {
    const sizeMatch = sizeParam.match(/^(\d+)x(\d+)$/);
    if (sizeMatch) {
      width = parseInt(sizeMatch[1] as string);
      height = parseInt(sizeMatch[2] as string);
    }
  }

  // Validate parameters
  if (
    width < 100 ||
    width > 4096 ||
    height < 100 ||
    height > 4096 ||
    quality < 1 ||
    quality > 100
  ) {
    return res.status(400).send("Invalid parameters");
  }

  const objectKey = `screenshots/${normalizedUrl
    .replace(/https?:\/\//, "")
    .replace(/\//g, "_")}_${width}x${height}_q${quality}.jpg`;

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
    });
    const s3Response = await s3.send(command);

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return streamToResponse(s3Response.Body, res);
  } catch (error: any) {
    if (error.name !== "NoSuchKey") {
      console.error(error);
    }
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "shell",
      timeout: 60000,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-features=site-per-process",
        "--remote-debugging-port=9222",
        "--remote-debugging-address=127.0.0.1",
        "--single-process",
        "--no-zygote",
      ],
    });;

    const page = await browser.newPage();
    await page.setViewport({ width, height });

    await page.goto(normalizedUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    await page.addStyleTag({
      content: `
                ::-webkit-scrollbar { display: none !important; }
                html, body { overflow: hidden !important; }
            `,
    });

    const imgBuffer = await page.screenshot({ type: "jpeg", quality });

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey,
        Body: imgBuffer,
        ContentType: "image/jpeg",
      })
    );

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(imgBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
