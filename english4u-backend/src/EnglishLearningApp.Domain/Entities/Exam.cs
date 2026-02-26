namespace EnglishLearningApp.Domain.Entities;

public class Exam
{
    public Guid Id { get; set; }
    public Guid? CourseId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? Duration { get; set; }
    public int? TotalPoints { get; set; }
    public double? PassingScore { get; set; }
    public bool IsPublished { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public Guid? CreatedBy { get; set; }
    public bool IsCustom { get; set; } = false;

    public Course? Course { get; set; }
    public User? Creator { get; set; }
    public ICollection<ExamQuestion> ExamQuestions { get; set; } = [];
    public ICollection<ExamSession> ExamSessions { get; set; } = [];
}
