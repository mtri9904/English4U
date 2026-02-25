using EnglishLearningApp.Application.Users.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Users.Queries.GetProfile;

public record GetProfileQuery(Guid UserId) : IRequest<UserProfileResult>;
