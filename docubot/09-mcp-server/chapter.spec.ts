import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CLAUDE_TURN_DONE, fsGoto, fsOpenFabric, fsShot, getGuiDevice, skipStep, test } from 'docubot';

// Installs fabric-studio from the zip the Install page offers, exactly as the page says (unzip, then uv tool install), registers it for a fresh folder,
// then drives the real Claude Code TUI. The pod is read from the machine's own registry (~/.fsh).
// The published download: the chapter tests the artifact a reader gets, not a checkout. Override with FSM_ZIP.
const ZIP = process.env.FSM_ZIP ?? join(__dirname, '..', '..', 'static', 'downloads', 'fabric-studio.zip');
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
// Steps 16-17 build a fabric that fails on purpose (FortiManager 8.0.0 does not install on the lab pod) so the
// failed-install page can show Claude finding the cause. They are independent of FSM_BUILD.
const FAIL = process.env.FSM_FAIL === '1';
const FAIL_FABRIC = process.env.FSM_FAIL_FABRIC ?? 'docs-fail';
// The pod login the chapter types into `fabric-studio-mcp setup`, like a student would. The password never
// reaches the screen (getpass does not echo it), and the step fails if it does.
const POD_USER = process.env.DOCUBOT_POD_USER ?? 'admin';
const POD_PASS = process.env.DOCUBOT_POD_PASS ?? '';
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
  const dl = join(root, 'download');
  mkdirSync(dl);
  const path = `${join(tools, 'bin')}:${process.env.PATH}`;
  // `fabric-studio-mcp setup` creates this registry, as it does for a student. Nothing is written by hand.
  const registry = join(root, 'instances.json');
  const shellEnv = { PATH: path, FSH_INSTANCES_FILE: registry };
  const runsDir = join(root, 'mcp-runs');
  const swap: Array<[string | RegExp, string]> = [
    [join(tools, 'bin'), '~/.local/bin'],
    [work, '~/fabric-studio-demo'], [/~\/\.docubot-fsmcp-[A-Za-z0-9]+\/demo/g, '~/fabric-studio-demo'],
    [homedir(), '~'], [POD, 'fabric-studio.example.com'],
  ];
  const title = 'student@laptop: ~/fabric-studio-demo';
  const rcCount = () => (existsSync(runsDir) ? readdirSync(runsDir).filter((f) => f.endsWith('.rc')).length : 0);

  try {
    // The Install page: unzip the download and install from the folder. Real commands, run in a throwaway tool folder.
    await test.step('fsm09-12-install', async () => {
      copyFileSync(ZIP, join(dl, 'fabric-studio.zip'));
      const run = (cmd: string, args: string[]) => {
        const r = spawnSync(cmd, args, { cwd: dl, env: { ...process.env, ...env, PATH: path }, encoding: 'utf8' });
        if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
        return `${r.stdout}${r.stderr}`;
      };
      run('unzip', ['-q', 'fabric-studio.zip']);
      const installed = run('uv', ['tool', 'install', './fabric-studio[mcp]'])
        .split('\n').filter((l) => /^Installed 1 executable/.test(l)).join('\n');   // drop the package-by-package list
      const where = run('which', ['fabric-studio-mcp']).trim();
      const out = ['$ unzip -q fabric-studio.zip', '$ uv tool install "./fabric-studio[mcp]"', installed,
        '$ which fabric-studio-mcp', where].join('\n');
      await capture.terminal('fsm09-12-install', out, { title: 'student@laptop: ~/Downloads', replace: swap });
    });

    // The Connect a Pod page: add the pod with the real command, answering its prompts as a student would.
    await test.step('fsm09-13-setup', async () => {
      if (!POD || !POD_PASS) throw new Error('set FSM_POD and DOCUBOT_POD_PASS: the chapter adds the pod with fabric-studio-mcp setup');
      const s = await local('laptop', { file: 'fabric-studio-mcp', args: ['setup'], cwd: work, env: shellEnv, cols: 100, rows: 16 });
      await s.waitFor(/Pod hostname or IP/, { where: 'transcript', timeoutMs: 60_000 }); s.send(POD);
      await s.waitFor(/Username \[admin\]/, { where: 'transcript', timeoutMs: 30_000 }); s.send(POD_USER === 'admin' ? '' : POD_USER);
      await s.waitFor(/Name for this pod/, { where: 'transcript', timeoutMs: 30_000 }); s.send('mypod');
      await s.waitFor(/Password for/, { where: 'transcript', timeoutMs: 30_000 }); s.send(POD_PASS);
      await s.waitFor(/Next: connect Claude/, { where: 'transcript', timeoutMs: 120_000 });
      const out = s.transcript().trimEnd();
      if (out.includes(POD_PASS)) throw new Error('the password reached the terminal output');
      await capture.terminal('fsm09-13-setup', out, { title, command: 'fabric-studio-mcp setup', replace: swap });
      s.kill();
    });

    await test.step('fsm09-14-pods', async () => {
      const r = spawnSync('fabric-studio-mcp', ['pods'], { env: { ...process.env, ...shellEnv }, encoding: 'utf8' });
      if (r.status !== 0 || !/mypod/.test(r.stdout)) throw new Error(`pods did not list the pod: ${r.stderr || r.stdout}`);
      // The host text changes length when the lab address is swapped for the example one, so rebuild the columns.
      const fmt = (a: string, b: string, c: string, d: string) => `${a.padEnd(16)} ${b.padEnd(32)} ${c.padEnd(12)} ${d}`;
      const rows = r.stdout.trimEnd().split('\n').slice(1).map((l) => l.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/)!);
      const table = [fmt('NAME', 'HOST', 'USER', 'LOGIN'), ...rows.map((m) => fmt(m[1], m[2].split(POD).join('fabric-studio.example.com'), m[3], m[4]))].join('\n');
      await capture.terminal('fsm09-14-pods', table, { title, command: 'fabric-studio-mcp pods', replace: swap });
    });

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

    // `claude mcp list` health-checks every server on the machine, including the author's own. Run it against a
    // throwaway Claude config, registered the way the page says (user scope), so it shows only this server and the
    // real ~/.claude.json is never touched.
    await test.step('fsm09-15-mcp-list', async () => {
      const cfg = join(root, 'claude-config');
      mkdirSync(cfg);
      const sh = await local('laptop', { cwd: work, env: { ...shellEnv, CLAUDE_CONFIG_DIR: cfg } });
      // an interactive shell's startup files can rebuild PATH and drop the throwaway tool folder
      sh.send(`export PATH="${join(tools, 'bin')}:$PATH"`); await sleep(3000);
      sh.send('claude mcp add fabric-studio --scope user -- fabric-studio-mcp');
      await sh.waitFor(/Added stdio MCP server/, { where: 'transcript', timeoutMs: 90_000 });
      await sleep(4000);   // let the shell draw its prompt, or the next command is swallowed
      sh.send('claude mcp list');
      await sh.waitFor(/fabric-studio: fabric-studio-mcp[^\n]*(Connected|Failed|authentication)/, { timeoutMs: 180_000 });
      const line = sh.plainScreen().split('\n').map((l) => l.trim()).filter((l) => /^fabric-studio: fabric-studio-mcp/.test(l)).pop();
      if (!line || !/Connected/.test(line)) throw new Error(`the server is not connected: ${line}`);
      await capture.terminal('fsm09-15-mcp-list', `Checking MCP server health…\n\n${line}`, { title, command: 'claude mcp list', replace: swap });
      sh.kill();
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

    // A build that fails on purpose, for the failed-install page: FortiManager 8.0.0 does not install on the lab pod.
    await test.step('fsm09-16-build-failed', async () => {
      if (!FAIL) return skipStep('fsm09-16-build-failed', 'set FSM_FAIL=1 to build a fabric that fails');
      const before = rcCount();
      claude.type(`Build a fabric called ${FAIL_FABRIC} on mypod with a FortiGate, a FortiManager and a FortiAnalyzer. Use version 8.0.0 for the FortiManager and 7.6 for the other two. Build it as soon as I approve.`);
      await sleep(2000); claude.enter();
      let approved = false;
      for (let i = 0; i < 4 && !approved; i++) {
        if (await settle(10_000, 420_000) === 'form') {
          claude.write(' '); await sleep(800); claude.write('\x1b[B'); await sleep(600); claude.write('\r'); approved = true;
        } else { claude.type('Yes, build it.'); await sleep(2000); claude.enter(); }
      }
      if (!approved) throw new Error('the approval form never appeared for the failing build');
      await settle(10_000, 300_000);
      const deadline = Date.now() + 25 * 60_000;
      while (rcCount() <= before) {
        if (Date.now() > deadline) throw new Error('the failing build did not finish within 25 minutes');
        await sleep(10_000);
      }
      const rcs = readdirSync(runsDir).filter((f) => f.endsWith('.rc'));
      if (rcs.every((f) => readFileSync(join(runsDir, f), 'utf8').trim() === '0') && rcs.length > before) {
        // every run succeeded: the 8.0.0 FortiManager installed, so there is no failure to show
        throw new Error('the build that was meant to fail succeeded');
      }
      claude.type('Did the build finish? Give me the result in a sentence or two.'); await sleep(2000); claude.enter();
      await settle(15_000, 420_000);
      await capture.screen('fsm09-16-build-failed', claude.screen(), { title, replace: swap, cols: 110 });
    });

    await test.step('fsm09-17-diagnose', async () => {
      if (!FAIL) return skipStep('fsm09-17-diagnose', 'set FSM_FAIL=1 to build a fabric that fails');
      claude.type('Why did it fail? Check the pod and tell me the cause.'); await sleep(2000); claude.enter();
      await settle(15_000, 420_000);
      const said = claude.plainScreen();
      if (!/254|log|login|FortiManager|image/i.test(said)) throw new Error(`no diagnosis on screen:\n${said}`);
      await capture.screen('fsm09-17-diagnose', claude.screen(), { title, replace: swap, cols: 110 });
    });
    claude.kill();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
