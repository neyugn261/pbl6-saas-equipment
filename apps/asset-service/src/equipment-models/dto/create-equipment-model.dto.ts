import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class CreateEquipmentModelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  manufacturer: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  modelCode: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  category?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  description?: string;
}
