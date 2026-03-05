namespace EnglishExamApp.Domain.Entities;

public class ExamTag
{
    public Guid ExamId { get; set; }
    public Guid TagId { get; set; }

    public Exam Exam { get; set; } = null!;
    public Tag Tag { get; set; } = null!;
}
