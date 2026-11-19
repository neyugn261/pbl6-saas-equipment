import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { invalidInput } from './registration.dto';

const present = (_: unknown, value: unknown) => value !== undefined;
export class BulkRow {
  @IsUUID() modelId: string;
  @IsString() @Matches(/\S/) @MaxLength(100) assetCode: string;
  @IsString() @Matches(/\S/) @MaxLength(150) serialNumber: string;
  @ValidateIf(present)
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(200)
  displayName?: string;
  @ValidateIf(present) @IsUUID() locationId?: string;
  @ValidateIf(present) @IsUUID() customerSiteId?: string;
  @ValidateIf(present)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  purchaseDate?: string;
  @ValidateIf(present)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  handoverDate?: string;
}
export class BulkInput {
  @ValidateIf(present) @IsUUID() defaultLocationId?: string;
  @ValidateIf(present) @IsUUID() defaultModelId?: string;
  @IsUUID() customerId: string;
  @IsUUID() customerSiteId: string;
  @IsIn(['STORE', 'CUSTOMER_SITE']) deliveryMethod: 'STORE' | 'CUSTOMER_SITE';
  @ValidateIf(present)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => BulkRow)
  rows?: BulkRow[];
  @ValidateIf(present) @IsString() @MaxLength(5000000) csv?: string;
}

export class BulkEquipmentUpdateRow {
  @IsUUID() equipmentId: string;
  @IsISO8601() updatedAt: string;
  @ValidateIf((_, value) => value !== undefined && value !== null) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsISO8601({ strict: true }) purchaseDate?: string | null;
  @ValidateIf((_, value) => value !== undefined && value !== null) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsISO8601({ strict: true }) handoverDate?: string | null;
  @ValidateIf((_, value) => value !== undefined && value !== null) @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsISO8601({ strict: true }) installationDate?: string | null;
  @ValidateIf((_, value) => value !== undefined && value !== null) @IsUUID() customerSiteId?: string;
  @ValidateIf((_, value) => value !== undefined && value !== null) @IsUUID() locationId?: string | null;
}

export class BulkEquipmentUpdateInput {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000)
  @ValidateNested({ each: true }) @Type(() => BulkEquipmentUpdateRow)
  rows: BulkEquipmentUpdateRow[];
}

/** RFC-style quoted cells, including escaped quotes and embedded newlines. */
export function parseEquipmentCsv(
  csv: string,
  defaultModelId?: string,
): Record<string, string>[] {
  if (csv.length > 5000000) invalidInput('CSV exceeds 5 MB');
  const records: string[][] = [];
  let record: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  const source = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
    } else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === ',' || c === '\n' || c === '\r') {
      record.push(cell.trim());
      cell = '';
      closed = false;
      if (c !== ',') {
        if (record.some(Boolean)) records.push(record);
        record = [];
        if (c === '\r' && source[i + 1] === '\n') i++;
      }
    } else {
      if (closed || c === '"') invalidInput('Invalid CSV quoting');
      cell += c;
    }
  }
  if (quoted) invalidInput('Unclosed CSV quote');
  record.push(cell.trim());
  if (record.some(Boolean)) records.push(record);
  const headers = records.shift() ?? [];
  const allowed = [
    'modelId',
    'assetCode',
    'serialNumber',
    'displayName',
    'locationId',
    'customerSiteId',
    'purchaseDate',
    'handoverDate',
  ];
  if (
    new Set(headers).size !== headers.length ||
    headers.some((h) => !allowed.includes(h)) ||
    !['assetCode', 'serialNumber'].every((h) => headers.includes(h)) ||
    (!defaultModelId && !headers.includes('modelId'))
  )
    invalidInput(
      'CSV requires modelId,assetCode,serialNumber; optional displayName,locationId,handoverDate',
    );
  if (!records.length || records.length > 2000)
    invalidInput('Provide 1–2,000 equipment rows');
  return records.map((row, index) => {
    if (row.length !== headers.length)
      invalidInput(`CSV row ${index + 2}: incorrect number of cells`);
    return {
      ...(defaultModelId ? { modelId: defaultModelId } : {}),
      ...Object.fromEntries(
        headers.flatMap((h, i) => (row[i] ? [[h, row[i]]] : [])),
      ),
    };
  });
}
