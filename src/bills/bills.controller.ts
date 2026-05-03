import {
  Body,
  Controller,
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
import { BillsService } from './bills.service';
import { CreateBillDto, GetBillsQueryDto } from './dto/bills.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
 
@ApiTags('Bills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bills')
export class BillsController {
  constructor(private readonly billsService: BillsService) {}
 
  // POST /api/v1/bills
  @Post()
  @UseGuards(RolesGuard)
  @Roles('owner')
  @ApiOperation({
    summary: '[Owner] Tạo hóa đơn tháng',
    description:
      'Tự động snapshot tên và SĐT tenant. ' +
      'Tự động tính tổng tiền = base_price + điện + nước. ' +
      'Chỉ tạo được 1 bill / phòng / tháng.',
  })
  createBill(@Body() dto: CreateBillDto, @Request() req: any) {
    return this.billsService.createBill(dto, req.user._id.toString());
  }
 
  // GET /api/v1/bills/my-bill  ← PHẢI đặt TRƯỚC /:id để không bị conflict
  @Get('my-bill')
  @UseGuards(RolesGuard)
  @Roles('tenant')
  @ApiOperation({ summary: '[Tenant] Xem hóa đơn của mình' })
  getMyBills(@Query() query: GetBillsQueryDto, @Request() req: any) {
    return this.billsService.getMyBills(req.user._id.toString(), query);
  }
 
  // GET /api/v1/bills
  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin', 'owner')
  @ApiOperation({
    summary: '[Admin/Owner] Danh sách hóa đơn',
    description: 'Filter theo room_id, month, year, status.',
  })
  getBills(@Query() query: GetBillsQueryDto, @Request() req: any) {
    return this.billsService.getBills(query, req.user.role, req.user._id.toString());
  }
 
  // PATCH /api/v1/bills/:id/status
  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('owner')
  @ApiOperation({
    summary: '[Owner] Xác nhận thanh toán hóa đơn',
    description: 'Atomic update — tránh double-pay bằng $ne guard.',
  })
  @ApiParam({ name: 'id', description: 'Bill ObjectId' })
  confirmPayment(@Param('id') id: string, @Request() req: any) {
    return this.billsService.confirmPayment(id, req.user._id.toString());
  }
}