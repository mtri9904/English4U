using EnglishLearningApp.Application.ScoringResults.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.ScoringResults.Queries.GetScoringResultBySessionId;

public class GetScoringResultBySessionIdQueryHandler(
    IGenericRepository<ScoringResult> scoringResultRepository
) : IRequestHandler<GetScoringResultBySessionIdQuery, ScoringResultDetail>
{
    public async Task<ScoringResultDetail> Handle(GetScoringResultBySessionIdQuery request, CancellationToken cancellationToken)
    {
        var results = await scoringResultRepository.FindAsync(r => r.SessionId == request.SessionId);
        var result = results.FirstOrDefault()
            ?? throw new KeyNotFoundException("Chưa có kết quả chấm điểm cho session này.");

        return new ScoringResultDetail(
            result.Id,
            result.SessionId,
            result.TotalScore,
            result.BandScore,
            result.Transcript,
            result.Feedback,
            result.PronunciationScore,
            result.FluencyScore,
            result.GrammarScore,
            result.CoherenceScore,
            result.ScoredAt
        );
    }
}
