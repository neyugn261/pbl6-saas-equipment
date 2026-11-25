import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

abstract class CodeLookupDto {
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  code!: string;
}

export class SiteCodeLookupDto extends CodeLookupDto {
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  customerCode!: string;
}

export class LocationCodeLookupDto extends SiteCodeLookupDto {
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  locationCode!: string;
}

export class ContactCodeLookupDto extends CodeLookupDto {
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  customerCode!: string;
}

export class BatchLookupDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((item) => (typeof item === 'string' ? item.trim() : item))
      : value,
  )
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  customerCodes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SiteCodeLookupDto)
  sites?: SiteCodeLookupDto[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => LocationCodeLookupDto)
  locations?: LocationCodeLookupDto[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ContactCodeLookupDto)
  contacts?: ContactCodeLookupDto[];
}
