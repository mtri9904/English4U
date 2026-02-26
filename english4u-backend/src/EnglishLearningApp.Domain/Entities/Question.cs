namespace EnglishLearningApp.Domain.Entities;

public class Question
{
    public Guid Id { get; set; }
    public Guid? LessonId { get; set; }
    public string? SkillType { get; set; }
    public string? QuestionType { get; set; }
    public string? Content { get; set; }
    public string? AudioUrl { get; set; }
    public string? ImageUrl { get; set; }
    public string? CorrectAnswer { get; set; }
    public string? Options { get; set; }
    public string? Explanation { get; set; }
    public int Points { get; set; } = 1;
    public int? OrderIndex { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Lesson? Lesson { get; set; }
    public ICollection<ExamQuestion> ExamQuestions { get; set; } = [];
    public ICollection<UserAnswer> UserAnswers { get; set; } = [];
}
