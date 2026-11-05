import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { assertPodAllowed, buildExpect, classifyServer, ClaudeApproval, fsGoto, fsOpenFabric, fsShot, getGuiDevice, skipStep, test, type Expect, type PendingCall } from 'docubot';

// Captures run on the operator's own Claude login (Sonnet): `--setting-sources ''` + `--strict-mcp-config` keep the operator's rules and hooks out of the gate.
// DOCUBOT_APPROVAL_ISOLATION=config-dir (CI, canary) uses a throwaway config and needs ANTHROPIC_API_KEY.
// Installs fabric-studio from the zip the Install page offers, exactly as the page says (unzip, then uv tool install), registers it for a fresh folder,
// then drives the real Claude Code TUI. The pod is read from the machine's own registry (~/.fsh).
// The published download: the chapter tests the artifact a reader gets, not a checkout. Override with FS_MCP_ZIP.
const ZIP = process.env.FS_MCP_ZIP ?? join(__dirname, '..', '..', 'content', '09-mcp-server', '01-install', 'fabric-studio.zip');
const POD = process.env.FS_MCP_POD ?? '';           // host of a lab pod you may change; step 6 accepts the restart, so it runs on that pod
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// A timestamped line for every step and every change of what a wait is looking at, so a stall shows what it waited on.
const T0 = Date.now();
const log = (message: string): void => console.log(`[chapter +${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s] ${message}`);
const step = async (name: string, body: () => Promise<void>): Promise<void> =>
  test.step(name, async () => {
    const t = Date.now();
    log(`start ${name}`);
    try { await body(); } catch (e) { log(`FAILED ${name} after ${Math.round((Date.now() - t) / 1000)}s`); throw e; }
    log(`done  ${name} in ${Math.round((Date.now() - t) / 1000)}s`);
  });
// Steps 7-11 build a real fabric on the pod (and stop the one running there), so they run only when asked.
// FS_MCP_FABRIC names the fabric to create: the same name twice is a no-op, so use a new one (or delete the old) per run.
// The pod's web login for steps 10-11 comes from DOCUBOT_POD_URL / DOCUBOT_POD_USER / DOCUBOT_POD_PASS.
// Approvals are decided by a policy hook (docubot's ClaudeApproval), not by reading the screen: each change step
// declares the one call it expects (tool, pod, confirm=true), any other change is denied, and the picture is taken
// only for that call. The pod is addressed by the name step 13 registers it under.
const POD_NAME = 'mypod';
// The bundled topologies' own subnets are page content, not lab addresses: keep them through IP masking.
const TOPO_IPS = ['10.254.254.0'];
const BUILD = process.env.FS_MCP_BUILD === '1';
// Steps 16-17 build a fabric that fails on purpose (FortiManager 8.0.0 does not install on the lab pod) so the
// failed-install page can show Claude finding the cause. They are independent of FS_MCP_BUILD.
const FAIL = process.env.FS_MCP_FAIL === '1';
const FAIL_FABRIC = process.env.FS_MCP_FAIL_FABRIC ?? 'docs-fail';
// The pod login the chapter types into `fabric-studio-mcp setup`, like a student would. The password never
// reaches the screen (getpass does not echo it), and the step fails if it does.
const POD_USER = process.env.DOCUBOT_POD_USER ?? 'admin';
const POD_PASS = process.env.DOCUBOT_POD_PASS ?? '';
// Step 5 restarts this VM, which must exist in the fabric running on the pod (step 5 fails fast if it does not).
const VM = process.env.FS_MCP_VM ?? 'fgt74';
const FABRIC = process.env.FS_MCP_FABRIC ?? 'docs-demo';

// Show the folder the page tells a student to use, and drop the warning that comes from the
// author's own second registration (a student with a single registration never sees it).
const tidy = (screen: string) =>
  screen.replace(/MCP config diagnostics[\s\S]*?(?=\s*Manage MCP servers)/, '');

