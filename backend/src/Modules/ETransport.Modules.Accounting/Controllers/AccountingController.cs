using ETransport.Core.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ETransport.Modules.Accounting.Controllers;

[ApiController]
[Route("api/accounting")]
[Authorize(Roles = "Accounting,Admin")]
public class AccountingController : ControllerBase
{
    [HttpGet("invoices")]
    public ActionResult<ApiResponse<List<InvoiceDto>>> GetInvoices() =>
        Ok(new ApiResponse<List<InvoiceDto>>(true, []));

    [HttpPost("invoices")]
    public ActionResult<ApiResponse<object>> CreateInvoice([FromBody] object request) =>
        Ok(new ApiResponse<object>(true, new { message = "Didox.uz / 1C integratsiyasi — keyingi bosqich" }));

    [HttpGet("integrations")]
    public ActionResult<ApiResponse<object>> Integrations() =>
        Ok(new ApiResponse<object>(true, new
        {
            systems = new[] { "1C Buxgalteriya", "Didox.uz", "e-gaz", "e-nakl" },
            status = "MVP — ulanish kutilmoqda"
        }));
}
