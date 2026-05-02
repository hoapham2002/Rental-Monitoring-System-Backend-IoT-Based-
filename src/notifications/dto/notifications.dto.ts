import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
 
export class GetNotificationsQueryDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Nếu true, chỉ trả về thông báo chưa đọc',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  unread_only?: boolean;
}
 