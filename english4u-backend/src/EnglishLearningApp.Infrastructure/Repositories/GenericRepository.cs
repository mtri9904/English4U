using System.Linq.Expressions;
using EnglishLearningApp.Domain.Repositories;
using EnglishLearningApp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace EnglishLearningApp.Infrastructure.Repositories;

public class GenericRepository<T>(ApplicationDbContext context) : IGenericRepository<T> where T : class
{
    private readonly DbSet<T> _dbSet = context.Set<T>();

    public async Task<IEnumerable<T>> GetAllAsync()
        => await _dbSet.ToListAsync();

    public async Task<T?> GetByIdAsync(Guid id)
        => await _dbSet.FindAsync(id);

    public async Task<IEnumerable<T>> FindAsync(Expression<Func<T, bool>> predicate)
        => await _dbSet.Where(predicate).ToListAsync();

    public async Task AddAsync(T entity)
        => await _dbSet.AddAsync(entity);

    public void Update(T entity)
        => _dbSet.Update(entity);

    public void Delete(T entity)
        => _dbSet.Remove(entity);

    public async Task SaveChangesAsync()
        => await context.SaveChangesAsync();
}
