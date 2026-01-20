import { IsNotEmpty, IsNumber, IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateCourseDto {
    @IsNotEmpty()
    @IsNumber()
    LevelID: number;

    @IsNotEmpty()
    @IsString()
    Title: string;

    @IsOptional()
    @IsString()
    Description?: string;

    @IsOptional()
    @IsString()
    ThumbnailURL?: string;

    @IsOptional()
    @IsNumber()
    Price?: number;

    @IsOptional()
    @IsBoolean()
    IsPublished?: boolean;
}
