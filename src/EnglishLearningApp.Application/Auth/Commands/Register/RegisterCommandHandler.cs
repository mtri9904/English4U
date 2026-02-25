using EnglishLearningApp.Application.Auth.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using EnglishLearningApp.Domain.Services;
using MediatR;

namespace EnglishLearningApp.Application.Auth.Commands.Register;

public class RegisterCommandHandler(
    IGenericRepository<User> userRepository,
    IJwtProvider jwtProvider,
    IPasswordHasher passwordHasher
) : IRequestHandler<RegisterCommand, AuthResult>
{
    public async Task<AuthResult> Handle(RegisterCommand request, CancellationToken cancellationToken)
    {
        var existing = await userRepository.FindAsync(u => u.Email == request.Email);
        if (existing.Any())
            throw new InvalidOperationException("Email đã được sử dụng.");

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = request.Email,
            PasswordHash = passwordHasher.Hash(request.Password),
            DisplayName = request.DisplayName,
            Role = request.Role ?? "Student",
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await userRepository.AddAsync(user);
        await userRepository.SaveChangesAsync();

        var token = jwtProvider.GenerateToken(user);
        return new AuthResult(user.Id, user.Email, user.DisplayName, user.Role, token);
    }
}
