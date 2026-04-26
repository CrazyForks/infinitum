import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

process.env.DATABASE_URL = `file:${process.cwd()}/prisma/test.db`;

Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: vi.fn(),
});
