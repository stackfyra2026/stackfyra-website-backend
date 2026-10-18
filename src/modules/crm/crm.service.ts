import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Lead,
  LeadDocument,
  LeadStatus,
  LeadSource,
} from '../../database/schemas/lead.schema.js';
import { QueryLeadsDto } from './dto/query-leads.dto.js';
import { UpdateLeadDto } from './dto/update-lead.dto.js';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

@Injectable()
export class CrmService {
  constructor(@InjectModel(Lead.name) private leadModel: Model<LeadDocument>) {}

  async findAll(query: QueryLeadsDto): Promise<
    | {
        csvContent: string;
        filename: string;
      }
    | {
        success: boolean;
        leads: any[];
        pagination: {
          total: number;
          page: number;
          limit: number;
          totalPages: number;
        };
        statusCounts: Record<string, number>;
      }
  > {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.max(
      1,
      Math.min(100, parseInt(query.limit || '10', 10)),
    );
    const search = (query.search || '').trim();
    const sourceParam = query.source || 'ALL';
    const statusParam = query.status || 'ALL';
    const dateFrom = query.dateFrom;
    const dateTo = query.dateTo;
    const assignedTo = query.assignedTo;
    const isExport = query.export === 'csv' || query.export === 'true';

    // Enforce tenant isolation
    const filter: any = {
      organizationId: 'stackfyra-org',
    };

    const validStatuses: LeadStatus[] = [
      'NEW',
      'CONTACTED',
      'IN_PROGRESS',
      'CONVERTED',
      'CLOSED',
    ];
    if (
      statusParam !== 'ALL' &&
      validStatuses.includes(statusParam as LeadStatus)
    ) {
      filter.status = statusParam;
    }

    const validSources: LeadSource[] = [
      'FACEBOOK',
      'INSTAGRAM',
      'WEBSITE',
      'GOOGLE_ADS',
      'LINKEDIN',
      'OTHER',
    ];
    if (
      sourceParam !== 'ALL' &&
      validSources.includes(sourceParam as LeadSource)
    ) {
      filter.source = sourceParam;
    }

    if (assignedTo && /^[0-9a-fA-F]{24}$/.test(assignedTo)) {
      filter.assignedTo = assignedTo;
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (!isNaN(from.getTime())) filter.createdAt.$gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        if (!isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = to;
        }
      }
    }

    if (search) {
      const sanitized = escapeRegex(search);
      filter.$or = [
        { fullName: { $regex: sanitized, $options: 'i' } },
        { email: { $regex: sanitized, $options: 'i' } },
        { phone: { $regex: sanitized, $options: 'i' } },
        { company: { $regex: sanitized, $options: 'i' } },
        { campaignName: { $regex: sanitized, $options: 'i' } },
        { formName: { $regex: sanitized, $options: 'i' } },
      ];
    }

    // CSV Export Handler
    if (isExport) {
      const allLeads = await this.leadModel
        .find(filter)
        .populate('assignedTo', 'name email')
        .sort({ createdAt: -1 })
        .lean();

      const csvHeaders = [
        'Lead ID',
        'External Lead ID',
        'Created At',
        'Full Name',
        'Email',
        'Phone',
        'Company',
        'Source',
        'Page Name',
        'Form Name',
        'Campaign Name',
        'Ad Name',
        'Status',
        'Assigned To',
        'Sync Status',
        'Notes',
      ];

      const csvRows = allLeads.map((lead: any) =>
        [
          escapeCsvField(lead._id),
          escapeCsvField(lead.externalLeadId || ''),
          escapeCsvField(
            new Date(lead.leadCreatedAt || lead.createdAt).toISOString(),
          ),
          escapeCsvField(lead.fullName || ''),
          escapeCsvField(lead.email || ''),
          escapeCsvField(lead.phone || ''),
          escapeCsvField(lead.company || ''),
          escapeCsvField(lead.source || 'FACEBOOK'),
          escapeCsvField(lead.pageName || ''),
          escapeCsvField(lead.formName || ''),
          escapeCsvField(lead.campaignName || ''),
          escapeCsvField(lead.adName || ''),
          escapeCsvField(lead.status || 'NEW'),
          escapeCsvField(lead.assignedTo?.name || ''),
          escapeCsvField(lead.syncStatus || 'SUCCESS'),
          escapeCsvField(lead.notes || ''),
        ].join(','),
      );

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
      const filename = `stackfyra-meta-leads-${dateFrom || 'all'}-to-${dateTo || 'today'}.csv`;

      return { csvContent, filename };
    }

    const skip = (page - 1) * limit;

    const [leads, total, counts] = await Promise.all([
      this.leadModel
        .find(filter)
        .populate('assignedTo', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.leadModel.countDocuments(filter),
      this.leadModel.aggregate([
        { $match: { organizationId: 'stackfyra-org' } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const statusCounts: Record<string, number> = {
      TOTAL: await this.leadModel.countDocuments({
        organizationId: 'stackfyra-org',
      }),
      NEW: 0,
      CONTACTED: 0,
      IN_PROGRESS: 0,
      CONVERTED: 0,
      CLOSED: 0,
    };

    counts.forEach((item: { _id: string; count: number }) => {
      if (item._id in statusCounts) {
        statusCounts[item._id] = item.count;
      }
    });

    return {
      success: true,
      leads,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      statusCounts,
    };
  }

  async findOne(id: string): Promise<any> {
    const lead = await this.leadModel
      .findOne({ _id: id, organizationId: 'stackfyra-org' })
      .populate('assignedTo', 'name email')
      .lean();

    if (!lead) {
      throw new NotFoundException('Lead not found.');
    }

    return { success: true, lead };
  }

  async update(id: string, dto: UpdateLeadDto): Promise<any> {
    const updateFields: any = {};

    const validStatuses: LeadStatus[] = [
      'NEW',
      'CONTACTED',
      'IN_PROGRESS',
      'CONVERTED',
      'CLOSED',
    ];
    if (dto.status && validStatuses.includes(dto.status)) {
      updateFields.status = dto.status;
    }

    if (typeof dto.notes === 'string') {
      updateFields.notes = dto.notes.trim();
    }

    if (
      dto.assignedTo === null ||
      (typeof dto.assignedTo === 'string' &&
        /^[0-9a-fA-F]{24}$/.test(dto.assignedTo))
    ) {
      updateFields.assignedTo = dto.assignedTo;
    }

    const updatedLead = await this.leadModel
      .findOneAndUpdate(
        { _id: id, organizationId: 'stackfyra-org' },
        { $set: updateFields },
        { new: true },
      )
      .populate('assignedTo', 'name email');

    if (!updatedLead) {
      throw new NotFoundException('Lead not found.');
    }

    return { success: true, lead: updatedLead };
  }

  async remove(id: string): Promise<any> {
    const deleted = await this.leadModel.findOneAndDelete({
      _id: id,
      organizationId: 'stackfyra-org',
    });

    if (!deleted) {
      throw new NotFoundException('Lead not found.');
    }

    return { success: true, message: 'Lead removed successfully.' };
  }
}
