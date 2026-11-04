import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, watch } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { TuiSession, fortiagentStage, skipStep, test, waitForFortiagentIdle } from 'docubot';
import type { AgentDevice } from 'docubot';

// FortiAgent's terminal chat (`fortiagent chat`) in a pseudo-terminal, for what a one-shot `chat -m` cannot do:
// answer the approval sheet for a tool that changes a pod. How the TUI is launched, when a turn is over and how an
// approval is answered lives in docubot's fortiagentAdapter (src/devices/agent.ts), the same seam Claude Code,
// Codex and opencode use. It assumes the Fabric Studio server is already added to FortiAgent (fortiagent.spec.ts
// does that) and a pod saved with `fabric-studio-mcp setup`.
//
// FSM_PROBE=0 FSM_BUILD=1 builds FSM_TOPOLOGY on FSM_POD; by default it plans only and approves nothing. Use a
// scratch fabric on a pod nobody is using: applying it stops the fabric running there.
// Every wait is on something on screen; there are no fixed sleeps.
const POD = process.env.FSM_POD ?? '';
const POD_NAME = process.env.FSM_POD_NAME ?? 'mypod';   // the name the pod was saved under with `fabric-studio-mcp setup`
const TOPOLOGY = process.env.FSM_TOPOLOGY ?? 'fgt_single';   // a bundled topology: build only builds ones that exist
const FORM = /ctrl\+s save/;                                  // the footer of the server's approval form
// The form is declined unless FSM_FORM=accept, so a probe of the second stage builds nothing.
const ACCEPT_FORM = process.env.FSM_FORM === 'accept';
const PROBE = process.env.FSM_PROBE !== '0';
const BUILD = process.env.FSM_BUILD === '1';
const TURN_TIMEOUT_MS = 8 * 60_000;
const ROWS = Number(process.env.FSM_ROWS ?? 90);   // the approval form's field sits below the plan: it needs about 60+ rows
// The bundled topology's own subnets are page content, not lab addresses: keep them through IP masking.
const TOPO_IPS = ['10.254.254.0'];

const log = (message: string): void => console.log(`[fortiagent-tui ${new Date().toISOString().slice(11, 19)}] ${message}`);

// The build runs detached and records each run under ~/.fsh/mcp-runs; its <run>.rc file appears when it exits.
const RUNS = join(homedir(), '.fsh', 'mcp-runs');
const exitFiles = (): Set<string> => new Set(existsSync(RUNS) ? readdirSync(RUNS).filter((f) => f.endsWith('.rc')) : []);

/**
 * Wait for a build run that was not there before to record its exit code, and return that code. Waits on the
 * directory (fs.watch), not a timer, and logs each new file; the only clock is the overall deadline.
 */
function waitForNewRun(before: Set<string>, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const fresh = (): string | undefined => [...exitFiles()].find((f) => !before.has(f));
    const done = (file: string): void => { watcher.close(); clearTimeout(deadline); resolve(readFileSync(join(RUNS, file), 'utf8').trim()); };
    const watcher = watch(RUNS, (event, name) => {
      log(`mcp-runs: ${event} ${name ?? ''}`);
      const file = fresh();
      if (file) done(file);
    });
    const deadline = setTimeout(() => { watcher.close(); reject(new Error(`no build run recorded an exit code within ${timeoutMs}ms`)); }, timeoutMs);
    const already = fresh();   // finished between the approval and this watch
    if (already) done(already);
  });
}

/** The last `n` lines of a screen that carry text. */
const tail = (screen: string, n = 14): string => screen.split('\n').filter((l) => l.trim()).slice(-n).join('\n');

