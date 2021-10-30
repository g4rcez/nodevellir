import { HttpStatusCode } from "../typings/http-status-code";

export class HttpError extends Error {
  constructor(public statusCode: HttpStatusCode, public message: string) {
    super();
    this.message = message
    this.name  = `[${statusCode}]HttpError`
  }
}
