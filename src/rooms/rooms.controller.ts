import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import {
  AssignTenantDto,
  CreateRoomDto,
  GetRoomsQueryDto,
  UpdateRoomStatusDto,
} from './dto/rooms.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
 
@ApiTags('Rooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}
 
  // GET /api/v1/rooms
  @Get()
  @ApiOperation({
    summary: 'Danh sách phòng (filter theo role tự động)',
    description: 'Admin thấy tất cả. Owner thấy phòng mình. Tenant thấy phòng đang ở.',
  })
  getRooms(@Query() query: GetRoomsQueryDto, @Request() req: any) {
    return this.roomsService.getRooms(query, req.user.role, req.user._id.toString());
  }
 
  // POST /api/v1/rooms
  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'owner')
  @ApiOperation({ summary: '[Admin/Owner] Tạo phòng mới' })
  createRoom(@Body() dto: CreateRoomDto, @Request() req: any) {
    return this.roomsService.createRoom(dto, req.user._id.toString());
  }
 
  // PATCH /api/v1/rooms/:id/assign
  @Patch(':id/assign')
  @UseGuards(RolesGuard)
  @Roles('admin', 'owner')
  @ApiOperation({ summary: '[Admin/Owner] Gán tenant vào phòng' })
  @ApiParam({ name: 'id', description: 'Room ObjectId' })
  assignTenant(
    @Param('id') id: string,
    @Body() dto: AssignTenantDto,
    @Request() req: any,
  ) {
    return this.roomsService.assignTenant(
      id,
      dto,
      req.user._id.toString(),
      req.user.role,
    );
  }
 
  // PATCH /api/v1/rooms/:id/status
  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('admin', 'owner')
  @ApiOperation({
    summary: '[Admin/Owner] Cập nhật trạng thái phòng',
    description: 'Không thể set "occupied" trực tiếp — dùng /assign.',
  })
  @ApiParam({ name: 'id', description: 'Room ObjectId' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRoomStatusDto,
    @Request() req: any,
  ) {
    return this.roomsService.updateStatus(
      id,
      dto,
      req.user._id.toString(),
      req.user.role,
    );
  }
 
  // DELETE /api/v1/rooms/:id
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'owner')
  @ApiOperation({
    summary: '[Admin/Owner] Xóa phòng',
    description:
      'Chỉ xóa được khi: không có tenant, không có thiết bị, không có hóa đơn chưa thanh toán.',
  })
  @ApiParam({ name: 'id', description: 'Room ObjectId' })
  deleteRoom(@Param('id') id: string, @Request() req: any) {
    return this.roomsService.deleteRoom(
      id,
      req.user._id.toString(),
      req.user.role,
    );
  }
}