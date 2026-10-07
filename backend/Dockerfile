FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY ETransport.sln ./
COPY src/ETransport.Core/ETransport.Core.csproj src/ETransport.Core/
COPY src/ETransport.Infrastructure/ETransport.Infrastructure.csproj src/ETransport.Infrastructure/
COPY src/ETransport.Api/ETransport.Api.csproj src/ETransport.Api/
COPY src/Modules/ETransport.Modules.Marketing/ETransport.Modules.Marketing.csproj src/Modules/ETransport.Modules.Marketing/
COPY src/Modules/ETransport.Modules.Dispatching/ETransport.Modules.Dispatching.csproj src/Modules/ETransport.Modules.Dispatching/
COPY src/Modules/ETransport.Modules.Railway/ETransport.Modules.Railway.csproj src/Modules/ETransport.Modules.Railway/
COPY src/Modules/ETransport.Modules.Warehouse/ETransport.Modules.Warehouse.csproj src/Modules/ETransport.Modules.Warehouse/
COPY src/Modules/ETransport.Modules.GateScales/ETransport.Modules.GateScales.csproj src/Modules/ETransport.Modules.GateScales/
COPY src/Modules/ETransport.Modules.Documents/ETransport.Modules.Documents.csproj src/Modules/ETransport.Modules.Documents/
COPY src/Modules/ETransport.Modules.Accounting/ETransport.Modules.Accounting.csproj src/Modules/ETransport.Modules.Accounting/
COPY src/Modules/ETransport.Modules.Dashboard/ETransport.Modules.Dashboard.csproj src/Modules/ETransport.Modules.Dashboard/

RUN dotnet restore ETransport.sln

COPY . .
RUN dotnet publish src/ETransport.Api/ETransport.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y curl fonts-liberation fontconfig fonts-freefont-ttf && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/publish .
EXPOSE 8080
ENTRYPOINT ["dotnet", "ETransport.Api.dll"]
