import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { ServiceHttpClient } from './http-client';

/** A separate, read-only query contract; existing list filters stay unchanged. */
export class DisplayIdsQuery {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.split(',') : value)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export type DisplayName = { id: string; tenantId: string; name: string; code?: string };
type Caller = { tenantId: string | null; accessToken: string };
type Kind = 'users' | 'branches' | 'sites';

/** Optional presentation data only. No shared cache: every call rechecks caller authorization. */
export class DisplayNameLookup {
  constructor(private readonly urls: { identity?: string; organization?: string }) {}

  async lookup(kind: Kind, references: (string | null | undefined)[], caller: Caller): Promise<Map<string, DisplayName>> {
    const result = new Map<string, DisplayName>();
    const baseUrl = kind === 'users' ? this.urls.identity : this.urls.organization;
    if (!baseUrl || !caller.tenantId) return result;
    const ids = [...new Set(references.filter((id): id is string => !!id).map(id => id.toLowerCase()))];
    const client = new ServiceHttpClient({ name: `${kind}-display-names`, baseUrl, timeoutMs: 800 });
    // Bounded batches, including historical lists larger than 100. Never one call per row.
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100);
      try {
        const rows = await client.get<DisplayName[]>(`/internal/display-names/${kind}`, {
          accessToken: caller.accessToken, query: { ids: batch.join(',') },
        });
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          if (typeof row?.id !== 'string' || typeof row.tenantId !== 'string' ||
            row.tenantId.toLowerCase() !== caller.tenantId.toLowerCase() ||
            !batch.includes(row.id.toLowerCase()) || typeof row.name !== 'string') continue;
          result.set(row.id.toLowerCase(), row);
        }
      } catch {
        // A timeout, forbidden/missing reference or deployment lag must not fail a business read.
        break;
      }
    }
    return result;
  }
}
