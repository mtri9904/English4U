using EnglishLearningApp.Application.Users.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Users.Queries.GetProfile;

public class GetProfileQueryHandler(
    IGenericRepository<User> userRepository
) : IRequestHandler<GetProfileQuery, UserProfileResult>
{
    public async Task<UserProfileResult> Handle(GetProfileQuery request, CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByIdAsync(request.UserId)
            ?? throw new KeyNotFoundException("Không tìm thấy người dùng.");

        return new UserProfileResult(
            user.Id,
            user.Email,
            user.DisplayName,
            user.Role,
            user.AvatarUrl,
            user.IsActive,
            user.CreatedAt
        );
    }
}
