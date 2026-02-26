using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using MediatR;

namespace EnglishLearningApp.Application.FlashcardDecks.Commands.DeleteFlashcardDeck;

public class DeleteFlashcardDeckCommandHandler(
    IGenericRepository<FlashcardDeck> deckRepository
) : IRequestHandler<DeleteFlashcardDeckCommand, bool>
{
    public async Task<bool> Handle(DeleteFlashcardDeckCommand request, CancellationToken cancellationToken)
    {
        var deck = await deckRepository.GetByIdAsync(request.Id)
            ?? throw new KeyNotFoundException("Không tìm thấy bộ thẻ.");

        deckRepository.Delete(deck);
        await deckRepository.SaveChangesAsync();
        return true;
    }
}
