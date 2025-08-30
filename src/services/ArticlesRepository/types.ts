import { Option } from "effect";
import type { BaseEntity } from "../../domain/logical/Common.js";

export type ListResult = {
  results: ReadonlyArray<BaseEntity>;
  hasMore: boolean;
  nextCursor?: string;
};
