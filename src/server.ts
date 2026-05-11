import { buildApp } from "./app.js";
import { createDependencies } from "./compositionRoot.js";

const deps = createDependencies();
const app = await buildApp(deps);

const close = async () => {
  await app.close();
  await deps.pool.end();
  process.exit(0);
};

process.on("SIGINT", () => {
  void close();
});
process.on("SIGTERM", () => {
  void close();
});

await app.listen({ port: deps.env.PORT, host: "0.0.0.0" });
deps.log.info({ port: deps.env.PORT }, "server.listening");
