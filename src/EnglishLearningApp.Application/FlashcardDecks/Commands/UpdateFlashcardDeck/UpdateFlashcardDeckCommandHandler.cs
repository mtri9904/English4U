using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.FlashcardDecks.Commands.UpdateFlashcardDeck;

public class UpdateFlashcardDeckCommandHandler(
    IGenericRepository<FlashcardDeck> deckRepository
) : IRequestHandler<UpdateFlashcardDeckCommand, bool>
{
    public async Task<bool> Handle(UpdateFlashcardDeckCommand request, CancellationToken cancellationToken)
    {
        var deck = await deckRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy bộ thẻ.");

        deck.Title = request.Title;
        deck.Description = request.Description;

        deckRepository.Update(deck);
        await deckRepository.SaveChangesAsync();
        return true;
    }
}
