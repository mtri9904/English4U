namespace EnglishExamApp.Domain.Entities;

public class SpeakingPart
{
    public Guid Id { get; set; }
    public Guid SectionId { get; set; }
    public int? PartNumber { get; set; }
    public string? Description { get; set; }

    public ExamSection Section { get; set; } = null!;
    public ICollection<SpeakingQuestion> SpeakingQuestions { get; set; } = [];
}
