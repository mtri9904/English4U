using EnglishLearningApp.Application.Tags.Commands;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Tags.Queries;

public record GetAllTagsQuery : IRequest<IEnumerable<TagResult>>;

public class GetAllTagsQueryHandler(
    IGenericRepository<Tag> repository
) : IRequestHandler<GetAllTagsQuery, IEnumerable<TagResult>>
{
    public async Task<IEnumerable<TagResult>> Handle(GetAllTagsQuery request, CancellationToken cancellationToken)
    {
        var list = await repository.GetAllAsync();
        return list.Select(t => new TagResult(t.Id, t.Name));
    }
}
