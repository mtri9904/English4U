namespace EnglishLearningApp.Domain.Entities;

public class ExamQuestion
{
    public Guid Id { get; set; }
    public Guid? ExamId { get; set; }
    public Guid? QuestionId { get; set; }
    public int? OrderIndex { get; set; }

    public Exam? Exam { get; set; }
    public Question? Question { get; set; }
}
