// The local emulator exposes a scheduled-event testing endpoint but does not
// run cron automatically. Drive it while Vite is alive; never create an OS job.
export function localCleanupPlugin() {
  return {
    name: "mogumatch-local-cleanup",
    apply: "serve",
    configureServer(server) {
      let timer;
      let running = false;
      let stopped = false;
      let failures = 0;
      async function tick() {
        if (stopped || running) return;
        const address = server.httpServer?.address();
        if (!address || typeof address === "string") return;
        const host = address.address.includes(":")
          ? `[${address.address === "::" ? "::1" : address.address}]`
          : (address.address === "0.0.0.0" ? "127.0.0.1" : address.address);
        running = true;
        try {
          const response = await fetch(`http://${host}:${address.port}/cdn-cgi/handler/scheduled`, {
            signal: AbortSignal.timeout(10000), redirect: "error",
          });
          if (!response.ok || (await response.text()).trim() !== "ok") throw new Error();
          if (failures) server.config.logger.info("Room cleanup recovered.");
          failures = 0;
        } catch {
          // No response bodies, room contents or secrets in logs.
          if (failures++ === 0) server.config.logger.warn("Room cleanup failed; retrying in one minute.");
        } finally { running = false; }
      }
      server.httpServer?.once("listening", () => {
        timer = setInterval(() => void tick(), 60000);
        timer.unref();
        void tick();
      });
      server.httpServer?.once("close", () => { stopped = true; clearInterval(timer); });
    },
  };
}
