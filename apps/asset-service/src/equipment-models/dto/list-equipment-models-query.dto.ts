import { PaginationQueryDto } from '@pbl6/service-kit';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const MODEL_SORTS = ['name', '-name', 'createdAt', '-createdAt'] as const;
export type ModelSort = (typeof MODEL_SORTS)[number];

export class ListEquipmentModelsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsIn(MODEL_SORTS)
  sort: ModelSort = 'name';
}
