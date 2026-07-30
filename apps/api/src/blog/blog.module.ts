import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { BlogController, BlogPublicController } from "./blog.controller";
import { BlogService } from "./blog.service";

@Module({
  imports: [PrismaModule],
  controllers: [BlogController, BlogPublicController],
  providers: [BlogService],
})
export class BlogModule {}