test('Approve a change in the FortiAgent terminal chat', async ({ capture }) => {
  test.setTimeout(30 * 60_000);
  if (!POD) throw new Error('set FSM_POD: the pod the change is made on (a scratch fabric, never a pod in use)');
  const work = mkdtempSync(join(homedir(), '.docubot-fsagent-tui-'));
  const folder = join(work, 'demo');
  mkdirSync(folder);
  const swap: Array<[string | RegExp, string]> = [
    [folder, '~/fabric-studio-demo'], [homedir(), '~'], [POD, 'fabric-studio.example.com'],
  ];
  const title = 'student@laptop: ~/fabric-studio-demo';
  // An empty folder: FortiAgent's own file and shell tools run where the chat starts, and the eval saw it read and
  // edit its working folder, so the page tells a reader to start from a folder they do not mind it touching.
  const device: AgentDevice = { type: 'agent', tool: 'fortiagent', cwd: folder };
  const fa = await TuiSession.start('fortiagent', device, { cols: 110, rows: ROWS });

  // Log every change of the screen as it happens, so a stall is visible while it runs.
  let seen = '';
  const watcher = setInterval(() => {
    const now = fa.plainScreen();
    if (now !== seen) { log(`screen:\n${tail(now)}`); seen = now; }
  }, 2000);
  try {
    await test.step('fsm09-30-fortiagent-tui-open', async () => {
      // From the logo down: the header above it carries the operator's own notification counts.
      const shot = fa.region({ start: /____ ____/, end: /Write a message|Type \/ to use a skill/ });
      await capture.screen('fsm09-30-fortiagent-tui-open', shot, { title, replace: swap, cols: 110 });
    });

    await test.step('fsm09-31-fortiagent-tui-plan', async () => {
      const plan = `Plan the ${TOPOLOGY} topology on ${POD_NAME}. Do not build it yet. In a few short lines: what would it create, and what would it stop?`;
      log(`asked: ${plan.slice(0, 80)}`);
      // A plan only reads, so no approval sheet should show; if the assistant asks to write a file anyway, deny it.
      const screen = await fa.turn(plan, { timeoutMs: TURN_TIMEOUT_MS, decision: 'decline' });
      // The page promises a plan that names what it would stop; a screen without that is not one to publish.
      if (!/\bstop/i.test(fa.plainScreen()) || !/fgt/i.test(fa.plainScreen())) throw new Error(`no plan on screen:\n${tail(fa.plainScreen(), 25)}`);
      const shot = fa.region({ start: /^[┃│|\s]*Plan the \S+ topology/, end: /Worked for/ });
      await capture.screen('fsm09-31-fortiagent-tui-plan', shot, { title, replace: swap, cols: 110, keepIps: TOPO_IPS });
    });

    await test.step('fsm09-32-fortiagent-tui-approve', async () => {
      if (PROBE || !BUILD) return skipStep('fsm09-32-fortiagent-tui-approve', 'set FSM_PROBE=0 and FSM_BUILD=1 to build on the pod');
      log('asked: Yes, build it.');
      // The turn stops at the first approval: FortiAgent's own sheet, or (when its review lets the call through,
      // "Auto-approved by FortiAI review") straight at the server's form.
      const first = await fa.turn('Yes, build it.', { timeoutMs: TURN_TIMEOUT_MS });
      if (fortiagentStage(fa.plainScreen()) === 'sheet') {
        // Approve only the sheet for the Fabric Studio build. Any other (a file write, a shell command) is denied.
        if (!/fabric.studio|\bbuild\b/i.test(fa.plainScreen())) {
          const other = tail(fa.plainScreen(), 20);
          await fa.answer('decline');
          throw new Error(`an approval sheet for something other than the build was denied:\n${other}`);
        }
        await capture.screen('fsm09-32-fortiagent-tui-approve', first, { title, replace: swap, cols: 110 });
        await fa.answer('approve');   // "Allow once"
        await fa.waitFor(FORM, { timeoutMs: 120_000 });
      }
      // The server's own question. Only the bottom of a long plan fits: ctrl+f gives the sheet the whole window.
      log(`form on screen:\n${tail(fa.plainScreen(), 25)}`);
      fa.write('\x06');
      await fa.waitFor(/Run it now|approve/i, { timeoutMs: 20_000 }).catch((e) => log(`field not found after ctrl+f: ${String(e).slice(0, 300)}`));
      log(`form expanded:\n${tail(fa.plainScreen(), 38)}`);
      await test.step('fsm09-33-fortiagent-tui-form', async () => {
        const shot = fa.region({ start: /MCP review/, end: /ctrl\+f (expand|collapse)/ });
        await capture.screen('fsm09-33-fortiagent-tui-form', shot, { title, replace: swap, cols: 110, keepIps: TOPO_IPS });
      });
      // The field has focus when the form opens ("‹ No ›"); Tab would move off it, so nothing is pressed here.
      fa.write('\x06');   // back to the normal size
      if (!ACCEPT_FORM && process.env.FSM_FORM !== 'explore') {
        await fa.answer('decline');   // Ctrl+D declines the form; nothing is built
        await waitForFortiagentIdle(fa.term, TURN_TIMEOUT_MS);
        return;
      }
      if (process.env.FSM_FORM === 'explore') {
        // Learn which key switches the field: try each, log the field's lines after it, end by declining.
        const field = (): string => fa.plainScreen().split('\n').filter((l) => /Approve {2,}|Accept {2,}/.test(l)).map((l) => l.replace(/[┃\s]+/g, ' ').trim()).join(' | ');
        for (const [name, key] of [['right', '\x1b[C'], ['left', '\x1b[D'], ['down', '\x1b[B'], ['up', '\x1b[A'], ['space', ' '], ['enter', '\r'], ['y', 'y']] as const) {
          const before = field();
          fa.write(key);
          const until = Date.now() + 3_000;
          while (field() === before && Date.now() < until) await new Promise((r) => setImmediate(r));   // the screen changing is the signal
          log(`after ${name}: ${field()}   [${/ctrl\+d decline/.test(fa.plainScreen()) ? 'form' : 'not a form'}]`);
        }
        await fa.answer('decline');
        await waitForFortiagentIdle(fa.term, TURN_TIMEOUT_MS);
        return;
      }
      // Accept: the field is switched to Yes and read back before Ctrl+S saves it. The build runs for minutes.
      const before = exitFiles();
      await fa.answer('approve');
      await waitForFortiagentIdle(fa.term, TURN_TIMEOUT_MS);
      // The turn ends when the build starts; the install itself takes minutes. Wait for the run to exit.
      log('build started; waiting for its run to record an exit code');
      const exit = await waitForNewRun(before, 25 * 60_000);
      if (exit !== '0') throw new Error(`the build run exited with ${exit}, not 0`);
      log('build run exited 0');
      await test.step('fsm09-34-fortiagent-tui-built', async () => {
        const up = await fa.turn('Is the fabric I just built up? Answer in a few short lines about its device only.', { timeoutMs: TURN_TIMEOUT_MS, decision: 'decline' });
        const shot = fa.region({ start: /^[┃│|\s]*Is the fabric I just built up/, end: /Worked for/ });
        await capture.screen('fsm09-34-fortiagent-tui-built', shot, { title, replace: swap, cols: 110, keepIps: TOPO_IPS });
        void up;
      });
    });
  } finally {
    clearInterval(watcher);
    fa.kill();
    rmSync(work, { recursive: true, force: true });
  }
});
