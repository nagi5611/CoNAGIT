// src/index.ts
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? "3000");
const app = createApp();
app.listen(port, () => {
  console.log(`listening on http://127.0.0.1:${port}`);
});
