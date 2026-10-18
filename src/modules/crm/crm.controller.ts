import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CrmService } from './crm.service.js';
import { QueryLeadsDto } from './dto/query-leads.dto.js';
import { UpdateLeadDto } from './dto/update-lead.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';

@ApiTags('CRM Leads')
@ApiBearerAuth()
@Controller('crm/leads')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get()
  @ApiOperation({ summary: 'Retrieve, search, and filter CRM and Meta leads with CSV export' })
  @ApiResponse({ status: 200, description: 'Leads list or CSV export' })
  async findAll(@Query() query: QueryLeadsDto, @Res() res: Response) {
    const result = await this.crmService.findAll(query);

    if ('csvContent' in result) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`,
      );
      return res.status(200).send(result.csvContent);
    }

    return res.status(200).json(result);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch single lead details' })
  @ApiResponse({ status: 200, description: 'Lead details' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  async findOne(@Param('id') id: string) {
    return this.crmService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update lead status, internal notes, or assignment' })
  @ApiResponse({ status: 200, description: 'Lead updated' })
  async update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.crmService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Permanently delete lead (Admin only)' })
  @ApiResponse({ status: 200, description: 'Lead deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async remove(@Param('id') id: string) {
    return this.crmService.remove(id);
  }
}
