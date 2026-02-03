import { DeletionMetadata } from "../value-objects/deletion-metadata.js";
import { Trashable } from "./trashable.js";

export interface FileDetails {
  original: string;
  variants: Array<{ resolution: string; s3Key: string }>;
}

export class Photo implements Trashable {
  constructor(
    public readonly userId: string,
    public readonly photoId: string,
    public readonly uploadId: string,
    public albumRefCount: number,
    public fileDetails: FileDetails,
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

  decrementRefCount(): void {
    if (this.albumRefCount > 0) {
      this.albumRefCount--;
    }
  }

  get canBePurgedFromS3(): boolean {
    return this.albumRefCount === 0;
  }
}
