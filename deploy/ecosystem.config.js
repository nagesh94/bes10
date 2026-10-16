/**
 * PM2 process file for the Next app server.
 *
 *   cd /srv/bhim-crm/current
 *   pm2 start deploy/ecosystem.config.js   # first time only
 *   pm2 save                               # remember it across reboots
 *   pm2 logs bhim-crm
 *
 * Releases go through `deploy/deploy.sh`, which reloads this app rather than
 * starting it again.
 *
 * This replaces `deploy/bhim-crm.service`. Run one or the other, never both:
 * two supervisors starting the same app fight over port 3000 and the loser
 * restart-loops. If systemd was used first, disable it before starting PM2:
 *
 *   sudo systemctl disable --now bhim-crm
 */
const { readFileSync } = require("node:fs");
const path = require("node:path");

// `cwd` below, and the path to .env. __dirname is deploy/, the app is above it.
const APP_DIR = path.join(__dirname, "..");

/**
 * The port, read out of the app's own .env.
 *
 * PM2 does not load .env files; Next does — `next start` reads .env from the
 * working directory at boot, which is why only PORT is lifted out here. It is
 * needed *before* the app starts, to pass `--port`, and reading it from the
 * same file nginx's upstream was configured against keeps the two from
 * drifting apart.
 *
 * Everything else — DATABASE_URL, S3_*, FIELD_ENCRYPTION_KEY — is deliberately
 * left out of this file. `pm2 save` writes the process list, environment
 * included, to ~/.pm2/dump.pm2 in plain text; secrets stay in .env (chmod 600)
 * where only the app reads them.
 */
function port() {
  try {
    const env = readFileSync(path.join(APP_DIR, ".env"), "utf8");
    const match = env.match(/^\s*PORT\s*=\s*["']?(\d+)["']?/m);
    if (match) return match[1];
  } catch {
    // No .env yet — fall through. Next's own env validation will complain far
    // more usefully than this file can.
  }
  return "3000";
}

const PORT = port();

module.exports = {
  apps: [
    {
      name: "bhim-crm",
      cwd: APP_DIR,

      /**
       * Next's binary directly, not `npm start`.
       *
       * With npm in front, PM2 supervises npm and signals reach npm instead of
       * Node: `pm2 restart` then leaves the old Node process orphaned, still
       * holding port 3000, and the new one dies with EADDRINUSE. Pointing at
       * the bin means the process PM2 watches is the server itself.
       */
      script: "node_modules/next/dist/bin/next",
      args: ["start", "--port", PORT],
      interpreter: "node",

      /**
       * Capping the heap means a runaway request gets an out-of-memory error
       * inside Node, which PM2 restarts cleanly, rather than the kernel's OOM
       * killer picking a victim — which on a box this small has a habit of
       * picking the Docker daemon and taking Gotenberg with it.
       */
      node_args: ["--max-old-space-size=2048"],

      /**
       * One process, fork mode.
       *
       * The app keeps nothing in process memory — sessions, locks and rate
       * limiting are all in Postgres — so cluster mode would work, but on a
       * 1–2 vCPU VPS a second worker buys no throughput and doubles RSS.
       *
       * If you do switch to `exec_mode: "cluster"` with `instances: 2`, note
       * that DATABASE_POOL_MAX is *per process*: halve it, or the two pools
       * together exhaust Postgres' connection limit.
       */
      exec_mode: "fork",
      instances: 1,

      // NODE_ENV is the one variable Next must have before it reads .env.
      // PORT is repeated here so `process.env.PORT` agrees with `--port`.
      env: {
        NODE_ENV: "production",
        PORT,
      },

      /**
       * Always come back, but not faster than the box can cope with.
       * `min_uptime` + `max_restarts` mean a release that cannot boot at all
       * ends up stopped and visible in `pm2 status`, instead of looping and
       * pinning the CPU. exp_backoff_restart_delay widens the gap on each
       * successive crash (100 ms, then up to ~15 s).
       */
      autorestart: true,
      exp_backoff_restart_delay: 100,
      min_uptime: "30s",
      max_restarts: 10,

      /**
       * A rooftop photo upload or a PDF conversion can be in flight when a
       * release lands. 10 s of grace before SIGKILL is enough for Gotenberg's
       * 60 s-timeout work to fail cleanly rather than be cut mid-write.
       */
      kill_timeout: 10000,
      listen_timeout: 10000,

      // Restart if RSS exceeds this. Set above the 2 GB heap cap on purpose:
      // the cap should be what stops a runaway request, with this as backstop
      // for a leak outside the JS heap (sharp's buffers, mostly).
      max_memory_restart: "2600M",

      // Never watch files in production: `npm ci` touching node_modules during
      // a release would restart the app mid-build.
      watch: false,

      /**
       * Logs land in ~/.pm2/logs/bhim-crm-{out,error}.log for the user that
       * ran `pm2 start` — the `bhim` user, whose home is /srv/bhim-crm (set by
       * `useradd -d`, not /home), so /srv/bhim-crm/.pm2/logs.
       * `time` prefixes every line with a timestamp, which the systemd journal
       * used to add for free. Rotation is not built in; install it once:
       *
       *   pm2 install pm2-logrotate
       *   pm2 set pm2-logrotate:max_size 20M
       *   pm2 set pm2-logrotate:retain 14
       *   pm2 set pm2-logrotate:compress true
       */
      time: true,
      merge_logs: true,
    },
  ],
};
