import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';
import { User, UserDocument } from '../../database/schemas/user.schema.js';

export interface PushNotificationPayload {
  title: string;
  body: string;
  clickUrl?: string;
  data?: Record<string, string>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private adminApp: App | null = null;

  constructor(
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {
    this.initFirebaseAdmin();
  }

  private initFirebaseAdmin() {
    try {
      if (getApps().length > 0) {
        this.adminApp = getApps()[0];
        return;
      }

      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;

      if (projectId && clientEmail && privateKey) {
        this.adminApp = initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        this.logger.log('Firebase Admin SDK initialized successfully.');
      } else {
        this.logger.warn(
          'Firebase Admin credentials incomplete in environment (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).',
        );
      }
    } catch (err: any) {
      this.logger.error('Failed to initialize Firebase Admin SDK: ' + err.message);
    }
  }

  /**
   * Registers or updates an FCM token for an admin user device.
   */
  async registerDeviceToken(
    userId: string,
    token: string,
    reqDeviceId?: string,
    reqUserAgent?: string,
  ): Promise<{ deviceId: string; deviceCount: number }> {
    const deviceId =
      reqDeviceId && typeof reqDeviceId === 'string' && reqDeviceId.trim()
        ? reqDeviceId.trim()
        : `dev_${Buffer.from(token).toString('base64url').substring(0, 16)}`;

    const userAgent =
      reqUserAgent && typeof reqUserAgent === 'string'
        ? reqUserAgent.trim()
        : '';

    // Step 1: Try updating existing device with matching deviceId
    const updateResult = await this.userModel.updateOne(
      { _id: userId, 'devices.deviceId': deviceId },
      {
        $set: {
          'devices.$.token': token,
          'devices.$.userAgent': userAgent,
          'devices.$.updatedAt': new Date(),
        },
      },
    );

    // Step 2: If deviceId did not match any existing device, $push new device object
    if (updateResult.matchedCount === 0) {
      await this.userModel.updateOne(
        { _id: userId },
        {
          $push: {
            devices: {
              deviceId,
              token,
              userAgent,
              updatedAt: new Date(),
            },
          },
        },
      );
    }

    const updatedUser = await this.userModel.findById(userId, { devices: 1 });
    return {
      deviceId,
      deviceCount: updatedUser?.devices?.length || 1,
    };
  }

  /**
   * Dispatches multicast push notification to all active Admin device tokens.
   */
  async sendPushNotificationToAdmins(
    payload: PushNotificationPayload,
  ): Promise<{ successCount: number; failureCount: number }> {
    try {
      if (!this.adminApp) {
        this.logger.warn(
          'Firebase Admin is not initialized. Skipping FCM push notification.',
        );
        return { successCount: 0, failureCount: 0 };
      }

      const adminUsers: any[] = await this.userModel.find({
        role: 'ADMIN',
        isActive: true,
      });

      if (!adminUsers || adminUsers.length === 0) {
        return { successCount: 0, failureCount: 0 };
      }

      const tokenToUserMap: Array<{ userId: string; token: string }> = [];
      adminUsers.forEach((adminUser: any) => {
        if (Array.isArray(adminUser.devices)) {
          adminUser.devices.forEach((device: any) => {
            if (
              device &&
              device.token &&
              typeof device.token === 'string' &&
              device.token.trim()
            ) {
              tokenToUserMap.push({
                userId: (adminUser as any)._id.toString(),
                token: device.token.trim(),
              });
            }
          });
        }
      });

      const tokens = tokenToUserMap.map((item) => item.token);
      if (tokens.length === 0) {
        this.logger.log('No active admin device tokens found in database.');
        return { successCount: 0, failureCount: 0 };
      }

      const message: MulticastMessage = {
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          title: payload.title,
          body: payload.body,
          click_action: payload.clickUrl || '/admin',
          url: payload.clickUrl || '/admin',
          ...(payload.data || {}),
        },
        android: {
          priority: 'high',
          notification: {
            title: payload.title,
            body: payload.body,
            icon: '/favicon/apple-touch-icon.png',
            clickAction: payload.clickUrl || '/admin',
            sound: 'default',
            defaultSound: true,
            defaultVibrateTimings: true,
            priority: 'high',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
            'apns-push-type': 'alert',
          },
          payload: {
            aps: {
              alert: {
                title: payload.title,
                body: payload.body,
              },
              sound: 'default',
              badge: 1,
              'content-available': 1,
            },
          },
        },
        webpush: {
          headers: {
            Urgency: 'high',
            TTL: '86400',
          },
          notification: {
            title: payload.title,
            body: payload.body,
            icon: '/favicon/apple-touch-icon.png',
            badge: '/favicon/favicon-32x32.png',
            vibrate: [200, 100, 200],
            renotify: true,
            tag: 'stackfyra-lead',
            requireInteraction: true,
            actions: [
              {
                action: 'open',
                title: 'View Lead',
              },
            ],
          },
          fcmOptions: {
            link: payload.clickUrl || '/admin',
          },
        },
        tokens,
      };

      const messaging = getMessaging(this.adminApp);
      const response = await messaging.sendEachForMulticast(message);
      this.logger.log(
        `FCM Push Notification sent to ${tokens.length} admin device(s): ${response.successCount} succeeded, ${response.failureCount} failed.`,
      );

      // Clean up stale or invalid FCM tokens
      if (response.failureCount > 0) {
        const tokensToRemove: Array<{ userId: string; token: string }> = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error) {
            const errorCode = resp.error.code;
            if (
              errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered'
            ) {
              tokensToRemove.push(tokenToUserMap[idx]);
            }
          }
        });

        if (tokensToRemove.length > 0) {
          for (const item of tokensToRemove) {
            await this.userModel.findByIdAndUpdate(item.userId, {
              $pull: {
                devices: { token: item.token },
              },
            });
          }
          this.logger.log(
            `Cleaned up ${tokensToRemove.length} expired/invalid device FCM token(s) from database.`,
          );
        }
      }

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error: any) {
      this.logger.error(
        'Error dispatching FCM push notification to admins: ' + error.message,
      );
      return { successCount: 0, failureCount: 0 };
    }
  }
}
