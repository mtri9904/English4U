import {
    Controller,
    Post,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    Body,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { SpeakingService } from './speaking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../../entities/user.entity';

@Controller('speaking')
export class SpeakingController {
    constructor(private speakingService: SpeakingService) { }

    // POST /api/speaking/upload - Upload speaking audio (Workflow VII)
    @UseGuards(JwtAuthGuard)
    @Post('upload')
    @UseInterceptors(
        FileInterceptor('audio', {
            storage: diskStorage({
                destination: './uploads/audio/user-speaking',
                filename: (req, file, cb) => {
                    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
                    cb(null, `speaking-${uniqueSuffix}${extname(file.originalname)}`);
                },
            }),
            fileFilter: (req, file, cb) => {
                if (!file.mimetype.match(/\/(wav|mp3|webm|ogg|m4a)$/)) {
                    return cb(new BadRequestException('Only audio files are allowed'), false);
                }
                cb(null, true);
            },
            limits: {
                fileSize: 10 * 1024 * 1024, // 10MB max
            },
        }),
    )
    async uploadAudio(
        @CurrentUser() user: User,
        @UploadedFile() file: Express.Multer.File,
        @Body() body: { QuestionID: string },
    ) {
        if (!file) {
            throw new BadRequestException('No audio file provided');
        }

        return this.speakingService.processAndGradeAudio(
            user.UserID,
            parseInt(body.QuestionID, 10),
            file.path,
        );
    }
}
