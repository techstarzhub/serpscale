import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { PrismaExceptionFilter } from "./common/prisma-exception.filter";

// Resilience: a single external fetch failing (e.g. undici's zstd decode error on
// some Node builds when a third-party API responds with zstd) must NEVER take down
// the whole API. Log and keep serving.
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", (err as Error)?.message || err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", (reason as Error)?.message || reason);
});

async function bootstrap() {
  // rawBody: true preserves the untouched request buffer (req.rawBody) needed for
  // Stripe webhook signature verification. bodyParser: false + useBodyParser below
  // replaces Nest's default 100kb JSON limit (too small for base64 logo uploads
  // like /team/branding's logoDataUrl) while still capturing rawBody.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bodyParser: false });
  app.useBodyParser("json", { limit: "10mb" });
  app.useBodyParser("urlencoded", { limit: "10mb", extended: true });
  app.use(cookieParser());
  // Allow the dashboard app + the marketing site (which reads /auth/me to show a
  // "Dashboard" link when the visitor is already signed in). Same-site cookies
  // (localhost:*) are shared across ports.
  const allowedOrigins = [
    process.env.WEB_ORIGIN || "http://localhost:3000",
    process.env.MARKETING_ORIGIN || "http://localhost:3020",
  ];
  const appDomain = (process.env.APP_DOMAIN || "serpscale.com").toLowerCase();
  app.enableCors({
    // Allow the dashboard + marketing origins, plus ANY white-label tenant
    // subdomain of the app domain (‹agency›.serpscale.com) and *.localhost in dev.
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // non-browser / same-origin
      if (allowedOrigins.includes(origin)) return cb(null, true);
      try {
        const host = new URL(origin).hostname.toLowerCase();
        if (host === appDomain || host.endsWith("." + appDomain) || host.endsWith(".localhost") || host === "localhost") {
          return cb(null, true);
        }
      } catch {
        /* fall through */
      }
      return cb(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());

  const port = Number(process.env.API_PORT) || 4000;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
}

bootstrap();
