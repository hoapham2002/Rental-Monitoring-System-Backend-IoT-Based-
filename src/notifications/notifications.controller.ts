import {
  Controller,
  Get,
  Param,
  Patch,
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
import { NotificationsService } from './notifications.service';
import { GetNotificationsQueryDto } from './dto/notifications.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
 
@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}
 
  // GET /api/v1/notifications
  @Get()
  @ApiOperation({
    summary: 'Lấy danh sách thông báo của user hiện tại',
    description: 'Trả về tối đa 50 thông báo mới nhất + số lượng chưa đọc.',
  })
  getNotifications(
    @Query() query: GetNotificationsQueryDto,
    @Request() req: any,
  ) {
    return this.notificationsService.getNotifications(
      req.user._id.toString(),
      query.unread_only,
    );
  }
 
  // PATCH /api/v1/notifications/:id/read
  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu 1 thông báo đã đọc' })
  @ApiParam({ name: 'id', description: 'Notification ObjectId' })
  markAsRead(@Param('id') id: string, @Request() req: any) {
    return this.notificationsService.markAsRead(id, req.user._id.toString());
  }
 
  // PATCH /api/v1/notifications/read-all
  @Patch('read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo đã đọc' })
  markAllAsRead(@Request() req: any) {
    return this.notificationsService.markAllAsRead(req.user._id.toString());
  }
}