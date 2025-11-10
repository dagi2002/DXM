import express from 'express';
import cors from 'cors';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());

const dataPath = join(__dirname, 'data.json');

const getData = () => JSON.parse(readFileSync(dataPath, 'utf-8'));

app.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/sessions', (_req, res) => {
  const data = getData();
  res.json(data.sessions || []);
});

app.get('/metrics', (_req, res) => {
  const data = getData();
  res.json(data.metrics || []);
});

app.get('/alerts', (_req, res) => {
  const data = getData();
  res.json(data.alerts || []);
});

app.get('/users', (_req, res) => {
  const data = getData();
  res.json(data.users || []);
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});