import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parse } from 'yaml';
import type { AppEnv } from '../config/env.validation.js';
import { DEVELOPER_SERVICES } from './catalog.js';

@Injectable()
export class DeveloperService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  assertEnabled(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production')
      throw new NotFoundException();
  }

  catalog() {
    this.assertEnabled();
    return DEVELOPER_SERVICES.map(
      ({ id, name, apiPrefix, stage, spec, interactive }) => ({
        id,
        name,
        apiPrefix,
        stage,
        interactive,
        docsUrl: spec ? `/docs?service=${id}` : null,
        specUrl: spec ? `/docs/openapi/${id}.json` : null,
      }),
    );
  }

  spec(id: string) {
    this.assertEnabled();
    const service = DEVELOPER_SERVICES.find(
      (item) => item.id === id && item.spec,
    );
    if (!service?.spec) throw new NotFoundException('Unknown API document');
    // Both src/developer and dist/developer resolve to the monorepo docs root.
    // Only filenames from our fixed catalog are read, never a request-supplied path.
    const document = parse(
      readFileSync(
        resolve(__dirname, '../../../../docs/api', service.spec),
        'utf8',
      ),
    ) as Record<string, any>;
    document.servers = [
      { url: service.serverBase, description: 'Current API Gateway' },
    ];
    document.tags = document.tags?.filter(
      (tag: { name: string }) => tag.name.toLowerCase() !== 'internal',
    );
    for (const [path, item] of Object.entries(
      document.paths as Record<string, Record<string, any>>,
    )) {
      if (/(?:^|\/)internal(?:\/|$)/i.test(path)) {
        delete document.paths[path];
        continue;
      }
      // Estimate endpoints are not implemented and /estimates has no Gateway route.
      // Keep the original contract intact; omit these planned operations from this public view.
      if (
        service.id === 'service-request' &&
        /\/estimates(?:\/|$)/.test(path)
      ) {
        delete document.paths[path];
        continue;
      }
      delete item.servers;
      for (const method of [
        'get',
        'post',
        'put',
        'patch',
        'delete',
        'head',
        'options',
        'trace',
      ]) {
        if (item[method]) delete item[method].servers;
      }
    }
    document.info.description = `${service.stage}.\n\nTài liệu được hiển thị qua Gateway; /internal/* được ẩn.\n\n${document.info.description ?? ''}`;
    return document;
  }

  async status() {
    this.assertEnabled();
    const catalog = this.catalog();
    const services = await Promise.all(
      DEVELOPER_SERVICES.map(async (service, index) => {
        const url = new URL(
          this.config.get(service.setting, { infer: true }) as string,
        );
        const started = Date.now();
        let state: 'up' | 'down' | 'no-health' = 'down';
        let httpStatus: number | null = null;
        try {
          const response = await fetch(new URL('/health', url), {
            signal: AbortSignal.timeout(1500),
            redirect: 'error',
          });
          httpStatus = response.status;
          state = response.ok
            ? 'up'
            : response.status === 404
              ? 'no-health'
              : 'down';
          await response.body?.cancel();
        } catch {
          /* Unreachable/timeout; do not expose upstream exception details. */
        }
        return {
          ...catalog[index],
          state,
          httpStatus,
          latencyMs: Date.now() - started,
          address: url.host,
          healthUrl: url.origin + '/health',
        };
      }),
    );
    return { checkedAt: new Date().toISOString(), services };
  }
}
