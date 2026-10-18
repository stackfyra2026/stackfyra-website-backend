import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FormSubmission,
  FormSubmissionDocument,
  SubmissionStatus,
} from '../../database/schemas/form-submission.schema.js';
import { QuerySubmissionsDto } from './dto/query-submissions.dto.js';
import { UpdateSubmissionDto } from './dto/update-submission.dto.js';

function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

@Injectable()
export class AdminSubmissionsService {
  constructor(
    @InjectModel(FormSubmission.name)
    private formSubmissionModel: Model<FormSubmissionDocument>,
  ) {}

  async findAll(query: QuerySubmissionsDto): Promise<
    | {
        csvContent: string;
        filename: string;
      }
    | {
        success: boolean;
        submissions: any[];
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
    const q = (query.q || '').trim();
    const status = query.status;
    const startDate = query.startDate;
    const endDate = query.endDate;
    const isExport = query.export === 'csv' || query.export === 'true';
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const filter: any = {};

    if (
      status &&
      ['NEW', 'CONTACTED', 'IN_PROGRESS', 'CONVERTED', 'CLOSED'].includes(status)
    ) {
      filter.status = status;
    }

    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { company: { $regex: q, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) filter.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = end;
        }
      }
    }

    // Handle CSV Export
    if (isExport) {
      const allSubmissions = await this.formSubmissionModel
        .find(filter)
        .populate('assignedTo', 'name email')
        .sort({ [sortBy]: sortOrder })
        .lean();

      const csvHeaders = [
        'Submission ID',
        'Created Date',
        'Submission Type',
        'Status',
        'Client Name',
        'Email Address',
        'Phone Number',
        'Company',
        'Country',
        'City',
        'Service Requested',
        'Budget Range',
        'Timeline',
        'Message / Description',
        'Source',
        'UTM Source',
        'UTM Medium',
        'UTM Campaign',
        'IP Address',
      ];

      const csvRows = allSubmissions.map((sub: any) =>
        [
          escapeCsvField(sub._id),
          escapeCsvField(new Date(sub.createdAt).toISOString()),
          escapeCsvField(sub.type),
          escapeCsvField(sub.status),
          escapeCsvField(sub.name || ''),
          escapeCsvField(sub.email || ''),
          escapeCsvField(sub.phone || ''),
          escapeCsvField(sub.company || ''),
          escapeCsvField(sub.country || sub.country_name || ''),
          escapeCsvField(sub.city || ''),
          escapeCsvField(sub.service || sub.projectType || ''),
          escapeCsvField(sub.budgetRange || ''),
          escapeCsvField(sub.timeline || ''),
          escapeCsvField(sub.message || sub.projectDescription || ''),
          escapeCsvField(sub.source || ''),
          escapeCsvField(sub.utm_source || ''),
          escapeCsvField(sub.utm_medium || ''),
          escapeCsvField(sub.utm_campaign || ''),
          escapeCsvField(sub.ip || ''),
        ].join(','),
      );

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
      const filename = `stackfyra-leads-${startDate || 'all'}-to-${endDate || 'today'}.csv`;

      return { csvContent, filename };
    }

    const skip = (page - 1) * limit;

    const [submissions, total, counts] = await Promise.all([
      this.formSubmissionModel
        .find(filter)
        .populate('assignedTo', 'name email')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.formSubmissionModel.countDocuments(filter),
      this.formSubmissionModel.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const statusCounts: Record<string, number> = {
      TOTAL: await this.formSubmissionModel.countDocuments(),
      NEW: 0,
      CONTACTED: 0,
      IN_PROGRESS: 0,
      CONVERTED: 0,
      CLOSED: 0,
    };

    counts.forEach((item: { _id: SubmissionStatus; count: number }) => {
      if (item._id in statusCounts) {
        statusCounts[item._id] = item.count;
      }
    });

    return {
      success: true,
      submissions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      statusCounts,
    };
  }

  async findOne(id: string): Promise<any> {
    const submission = await this.formSubmissionModel
      .findById(id)
      .populate('assignedTo', 'name email')
      .lean();

    if (!submission) {
      throw new NotFoundException('Form submission not found.');
    }

    return { success: true, submission };
  }

  async update(id: string, dto: UpdateSubmissionDto): Promise<any> {
    const submission = await this.formSubmissionModel.findById(id);
    if (!submission) {
      throw new NotFoundException('Form submission not found.');
    }

    if (dto.status) {
      const validStatuses: SubmissionStatus[] = [
        'NEW',
        'CONTACTED',
        'IN_PROGRESS',
        'CONVERTED',
        'CLOSED',
      ];
      if (!validStatuses.includes(dto.status)) {
        throw new BadRequestException('Invalid lead status value.');
      }
      submission.status = dto.status;
    }

    if (dto.assignedTo !== undefined) {
      submission.assignedTo = (dto.assignedTo as any) || null;
    }

    await submission.save();

    return {
      success: true,
      message: 'Form submission updated.',
      submission,
    };
  }

  async remove(id: string): Promise<any> {
    const submission = await this.formSubmissionModel.findByIdAndDelete(id);
    if (!submission) {
      throw new NotFoundException('Form submission not found.');
    }

    return { success: true, message: 'Submission deleted successfully.' };
  }
}
