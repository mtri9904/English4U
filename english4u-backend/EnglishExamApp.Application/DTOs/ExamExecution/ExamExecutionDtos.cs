namespace EnglishExamApp.Application.DTOs.ExamExecution;

public sealed record AutoSaveAnswerDto(
    Guid SessionId,
    Guid QuestionId,
    string? AnswerText);

public sealed record SubmitExamResultDto(
    Guid SessionId,
    double ReadingScore,
    double ListeningScore,
    double TotalAutoScore,
    bool HasWriting,
    bool HasSpeaking,
    string Status);
