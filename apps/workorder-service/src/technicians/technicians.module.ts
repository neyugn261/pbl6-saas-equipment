import { Module } from '@nestjs/common';
import { ReferencesModule } from '../references/references.module';
import { TechniciansRepository } from './technicians.repository';
import { TechniciansService } from './technicians.service';
import {
  SkillsController,
  TechniciansController,
} from './technicians.controller';
@Module({
  imports: [ReferencesModule],
  providers: [TechniciansRepository, TechniciansService],
  controllers: [TechniciansController, SkillsController],
})
export class TechniciansModule {}
