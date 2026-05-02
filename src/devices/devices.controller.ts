import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { UpdateStatusDto, ControlDeviceDto, GetLogsQueryDto } from './dto/devices.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
 
@ApiTags('Devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}
 
  // ── GET /devices ─────────────────────────────────────────────────────────
  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Danh sách thiết bị (filter theo role tự động)' })
  @ApiQuery({ name: 'room_id', required: false, description: 'Filter theo phòng cụ thể' })
  getDevices(@Request() req: any, @Query('room_id') roomId?: string) {
    return this.devicesService.getDevices(req.user.role, req.user._id.toString(), roomId);
  }
 
  // ── GET /devices/:id/logs ─────────────────────────────────────────────────
  @Get(':id/logs')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lịch sử hoạt động thiết bị (ai mở cửa, lúc nào)' })
  @ApiParam({ name: 'id', example: 'LOCK_101' })
  getDeviceLogs(
    @Param('id') id: string,
    @Query() query: GetLogsQueryDto,
    @Request() req: any,
  ) {
    return this.devicesService.getDeviceLogs(
      id,
      query,
      req.user.role,
      req.user._id.toString(),
    );
  }
 
  // ── POST /devices/status ── Auth: x-api-key (middleware, không phải guard) ─
  @Post('status')
  @ApiSecurity('IoT-API-Key')
  @ApiOperation({
    summary: '[IoT Gateway] Cập nhật trạng thái thiết bị',
    description:
      'Yêu cầu header x-api-key. Không dùng JWT. ' +
      'Values đặc biệt: FIRE, PASSWORD_FAIL → tự động tạo Alert + emit Socket.io',
  })
  handleStatusUpdate(@Body() dto: UpdateStatusDto) {
    return this.devicesService.handleStatusUpdate(dto);
  }
 
  // ── POST /devices/control ──────────────────────────────────────────────────
  @Post('control')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'owner', 'tenant')
  @ApiOperation({
    summary: 'Điều khiển thiết bị từ xa (mở khóa, bật đèn...)',
    description: 'Tenant chỉ điều khiển thiết bị phòng mình.',
  })
  controlDevice(@Body() dto: ControlDeviceDto, @Request() req: any) {
    return this.devicesService.controlDevice(
      dto,
      req.user._id.toString(),
      req.user.role,
    );
  }
}