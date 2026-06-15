namespace EnglishExamApp.Domain.Entities;

public class DocumentUpload
{
    public Guid Id { get; set; }
    public Guid UploadedBy { get; set; }
    public string? FileName { get; set; }
    public string FileUrl { get; set; } = string.Empty;
    public string ProcessStatus { get; set; } = "Pending";
    public string? ErrorMessage { get; set; }
    public Guid? GeneratedExamId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User Uploader { get; set; } = null!;
    public Exam? GeneratedExam { get; set; }
}
