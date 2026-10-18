import { Controller, Post, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { InquiriesService } from './inquiries.service.js';
import { SendInquiryDto } from './dto/send-inquiry.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';

@ApiTags('Public Inquiries')
@Controller('send-inquiry')
export class InquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit lead capture or consultation booking inquiry' })
  @ApiResponse({ status: 200, description: 'Inquiry saved and notifications dispatched' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async submitInquiry(@Body() dto: SendInquiryDto, @Req() req: Request) {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string) ||
      req.socket.remoteAddress;

    return this.inquiriesService.processInquiry(dto, clientIp);
  }
}
