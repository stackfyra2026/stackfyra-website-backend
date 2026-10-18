import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type UserRole = 'ADMIN';
export const UserRole = {
  ADMIN: 'ADMIN' as const,
};

export type UserDocument = User & Document;

@Schema({ _id: false })
export class Device {
  @Prop({ type: String, required: true })
  deviceId: string;

  @Prop({ type: String, required: true })
  token: string;

  @Prop({ type: String, default: '' })
  userAgent?: string;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const DeviceSchema = SchemaFactory.createForClass(Device);

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({ type: String, required: true })
  passwordHash: string;

  @Prop({
    type: String,
    enum: ['ADMIN'],
    default: 'ADMIN',
  })
  role: UserRole;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    default: null,
  })
  createdBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  lastLoginAt?: Date;

  @Prop({ type: [DeviceSchema], default: [] })
  devices: Device[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
