using EnglishLearningApp.Application.Auth.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using EnglishLearningApp.Domain.Services;
using MediatR;

namespace EnglishLearningApp.Application.Auth.Queries.Login;

public class LoginQueryHandler(
    IGenericRepository<User> userRepository,
    IJwtProvider jwtProvider,
    IPasswordHasher passwordHasher
) : IRequestHandler<LoginQuery, AuthResult>
{
    public async Task<AuthResult> Handle(LoginQuery request, CancellationToken cancellationToken)
    {
        var users = await userRepository.FindAsync(u => u.Email == request.Email);
        var user = users.FirstOrDefault()
            ?? throw new UnauthorizedAccessException("Email hoặc mật khẩu không đúng.");

        if (!passwordHasher.Verify(request.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("Email hoặc mật khẩu không đúng.");

        var token = jwtProvider.GenerateToken(user);
        return new AuthResult(user.Id, user.Email, user.DisplayName, user.Role, token);
    }
}
