import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { SpeakingController } from './speaking.controller';
import { SpeakingService } from './speaking.service';
import { UserSubmission } from '../../entities/user-submission.entity';
import { Question } from '../../entities/question.entity';
import * as fs from 'fs';

@Module({
    imports: [
        TypeOrmModule.forFeature([UserSubmission, Question]),
        MulterModule.registerAsync({
            useFactory: () => ({
                dest: './uploads/audio/user-speaking',
            }),
        }),
    ],
    controllers: [SpeakingController],
    providers: [SpeakingService],
    exports: [SpeakingService],
})
export class SpeakingModule {
    constructor() {
        // Create upload directories if they don't exist
        const dirs = [
            './uploads',
            './uploads/audio',
            './uploads/audio/user-speaking',
            './uploads/audio/listening',
        ];

        dirs.forEach((dir) => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
}
