namespace EnglishLearningApp.Domain.Entities;

public class UserAnswer
{
    public Guid Id { get; set; }
    public Guid? SessionId { get; set; }
    public Guid? QuestionId { get; set; }
    public string? AnswerText { get; set; }
    public string? AudioUrl { get; set; }
    public bool IsAutoSaved { get; set; } = true;
    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;

    public ExamSession? Session { get; set; }
    public Question? Question { get; set; }
}
