import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, InviteOwnerDto, RegisterTenantDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/v1/auth/login
  @Post('login')
  @ApiOperation({ summary: 'Login – returns JWT access token and role' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // POST /api/v1/auth/invite-owner  (Admin only)
  @Post('invite-owner')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '[Admin only] Create an Owner account' })
  inviteOwner(@Body() dto: InviteOwnerDto) {
    return this.authService.inviteOwner(dto);
  }

  // POST /api/v1/auth/register-tenant  (Owner only)
  @Post('register-tenant')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @ApiOperation({ summary: '[Owner only] Create a Tenant and assign to a room' })
  registerTenant(@Body() dto: RegisterTenantDto, @Request() req: any) {
    return this.authService.registerTenant(dto, req.user._id.toString());
  }

  // GET /api/v1/auth/profile
  @Get('profile')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy thông tin user đang đăng nhập' })
  getProfile(@Request() req: any) {
    // req.user được populate bởi JwtStrategy.validate()
    // password đã bị exclude (select: false trong schema)
    return req.user;
  }

  
}