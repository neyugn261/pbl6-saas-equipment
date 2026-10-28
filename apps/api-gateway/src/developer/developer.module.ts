import { Module } from '@nestjs/common';
import { DeveloperController } from './developer.controller.js';
import { DeveloperService } from './developer.service.js';
@Module({ controllers: [DeveloperController], providers: [DeveloperService] })
export class DeveloperModule {}
