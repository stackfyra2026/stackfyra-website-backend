import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health and root', () => {
    it('should return health status', () => {
      const result = appController.getHealth();
      expect(result).toBeDefined();
      expect(result.status).toBe('ok');
      expect(result.service).toBe('Stackfyra NestJS API');
    });

    it('should return root status', () => {
      const result = appController.getRoot();
      expect(result).toBeDefined();
      expect(result.status).toBe('ok');
    });
  });
});
