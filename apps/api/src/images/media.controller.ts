import { Controller, Get, Param, Res, NotFoundException } from "@nestjs/common";
import type { Response } from "express";
import { StorageService } from "../storage/storage.service";
import { ImagesService } from "./images.service";

// Public, unauthenticated streaming of blog images out of R2. Only the
// blog-images folder is reachable (keys are built server-side, never from raw
// user input), so nothing else in the bucket is exposed. Images are meant to be
// public — they end up in published blog posts.
@Controller("media")
export class MediaController {
  constructor(
    private readonly storage: StorageService,
    private readonly images: ImagesService,
  ) {}

  @Get("blog-images/:projectId/:file")
  async blogImage(
    @Param("projectId") projectId: string,
    @Param("file") file: string,
    @Res() res: Response,
  ) {
    // Guard the filename so a crafted param can't escape the folder.
    if (!/^[a-f0-9]{1,64}\.(webp|png|jpe?g|avif)$/i.test(file) || !/^[a-z0-9-]{1,64}$/i.test(projectId)) {
      throw new NotFoundException();
    }
    const obj = await this.storage.getObject(this.images.keyFor(projectId, file));
    if (!obj) throw new NotFoundException();
    res.setHeader("Content-Type", obj.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(obj.body);
  }
}
