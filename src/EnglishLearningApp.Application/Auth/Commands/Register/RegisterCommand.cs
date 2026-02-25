using EnglishLearningApp.Application.Auth.DTOs;
using MediatR;

namespace EnglishLearningApp.Application.Auth.Commands.Register;

public record RegisterCommand(
    string Email,
    string Password,
    string? DisplayName,
    string? Role
) : IRequest<AuthResult>;
