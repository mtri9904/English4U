namespace EnglishExamApp.Application.DTOs.Exams;

public sealed record ReadabilityAnalysisResponseDto(
    double FleschKincaidGrade,
    double GunningFog,
    int WordCount,
    double ZipfFrequency,
    double AwlRatio);
