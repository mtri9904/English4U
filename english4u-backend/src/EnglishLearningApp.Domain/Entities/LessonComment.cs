namespace EnglishLearningApp.Domain.Entities;

public class LessonComment
{
    public Guid Id { get; set; }
    public Guid LessonId { get; set; }
    public Guid UserId { get; set; }
    public Guid? ParentId { get; set; }
    public string Content { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Lesson? Lesson { get; set; }
    public User? User { get; set; }
    public LessonComment? Parent { get; set; }
    public ICollection<LessonComment> Replies { get; set; } = [];
}
