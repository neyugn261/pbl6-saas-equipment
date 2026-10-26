import { Module } from '@nestjs/common';
import { REFERENCES, HttpReferencesClient } from './references.client';
@Module({
  providers: [{ provide: REFERENCES, useClass: HttpReferencesClient }],
  exports: [REFERENCES],
})
export class ReferencesModule {}
