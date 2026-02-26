using EnglishLearningApp.Application.Auth.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Auth.Queries.Login;

public record LoginQuery(
    string Email,
    string Password
) : IRequest<AuthResult>;
