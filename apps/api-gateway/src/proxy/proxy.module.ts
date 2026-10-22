import { Module } from '@nestjs/common';

/**
 * ProxyModule is intentionally empty — all proxy middleware are registered
 * in AppModule.configure() via the MiddlewareConsumer. This module exists
 * as a logical grouping placeholder and may grow to include proxy-specific
 * providers (e.g. circuit-breaker) in the future.
 */
@Module({})
export class ProxyModule {}
