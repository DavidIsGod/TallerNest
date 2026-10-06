export interface PaginationMeta {
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export function paginate<T>(
  items: T[],
  totalItems: number,
  page: number,
  size: number,
): Paginated<T> {
  return {
    items,
    meta: {
      page,
      size,
      totalItems,
      totalPages: Math.ceil(totalItems / size),
    },
  };
}

export function skipFor(page: number, size: number): number {
  return (page - 1) * size;
}
