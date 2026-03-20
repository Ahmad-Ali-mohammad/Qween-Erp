import type { RequestHandler } from 'express';

export function forwardSubtree(prefix: string, target: RequestHandler): RequestHandler {
  return (req, res, next) => {
    const originalUrl = req.url;
    req.url = `${prefix}${originalUrl === '/' ? '' : originalUrl}`;
    target(req, res, (error?: unknown) => {
      req.url = originalUrl;
      next(error as any);
    });
  };
}
