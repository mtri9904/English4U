namespace EnglishExamApp.Domain.Entities;

public class Exam
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? DurationMinutes { get; set; }
    public double? TotalPoints { get; set; }
    public string? ExamType { get; set; }
    public string? SourcePdfUrl { get; set; }
    public bool IsPublished { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User? Creator { get; set; }
    public ICollection<ExamSection> ExamSections { get; set; } = [];
    public ICollection<ExamSession> ExamSessions { get; set; } = [];
    public ICollection<ExamTag> ExamTags { get; set; } = [];
    public ICollection<DocumentUpload> DocumentUploads { get; set; } = [];
}
