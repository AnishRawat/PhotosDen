import { DeletionMetadata } from "../value-objects/deletion-metadata.js";

export interface Trashable {
  deletion: DeletionMetadata;
  softDelete(): void;
  restore(): void;
}
