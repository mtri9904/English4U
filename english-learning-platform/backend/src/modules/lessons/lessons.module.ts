import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';
import { Lesson } from '../../entities/lesson.entity';
import { Question } from '../../entities/question.entity';
import { QuestionOption } from '../../entities/question-option.entity';
import { UserSubmission } from '../../entities/user-submission.entity';
import { UserLessonProgress } from '../../entities/user-lesson-progress.entity';
import { CoinHistory } from '../../entities/coin-history.entity';
import { User } from '../../entities/user.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Lesson,
            Question,
            QuestionOption,
            UserSubmission,
            UserLessonProgress,
            CoinHistory,
            User,
        ]),
    ],
    controllers: [LessonsController],
    providers: [LessonsService],
    exports: [LessonsService],
})
export class LessonsModule { }
