namespace EnglishExamApp.Domain.Entities;

public class Question
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public int? QuestionNumber { get; set; }
    public string? Content { get; set; }
    public string? CorrectAnswer { get; set; }
    public string? Explanation { get; set; }
    public string? Provenance { get; set; }
    public string? EvidenceLocation { get; set; }
    public double Points { get; set; } = 1;

    public QuestionGroup Group { get; set; } = null!;
    public ICollection<QuestionOption> QuestionOptions { get; set; } = [];
    public ICollection<UserAnswer> UserAnswers { get; set; } = [];
    public ICollection<SavedQuestion> SavedQuestions { get; set; } = [];
}
