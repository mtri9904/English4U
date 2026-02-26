using EnglishLearningApp.Application.ScoringResults.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.ScoringResults.Queries.GetScoringResultBySessionId;

public record GetScoringResultBySessionIdQuery(Guid SessionId) : IRequest<ScoringResultDetail>;
