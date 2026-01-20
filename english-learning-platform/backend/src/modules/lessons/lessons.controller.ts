import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    UseGuards,
} from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { SubmitAnswersDto } from './dto/submit-answers.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../../entities/user.entity';

@Controller('lessons')
export class LessonsController {
    constructor(private lessonsService: LessonsService) { }

    // GET /api/lessons/:id - Get lesson content and questions
    @UseGuards(JwtAuthGuard)
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.lessonsService.findOne(+id);
    }

    // POST /api/lessons/submit - Submit answers
    @UseGuards(JwtAuthGuard)
    @Post('submit')
    submit(@CurrentUser() user: User, @Body() submitDto: SubmitAnswersDto) {
        return this.lessonsService.submitAnswers(user.UserID, submitDto);
    }
}
