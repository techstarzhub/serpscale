import { BadRequestException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";

// Scopes cover Search Console + Analytics (GA4) + Business Profile (GMB) in one
// consent. business.manage lights up once Google approves the project's Business
// Profile API access; until then Google simply won't grant it (rest still work).
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/business.manage",
];

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  static projectOwnerKey(projectId: string): string {
    return `project:${projectId}`;
  }

  private redirectUri(): string {
    return process.env.GOOGLE_REDIRECT_URI || "http://localhost:4000/integrations/google/callback";
  }

  async status(ownerKey: string) {
    const rows = await this.prisma.integration.findMany({
      where: { ownerKey },
      orderBy: { createdAt: "asc" },
    });
    return {
      googleAccounts: rows
        .filter((r) => r.provider === "google")
        .map((r) => ({ id: r.id, accountEmail: r.accountEmail, status: r.status })),
      googleConfigured: !!process.env.GOOGLE_CLIENT_ID,
    };
  }

  googleAuthUrl(ownerKey: string): string {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new BadRequestException("Google OAuth is not configured yet.");
    const state = this.jwt.sign(
      { ownerKey },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: "10m" },
    );
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.redirectUri(),
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: GOOGLE_SCOPES.join(" "),
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  // Returns the ownerKey so the caller can redirect back to the right project.
  async handleGoogleCallback(code: string, state: string): Promise<string> {
    let ownerKey: string;
    try {
      ownerKey = (this.jwt.verify(state, { secret: process.env.JWT_ACCESS_SECRET }) as { ownerKey: string }).ownerKey;
    } catch {
      throw new BadRequestException("Invalid or expired state");
    }
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: this.redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) throw new BadRequestException("Google token exchange failed");
    const data: any = await res.json();
    // A STABLE account email is required so retries dedupe (upsert key) instead of
    // creating duplicate integrations. Fall back to Google's userinfo, never a timestamp.
    let email = data.id_token ? this.emailFromIdToken(data.id_token) : null;
    if (!email && data.access_token) {
      try {
        const ui = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${data.access_token}` } });
        if (ui.ok) email = ((await ui.json()) as any).email ?? null;
      } catch { /* fall through */ }
    }
    if (!email) throw new BadRequestException("Could not determine the Google account email");
    const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;

    await this.prisma.integration.upsert({
      where: { ownerKey_provider_accountEmail: { ownerKey, provider: "google", accountEmail: email } },
      update: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? undefined,
        expiresAt,
        scope: data.scope,
        status: "connected",
      },
      create: {
        ownerKey,
        provider: "google",
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
        scope: data.scope,
        accountEmail: email,
        status: "connected",
      },
    });
    return ownerKey;
  }

  private emailFromIdToken(idToken: string): string | null {
    try {
      const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString());
      return payload.email ?? null;
    } catch {
      return null;
    }
  }

  async disconnectById(ownerKey: string, id: string) {
    await this.prisma.integration.deleteMany({ where: { id, ownerKey } });
    return { ok: true };
  }
}
