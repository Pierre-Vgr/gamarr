import { Router } from "express";
import { listHistory } from "../services/history.js";

export const historyRouter = Router();

historyRouter.get("/", (req, res) => {
  const limit = req.query.limit ? Math.min(Number(req.query.limit), 500) : 200;
  res.json(listHistory(limit));
});
