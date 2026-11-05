import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { answerFortiagentApproval, assertPodAllowed, defaultRunsDir, fortiagentStage, fortiagentTurn, guardedTurn, RealTerminal, skipStep, test, waitForBuildRun, waitForFortiagentIdle, watchFortiagentGate, withFortiagentRule } from 'docubot';
import type { FortiagentCallExpect } from 'docubot';

// FortiAgent's terminal chat (`fortiagent chat`) in a REAL terminal (ttyd + xterm.js), for what a one-shot `chat -m` cannot do:
// answer the approval sheet for a tool that changes a pod. When a turn is over and how an approval is answered lives in
// docubot (fortiagentTurn / answerFortiagentApproval in src/agents/tui.ts); every picture is a real screenshot
// (capture.agent), never a re-rendered or edited frame. The sheet is photographed with all of its rows: the page tells the
// reader to use only Allow once or Deny, and the run itself only ever declines (Esc) or, with FS_MCP_ACCEPT, allows once. It assumes the Fabric Studio server is already added to FortiAgent (fortiagent.spec.ts
// does that) and a pod saved with `fabric-studio-mcp setup`.
//
// FS_MCP_PROBE=0 FS_MCP_BUILD=1 builds FS_MCP_TOPOLOGY on FS_MCP_POD; by default it plans only and approves nothing. Use a
// scratch fabric on a pod nobody is using: applying it stops the fabric running there.
// Every wait is on something on screen; there are no fixed sleeps.
const POD = process.env.FS_MCP_POD ?? '';
const POD_NAME = process.env.FS_MCP_POD_NAME ?? 'mypod';   // the name the pod was saved under with `fabric-studio-mcp setup`
// A bundled topology whose fabric is NOT on the pod (fgt_fmg_faz makes fgt-fmg-faz), so the plan says what it would create and
// stop, not "no-op". A fabric that already exists (fgt_single -> fgt-single) makes the plan read "nothing to build" before "Yes, build it".
const TOPOLOGY = process.env.FS_MCP_TOPOLOGY ?? 'fgt_fmg_faz';
// The sheet is denied unless FS_MCP_ACCEPT=1, so a run that only captures it builds nothing.
const ACCEPT_BUILD = process.env.FS_MCP_ACCEPT === '1';
const PROBE = process.env.FS_MCP_PROBE !== '0';
const BUILD = process.env.FS_MCP_BUILD === '1';
const TURN_TIMEOUT_MS = 8 * 60_000;
const ROWS = Number(process.env.FS_MCP_ROWS ?? 50);

// The Fabric Studio server's changing tools are set to Ask for the run AND FortiAI review ("Auto mode", the account setting
// permissions.autoMode) is switched off for it (withFortiagentRule: the operator's own rule and review setting are saved
// first and put back in a finally, and the run refuses to start if either cannot be read back as set). A rule of `prompt`
// alone is not a gate: with Auto mode on, FortiAI's reviewer answers the prompt and a real build ran with no sheet.
// Step 32 also watches the turn (watchFortiagentGate) and fails the run, killing the turn, the moment anything but the person answers.
const SERVER = 'fabric-studio';
// The one call the build step means. The host is left out on purpose: the model writes the pod as a name or an address,
// and the decisions log records whichever it wrote. The action and the topology identify the call.
const BUILD_EXPECT: FortiagentCallExpect = { server: SERVER, tool: 'build', args: { action: 'apply', topology: TOPOLOGY } };

const log = (message: string): void => console.log(`[fortiagent-tui ${new Date().toISOString().slice(11, 19)}] ${message}`);

// The build runs detached and records each run under ~/.fsh/mcp-runs; its <run>.rc file appears when it exits.
const RUNS = defaultRunsDir();

/** The last `n` lines of a screen that carry text. */
const tail = (screen: string, n = 14): string => screen.split('\n').filter((l) => l.trim()).slice(-n).join('\n');

