// src/errors/BadRequestError.ts
export class EmptyRequestError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = "EmptyRequestError";
    this.statusCode = 204; // HTTP 204 No Content
  }
}
