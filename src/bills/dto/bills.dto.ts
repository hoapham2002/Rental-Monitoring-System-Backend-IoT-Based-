import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
 
// ── POST /bills ───────────────────────────────────────────────────────────────
export class CreateBillDto {
  @ApiProperty({ example: '665f...', description: 'Room ObjectId' })
  @IsString()
  @IsNotEmpty()
  room_id!: string;
 
  @ApiProperty({ example: 1, description: 'Tháng (1-12)' })
  @IsNumber()
  @Min(1)
  @Max(12)
  month!: number;
 
  @ApiProperty({ example: 2025 })
  @IsNumber()
  @Min(2000)
  year!: number;
 
  @ApiProperty({ example: 120, description: 'Số điện tiêu thụ (kWh)' })
  @IsNumber()
  @Min(0)
  electricity_index!: number;
 
  @ApiProperty({ example: 8, description: 'Số nước tiêu thụ (m³)' })
  @IsNumber()
  @Min(0)
  water_index!: number;
}
 
// ── GET /bills query ──────────────────────────────────────────────────────────
export class GetBillsQueryDto {
  @ApiPropertyOptional({ example: '665f...' })
  @IsOptional()
  @IsString()
  room_id?: string;
 
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  @Transform(({ value }) => parseInt(value))
  month?: number;
 
  @ApiPropertyOptional({ example: 2025 })
  @IsOptional()
  @IsNumber()
  @Min(2000)
  @Transform(({ value }) => parseInt(value))
  year?: number;
 
  @ApiPropertyOptional({ enum: ['unpaid', 'paid', 'pending'] })
  @IsOptional()
  @IsEnum(['unpaid', 'paid', 'pending'])
  status?: 'unpaid' | 'paid' | 'pending';
}