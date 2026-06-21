namespace EnglishExamApp.Domain.Entities;

public class QuestionGroup
{
    public Guid Id { get; set; }
    public Guid? PassageId { get; set; }
    public Guid? ListeningPartId { get; set; }
    public string? GroupType { get; set; }
    public string? Instruction { get; set; }
    public int? StartQuestion { get; set; }
    public int? EndQuestion { get; set; }
    public string? OptionLabelType { get; set; }

    public string? ContentData { get; set; }
    public string? AssetsData { get; set; }

    public ReadingPassage? Passage { get; set; }
    public ListeningPart? ListeningPart { get; set; }
    public ICollection<Question> Questions { get; set; } = [];
}
