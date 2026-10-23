import { IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

const calendarDate = /^\d{4}-\d{2}-\d{2}$/;

export class WarrantyDateQueryDto {
  @IsOptional() @Matches(calendarDate) @IsISO8601({ strict: true }) date?: string;
}

export class CreateWarrantyDto {
  @Matches(calendarDate) @IsISO8601({ strict: true }) startDate: string;
  @Matches(calendarDate) @IsISO8601({ strict: true }) endDate: string;
  @IsString() @MinLength(1) @MaxLength(50) warrantyType: string;
  @IsOptional() @IsString() terms?: string;
}

export class VoidWarrantyDto {
  @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(1000) reason?: string;
}
