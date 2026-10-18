import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { Public } from './common/decorators/public.decorator.js';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'API Health Check', description: 'Returns system uptime and health status.' })
  @ApiResponse({ status: 200, description: 'Service is healthy.' })
  getHealth() {
    return this.appService.getHealthStatus();
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'API Root', description: 'Root API endpoint returning health status.' })
  @ApiResponse({ status: 200, description: 'Service is healthy.' })
  getRoot() {
    return this.appService.getHealthStatus();
  }
}
