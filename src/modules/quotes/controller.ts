import { Request, Response } from 'express';
import { ok, fail } from '../../utils/response';
import { CreateQuoteDto, UpdateQuoteDto, QuoteQueryDto, UpdateQuoteStatusDto } from './dto';
import * as quoteService from './service';

export async function createQuote(req: any, res: Response) {
  try {
    const quote = await quoteService.createQuote(req.body as any, Number(req.user.id));
    ok(res, quote);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function updateQuote(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const quote = await quoteService.updateQuote(Number(id), req.body as any);
    ok(res, quote);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function listQuotes(req: Request, res: Response) {
  try {
    const result = await quoteService.listQuotes(req.query as any);
    ok(res, result);
  } catch (error) {
    fail(res, 'INTERNAL_SERVER_ERROR', (error as Error).message);
  }
}

export async function getQuote(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const quote = await quoteService.getQuote(Number(id));
    ok(res, quote);
  } catch (error) {
    fail(res, 'NOT_FOUND', (error as Error).message);
  }
}

export async function sendQuote(req: any, res: Response) {
  try {
    const { id } = req.params;
    const quote = await quoteService.sendQuote(Number(id), Number(req.user.id));
    ok(res, quote);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function convertToInvoice(req: any, res: Response) {
  try {
    const { id } = req.params;
    const result = await quoteService.convertToInvoice(Number(id), Number(req.user.id));
    ok(res, result);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function updateQuoteStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status } = req.body as any;
    const quote = await quoteService.updateQuoteStatus(Number(id), status);
    ok(res, quote);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function deleteQuote(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await quoteService.deleteQuote(Number(id));
    ok(res, result);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}
