import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../../entities/lesson.entity';
import { Question } from '../../entities/question.entity';
import { QuestionOption } from '../../entities/question-option.entity';
import { UserSubmission } from '../../entities/user-submission.entity';
import { UserLessonProgress } from '../../entities/user-lesson-progress.entity';
import { CoinHistory } from '../../entities/coin-history.entity';
import { User } from '../../entities/user.entity';
import { SubmitAnswersDto } from './dto/submit-answers.dto';

@Injectable()
export class LessonsService {
    constructor(
        @InjectRepository(Lesson)
        private lessonRepository: Repository<Lesson>,
        @InjectRepository(Question)
        private questionRepository: Repository<Question>,
        @InjectRepository(QuestionOption)
        private optionRepository: Repository<QuestionOption>,
        @InjectRepository(UserSubmission)
        private submissionRepository: Repository<UserSubmission>,
        @InjectRepository(UserLessonProgress)
        private progressRepository: Repository<UserLessonProgress>,
        @InjectRepository(CoinHistory)
        private coinHistoryRepository: Repository<CoinHistory>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
    ) { }

    // Workflow IV & V: Get lesson with questions (Listening, Reading, etc.)
    async findOne(id: number) {
        const lesson = await this.lessonRepository.findOne({
            where: { LessonID: id },
            relations: ['Unit'],
        });

        if (!lesson) {
            throw new NotFoundException('Lesson not found');
        }

        // Get questions with options
        const questions = await this.questionRepository.find({
            where: { LessonID: id },
        });

        const questionsWithOptions = await Promise.all(
            questions.map(async (question) => {
                const options = await this.optionRepository.find({
                    where: { QuestionID: question.QuestionID },
                });
                return {
                    ...question,
                    options: options.map((opt) => ({
                        OptionID: opt.OptionID,
                        OptionText: opt.OptionText,
                        // Hide correct answer from students
                    })),
                };
            }),
        );

        return {
            ...lesson,
            questions: questionsWithOptions,
        };
    }

    // Workflow IV & V: Submit answers and auto-grade
    async submitAnswers(userId: number, submitDto: SubmitAnswersDto) {
        const { LessonID, answers } = submitDto;

        let totalScore = 0;
        let maxScore = 0;
        const results: Array<{ QuestionID: number; IsCorrect: boolean; Score: number }> = [];

        // Process each answer
        for (const answer of answers) {
            const question = await this.questionRepository.findOne({
                where: { QuestionID: answer.QuestionID },
            });

            if (!question) continue;

            maxScore += question.ScorePoint;

            let isCorrect = false;
            let score = 0;

            // Auto-grade based on question type
            if (question.QuestionType === 'MCQ' || question.QuestionType === 'TrueFalse') {
                const correctOption = await this.optionRepository.findOne({
                    where: {
                        QuestionID: question.QuestionID,
                        IsCorrect: true,
                    },
                });

                isCorrect = correctOption?.OptionID === answer.SelectedOptionID;
                score = isCorrect ? question.ScorePoint : 0;
            }

            totalScore += score;

            // Save submission
            const submission = this.submissionRepository.create({
                UserID: userId,
                QuestionID: answer.QuestionID,
                SelectedOptionID: answer.SelectedOptionID,
                TextAnswer: answer.TextAnswer,
                AudioURL: answer.AudioURL,
                IsCorrect: isCorrect,
                AutoScore: score,
            });

            await this.submissionRepository.save(submission);

            results.push({
                QuestionID: question.QuestionID,
                IsCorrect: isCorrect,
                Score: score,
            });
        }

        const percentageScore = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

        // Update or create progress
        let progress = await this.progressRepository.findOne({
            where: { UserID: userId, LessonID },
        });

        const isCompleted = percentageScore >= 70; // 70% pass threshold

        if (progress) {
            if (!progress.HighScore || percentageScore > progress.HighScore) {
                progress.HighScore = percentageScore;
            }
            progress.IsCompleted = isCompleted;
            progress.LastLearnedAt = new Date();
        } else {
            progress = this.progressRepository.create({
                UserID: userId,
                LessonID,
                HighScore: percentageScore,
                IsCompleted: isCompleted,
            });
        }

        await this.progressRepository.save(progress);

        // Award coins if first time completing
        if (isCompleted && !progress.IsCompleted) {
            const coinsEarned = 10;
            await this.awardCoins(userId, coinsEarned, 'Completed lesson');
        }

        return {
            success: true,
            totalScore,
            maxScore,
            percentageScore,
            isCompleted,
            results,
        };
    }

    // Helper: Award coins
    private async awardCoins(userId: number, amount: number, description: string) {
        // Update user balance
        await this.userRepository.increment({ UserID: userId }, 'CoinBalance', amount);

        // Log transaction
        const transaction = this.coinHistoryRepository.create({
            UserID: userId,
            Amount: amount,
            Description: description,
        });

        await this.coinHistoryRepository.save(transaction);
    }
}
