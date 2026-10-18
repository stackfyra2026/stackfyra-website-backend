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
import { AdminSubmissionsService } from './admin-submissions.service.js';
import { QuerySubmissionsDto } from './dto/query-submissions.dto.js';
import { UpdateSubmissionDto } from './dto/update-submission.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';

@ApiTags('Admin Submissions')
@ApiBearerAuth()
@Controller('admin/submissions')
export class AdminSubmissionsController {
  constructor(
    private readonly adminSubmissionsService: AdminSubmissionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List lead submissions with pagination, search, and CSV export' })
  @ApiResponse({ status: 200, description: 'Submissions list or CSV download' })
  async findAll(@Query() query: QuerySubmissionsDto, @Res() res: Response) {
    const result = await this.adminSubmissionsService.findAll(query);

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
  @ApiOperation({ summary: 'Get single submission details' })
  @ApiResponse({ status: 200, description: 'Submission details' })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  async findOne(@Param('id') id: string) {
    return this.adminSubmissionsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update submission status or assignment' })
  @ApiResponse({ status: 200, description: 'Submission updated' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSubmissionDto,
  ) {
    return this.adminSubmissionsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Permanently delete submission (Admin only)' })
  @ApiResponse({ status: 200, description: 'Submission deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async remove(@Param('id') id: string) {
    return this.adminSubmissionsService.remove(id);
  }
}
