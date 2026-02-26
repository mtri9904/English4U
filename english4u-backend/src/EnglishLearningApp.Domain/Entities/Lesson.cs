namespace EnglishLearningApp.Domain.Entities;

public class Lesson
{
    public Guid Id { get; set; }
    public Guid? CourseId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? ThumbnailUrl { get; set; }
    public string? Content { get; set; }
    public int? OrderIndex { get; set; }
    public int? Duration { get; set; }
    public bool IsPublished { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Course? Course { get; set; }
    public ICollection<Question> Questions { get; set; } = [];
    public ICollection<LessonComment> LessonComments { get; set; } = [];
}
