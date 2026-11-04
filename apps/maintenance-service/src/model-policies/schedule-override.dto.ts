import { IsUUID, IsInt, Min, Max } from 'class-validator';
export class ScheduleOverrideDto {
  @IsUUID() itemId: string;
  @IsInt() @Min(1) @Max(1000) frequencyValue: number;
  @IsInt() @Min(1) @Max(100) firstOccurrence: number;
}
