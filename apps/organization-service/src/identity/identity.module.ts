import { Global, Module } from '@nestjs/common';
import { HttpIdentityClient, IdentityClient } from './identity.client';

@Global()
@Module({
  providers: [{ provide: IdentityClient, useClass: HttpIdentityClient }],
  exports: [IdentityClient],
})
export class IdentityModule {}
