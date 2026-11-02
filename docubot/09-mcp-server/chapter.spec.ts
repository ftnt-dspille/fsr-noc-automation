import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CLAUDE_TURN_DONE, fsGoto, fsOpenFabric, fsShot, getGuiDevice, skipStep, test } from 'docubot';

// Installs fabric-studio from the Git server exactly as the page says, registers it for a fresh folder,
// then drives the real Claude Code TUI. The pod is read from the machine's own registry (~/.fsh).
const REPO = process.env.FSM_REPO ?? 'ssh://git@git.fndn.fortinet.net:2222/dspille/fabric-studio.git';
const POD = process.env.FSM_POD ?? '';           // host of a lab pod you may change; step 6 accepts the restart, so it runs on that pod
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Steps 7-11 build a real fabric on the pod (and stop the one running there), so they run only when asked.
// FSM_FABRIC names the fabric to create: the same name twice is a no-op, so use a new one (or delete the old) per run.
// The pod's web login for steps 10-11 comes from DOCUBOT_POD_URL / DOCUBOT_POD_USER / DOCUBOT_POD_PASS.
// Claude Code's own tool-permission prompt: Enter accepts the default (Yes).
const PROCEED = { when: /Do you want to proceed/, send: '\r' };
// The bundled topologies' own subnets are page content, not lab addresses: keep them through IP masking.
const TOPO_IPS = ['10.254.254.0'];
const BUILD = process.env.FSM_BUILD === '1';
// Step 5 restarts this VM, which must exist in the fabric running on the pod (step 5 fails fast if it does not).
const VM = process.env.FSM_VM ?? 'fgt74';
const FABRIC = process.env.FSM_FABRIC ?? 'docs-demo';

// Show the folder the page tells a student to use, and drop the warning that comes from the
// author's own second registration (a student with a single registration never sees it).
const tidy = (screen: string) =>
  screen.replace(/MCP config diagnostics[\s\S]*?(?=\s*Manage MCP servers)/, '');

