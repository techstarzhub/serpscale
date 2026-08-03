import { Module } from "@nestjs/common";
import { ReplicateService } from "./replicate.service";
import { ImagesService } from "./images.service";
import { MediaController } from "./media.controller";

// AI image generation (Replicate) + public media streaming from R2.
@Module({
  controllers: [MediaController],
  providers: [ReplicateService, ImagesService],
  exports: [ImagesService],
})
export class ImagesModule {}
