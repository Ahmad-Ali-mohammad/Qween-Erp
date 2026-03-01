import { Errors } from '../../src/utils/response';

describe('Errors helper', () => {
  it('should build validation error', () => {
    const e = Errors.validation('bad input');
    expect(e.message).toBe('bad input');
    expect(e.status).toBe(422);
  });
});
