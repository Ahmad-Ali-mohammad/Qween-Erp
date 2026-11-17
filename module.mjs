// @ts-check
import { module } from "@prisma/composer";
import { envSecret } from "@prisma/composer-prisma-cloud";
import { postgres, dataContract } from "@prisma/composer-prisma-cloud/orm";
import erpQweenContractJson from "./src/prisma/contract.json" with { type: "json" };
import erpQweenService from "./src/service.mts";

export default module("qween-erp", ({ provision }) => {
  const database = provision(
    postgres({ name: "database", contract: dataContract(erpQweenContractJson), config: "./prisma.config.ts" }),
  );
  provision(erpQweenService, {
    id: "erpqween",
    deps: { db: database },
    input: { jwtSecret: envSecret("JWT_SECRET") }, // Signs login session tokens.
  });
});
