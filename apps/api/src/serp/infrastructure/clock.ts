import { Injectable } from "@nestjs/common";
import type { IClock } from "../domain/ports";

/** Real clock. Tests inject a fixed clock instead for determinism. */
@Injectable()
export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}
