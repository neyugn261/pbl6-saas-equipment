import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class PrepareAttachmentDto {
  @IsString() @MinLength(1) @MaxLength(255) fileName: string;
  @IsString() mimeType: string;
  @IsInt() @Min(1) sizeBytes: number;
  @Matches(/^[a-f0-9]{64}$/) checksumSha256: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['INTERNAL', 'CUSTOMER'])
  visibility?: 'INTERNAL' | 'CUSTOMER';
}
export class AttachmentVisibilityDto {
  @IsIn(['INTERNAL', 'CUSTOMER']) visibility: 'INTERNAL' | 'CUSTOMER';
}
export class CompleteAttachmentDto {}
