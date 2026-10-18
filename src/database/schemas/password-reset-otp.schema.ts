import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type PasswordResetOtpDocument = PasswordResetOtp & Document;

@Schema({ timestamps: true, collection: 'passwordresetotps' })
export class PasswordResetOtp {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({ type: String, required: true })
  otpHash: string;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: Date, default: null })
  consumedAt?: Date;

  @Prop({ type: String, default: null, index: true })
  resetTokenHash?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PasswordResetOtpSchema =
  SchemaFactory.createForClass(PasswordResetOtp);
// MongoDB TTL index on expiresAt field (auto deletes after expiresAt passes)
PasswordResetOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