test('Connect Claude Code to the fabric-studio MCP server', async ({ local, capture, gui, lab }) => {
  assertPodAllowed(POD);   // named for this run, not locked, not on the deny list: checked before anything is launched
  test.setTimeout(45 * 60_000);   // a real Claude conversation can take minutes, and the build steps wait for a fabric install
  const root = mkdtempSync(join(homedir(), '.docubot-fs-mcp-'));
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
    [work, '~/fabric-studio-demo'], [/~\/\.docubot-fs-mcp-[A-Za-z0-9]+(?:\/(?:demo|d(?:emo)?|…)?)?/g, '~/fabric-studio-demo'],   // also the truncated form on option 2 of a dialog ("~/.docubot-fs-mcp-8SJQhJ/…")
    [homedir(), '~'],
    // Same width as the real host: Claude lays tables out before the swap, so a longer or shorter text would break their borders.
    [POD, '192.0.2.10'.padEnd(POD.length)],
    // the operator's own plan usage and time zone, shown by Claude Code under a long answer: not part of the page
    [/You.ve used \d+%[^\r\n]*limit[^\r\n]*/g, ''],
  ];
  const title = 'student@laptop: ~/fabric-studio-demo';
  const rcCount = () => (existsSync(runsDir) ? readdirSync(runsDir).filter((f) => f.endsWith('.rc')).length : 0);

  try {
    // The Install page: unzip the download and install from the folder. Real commands, run in a throwaway tool folder.
    await step('fsm09-12-install', async () => {
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
    await step('fsm09-13-setup', async () => {
      if (!POD || !POD_PASS) throw new Error('set FS_MCP_POD and DOCUBOT_POD_PASS: the chapter adds the pod with fabric-studio-mcp setup');
      const s = await local('laptop', { file: 'fabric-studio-mcp', args: ['setup'], cwd: work, env: shellEnv, cols: 100, rows: 16 });
      await s.waitFor(/Pod hostname or IP/, { where: 'transcript', timeoutMs: 60_000 }); s.send(POD);
      await s.waitFor(/Username \[admin\]/, { where: 'transcript', timeoutMs: 30_000 }); s.send(POD_USER === 'admin' ? '' : POD_USER);
      await s.waitFor(/Name for this pod/, { where: 'transcript', timeoutMs: 30_000 }); s.send('mypod');
      await s.waitFor(/Password for/, { where: 'transcript', timeoutMs: 30_000 }); s.send(POD_PASS);
      await s.waitFor(/Next: run\s+fabric-studio-mcp connect/, { where: 'transcript', timeoutMs: 120_000 });
      const out = s.transcript().trimEnd();
      if (out.includes(POD_PASS)) throw new Error('the password reached the terminal output');
      await capture.terminal('fsm09-13-setup', out, { title, command: 'fabric-studio-mcp setup', replace: swap });
      s.kill();
    });

    await step('fsm09-14-pods', async () => {
      const r = spawnSync('fabric-studio-mcp', ['pods'], { env: { ...process.env, ...shellEnv }, encoding: 'utf8' });
      if (r.status !== 0 || !/mypod/.test(r.stdout)) throw new Error(`pods did not list the pod: ${r.stderr || r.stdout}`);
      // The host text changes length when the lab address is swapped for the example one, so rebuild the columns.
      const fmt = (a: string, b: string, c: string, d: string) => `${a.padEnd(16)} ${b.padEnd(32)} ${c.padEnd(12)} ${d}`;
      const rows = r.stdout.trimEnd().split('\n').slice(1).map((l) => l.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/)!);
      const table = [fmt('NAME', 'HOST', 'USER', 'LOGIN'), ...rows.map((m) => fmt(m[1], m[2].split(POD).join('fabric-studio.example.com'), m[3], m[4]))].join('\n');
      await capture.terminal('fsm09-14-pods', table, { title, command: 'fabric-studio-mcp pods', replace: swap });
    });

    await step('fsm09-01-register', async () => {
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
    // The read and change tool lists come from the server itself (tools/list); a tool it adds later is denied until classified.
    // Captures use the operator's login and the Sonnet header; `--setting-sources ''` drops their rules and hooks (proven live with a
    // control). DOCUBOT_APPROVAL_ISOLATION=config-dir switches to the throwaway config + ANTHROPIC_API_KEY + Haiku (CI/canary).
    const approval = new ClaudeApproval({ dev: { type: 'agent', tool: 'claude', cwd: work }, isolation: process.env.DOCUBOT_APPROVAL_ISOLATION === 'config-dir' ? 'config-dir' : 'operator-login' });
    const policy = await classifyServer(join(work, '.mcp.json'), 'fabric-studio', { builtins: ['ToolSearch'] }, shellEnv);
    const gate = approval.prepare(policy);
    const claude = await local('laptop', {
      file: 'claude',
      args: ['--permission-mode', 'default', '--model', gate.model, '--strict-mcp-config', '--mcp-config', '.mcp.json', ...gate.args],
      cwd: work, env: { ...shellEnv, ...gate.env }, cols: 110, rows: 100,   // a long answer after the restart is taller than 64 rows: Ink then repaints the header twice
    });
    const session = approval.attach(claude);
    const expectChange = (e: Omit<Expect, 'decision'>): Expect => {
      const expected = buildExpect(policy, { ...e, decision: 'approve' });
      approval.setExpect(expected);
      return expected;
    };

    await step('fsm09-02-trust-folder', async () => {
      // Claude asks whether to trust a folder the first time it opens it.
      await claude.waitFor(/trust this folder/, { timeoutMs: 60_000 });
      await sleep(1500);
      await capture.screen('fsm09-02-trust-folder', claude.screen(), { title, replace: swap, cols: 110 });
      claude.write('\x1b[B'); await sleep(600); claude.write('\r');   // "Yes, I trust this folder"
      await claude.waitFor(/\? for shortcuts/, { timeoutMs: 60_000 });
    });

    await step('fsm09-03-check-mcp', async () => {
      claude.type('/mcp'); await sleep(1500); claude.enter();
      await claude.waitFor(/fabric-studio\s+\d+ tools/, { timeoutMs: 60_000 });
      await sleep(1500);
      await capture.screen('fsm09-03-check-mcp', tidy(claude.screen()), { title, replace: swap, cols: 110 });
      claude.write('\x1b'); await sleep(1000);
    });

    // `claude mcp list` health-checks every server on the machine, including the author's own. Run it against a
    // throwaway Claude config, registered the way the page says (user scope), so it shows only this server and the
    // real ~/.claude.json is never touched.
    await step('fsm09-15-mcp-list', async () => {
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

    await step('fsm09-04-ask-pods', async () => {
      await session.send('/clear');   // drops the setup steps' "MCP dialog dismissed" noise; the picture starts at the question
      await session.send('List my managed Fabric Studio instances.');
      await approval.turnDone(180_000);   // reads run unprompted: the policy allows them
      const shown = await approval.settled(/managed Fabric Studio instance/);
      await capture.screen('fsm09-04-ask-pods', shown.clean, { title, replace: swap, cols: 110 });
    });

    // The call step 5 pauses on, answered by step 6.
    let change: PendingCall | undefined;
    await step('fsm09-05-approve-change', async () => {
      if (!POD) throw new Error('set FS_MCP_POD to the host of a pod you may change');
      // The fabric is pinned: the pod can hold the same VM name in two fabrics (docs-demo and docs-fail both have an fgt), so an
      // expectation without it would approve a restart of the wrong one.
      const expected = expectChange({ tool: 'vm_lifecycle', args: { host: POD_NAME, action: 'restart', vm: VM, fabric: FABRIC, confirm: true } });
      await session.send(`Restart the VM ${VM} in the fabric ${FABRIC} on mypod.`);   // what a student would type; the model may preview first and ask
      // Resolves on Claude's own permission event for exactly this call; a different change is denied and fails here.
      let call = await approval.pendingOrEnd(expected, 240_000);
      for (let i = 0; i < 3 && !call; i++) {
        await session.send('Yes, go ahead.');
        call = await approval.pendingOrEnd(expected, 240_000);
      }
      if (!call) throw new Error('the permission request never appeared for the restart');
      change = call;
      log(`waiting for approval: ${change.tool} ${JSON.stringify(change.args)}`);
      const frame = await approval.capture(change);   // whole frame, checked to be this call's dialog
      await capture.screen('fsm09-05-approve-change', frame.clean, { title, replace: swap, cols: 110 });
    });

    await step('fsm09-06-approved', async () => {
      await approval.answer(change!, 'approve');   // the "Yes" row, by name; "always" is never chosen
      // The restart takes about a minute: power off, power on, wait for ready. The turn's Stop event ends the wait.
      await approval.turnDone(240_000);
      await sleep(3000);                           // let the closing end-of-turn line settle
      await capture.screen('fsm09-06-approved', (await approval.settled(/restarted|power/i)).clean, { title, replace: swap, cols: 110 });
    });

    await step('fsm09-07-build-plan', async () => {
      if (!BUILD) return skipStep('fsm09-07-build-plan', 'set FS_MCP_BUILD=1 to build a fabric on the pod');
      approval.setExpect(undefined);   // a plan changes nothing: any approval request for a change is denied
      await session.send(`Plan a fabric called ${FABRIC} on mypod with a FortiGate, a FortiManager and a FortiAnalyzer, using version 7.6 for all three. Do not build it yet: tell me what it would stop and which firmware each device gets.`);
      await approval.turnDone(420_000);
      // A plan that failed is not a screenshot to publish: the page promises a plan. Judge only what Claude said after
      // the question (the screen above it is earlier output), and ask for what a plan has, not for absent bad words.
      const screen = claude.plainScreen();
      const marker = 'which firmware each device gets.';
      const answer = screen.slice(screen.lastIndexOf(marker) + marker.length);
      const has = (re: RegExp) => re.test(answer);
      const problems = [
        !has(new RegExp(FABRIC)) && `the fabric name ${FABRIC}`,
        !has(/\bstop/i) && 'what it would stop',
        !has(/FortiGate|\bfgt\b/i) && 'a FortiGate',
        !has(/FortiManager|\bfmg\b/i) && 'a FortiManager',
        !has(/FortiAnalyzer|\bfaz\b/i) && 'a FortiAnalyzer',
        !has(/\d+\.\d+\.\d+/) && 'a firmware version',
        has(/image not found|repository root/i) && 'an image or repository error',
      ].filter(Boolean);
      if (problems.length) {
        throw new Error(`Claude did not produce a plan (missing or wrong: ${problems.join(', ')}). After the question:\n${answer.split('\n').filter((l) => l.trim()).slice(-30).join('\n')}`);
      }
      log('plan has the fabric, a stop statement, three devices and firmware versions');
      await capture.screen('fsm09-07-build-plan', (await approval.settled()).clean, { title, replace: swap, cols: 110, keepIps: TOPO_IPS });
    });

    await step('fsm09-08-build-approve', async () => {
      if (!BUILD) return skipStep('fsm09-08-build-approve', 'set FS_MCP_BUILD=1 to build a fabric on the pod');
      const expected = expectChange({ tool: 'build', args: { action: 'apply', host: POD_NAME, confirm: true } });
      await session.send('Yes, build it.');
      const call = await approval.pending(expected, 420_000);
      const frame = await approval.capture(call);
      await capture.screen('fsm09-08-build-approve', frame.clean, { title, replace: swap, cols: 110, keepIps: TOPO_IPS });
      await approval.answer(call, 'approve');   // the build runs
    });

    await step('fsm09-09-build-done', async () => {
      if (!BUILD) return skipStep('fsm09-09-build-done', 'set FS_MCP_BUILD=1 to build a fabric on the pod');
      await approval.turnDone(300_000);
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
        log(`waiting for the build run to record an exit code (runs recorded: ${existsSync(runs) ? readdirSync(runs).length : 0})`);
        await sleep(10_000);
      }
      approval.setExpect(undefined);
      await session.send('Is the fabric up? Check the devices.');
      await approval.turnDone(420_000);
      await capture.screen('fsm09-09-build-done', (await approval.settled()).clean, { title, replace: swap, cols: 110, keepIps: TOPO_IPS });
    });

    // The same build as Fabric Studio records it: the Events page and the fabric's topology.
    await step('fsm09-10-fs-events', async () => {
      if (!BUILD) return skipStep('fsm09-10-fs-events', 'set FS_MCP_BUILD=1 to build a fabric on the pod');
      const page = await gui('pod');
      await page.setViewportSize({ width: 1280, height: 640 });
      await fsGoto(page, getGuiDevice(lab, 'pod').url, 'eventsAll');
      await capture.shot(page, 'fsm09-10-fs-events', fsShot(page));
    });

    await step('fsm09-11-fs-topology', async () => {
      if (!BUILD) return skipStep('fsm09-11-fs-topology', 'set FS_MCP_BUILD=1 to build a fabric on the pod');
      const page = await gui('pod');
      await page.setViewportSize({ width: 1280, height: 760 });
      await fsOpenFabric(page, getGuiDevice(lab, 'pod').url, FABRIC);
      await capture.shot(page, 'fsm09-11-fs-topology', fsShot(page));
    });

    // A build that fails on purpose, for the failed-install page: FortiManager 8.0.0 does not install on the lab pod.
    await step('fsm09-16-build-failed', async () => {
      if (!FAIL) return skipStep('fsm09-16-build-failed', 'set FS_MCP_FAIL=1 to build a fabric that fails');
      const before = rcCount();
      const expected = expectChange({ tool: 'build', args: { action: 'apply', host: POD_NAME, confirm: true } });
      await session.send(`Build a fabric called ${FAIL_FABRIC} on mypod with a FortiGate, a FortiManager and a FortiAnalyzer. Use version 8.0.0 for the FortiManager and 7.6 for the other two. Build it as soon as I approve.`);
      // The model may ask first instead of calling: when the turn ends with no call, tell it to go ahead (up to 4 times).
      let call = await approval.pendingOrEnd(expected, 420_000);
      for (let i = 0; i < 3 && !call; i++) {
        await session.send('Yes, build it.');
        call = await approval.pendingOrEnd(expected, 420_000);
      }
      if (!call) throw new Error('the permission request never appeared for the failing build');
      await approval.answer(call, 'approve');
      await approval.turnDone(300_000);
      const deadline = Date.now() + 25 * 60_000;
      while (rcCount() <= before) {
        if (Date.now() > deadline) throw new Error('the failing build did not finish within 25 minutes');
        log(`waiting for the failing build's exit code (${rcCount()} of more than ${before})`);
        await sleep(10_000);
      }
      const rcs = readdirSync(runsDir).filter((f) => f.endsWith('.rc'));
      if (rcs.every((f) => readFileSync(join(runsDir, f), 'utf8').trim() === '0') && rcs.length > before) {
        // every run succeeded: the 8.0.0 FortiManager installed, so there is no failure to show
        throw new Error('the build that was meant to fail succeeded');
      }
      approval.setExpect(undefined);
      await session.send('Did the build finish? Give me the result in a sentence or two.');
      await approval.turnDone(420_000);
      await capture.screen('fsm09-16-build-failed', (await approval.settled()).clean, { title, replace: swap, cols: 110 });
    });

    await step('fsm09-17-diagnose', async () => {
      if (!FAIL) return skipStep('fsm09-17-diagnose', 'set FS_MCP_FAIL=1 to build a fabric that fails');
      await session.send('Why did it fail? Check the pod and tell me the cause.');
      await approval.turnDone(420_000);
      const said = claude.plainScreen();
      if (!/254|log|login|FortiManager|image/i.test(said)) throw new Error(`no diagnosis on screen:\n${said}`);
      await capture.screen('fsm09-17-diagnose', (await approval.settled()).clean, { title, replace: swap, cols: 110 });
    });
    claude.kill();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
