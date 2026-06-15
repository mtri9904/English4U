namespace EnglishExamApp.Domain.Entities;

public class ScoringRubric
{
    public Guid Id { get; set; }
    public string? SkillType { get; set; }
    public string? CriteriaName { get; set; }
    public string? Description { get; set; }
    public double? MaxBand { get; set; }

    public ICollection<AiFeedback> AiFeedbacks { get; set; } = [];
}
