import { DeletionMetadata } from "../value-objects/deletion-metadata.js";
import { Trashable } from "./trashable.js";

export class Album implements Trashable {
  constructor(
    public readonly userId: string,
    public readonly albumId: string,
    public title: string,
    public description: string,
    public deletion: DeletionMetadata = DeletionMetadata.createActive(),
  ) {}

  softDelete(): void {
    if (this.deletion.isDeleted) return;
    this.deletion = DeletionMetadata.createForSoftDelete();
  }

  restore(): void {
    if (!this.deletion.isDeleted) return;
    this.deletion = DeletionMetadata.createActive();
  }
}
