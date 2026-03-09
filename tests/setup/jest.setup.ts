import { disconnectDb } from '../../src/config/database';

afterAll(async () => {
  await disconnectDb();
});
