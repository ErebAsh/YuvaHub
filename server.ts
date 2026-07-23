import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import path from "path";
import { initializeDatabase } from "./src/api/db.js";
import { Server as SocketIOServer } from "socket.io";
import { setSocketIO } from "./src/api/socketInstance.js";
import { setupSocketEvents } from "./src/socket/index.js";
import { runDeadlineChecks, runWeeklyDigest } from "./src/services/deadlineScheduler.js";
import { dbCommand } from "./src/api/db.js";

// Import Main API Router
import apiRoutes from "./src/api/routes/index.js";
import { analyticsBuffer } from "./src/api/analytics.js";
import * as Sentry from "@sentry/node";

dotenv.config();

Sentry.init({
  dsn: process.env.SENTRY_DSN_NODE,
  tracesSampleRate: 1.0,
});

const app = express();
const server = http.createServer(app);

const corsOrigins = process.env.NODE_ENV === "development" 
  ? ["http://localhost:3000", "http://127.0.0.1:3000"]
  : ["https://yuvahub.xyz", "https://www.yuvahub.xyz", "https://yuvahub-web.vercel.app"];

// Initialize Socket.io Singleton
const io = new SocketIOServer(server, { cors: { origin: corsOrigins, credentials: true } });
setSocketIO(io);

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Setup API Routes
app.use("/api", apiRoutes);

// Fallback Route
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Endpoint not found" });
});

import { errorHandler } from "./src/middlewares/errorHandler.js";
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// ── Graceful Shutdown ─────────────────────────────────────────────────
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Core] Received ${signal}. Starting graceful shutdown...`);

  // 1. Stop accepting new HTTP connections
  server.close(() => {
    console.log("[Core] HTTP server closed.");
  });

  // 2. Drain analytics buffer (safe — drainAndStop sets isShuttingDown flag,
  //    rejects new pushes, flushes remaining, then stops the interval)
  try {
    await analyticsBuffer.drainAndStop();
    console.log("[Core] Analytics buffer drained successfully.");
  } catch (err) {
    console.error("[Core] Error draining analytics buffer:", err);
  }

  // 3. Exit
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

async function bootstrap() {
  try {
    // 1. Initialize databases and caches
    await initializeDatabase();
    
    // 2. Start the HTTP server
    server.listen(PORT, () => {
      console.log(`[Core] Server running on port ${PORT}`);
    });

    // 3. Setup Socket.IO Event Handlers
    setupSocketEvents();

    // 4. Start Background Services
    if (process.env.NODE_ENV !== "test") {
      setInterval(() => runDeadlineChecks(dbCommand), 24 * 60 * 60 * 1000);
      setInterval(() => runWeeklyDigest(dbCommand), 7 * 24 * 60 * 60 * 1000);
      
      // Node.js Central Ingestion
      if (process.env.START_NODE_SCRAPER === "true") {
        console.log("[Scraper] Central Ingestion daemon enabled");
        import("child_process").then(({ spawn }) => {
          spawn("npx", ["tsx", "scrape-cli.ts"], {
            cwd: process.cwd(),
            detached: true,
            stdio: "ignore"
          }).unref();
        });
      }
    }
  } catch (err) {
    console.error("[Core] Failed to bootstrap server:", err);
    process.exit(1);
  }
}

bootstrap();

export default app;
