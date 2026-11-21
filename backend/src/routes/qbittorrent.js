import { Router } from "express";
import { isConfigured } from "../services/qbittorrent.js";

export const qbittorrentRouter = Router();

qbittorrentRouter.get("/status", (req, res) => {
  res.json({ configured: isConfigured() });
});
