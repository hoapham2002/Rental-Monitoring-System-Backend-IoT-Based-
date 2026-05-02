import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
 
// ── POST /devices/status (từ IoT Gateway) ────────────────────────────────────
export class UpdateStatusDto {
  @ApiProperty({
    example: 'FIRE_101',
    description: 'Device ID khớp với _id trong collection Devices',
  })
  @IsString()
  @IsNotEmpty()
  deviceId!: string;
 
  @ApiProperty({
    example: 'FIRE',
    description:
      'Giá trị trạng thái gửi lên. Các giá trị đặc biệt: FIRE, DOOR_OPEN, DOOR_LOCKED, MOTION_ON, MOTION_OFF, PASSWORD_FAIL',
  })
  @IsString()
  @IsNotEmpty()
  value!: string;
 
  @ApiPropertyOptional({
    example: '2025-01-15T10:30:00Z',
    description: 'Timestamp từ thiết bị. Nếu không có sẽ dùng server time',
  })
  @IsOptional()
  @IsString()
  ts?: string;
}
 
// ── POST /devices/control (từ FE/Mobile) ─────────────────────────────────────
export class ControlDeviceDto {
  @ApiProperty({ example: 'LOCK_101' })
  @IsString()
  @IsNotEmpty()
  deviceId!: string;
 
  @ApiProperty({
    example: 'UNLOCK',
    enum: ['UNLOCK', 'LOCK', 'LIGHT_ON', 'LIGHT_OFF'],
  })
  @IsEnum(['UNLOCK', 'LOCK', 'LIGHT_ON', 'LIGHT_OFF'])
  command!: 'UNLOCK' | 'LOCK' | 'LIGHT_ON' | 'LIGHT_OFF';
 
  @ApiPropertyOptional({
    example: 5,
    description: 'Thời gian (giây) giữ trạng thái, ví dụ: mở khóa 5 giây rồi tự khóa lại',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  duration_sec?: number;
}
 
// ── GET /devices/:id/logs query params ───────────────────────────────────────
export class GetLogsQueryDto {
  @ApiPropertyOptional({ example: 50, description: 'Số log tối đa trả về (default 50)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
 
  @ApiPropertyOptional({ example: 'door_opened', description: 'Filter theo loại event' })
  @IsOptional()
  @IsString()
  event?: string;
}