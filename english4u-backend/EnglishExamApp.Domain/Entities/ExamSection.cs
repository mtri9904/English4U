namespace EnglishExamApp.Domain.Entities;

public class ExamSection
{
    public Guid Id { get; set; }
    public Guid ExamId { get; set; }
    public string SkillType { get; set; } = string.Empty;
    public string? Title { get; set; }
    public int? OrderIndex { get; set; }

    public Exam Exam { get; set; } = null!;
    public ICollection<ReadingPassage> ReadingPassages { get; set; } = [];
    public ICollection<ListeningPart> ListeningParts { get; set; } = [];
    public ICollection<WritingTask> WritingTasks { get; set; } = [];
    public ICollection<SpeakingPart> SpeakingParts { get; set; } = [];
}
