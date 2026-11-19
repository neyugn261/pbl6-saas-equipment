import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';
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

export class TechnicianKpiQueryDto {
  @Transform(upperTimestamp)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(REPORT_TIMESTAMP, { message })
  from: string;

  @Transform(upperTimestamp)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(REPORT_TIMESTAMP, { message })
  to: string;

  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsUUID('4')
  technicianId?: string;
}

export interface TechnicianKpiItem {
  technicianId: string;
  employeeCode: string;
  userId: string;
  fullName: string | null;
  branchId: string;
  branchName: string | null;
  branchCode: string | null;
  status: string;
  // Khối lượng: Đếm WO hoàn tất trong khoảng ngày được chọn, gồm WO khảo sát
  completedCount: number;
  // Tỷ lệ sửa thành công: WO sửa chữa/bảo hành có kết quả RESOLVED / tổng WO sửa chữa/bảo hành có kết quả kỹ thuật
  repairSuccessRate: number | null;
  resolvedRepairCount: number;
  eligibleRepairCount: number;
  // Tỷ lệ đúng hạn: WO hoàn tất vào hoặc trước scheduledEnd / tổng WO hoàn tất có scheduledEnd
  onTimeRate: number | null;
  onTimeCount: number;
  scheduledCount: number;
  // MTTR: Thời gian xử lý trung bình tính theo giờ (làm tròn 2 chữ số thập phân)
  averageMttrHours: number | null;
  // FTFR: Tỷ lệ sửa dứt điểm lần đầu (không phải ca thay thế/làm lại)
  firstTimeFixRate: number | null;
  firstTimeFixCount: number;
  // Phân bổ khối lượng theo loại công việc
  repairCount: number;
  warrantyCount: number;
  maintenanceCount: number;
  inspectionCount: number;
}

export interface TechnicianKpiSummary {
  totalTechnicians: number;
  totalCompletedCount: number;
  overallRepairSuccessRate: number | null;
  totalResolvedRepairCount: number;
  totalEligibleRepairCount: number;
  overallOnTimeRate: number | null;
  totalOnTimeCount: number;
  totalScheduledCount: number;
  overallMttrHours: number | null;
  overallFirstTimeFixRate: number | null;
  totalFirstTimeFixCount: number;
  totalRepairCount: number;
  totalWarrantyCount: number;
  totalMaintenanceCount: number;
  totalInspectionCount: number;
}

export interface TechnicianKpiResponse {
  from: string;
  to: string;
  timezone: 'Asia/Ho_Chi_Minh';
  items: TechnicianKpiItem[];
  summary: TechnicianKpiSummary;
}

export class TechnicianDrilldownQueryDto {
  @Transform(upperTimestamp)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(REPORT_TIMESTAMP, { message })
  from: string;

  @Transform(upperTimestamp)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(REPORT_TIMESTAMP, { message })
  to: string;
}

export interface TechnicianDrilldownWorkOrder {
  id: string;
  workOrderNo: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  customerId: string;
  customerName: string | null;
  equipmentId: string;
  branchId: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  startedAt: string | null;
  completedAt: string;
  durationHours: number | null;
  isOnTime: boolean | null;
  reportResult: string | null;
  isFirstTimeFix: boolean | null;
}

export interface TechnicianDrilldownResponse {
  from: string;
  to: string;
  timezone: 'Asia/Ho_Chi_Minh';
  technician: {
    technicianId: string;
    employeeCode: string;
    fullName: string | null;
    branchId: string;
    branchName: string | null;
  };
  items: TechnicianDrilldownWorkOrder[];
  total: number;
}
