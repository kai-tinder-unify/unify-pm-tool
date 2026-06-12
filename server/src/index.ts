import 'dotenv/config';
import { createApp } from './app';
import { startScheduler } from './services/scheduler';

const port = Number(process.env.PORT || 4000);

const app = createApp();

app.listen(port, () => {
  console.log(`Ascend Hub API listening on http://localhost:${port}`);
  startScheduler();
});
