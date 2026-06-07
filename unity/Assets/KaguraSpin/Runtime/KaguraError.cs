using System;

namespace KaguraSpin
{
    /// <summary>
    /// Raised when the backend returns a non-2xx response. Mirrors the SDK's
    /// KaguraError: carries the server error <see cref="Code"/> and HTTP
    /// <see cref="Status"/> so callers can branch (e.g. 402 INSUFFICIENT_FUNDS).
    /// </summary>
    public sealed class KaguraError : Exception
    {
        public string Code { get; }
        public long Status { get; }

        public KaguraError(string code, string message, long status) : base(message)
        {
            Code = code;
            Status = status;
        }

        public override string ToString() => $"KaguraError({Code}, {Status}): {Message}";
    }
}
