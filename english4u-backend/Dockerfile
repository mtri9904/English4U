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

# Install python3 and edge-tts for AI Neural Voice generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    && pip3 install --no-cache-dir --break-system-packages edge-tts \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create uploads and tts-cache folders and ensure full permissions
RUN mkdir -p /app/uploads /app/.runtime/tts-cache && chmod -R 777 /app/uploads /app/.runtime

ENTRYPOINT ["dotnet", "EnglishExamApp.API.dll"]
