import { Body, Controller, Get, Ip, Post, Headers } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CaptchaService } from "./captcha.service";
import { PublicFormsService } from "./public-forms.service";
import { ContactDto, SubscribeDto } from "./dto/public-forms.dto";

/**
 * Unauthenticated endpoints for the marketing website's contact + newsletter
 * forms. Protected by a self-contained captcha + honeypot and tight rate limits.
 */
@Controller("public")
export class PublicFormsController {
  constructor(
    private readonly forms: PublicFormsService,
    private readonly captcha: CaptchaService,
  ) {}

  /** Issue a fresh captcha challenge for a form. */
  @Get("captcha")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  captchaChallenge() {
    return this.captcha.issue();
  }

  @Post("contact")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  contact(@Body() dto: ContactDto, @Ip() ip: string, @Headers("user-agent") ua?: string) {
    return this.forms.contact(dto, ip, ua);
  }

  @Post("subscribe")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  subscribe(@Body() dto: SubscribeDto, @Ip() ip: string) {
    return this.forms.subscribe(dto, ip);
  }
}
