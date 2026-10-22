import { Module } from '@nestjs/common';
import { ASSET_CLIENT, HttpAssetClient } from './asset-client';

@Module({
  providers: [{ provide: ASSET_CLIENT, useClass: HttpAssetClient }],
  exports: [ASSET_CLIENT],
})
export class AssetModule {}
