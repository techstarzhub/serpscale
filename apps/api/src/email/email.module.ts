import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { EmailService } from "./email.service";

@Global()
@Module({
  imports: [PrismaModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
