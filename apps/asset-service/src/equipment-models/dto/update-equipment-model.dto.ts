import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class UpdateEquipmentModelDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  description?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
