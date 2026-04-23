namespace EnglishExamApp.Domain.Entities;

public class ListeningPart
{
    public Guid Id { get; set; }
    public Guid SectionId { get; set; }
    public int? PartNumber { get; set; }
    public string AudioUrl { get; set; } = string.Empty;
    public string? ContextDescription { get; set; }
    public string? TranscriptData { get; set; }

    public ExamSection Section { get; set; } = null!;
    public ICollection<QuestionGroup> QuestionGroups { get; set; } = [];
}
