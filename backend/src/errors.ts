/** Domain errors that map to 4xx responses. */
export class GameError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "GameError";
    this.code = code;
    this.status = status;
  }
}

export class InsufficientFunds extends GameError {
  constructor(currency: string, have: number, need: number) {
    super("INSUFFICIENT_FUNDS", `not enough ${currency}: have ${have}, need ${need}`, 402);
  }
}

export class InvalidAction extends GameError {
  constructor(message: string) {
    super("INVALID_ACTION", message, 422);
  }
}
