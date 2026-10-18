import { Module } from '@nestjs/common';
import { AdminSubmissionsController } from './admin-submissions.controller.js';
import { AdminSubmissionsService } from './admin-submissions.service.js';

@Module({
  controllers: [AdminSubmissionsController],
  providers: [AdminSubmissionsService],
  exports: [AdminSubmissionsService],
})
export class AdminSubmissionsModule {}
