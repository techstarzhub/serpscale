import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
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
  // Stripe webhook signature verification.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(cookieParser());
  // Allow the dashboard app + the marketing site (which reads /auth/me to show a
  // "Dashboard" link when the visitor is already signed in). Same-site cookies
  // (localhost:*) are shared across ports.
  const allowedOrigins = [
    process.env.WEB_ORIGIN || "http://localhost:3000",
    process.env.MARKETING_ORIGIN || "http://localhost:3020",
  ];
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());

  const port = Number(process.env.API_PORT) || 4000;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
}

bootstrap();
