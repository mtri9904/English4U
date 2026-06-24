# Base image for runtime
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS base
WORKDIR /app
EXPOSE 7860
ENV ASPNETCORE_URLS=http://+:7860

# SDK image for building
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src

# Copy projects and restore dependencies
COPY ["EnglishExamApp.API/EnglishExamApp.API.csproj", "EnglishExamApp.API/"]
COPY ["EnglishExamApp.Application/EnglishExamApp.Application.csproj", "EnglishExamApp.Application/"]
COPY ["EnglishExamApp.Domain/EnglishExamApp.Domain.csproj", "EnglishExamApp.Domain/"]
COPY ["EnglishExamApp.Infrastructure/EnglishExamApp.Infrastructure.csproj", "EnglishExamApp.Infrastructure/"]
RUN dotnet restore "EnglishExamApp.API/EnglishExamApp.API.csproj"

# Copy all source files and build
COPY . .
WORKDIR "/src/EnglishExamApp.API"
RUN dotnet build "EnglishExamApp.API.csproj" -c $BUILD_CONFIGURATION -o /app/build

# Publish stage
FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "EnglishExamApp.API.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

# Final stage
FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .

# Create uploads folder and ensure permissions
RUN mkdir -p /app/uploads && chmod -R 777 /app/uploads

ENTRYPOINT ["dotnet", "EnglishExamApp.API.dll"]
