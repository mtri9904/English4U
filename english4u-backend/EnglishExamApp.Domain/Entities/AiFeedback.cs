namespace EnglishExamApp.Domain.Entities;

public class AiFeedback
{
    public Guid Id { get; set; }
    public Guid AnswerId { get; set; }
    public Guid RubricId { get; set; }
    public double BandScore { get; set; }
    public string? AiComment { get; set; }
    public string? Improvements { get; set; }
    public double? ConfidenceScore { get; set; }
    public string? EvidenceData { get; set; }

    public UserAnswer Answer { get; set; } = null!;
    public ScoringRubric Rubric { get; set; } = null!;
}
