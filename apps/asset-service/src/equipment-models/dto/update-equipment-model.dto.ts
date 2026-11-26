import { IsIn } from 'class-validator';

export class UpdateEquipmentModelDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status: 'ACTIVE' | 'INACTIVE';
}
