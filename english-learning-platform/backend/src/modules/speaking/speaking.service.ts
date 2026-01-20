import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UserSubmission } from '../../entities/user-submission.entity';
import { Question } from '../../entities/question.entity';
import axios from 'axios';
import * as fs from 'fs';
const FormData = require('form-data');

@Injectable()
export class SpeakingService {
    private aiServiceUrl: string;

    constructor(
        @InjectRepository(UserSubmission)
        private submissionRepository: Repository<UserSubmission>,
        @InjectRepository(Question)
        private questionRepository: Repository<Question>,
        private configService: ConfigService,
    ) {
        this.aiServiceUrl = this.configService.get('AI_SERVICE_URL', 'http://localhost:8000');
    }

    // Workflow VII: Process speaking audio and send to AI
    async processAndGradeAudio(userId: number, questionID: number, audioPath: string) {
        // Get question details
        const question = await this.questionRepository.findOne({
            where: { QuestionID: questionID },
        });

        if (!question) {
            throw new Error('Question not found');
        }

        // Generate public URL for audio (relative path)
        const audioURL = audioPath.replace(/\\/g, '/').replace('./uploads', '/uploads');

        // Send to AI service for analysis
        let aiResponse: any = null;
        try {
            aiResponse = await this.callAIService(audioPath, question.ContentText);
        } catch (error) {
            console.error('AI Service error:', error.message);
            // Continue without AI if service is unavailable
        }

        // Save submission with AI results
        const submission = this.submissionRepository.create({
            UserID: userId,
            QuestionID: questionID,
            AudioURL: audioURL,
            PronunciationScore: aiResponse?.pronunciationScore || null,
            FluencyScore: aiResponse?.fluencyScore || null,
            AutoScore: aiResponse?.overallScore || null,
            SystemFeedback: aiResponse?.feedback || 'AI grading unavailable',
        });

        await this.submissionRepository.save(submission);

        return {
            success: true,
            submissionID: submission.SubmissionID,
            audioURL,
            pronunciationScore: aiResponse?.pronunciationScore,
            fluencyScore: aiResponse?.fluencyScore,
            overallScore: aiResponse?.overallScore,
            feedback: aiResponse?.feedback,
            transcript: aiResponse?.transcript,
        };
    }

    // Call Python AI service
    private async callAIService(audioPath: string, expectedText: string) {
        const formData = new FormData();
        formData.append('audio', fs.createReadStream(audioPath));
        formData.append('expected_text', expectedText);

        const response = await axios.post(
            `${this.aiServiceUrl}/api/speaking/analyze`,
            formData,
            {
                headers: formData.getHeaders(),
                timeout: 30000, // 30 seconds
            },
        );

        return response.data;
    }
}