const FORTIAGENT_BIN = process.env.FORTIAGENT_BIN || '/Applications/FortiAgent.app/Contents/Resources/bin/fortiagent';
const READY = /Write a message|Type \/ to use a skill/;

test('Approve a change in the FortiAgent terminal chat', async ({ page, capture }) => {
  assertPodAllowed(POD);   // named for this run, not locked, not on the deny list
  test.setTimeout(30 * 60_000);
  if (!POD) throw new Error('set FS_MCP_POD: the pod the change is made on (a scratch fabric, never a pod in use)');
  const work = mkdtempSync(join(homedir(), '.docubot-fsagent-tui-'));
  const folder = join(work, 'demo');
  mkdirSync(folder);
  // Boxed in every picture: the working folder (under the operator's home) and the pod's real host and saved name.
  const HIDE = [folder, work, homedir(), POD, ...(POD_NAME === 'mypod' ? [] : [POD_NAME])];
  // An empty folder: FortiAgent's own file and shell tools run where the chat starts, and the eval saw it read and
  // edit its working folder, so the page tells a reader to start from a folder they do not mind it touching.
  try {
    await withFortiagentRule(SERVER, 'prompt', async (proof) => {
      const real = await RealTerminal.start(page, { file: FORTIAGENT_BIN, args: ['chat'], cwd: folder, cols: 110, rows: ROWS, env: { ...(process.env as Record<string, string>), TERM: 'xterm-256color', COLORTERM: 'truecolor' }, envKeys: [/^FORTIAGENT_/] });
      await real.readyWith({ pattern: READY });
      const fa = {
        term: real.term,
        plainScreen: (): string => real.term.plainScreen(),
        turn: (prompt: string, o: Parameters<typeof fortiagentTurn>[2] = {}): Promise<string> => fortiagentTurn(real.term, prompt, o),
        answer: (d: 'approve' | 'decline', e?: FortiagentCallExpect) => answerFortiagentApproval(real.term, d, e),
        kill: (): void => real.kill(),
      };

      // Log every change of the screen as it happens, so a stall is visible while it runs.
      let seen = '';
      const watcher = setInterval(() => {
        const now = fa.plainScreen();
        if (now !== seen) { log(`screen:\n${tail(now)}`); seen = now; }
      }, 2000);
      try {
        await test.step('fsm09-30-fortiagent-tui-open', async () => {
          // From the logo down: the header above it carries the operator's own notification counts.
          // From the logo down: the header above it carries the operator's own notification counts.
          await capture.agent('fsm09-30-fortiagent-tui-open', real, { terms: HIDE, startAt: /____ ____/, endAt: READY });
        });

        await test.step('fsm09-31-fortiagent-tui-plan', async () => {
          const plan = `I want a fabric on ${POD_NAME} with a FortiGate, a FortiManager and a FortiAnalyzer. Do not build it yet. In a few short lines: what would it create, and what would it stop?`;
          log(`asked: ${plan.slice(0, 80)}`);
          // A plan only reads, so no approval sheet should show; if the assistant asks to write a file anyway, deny it.
          await fa.turn(plan, { timeoutMs: TURN_TIMEOUT_MS, decision: 'decline' });
          // The page promises a plan that names what it would stop; a screen without that is not one to publish.
          if (!/\bstop/i.test(fa.plainScreen()) || !/fgt/i.test(fa.plainScreen())) throw new Error(`no plan on screen:\n${tail(fa.plainScreen(), 25)}`);
          // A plan for a fabric that already exists on the pod says it is a no-op, and the next step then builds it: refuse that picture.
          if (/no-?op|nothing to (build|do|change)|already (exists|running|built)/i.test(fa.plainScreen().split(plan.slice(0, 30))[1] ?? '')) throw new Error(`the plan is a no-op: ${TOPOLOGY} is already on the pod; pick a topology that is not (FS_MCP_TOPOLOGY):\n${tail(fa.plainScreen(), 25)}`);
          await capture.agent('fsm09-31-fortiagent-tui-plan', real, { terms: HIDE, startAt: /I want a fabric on \S+ with a FortiGate/, endAt: /Worked for/ });
        });

        await test.step('fsm09-32-fortiagent-tui-approve', async () => {
          if (PROBE || !BUILD) return skipStep('fsm09-32-fortiagent-tui-approve', 'set FS_MCP_PROBE=0 and FS_MCP_BUILD=1 to build on the pod');
          log('asked: Yes, build it.');
          // Fail closed. Re-prove the gate now (review off, rule still prompt), then watch the turn: an answer with no sheet
          // (FortiAI review, a grant, a rule), "Auto-approved" on screen, or a build run starting with no sheet kills the turn
          // and fails the run. The watch stays on until the sheet has been answered and the turn is over.
          await proof.assertManual();
          const watch = watchFortiagentGate({
            server: SERVER, tool: 'build', args: BUILD_EXPECT.args, since: Date.now() - 2000, screen: () => fa.plainScreen(), write: (k) => fa.term.write(k), kill: () => fa.kill(),
            expectNoRun: !ACCEPT_BUILD, log,
          });
          try {
            // The server asks nothing itself: the approval is FortiAgent's own sheet for the changing tool. The turn stops there.
            await guardedTurn(fa.turn('Yes, build it.', { timeoutMs: TURN_TIMEOUT_MS }), watch, false);
            if (fortiagentStage(fa.plainScreen()) !== 'sheet') throw new Error(`no approval sheet for the build:\n${tail(fa.plainScreen(), 25)}`);
            // Approve only the sheet for the Fabric Studio build. Any other (a file write, a shell command) is denied.
            if (!/fabric.studio|\bbuild\b/i.test(fa.plainScreen())) {
              const other = tail(fa.plainScreen(), 20);
              await fa.answer('decline');
              throw new Error(`an approval sheet for something other than the build was denied:\n${other}`);
            }
            await watch.check();
            // The real sheet, every row as FortiAgent draws it (Allow once, Allow for this thread, the two Always rows, Deny).
            // Nothing is blanked; the run never presses an Always row: decline is Esc, approve is Enter on the highlighted Allow once.
            await capture.agent('fsm09-32-fortiagent-tui-approve', real, { terms: HIDE, startAt: /Fabric Studio|build/i, endAt: /enter confirm/, volatile: /\b\d+s\b/g });
            if (!ACCEPT_BUILD) {
              // Decline, and the decisions log must show that exact call declined by the person (approval.denied with a sheet's requestID),
              // not a review verdict. Nothing is built: the watch fails the run if a build run appears.
              await fa.answer('decline', BUILD_EXPECT);
              await guardedTurn(waitForFortiagentIdle(fa.term, TURN_TIMEOUT_MS), watch, false);
              await watch.check();
              log('declined at the sheet; nothing was built');
              return;
            }
            // Allow once: the build runs for minutes, detached. The log must show the same call approved before it runs.
            const before = waitForBuildRun.snapshot(RUNS);
            await fa.answer('approve', BUILD_EXPECT);
            await guardedTurn(waitForFortiagentIdle(fa.term, TURN_TIMEOUT_MS), watch, false);
            log('build started; waiting for its run to record an exit code');
            const exit = await waitForBuildRun(RUNS, { before, timeoutMs: 25 * 60_000, onEvent: log });
            if (exit !== '0') throw new Error(`the build run exited with ${exit}, not 0`);
            log('build run exited 0');
          } finally { watch.stop(); }
          await test.step('fsm09-34-fortiagent-tui-built', async () => {
            await fa.turn('Is the fabric I just built up?', { timeoutMs: TURN_TIMEOUT_MS, decision: 'decline' });
            await capture.agent('fsm09-34-fortiagent-tui-built', real, { terms: HIDE, startAt: /Is the fabric I just built up/, endAt: /Worked for/ });
          });
        });
      } finally {
        clearInterval(watcher);
        fa.kill();
      }
    }, { log: (m: string) => log(m) });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
