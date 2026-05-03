import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
 
// ── POST /rooms ───────────────────────────────────────────────────────────────
export class CreateRoomDto {
  @ApiProperty({ example: 'Phòng 101' })
  @IsString()
  @IsNotEmpty()
  name!: string;
 
  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  floor!: number;
 
  @ApiProperty({ example: 2500000, description: 'Giá thuê cơ bản (VNĐ/tháng)' })
  @IsNumber()
  @Min(0)
  base_price!: number;
}
 
// ── PATCH /rooms/:id/assign ───────────────────────────────────────────────────
export class AssignTenantDto {
  @ApiProperty({ example: '665f...', description: 'ObjectId của tenant cần gán vào phòng' })
  @IsString()
  @IsNotEmpty()
  tenant_id!: string;
}
 
// ── PATCH /rooms/:id/status ───────────────────────────────────────────────────
export class UpdateRoomStatusDto {
  @ApiProperty({ enum: ['empty', 'occupied', 'maintenance'] })
  @IsEnum(['empty', 'occupied', 'maintenance'])
  status!: 'empty' | 'occupied' | 'maintenance';
}
 
// ── GET /rooms query ──────────────────────────────────────────────────────────
export class GetRoomsQueryDto {
  @ApiPropertyOptional({ enum: ['empty', 'occupied', 'maintenance'] })
  @IsOptional()
  @IsEnum(['empty', 'occupied', 'maintenance'])
  status?: 'empty' | 'occupied' | 'maintenance';
 
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  floor?: number;
}