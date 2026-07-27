import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";

/** Maps Prisma database errors to sensible HTTP statuses instead of a blanket 500. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Database error";

    switch (exception.code) {
      case "P2002": // unique constraint
        status = HttpStatus.CONFLICT;
        message = "A record with these details already exists.";
        break;
      case "P2025": // record not found (update/delete)
        status = HttpStatus.NOT_FOUND;
        message = "The requested record was not found.";
        break;
      case "P2003": // foreign key constraint
        status = HttpStatus.BAD_REQUEST;
        message = "This references data that doesn't exist or is still in use.";
        break;
      case "P2014": // required relation violated
        status = HttpStatus.BAD_REQUEST;
        message = "This change would break a required relation.";
        break;
      default:
        this.logger.warn(`Unmapped Prisma error ${exception.code}: ${exception.message.slice(0, 120)}`);
    }
    res.status(status).json({ statusCode: status, message, error: exception.code });
  }
}
