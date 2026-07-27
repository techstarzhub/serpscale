import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { ISnapshotRepository, NewSnapshotInput, PersistedSnapshot } from "../domain/ports";
import type { NormalizedSerp } from "../domain/serp.types";

/**
 * Persists an immutable snapshot: the queryable normalized child tables PLUS a
 * canonical serialized copy in metadata.raw for lossless O(1) reads.
 */
@Injectable()
export class PrismaSnapshotRepository implements ISnapshotRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: NewSnapshotInput): Promise<PersistedSnapshot> {
    const { serp } = input;
    const [countryId, languageId, deviceId] = await this.resolveLocale(serp);

    const snapshot = await this.prisma.$transaction(async (tx) => {
      const snap = await tx.serpSnapshot.create({
        data: {
          orgId: input.orgId,
          keywordId: input.keywordId,
          query: serp.query,
          engine: serp.engine,
          countryId,
          languageId,
          deviceId,
          contentHash: serp.metadata.contentHash,
          totalResults: serp.totalResults != null ? BigInt(serp.totalResults) : null,
          fetchedAt: new Date(serp.fetchedAt),
          organic: {
            create: serp.organic.map((o) => ({
              position: o.position,
              rank: o.rank,
              title: o.title,
              url: o.url,
              domain: o.domain,
              snippet: o.snippet,
              sitelinks: (o.sitelinks ?? undefined) as Prisma.InputJsonValue | undefined,
            })),
          },
          features: {
            create: serp.features.map((f) => ({
              type: f.type,
              position: typeof f.position === "number" ? f.position : 0,
              ownedByDomain: "ownedByDomain" in f ? f.ownedByDomain : undefined,
              data: f as unknown as Prisma.InputJsonValue,
            })),
          },
          paa: { create: serp.peopleAlsoAsk.map((q) => ({ position: q.position, question: q.question, snippet: q.snippet, url: q.url })) },
          related: { create: serp.relatedSearches.map((r) => ({ position: r.position, query: r.query })) },
          aiOverview: serp.aiOverview
            ? { create: { content: serp.aiOverview.content, sources: serp.aiOverview.sources as unknown as Prisma.InputJsonValue, citedDomains: serp.aiOverview.citedDomains } }
            : undefined,
          metadata: {
            create: {
              provider: serp.metadata.provider,
              providerLatencyMs: serp.metadata.latencyMs,
              totalOrganic: serp.metadata.totalOrganic,
              featureTypes: serp.metadata.featureTypes,
              raw: serp as unknown as Prisma.InputJsonValue, // canonical read model
            },
          },
        },
      });
      return snap;
    });

    return { id: snapshot.id, serp };
  }

  async findById(id: string): Promise<PersistedSnapshot | null> {
    const meta = await this.prisma.serpMetadata.findUnique({ where: { snapshotId: id } });
    return meta ? { id, serp: meta.raw as unknown as NormalizedSerp } : null;
  }

  async findByContentHash(orgId: string, hash: string): Promise<PersistedSnapshot | null> {
    const snap = await this.prisma.serpSnapshot.findFirst({
      where: { orgId, contentHash: hash },
      orderBy: { fetchedAt: "desc" },
      include: { metadata: true },
    });
    return snap?.metadata ? { id: snap.id, serp: snap.metadata.raw as unknown as NormalizedSerp } : null;
  }

  async findLatestFresh(keywordId: string, maxAgeMs: number): Promise<PersistedSnapshot | null> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const snap = await this.prisma.serpSnapshot.findFirst({
      where: { keywordId, fetchedAt: { gte: cutoff } },
      orderBy: { fetchedAt: "desc" },
      include: { metadata: true },
    });
    return snap?.metadata ? { id: snap.id, serp: snap.metadata.raw as unknown as NormalizedSerp } : null;
  }

  /** Resolve (or create) the small reference rows for the SERP's locale + device. */
  private async resolveLocale(serp: NormalizedSerp): Promise<[number, number, number]> {
    const [country, language, device] = await this.prisma.$transaction([
      this.prisma.serpCountry.upsert({ where: { code: serp.locale.country }, create: { code: serp.locale.country, name: serp.locale.country }, update: {} }),
      this.prisma.serpLanguage.upsert({ where: { code: serp.locale.language }, create: { code: serp.locale.language, name: serp.locale.language }, update: {} }),
      this.prisma.serpDevice.upsert({ where: { name: serp.device }, create: { name: serp.device }, update: {} }),
    ]);
    return [country.id, language.id, device.id];
  }
}
