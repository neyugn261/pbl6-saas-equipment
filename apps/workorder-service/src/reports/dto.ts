import { Transform } from 'class-transformer';
import { IsISO8601, Matches } from 'class-validator';
import { REPORT_TIMESTAMP } from './report-range';

// RFC3339 permits lowercase t/z; normalize before strict ISO validation.
const upperTimestamp = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase() : value;
const message =
  '$property must have an explicit Z/offset and at most six fractional digits';
export class WorkOrderSummaryQueryDto {
  @Transform(upperTimestamp)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(REPORT_TIMESTAMP, { message })
  from: string;

  @Transform(upperTimestamp)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(REPORT_TIMESTAMP, { message })
  to: string;
}
