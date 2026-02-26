namespace EnglishLearningApp.Domain.Entities;

public class UserUpload
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string? FileName { get; set; }
    public string? FileUrl { get; set; }
    public string? FileType { get; set; }
    public string? ProcessStatus { get; set; } // Pending, Processing, Completed, Failed
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}
