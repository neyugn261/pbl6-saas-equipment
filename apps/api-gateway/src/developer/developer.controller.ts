import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { resolve } from 'node:path';
import { DeveloperService } from './developer.service.js';

// Developer tooling only: no business data, and every route is disabled in production.
// Try-it-out still goes through the normal Gateway and each service's auth guards.
@Controller()
export class DeveloperController {
  constructor(private readonly developer: DeveloperService) {}

  @Get('dev')
  dashboard(@Res() response: Response) {
    return this.page(response, 'dashboard.html');
  }

  @Get('docs')
  docs(@Res() response: Response) {
    return this.page(response, 'docs.html');
  }

  @Get('dev/catalog')
  catalog() {
    return this.developer.catalog();
  }

  @Get('dev/status')
  status() {
    return this.developer.status();
  }

  @Get('docs/openapi/:document')
  spec(@Param('document') document: string) {
    if (!document.endsWith('.json')) throw new NotFoundException();
    return this.developer.spec(document.slice(0, -5));
  }

  @Get('dev/assets/:file')
  asset(@Param('file') file: string, @Res() response: Response) {
    this.developer.assertEnabled();
    const files: Record<string, string> = {
      'portal.css': resolve(__dirname, 'public/portal.css'),
      'dashboard.js': resolve(__dirname, 'public/dashboard.js'),
      'docs.js': resolve(__dirname, 'public/docs.js'),
      'swagger-ui.css': require.resolve('swagger-ui-dist/swagger-ui.css'),
      'swagger-ui-bundle.js':
        require.resolve('swagger-ui-dist/swagger-ui-bundle.js'),
    };
    if (!Object.hasOwn(files, file)) throw new NotFoundException();
    // pnpm resolves dependencies through node_modules/.pnpm. Only the fixed
    // whitelist above may be served; no request path is passed to sendFile.
    return response.sendFile(files[file], { dotfiles: 'allow' });
  }

  private page(response: Response, name: string) {
    this.developer.assertEnabled();
    response.setHeader('Cache-Control', 'no-store');
    return response.sendFile(resolve(__dirname, 'public', name));
  }
}
