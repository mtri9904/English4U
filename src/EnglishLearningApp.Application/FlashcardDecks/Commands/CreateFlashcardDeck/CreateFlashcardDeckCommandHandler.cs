using EnglishLearningApp.Application.FlashcardDecks.DTOs;
using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.FlashcardDecks.Commands.CreateFlashcardDeck;

public class CreateFlashcardDeckCommandHandler(
    IGenericRepository<FlashcardDeck> deckRepository
) : IRequestHandler<CreateFlashcardDeckCommand, FlashcardDeckResult>
{
    public async Task<FlashcardDeckResult> Handle(CreateFlashcardDeckCommand request, CancellationToken cancellationToken)
    {
        var deck = new FlashcardDeck
        {
            Id = Guid.NewGuid(),
            CourseId = request.CourseId,
            Title = request.Title,
            Description = request.Description,
            CreatedAt = DateTime.UtcNow
        };

        await deckRepository.AddAsync(deck);
        await deckRepository.SaveChangesAsync();

        return new FlashcardDeckResult(deck.Id, deck.CourseId, deck.Title, deck.Description, deck.CreatedAt);
    }
}
