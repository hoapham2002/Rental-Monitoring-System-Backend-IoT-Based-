import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
 
export class GetAlertsQueryDto {
  @ApiPropertyOptional({ example: '665f...', description: 'Filter theo phòng' })
  @IsOptional()
  @IsString()
  room_id?: string;
 
  @ApiPropertyOptional({ example: false, description: 'Filter theo trạng thái xử lý' })
  @IsOptional()
  @IsBoolean()
  resolved?: boolean;
 
  @ApiPropertyOptional({ enum: ['fire', 'security', 'system'] })
  @IsOptional()
  @IsEnum(['fire', 'security', 'system'])
  type?: 'fire' | 'security' | 'system';
 
  @ApiPropertyOptional({ enum: ['info', 'warning', 'critical'] })
  @IsOptional()
  @IsEnum(['info', 'warning', 'critical'])
  severity?: 'info' | 'warning' | 'critical';
 
  @ApiPropertyOptional({ example: 20, description: 'Số lượng tối đa (default: 20)' })
  @IsOptional()
  limit?: number;
}
 
export class ResolveAlertDto {
  @ApiPropertyOptional({ example: 'Đã kiểm tra, báo động nhầm do bếp gas' })
  @IsOptional()
  @IsString()
  note?: string;
}