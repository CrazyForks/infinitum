import "@testing-library/jest-dom/vitest";

process.env.DATABASE_URL = `file:${process.cwd()}/prisma/test.db`;
