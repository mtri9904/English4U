namespace EnglishExamApp.Domain.Entities;

public class ReadingPassage
{
    public Guid Id { get; set; }
    public Guid SectionId { get; set; }
    public int? PassageNumber { get; set; }
    public string? Title { get; set; }
    public string? ParagraphsData { get; set; }
    public string? AssetsData { get; set; }

    public ExamSection Section { get; set; } = null!;
    public ICollection<QuestionGroup> QuestionGroups { get; set; } = [];
}
