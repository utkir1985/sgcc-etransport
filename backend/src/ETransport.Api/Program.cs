using ETransport.Infrastructure;
using ETransport.Infrastructure.Data;
using ETransport.Modules.Accounting.Controllers;
using ETransport.Modules.Dashboard;
using ETransport.Modules.Dispatching;
using ETransport.Modules.Marketing;
using ETransport.Modules.Warehouse;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.OpenApi.Models;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<OneCScalesOptions>(builder.Configuration.GetSection(OneCScalesOptions.SectionName));
builder.Services.AddHttpClient("OneCScales", client =>
{
    // Keng sana oralig‘ida 1C minglab yozuv qaytarishi mumkin
    client.Timeout = TimeSpan.FromSeconds(120);
});

builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddMarketingModule();
builder.Services.AddDispatchingModule();
builder.Services.AddDashboardModule();
builder.Services.AddWarehouseModule();

// Standart: barcha endpointlar JWT talab qiladi ([AllowAnonymous] istisno)
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

// Login'ga qo'pol kuch (brute-force) hujumidan himoya — IP bo'yicha daqiqasiga
// cheklangan urinish. Nginx darajasida ham xuddi shunday cheklov bor (ikki qatlam).
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("login", opt =>
    {
        opt.PermitLimit = 5;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 0;
    });
});

builder.Services.AddControllers()
    .AddApplicationPart(typeof(ETransport.Infrastructure.Identity.Controllers.AuthController).Assembly)
    .AddApplicationPart(typeof(MarketingModule).Assembly)
    .AddApplicationPart(typeof(DispatchingModule).Assembly)
    .AddApplicationPart(typeof(ETransport.Modules.Railway.RailwayModule).Assembly)
    .AddApplicationPart(typeof(ETransport.Modules.Warehouse.WarehouseModule).Assembly)
    .AddApplicationPart(typeof(ETransport.Modules.GateScales.GateScalesModule).Assembly)
    .AddApplicationPart(typeof(ETransport.Modules.Documents.DocumentsModule).Assembly)
    .AddApplicationPart(typeof(ETransport.Modules.Accounting.AccountingModule).Assembly)
    .AddApplicationPart(typeof(DashboardModule).Assembly);

var swaggerEnabled = builder.Configuration.GetValue("Swagger:Enabled", builder.Environment.IsDevelopment());
if (swaggerEnabled)
{
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new OpenApiInfo
        {
            Title = "E-Transport API",
            Version = "v1",
            Description = "Yuklash va Transport Logistikasi Tizimi — Modulli arxitektura. Barcha endpointlar JWT talab qiladi (login dan tashqari)."
        });
        c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
        {
            Description = "Avval POST /api/Auth/login orqali token oling, so‘ng: Bearer {token}",
            Name = "Authorization",
            In = ParameterLocation.Header,
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT"
        });
        c.AddSecurityRequirement(new OpenApiSecurityRequirement
        {
            {
                new OpenApiSecurityScheme
                {
                    Reference = new OpenApiReference
                    {
                        Type = ReferenceType.SecurityScheme,
                        Id = "Bearer"
                    }
                },
                Array.Empty<string>()
            }
        });
    });
}

var corsOrigins = builder.Configuration["Cors:Origins"]?
    .Split(',', StringSplitOptions.RemoveEmptyEntries)
    .Select(x => x.Trim())
    .Where(x => !string.IsNullOrEmpty(x))
    .ToArray()
    ?? ["http://localhost"];

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();

using (var scope = app.Services.CreateScope())
    await DbSeeder.SeedAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>());

// Xavfsizlik headerlari
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers.TryAdd("X-Content-Type-Options", "nosniff");
    ctx.Response.Headers.TryAdd("X-Frame-Options", "DENY");
    ctx.Response.Headers.TryAdd("Referrer-Policy", "no-referrer");
    ctx.Response.Headers.TryAdd("X-XSS-Protection", "0");
    await next();
});

if (swaggerEnabled)
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "E-Transport API v1");
        c.DisplayRequestDuration();
    });
}

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
if (swaggerEnabled)
    app.MapSwagger().AllowAnonymous();
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }))
    .AllowAnonymous();

app.Run();
