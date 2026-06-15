using EnglishExamApp.Application.DTOs.Users;

namespace EnglishExamApp.Application.Interfaces;

public interface IUserService
{
    Task<PagedResult<UserOverviewDto>> GetPagedUsersAsync(UserPagedRequest request, CancellationToken cancellationToken = default);
    Task<UserDetailDto?> GetUserDetailAsync(Guid id, CancellationToken cancellationToken = default);
    Task<UserManagementStatsDto> GetUserManagementStatsAsync(CancellationToken cancellationToken = default);
    Task<bool> ToggleUserStatusAsync(Guid id, bool isActive, CancellationToken cancellationToken = default);
    Task<bool> UpdateUserRoleAsync(Guid id, string roleName, CancellationToken cancellationToken = default);
    Task<bool> DeleteUserAsync(Guid id, CancellationToken cancellationToken = default);
}
