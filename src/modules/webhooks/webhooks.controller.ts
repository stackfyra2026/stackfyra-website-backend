import {
  Controller,
  Get,
  Post,
  Query,
  Headers,
  Req,
  Res,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { WebhooksService } from './webhooks.service.js';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Public()
  @Get('meta')
  @ApiOperation({
    summary: 'Meta Webhook Handshake',
    description:
      'Responds to Facebook Webhook subscription verification requests with the challenge string in plain text.',
  })
  @ApiQuery({ name: 'hub.mode', description: 'Subscribe mode (must be "subscribe")' })
  @ApiQuery({ name: 'hub.verify_token', description: 'Verification secret token configured in Meta App' })
  @ApiQuery({ name: 'hub.challenge', description: 'Random challenge string provided by Meta' })
  @ApiResponse({ status: 200, description: 'Plain text challenge response.' })
  @ApiResponse({ status: 403, description: 'Token mismatch or forbidden.' })
  verifyMetaWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string) ||
      (req.headers['x-real-ip'] as string) ||
      req.socket.remoteAddress ||
      'unknown';

    const verifiedChallenge = this.webhooksService.verifyMetaWebhookHandshake(
      mode,
      token,
      challenge,
      ip,
    );

    return res.status(HttpStatus.OK).type('text/plain').send(verifiedChallenge);
  }

  @Public()
  @Post('meta')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive Meta Lead Event',
    description:
      'Receives signed real-time lead generation notifications, verifies HMAC-SHA256 signature, deduplicates, and ingests leads.',
  })
  @ApiHeader({
    name: 'x-hub-signature-256',
    required: false,
    description: 'HMAC-SHA256 signature calculated with META_APP_SECRET',
  })
  @ApiResponse({ status: 200, description: 'Webhook acknowledged and processed.' })
  @ApiResponse({ status: 401, description: 'Invalid signature.' })
  async receiveMetaWebhook(
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: any,
    @Body() body: any,
  ) {
    const rawBody = req.rawBody || JSON.stringify(body);
    return this.webhooksService.handleMetaWebhookEvent(rawBody, signature, body);
  }

  @Public()
  @Post('resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive Resend Delivery Event',
    description:
      'Receives email delivery, bounce, and complaint notifications from Resend, updating MongoDB Outbox statuses.',
  })
  @ApiHeader({ name: 'svix-id', required: false, description: 'Svix Webhook message ID' })
  @ApiHeader({ name: 'svix-timestamp', required: false, description: 'Svix Webhook timestamp' })
  @ApiHeader({ name: 'svix-signature', required: false, description: 'Svix Webhook signature' })
  @ApiResponse({ status: 200, description: 'Webhook event processed.' })
  @ApiResponse({ status: 401, description: 'Invalid signature.' })
  async receiveResendWebhook(
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
    @Headers('resend-signature-id') resendId: string,
    @Headers('x-resend-signature') xResendSig: string,
    @Req() req: any,
    @Body() body: any,
  ) {
    const rawBody = req.rawBody || JSON.stringify(body);
    const id = svixId || resendId;
    const sig = svixSignature || xResendSig;
    return this.webhooksService.handleResendWebhookEvent(
      rawBody,
      id,
      svixTimestamp,
      sig,
      body,
    );
  }
}