test('Connect Claude Code to the fabric-studio MCP server', async ({ local, capture, gui, lab }) => {
  test.setTimeout(45 * 60_000);   // a real Claude conversation can take minutes, and the build steps wait for a fabric install
  const root = mkdtempSync(join(homedir(), '.docubot-fsmcp-'));
  const tools = join(root, 'tools');
  const work = join(root, 'demo');
  mkdirSync(work);
  const env = { UV_TOOL_DIR: tools, UV_TOOL_BIN_DIR: join(tools, 'bin') };
  execFileSync('uv', ['tool', 'install', `fabric-studio[mcp] @ git+${REPO}`], { env: { ...process.env, ...env }, stdio: 'pipe' });
  const path = `${join(tools, 'bin')}:${process.env.PATH}`;
  // A registry of one pod under a neutral name, so the shots show a student's view and not the author's pods.
  const registry = join(root, 'instances.json');
  writeFileSync(registry, JSON.stringify({ instances: { [POD]: { name: 'mypod', user: 'admin', tags: [], added_at: '2026-01-01T00:00:00+0000' } } }));
  const shellEnv = { PATH: path, FSH_INSTANCES_FILE: registry };
  const swap: Array<[string | RegExp, string]> = [
    [work, '~/fabric-studio-demo'], [/~\/\.docubot-fsmcp-[A-Za-z0-9]+\/demo/g, '~/fabric-studio-demo'],
    [homedir(), '~'], [POD, 'fabric-studio.example.com'],
  ];
  const title = 'student@laptop: ~/fabric-studio-demo';

  try {
    await test.step('fsm09-01-register', async () => {
      const sh = await local('laptop', { cwd: work, env: shellEnv });
      const cmd = 'claude mcp add fabric-studio --scope project -- fabric-studio-mcp';
      sh.send(cmd);
      await sh.waitFor(/File modified:[^\n]*\.mcp\.json/, { where: 'transcript', timeoutMs: 90_000 });
      const said = sh.transcript();
      const out = said.slice(said.indexOf('Added stdio MCP server')).trimEnd().replace(/File modified: .*/, 'File modified: ~/fabric-studio-demo/.mcp.json');
      await capture.terminal('fsm09-01-register', out, { title, command: cmd, replace: swap });
      sh.kill();
    });

    // --strict-mcp-config limits the session to the file step 1 wrote, so the shots show only this server.
    const claude = await local('laptop', {
      file: 'claude',
      args: ['--permission-mode', 'default', '--model', 'sonnet', '--strict-mcp-config', '--mcp-config', '.mcp.json'],
      cwd: work, env: shellEnv, cols: 110, rows: 40,
    });

    await test.step('fsm09-02-trust-folder', async () => {
      // Claude asks whether to trust a folder the first time it opens it.
      await claude.waitFor(/trust this folder/, { timeoutMs: 60_000 });
      await sleep(1500);
      await capture.screen('fsm09-02-trust-folder', claude.screen(), { title, replace: swap, cols: 110 });
      claude.write('\x1b[B'); await sleep(600); claude.write('\r');   // "Yes, I trust this folder"
      await claude.waitFor(/\? for shortcuts/, { timeoutMs: 60_000 });
    });

    await test.step('fsm09-03-check-mcp', async () => {
      claude.type('/mcp'); await sleep(1500); claude.enter();
      await claude.waitFor(/fabric-studio\s+\d+ tools/, { timeoutMs: 60_000 });
      await sleep(1500);
      await capture.screen('fsm09-03-check-mcp', tidy(claude.screen()), { title, replace: swap, cols: 110 });
      claude.write('\x1b'); await sleep(1000);
    });

    await test.step('fsm09-04-ask-pods', async () => {
      claude.type('List my managed Fabric Studio instances.'); await sleep(2000); claude.enter();
      await claude.waitFor(/Do you want to proceed/, { timeoutMs: 90_000 });
      await sleep(1000); claude.write('\r');
      await claude.waitFor(CLAUDE_TURN_DONE, { timeoutMs: 180_000 });
      await sleep(1500);
      await capture.screen('fsm09-04-ask-pods', claude.screen(), { title, replace: swap, cols: 110 });
    });

    await test.step('fsm09-05-approve-change', async () => {
      if (!POD) throw new Error('set FSM_POD to the host of a pod you may change');
      claude.type(`Restart the ${VM} VM on mypod. Call vm_lifecycle with confirm=true straight away.`);
      await sleep(2000); claude.enter();
      // Claude's own "Do you want to proceed?" prompts (it can raise several: load the tool, then call it) are
      // answered as they appear; the server's approval question is the one to capture.
      await claude.waitFor(/requests your input/, { timeoutMs: 240_000, answer: [PROCEED] });
      await sleep(1500);
      await capture.screen('fsm09-05-approve-change', claude.screen(), { title, replace: swap, cols: 110 });
    });

    await test.step('fsm09-06-approved', async () => {
      claude.write(' '); await sleep(800);       // tick Approve
      claude.write('\x1b[B'); await sleep(600);  // move to Accept
      claude.write('\r');
      // The restart takes about a minute: power off, power on, wait for ready.
      // Wait for Claude's own report (the step 4 end-of-turn line is still on screen, so it cannot be the cue).
      await claude.waitFor(/restarted|powered on and ready/i, { timeoutMs: 240_000 });
      await sleep(10_000);                       // let the closing end-of-turn line settle
      await capture.screen('fsm09-06-approved', claude.screen(), { title, replace: swap, cols: 110 });
    });

    // Wait for Claude to finish a turn, pressing Enter on its own tool-permission prompts. Returns 'form' when the
    // server's approval question is up (the caller decides what to do), else 'idle'.
    const settle = async (minMs: number, maxMs: number): Promise<'form' | 'idle'> => {
      const t0 = Date.now();
      let quiet = 0;
      while (Date.now() - t0 < maxMs) {
        await sleep(8000);
        const t = claude.plainScreen();
        if (/requests your input/.test(t)) return 'form';
        if (/Do you want to proceed/.test(t)) { claude.write('\r'); quiet = 0; continue; }
        if (/\? for shortcuts/.test(t) && !/esc to interrupt/.test(t) && Date.now() - t0 > minMs) { if (++quiet >= 2) return 'idle'; } else quiet = 0;
      }
      throw new Error(`Claude did not settle within ${maxMs} ms`);
    };

    await test.step('fsm09-07-build-plan', async () => {
      if (!BUILD) return skipStep('fsm09-07-build-plan', 'set FSM_BUILD=1 to build a fabric on the pod');
      claude.type(`Plan a fabric called ${FABRIC} on mypod with a FortiGate, a FortiManager and a FortiAnalyzer, using version 7.6 for all three. Do not build it yet: tell me what it would stop and which firmware each device gets.`);
      await sleep(2000); claude.enter();
      if (await settle(30_000, 420_000) !== 'idle') throw new Error('expected a plan, got the approval form');
      // A plan that failed is not a screenshot to publish: the page promises a plan.
      const planned = claude.plainScreen();
      if (/repository root|did not work|didn't work|failed|error/i.test(planned) || !/fgt_fmg_faz|fgt-fmg-faz|docs-demo/.test(planned)) {
        throw new Error(`Claude did not produce a plan. Screen:\n${planned.split('\n').filter((l) => l.trim()).slice(-25).join('\n')}`);
      }
      await capture.screen('fsm09-07-build-plan', claude.screen(), { title, replace: swap, cols: 110, keepIps: TOPO_IPS });
    });

    await test.step('fsm09-08-build-approve', async () => {
      if (!BUILD) return skipStep('fsm09-08-build-approve', 'set FSM_BUILD=1 to build a fabric on the pod');
      claude.type('Yes, build it.'); await sleep(2000); claude.enter();
      if (await settle(10_000, 420_000) !== 'form') throw new Error('the approval form never appeared');
      await sleep(1500);
      await capture.screen('fsm09-08-build-approve', claude.screen(), { title, replace: swap, cols: 110, keepIps: TOPO_IPS });
      claude.write(' '); await sleep(800); claude.write('\x1b[B'); await sleep(600); claude.write('\r');   // tick Approve, Accept
    });

    await test.step('fsm09-09-build-done', async () => {
      if (!BUILD) return skipStep('fsm09-09-build-done', 'set FSM_BUILD=1 to build a fabric on the pod');
      await settle(10_000, 300_000);
      // The build runs detached: wait for its run to record an exit code, then ask whether the fabric is up.
      const runs = join(root, 'mcp-runs');
      const deadline = Date.now() + 25 * 60_000;
      const finished = () => existsSync(runs) && readdirSync(runs).some((f) => f.endsWith('.rc'));
      const screenTail = () => claude.plainScreen().split('\n').filter((l) => l.trim()).slice(-25).join('\n');
      const started = Date.now();
      while (!finished()) {
        // An approved build records its run within seconds; none after 3 minutes means it never started.
        if (Date.now() - started > 180_000 && !(existsSync(runs) && readdirSync(runs).length)) {
          throw new Error(`no build run was recorded in ${runs} after the approval. Last screen:\n${screenTail()}`);
        }
        if (Date.now() > deadline) throw new Error('the build did not finish within 25 minutes');
        await sleep(10_000);
      }
      claude.type('Is the fabric up? Check the devices.'); await sleep(2000); claude.enter();
      await settle(15_000, 420_000);
      await capture.screen('fsm09-09-build-done', claude.screen(), { title, replace: swap, cols: 110, keepIps: TOPO_IPS });
    });

    // The same build as Fabric Studio records it: the Events page and the fabric's topology.
    await test.step('fsm09-10-fs-events', async () => {
      if (!BUILD) return skipStep('fsm09-10-fs-events', 'set FSM_BUILD=1 to build a fabric on the pod');
      const page = await gui('pod');
      await page.setViewportSize({ width: 1280, height: 640 });
      await fsGoto(page, getGuiDevice(lab, 'pod').url, 'eventsAll');
      await capture.shot(page, 'fsm09-10-fs-events', fsShot(page));
    });

    await test.step('fsm09-11-fs-topology', async () => {
      if (!BUILD) return skipStep('fsm09-11-fs-topology', 'set FSM_BUILD=1 to build a fabric on the pod');
      const page = await gui('pod');
      await page.setViewportSize({ width: 1280, height: 760 });
      await fsOpenFabric(page, getGuiDevice(lab, 'pod').url, FABRIC);
      await capture.shot(page, 'fsm09-11-fs-topology', fsShot(page));
    });
    claude.kill();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
