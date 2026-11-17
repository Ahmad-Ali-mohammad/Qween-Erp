import 'dotenv/config';
import { defineConfig as orm, prisma7Schema } from '@prisma/orm-postgres/config';
import { definePrismaConfig } from 'prisma/config';
import { defineConfig as composer } from '@prisma/composer/config';
import { nodeBuild } from '@prisma/composer/node/control';
import { prismaCloud, prismaState } from '@prisma/composer-prisma-cloud/control';

export default definePrismaConfig({
  orm: orm({
    contract: prisma7Schema('prisma/schema.prisma'),
    output: 'src/prisma',
    db: { connection: process.env['DATABASE_URL']! },
  }),
  composer: composer({
    entry: './module.mjs',
    extensions: [prismaCloud(), nodeBuild()],
    state: prismaState(),
  }),
});
