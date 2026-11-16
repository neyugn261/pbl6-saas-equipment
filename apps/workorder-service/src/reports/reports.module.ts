import { Module } from '@nestjs/common';
import { ReferencesModule } from '../references/references.module';
import {
  ReportsController,
  TechnicianReportsController,
} from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

@Module({
  imports: [ReferencesModule],
  controllers: [ReportsController, TechnicianReportsController],
  providers: [ReportsRepository, ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
