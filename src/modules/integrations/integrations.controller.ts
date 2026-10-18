import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { UserRole } from '../../database/schemas/user.schema.js';
import { IntegrationsService } from './integrations.service.js';
import { ConfigureEmailDto } from './dto/configure-email.dto.js';
import { TestEmailDto } from './dto/test-email.dto.js';
import { RetryEmailDto } from './dto/retry-email.dto.js';
import { SaveMetaTokenDto } from './dto/save-meta-token.dto.js';
import { ReauthorizeMetaDto } from './dto/reauthorize-meta.dto.js';

@ApiTags('Admin Integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  // ==========================================
  // META INTEGRATION
  // ==========================================

  @Post('meta/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate Meta Token',
    description:
      'Validates token scopes and expiration with Facebook Graph API and sets reauthorization status if required.',
  })
  @ApiResponse({ status: 200, description: 'Token validation report.' })
  @ApiResponse({ status: 400, description: 'No connected Meta page.' })
  @ApiResponse({ status: 403, description: 'Admin privilege required.' })
  async validateMetaToken() {
    return this.integrationsService.validateMetaToken();
  }

  @Post('meta/token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Save Meta Page Token',
    description:
      'Validates, subscribes to leadgen webhooks, and encrypts a Meta Page Access Token with AES-256-GCM.',
  })
  @ApiResponse({ status: 200, description: 'Meta page token saved and subscribed.' })
  @ApiResponse({ status: 409, description: 'Active token exists, confirmOverwrite required.' })
  @ApiResponse({ status: 403, description: 'Admin privilege required.' })
  async saveMetaToken(@Body() dto: SaveMetaTokenDto) {
    return this.integrationsService.saveMetaToken(dto);
  }

  @Get('meta/status')
  @ApiOperation({
    summary: 'Get Meta Integration Status',
    description:
      'Returns sanitized Meta integration status without exposing encrypted tokens or cryptographic keys.',
  })
  @ApiResponse({ status: 200, description: 'Sanitized Meta integration health.' })
  @ApiResponse({ status: 403, description: 'Admin privilege required.' })
  async getMetaStatus() {
    return this.integrationsService.getMetaStatus();
  }

  @Post('meta/reauthorize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Flag Meta for Reauthorization',
    description:
      'Flags Meta connection as REAUTH_REQUIRED and sends alert email to administrators.',
  })
  @ApiResponse({ status: 200, description: 'Reauthorization flagged successfully.' })
  @ApiResponse({ status: 404, description: 'Meta integration not configured.' })
  @ApiResponse({ status: 403, description: 'Admin privilege required.' })
  async reauthorizeMeta(
    @Body() dto: ReauthorizeMetaDto,
    @CurrentUser() user: any,
  ) {
    return this.integrationsService.reauthorizeMeta(dto.reason, user?.email);
  }

  // ==========================================
  // EMAIL INTEGRATION
  // ==========================================

  @Get('email/status')
  @ApiOperation({
    summary: 'Get Email Integration Status',
    description:
      'Returns Resend integration status, masked credentials, DNS verification records, and MongoDB outbox queue statistics.',
  })
  @ApiResponse({ status: 200, description: 'Email integration overview.' })
  @ApiResponse({ status: 403, description: 'Admin privilege required.' })
  async getEmailStatus() {
    return this.integrationsService.getEmailStatus();
  }

  @Post('email/configure')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Configure Email Settings',
    description:
      'Configures Resend API key, sender details, alert rules, and verified DNS records.',
  })
  @ApiResponse({ status: 200, description: 'Email integration saved.' })
  @ApiResponse({ status: 400, description: 'Invalid API key or validation failed.' })
  @ApiResponse({ status: 409, description: 'Active key exists, confirmOverwrite required.' })
  @ApiResponse({ status: 403, description: 'Admin privilege required.' })
  async configureEmail(@Body() dto: ConfigureEmailDto) {
    return this.integrationsService.configureEmail(dto);
  }

  @Post('email/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send Test Email',
    description:
      'Enqueues and dispatches a test verification email via Resend and MongoDB Outbox.',
  })
  @ApiResponse({ status: 200, description: 'Test email dispatched or queued.' })
  @ApiResponse({ status: 400, description: 'Invalid test recipient.' })
  @ApiResponse({ status: 403, description: 'Admin privilege required.' })
  async sendTestEmail(
    @Body() dto: TestEmailDto,
    @CurrentUser() user: any,
  ) {
    return this.integrationsService.sendTestEmail(dto.recipient, user?.email);
  }

  @Post('email/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate Email Credentials',
    description:
      'Verifies the currently active Resend API key with the Resend Domains API.',
  })
  @ApiResponse({ status: 200, description: 'Credentials verified.' })
  @ApiResponse({ status: 400, description: 'No key or invalid credentials.' })
  @ApiResponse({ status: 403, description: 'Admin privilege required.' })
  async validateEmail() {
    return this.integrationsService.validateEmail();
  }

  @Get('email/jobs')
  @ApiOperation({
    summary: 'List Email Outbox Jobs',
    description:
      'Returns recent email outbox jobs, automatically purging entries older than 24 hours.',
  })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by job status (QUEUED, SENT, FAILED, ALL)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit number of jobs (1-50, default 15)' })
  @ApiResponse({ status: 200, description: 'List of outbox jobs.' })
  @ApiResponse({ status: 403, description: 'Admin privilege required.' })
  async getEmailJobs(
    @Query('status') status?: string,
    @Query('limit') limit?: number,
  ) {
    return this.integrationsService.getEmailJobs(status, limit ? Number(limit) : 15);
  }

  @Delete('email/jobs')
  @ApiOperation({
    summary: 'Delete Email Outbox Jobs',
    description: 'Deletes a specific outbox job by ID or clears all outbox jobs.',
  })
  @ApiQuery({ name: 'jobId', required: false, description: 'Specific outbox jobId to delete' })
  @ApiQuery({ name: 'id', required: false, description: 'Alternative alias for jobId or _id' })
  @ApiQuery({ name: 'clearAll', required: false, description: 'Set true to clear all matching jobs' })
  @ApiQuery({ name: 'status', required: false, description: 'Optional status filter when clearing' })
  @ApiResponse({ status: 200, description: 'Outbox jobs deleted.' })
  @ApiResponse({ status: 404, description: 'Job not found.' })
  @ApiResponse({ status: 403, description: 'Admin privilege required.' })
  async deleteEmailJobs(
    @Query('jobId') jobId?: string,
    @Query('id') id?: string,
    @Query('clearAll') clearAll?: string,
    @Query('status') status?: string,
  ) {
    const targetId = jobId || id;
    const shouldClearAll = clearAll === 'true';
    return this.integrationsService.deleteEmailJobs(targetId, shouldClearAll, status);
  }

  @Post('email/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retry Outbox Jobs',
    description:
      'Manually triggers immediate retry processing of eligible queued outbox email jobs.',
  })
  @ApiResponse({ status: 200, description: 'Retry processing completed.' })
  @ApiResponse({ status: 403, description: 'Admin privilege required.' })
  async retryEmailJobs(@Body() dto: RetryEmailDto) {
    return this.integrationsService.retryEmailJobs(dto.limit || 20);
  }
}
