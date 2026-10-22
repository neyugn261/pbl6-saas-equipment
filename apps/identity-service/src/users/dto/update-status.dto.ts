import { IsEnum } from 'class-validator';

export class UpdateStatusDto {
  @IsEnum(['ACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'SUSPENDED';
}
