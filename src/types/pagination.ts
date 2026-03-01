export interface PaginationInput {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export function normalizePagination(input: PaginationInput): Required<PaginationInput> {
  const page = Number(input.page ?? 1);
  const limit = Number(input.limit ?? 20);
  return {
    page: Number.isNaN(page) || page < 1 ? 1 : page,
    limit: Number.isNaN(limit) || limit < 1 ? 20 : Math.min(limit, 200)
  };
}
