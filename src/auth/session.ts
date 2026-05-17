// src/auth/session.ts
import type { RequestHandler } from "express";

/**
 * Auth gate for presign routes. Replace with real session checks when integrated.
 * Set PRESIGN_REQUIRE_AUTH=0 for local PoC only (never in production).
 */
export const requireAuthSession: RequestHandler = (_req, res, next) => {
  if (process.env.PRESIGN_REQUIRE_AUTH === "0") {
    next();
    return;
  }
  res.status(401).json({ error: "unauthorized" });
};
