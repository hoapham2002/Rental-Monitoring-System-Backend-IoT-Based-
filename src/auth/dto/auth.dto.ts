import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
 
// ── Login ────────────────────────────────────────────────────
export class LoginDto {
  @ApiProperty({ example: 'owner@example.com' })
  @IsEmail()
  email!: string;
 
  @ApiProperty({ example: 'strongPassword123' })
  @IsString()
  @MinLength(6)
  password!: string;
}
 
// ── Admin creates Owner ──────────────────────────────────────
export class InviteOwnerDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  @IsNotEmpty()
  name!: string;
 
  @ApiProperty({ example: 'owner@example.com' })
  @IsEmail()
  email!: string;
 
  @ApiProperty({ example: 'strongPassword123' })
  @IsString()
  @MinLength(6)
  password!: string;
 
  @ApiProperty({ example: '0912345678' })
  @IsString()
  phone!: string;
}
 
// ── Owner creates Tenant ─────────────────────────────────────
export class RegisterTenantDto {
  @ApiProperty({ example: 'Tran Thi B' })
  @IsString()
  @IsNotEmpty()
  name!: string;
 
  @ApiProperty({ example: 'tenant@example.com' })
  @IsEmail()
  email!: string;
 
  @ApiProperty({ example: 'strongPassword123' })
  @IsString()
  @MinLength(6)
  password!: string;
 
  @ApiProperty({ example: '0987654321' })
  @IsString()
  phone!: string;
 
  @ApiProperty({ example: '665f1a2b3c4d5e6f7a8b9c0d', description: 'Room ObjectId to assign' })
  @IsString()
  @IsNotEmpty()
  room_id!: string;
}