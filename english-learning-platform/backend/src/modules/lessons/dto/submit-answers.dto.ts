import { IsNotEmpty, IsNumber, IsOptional, IsArray } from 'class-validator';

export class SubmitAnswersDto {
    @IsNotEmpty()
    @IsNumber()
    LessonID: number;

    @IsNotEmpty()
    @IsArray()
    answers: SubmitAnswerItem[];
}

export class SubmitAnswerItem {
    @IsNotEmpty()
    @IsNumber()
    QuestionID: number;

    @IsOptional()
    @IsNumber()
    SelectedOptionID?: number; // For MCQ

    @IsOptional()
    TextAnswer?: string; // For writing/fill-in-blank

    @IsOptional()
    AudioURL?: string; // For speaking (set after upload)
}
