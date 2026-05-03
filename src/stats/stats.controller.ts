import {
  Controller,
  Get,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { StatsService } from './stats.service';
import { CacheInterceptor } from './cache.interceptor';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Stats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'owner')
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  // GET /api/v1/stats/overview
  @Get('overview')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({
    summary: 'Dashboard summary — 4 queries parallel',
    description:
      'Trả về: tổng phòng, phòng theo status, alert chưa xử lý, bill chưa trả, thiết bị offline. ' +
      'Cache Redis 5 phút.',
  })
  getOverview(@Request() req: any) {
    return this.statsService.getOverview(req.user.role, req.user._id.toString());
  }

  // GET /api/v1/stats/revenue?year=2025
  @Get('revenue')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({
    summary: 'Doanh thu theo tháng trong năm',
    description: 'Aggregation $group by month, đủ 12 tháng (tháng không có data = 0).',
  })
  @ApiQuery({ name: 'year', required: false, example: 2025 })
  getRevenue(@Request() req: any, @Query('year') year?: string) {
    const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.statsService.getRevenue(
      req.user.role,
      req.user._id.toString(),
      targetYear,
    );
  }

  // GET /api/v1/stats/alerts?days=7
  @Get('alerts')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({
    summary: 'Thống kê cảnh báo theo loại và timeline',
    description: 'Aggregation theo type, severity và theo ngày trong N ngày gần nhất.',
  })
  @ApiQuery({ name: 'days', required: false, example: 7, description: 'Số ngày nhìn lại (default: 7)' })
  getAlertStats(@Request() req: any, @Query('days') days?: string) {
    return this.statsService.getAlertStats(
      req.user.role,
      req.user._id.toString(),
      days ? parseInt(days, 10) : 7,
    );
  }

  // GET /api/v1/stats/devices
  @Get('devices')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({
    summary: 'Trạng thái thiết bị — online ratio + breakdown theo type',
    description: 'Phát hiện thiết bị stale (không ping >1 giờ).',
  })
  getDeviceStats(@Request() req: any) {
    return this.statsService.getDeviceStats(
      req.user.role,
      req.user._id.toString(),
    );
  }
}
