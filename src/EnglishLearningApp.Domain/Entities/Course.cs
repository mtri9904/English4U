namespace EnglishLearningApp.Domain.Entities;

public class Course
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? ThumbnailUrl { get; set; }
    public string? SkillType { get; set; }
    public string? DifficultyLevel { get; set; }
    public bool IsPublished { get; set; } = false;
    public Guid? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User? Creator { get; set; }
    public ICollection<Lesson> Lessons { get; set; } = [];
    public ICollection<Exam> Exams { get; set; } = [];
    public ICollection<LearningProgress> LearningProgresses { get; set; } = [];
    public ICollection<CourseReview> CourseReviews { get; set; } = [];
    public ICollection<CourseTag> CourseTags { get; set; } = [];
    public ICollection<FlashcardDeck> FlashcardDecks { get; set; } = [];
}
