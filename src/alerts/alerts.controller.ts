import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { GetAlertsQueryDto, ResolveAlertDto } from './dto/alerts.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
 
@ApiTags('Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}
 
  // GET /api/v1/alerts
  @Get()
  @ApiOperation({
    summary: 'Danh sách cảnh báo (filter theo role tự động)',
    description:
      'Admin thấy tất cả. Owner thấy phòng mình. Tenant thấy phòng đang ở.',
  })
  getAlerts(@Query() query: GetAlertsQueryDto, @Request() req: any) {
    return this.alertsService.getAlerts(
      query,
      req.user.role,
      req.user._id.toString(),
    );
  }
 
  // PATCH /api/v1/alerts/:id/resolve
  @Patch(':id/resolve')
  @UseGuards(RolesGuard)
  @Roles('admin', 'owner')
  @ApiOperation({ summary: '[Admin/Owner] Đánh dấu cảnh báo đã xử lý' })
  @ApiParam({ name: 'id', description: 'Alert ObjectId' })
  resolveAlert(
    @Param('id') id: string,
    @Body() dto: ResolveAlertDto,
    @Request() req: any,
  ) {
    return this.alertsService.resolveAlert(
      id,
      dto,
      req.user.role,
      req.user._id.toString(),
    );
  }
}