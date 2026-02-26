using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.Tags.Commands;

public record CreateTagCommand(string Name) : IRequest<TagResult>;
public record DeleteTagCommand(Guid Id) : IRequest<bool>;
public record TagResult(Guid Id, string Name);

public class CreateTagCommandHandler(
    IGenericRepository<Tag> repository
) : IRequestHandler<CreateTagCommand, TagResult>
{
    public async Task<TagResult> Handle(CreateTagCommand request, CancellationToken cancellationToken)
    {
        var entity = new Tag { Id = Guid.NewGuid(), Name = request.Name };
        await repository.AddAsync(entity);
        await repository.SaveChangesAsync();
        return new TagResult(entity.Id, entity.Name);
    }
}

public class DeleteTagCommandHandler(
    IGenericRepository<Tag> repository
) : IRequestHandler<DeleteTagCommand, bool>
{
    public async Task<bool> Handle(DeleteTagCommand request, CancellationToken cancellationToken)
    {
        var entity = await repository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy tag.");
        repository.Delete(entity);
        await repository.SaveChangesAsync();
        return true;
    }
}
