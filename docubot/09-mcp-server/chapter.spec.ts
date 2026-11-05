import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { assertPodAllowed, buildExpect, createAgentLab, defaultRunsDir, fsGoto, fsOpenFabric, fsShot, getGuiDevice, installFabricStudioMcp, listRuns, operatorClaudeTitles, pollUntil, setupPod, skipStep, slashCommand, waitForBuildRun, waitForRunStart, type LabConfig, test, type Expect, type PendingCall } from 'docubot';

// Captures run on the operator's own Claude login (Sonnet): `--setting-sources ''` + `--strict-mcp-config` keep the operator's rules and hooks out of the gate.
// DOCUBOT_APPROVAL_ISOLATION=config-dir (CI, canary) uses a throwaway config and needs ANTHROPIC_API_KEY.
// Installs fabric-studio from the zip the Install page offers, exactly as the page says (unzip, then uv tool install), registers it for a fresh folder,
// then drives the real Claude Code TUI. The pod is read from the machine's own registry (~/.fsh).
// The published download: the chapter tests the artifact a reader gets, not a checkout. Override with FS_MCP_ZIP.
const ZIP = process.env.FS_MCP_ZIP ?? join(__dirname, '..', '..', 'content', '09-mcp-server', '01-install', 'fabric-studio.zip');
const POD = process.env.FS_MCP_POD ?? '';           // host of a lab pod you may change; step 6 accepts the restart, so it runs on that pod
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
const BUILD = process.env.FS_MCP_BUILD === '1';
// Steps 16-17 build a fabric that fails on purpose (FortiManager 8.0.0 does not install on the lab pod) so the
// failed-install page can show Claude finding the cause. They are independent of FS_MCP_BUILD.
const DECLINE_BUILD = process.env.FS_MCP_DECLINE_BUILD === '1';
const FAIL = process.env.FS_MCP_FAIL === '1';
const FAIL_FABRIC = process.env.FS_MCP_FAIL_FABRIC ?? 'docs-fail';
// The pod login the chapter types into `fabric-studio-mcp setup`, like a student would. The password never
// reaches the screen (getpass does not echo it), and the step fails if it does.
// Read from the `pod` device once the lab config has loaded (DOCUBOT_POD_USER / DOCUBOT_POD_PASS in the environment or in the
// gitignored labconfig.local.yaml, as for every other device); see podLogin() in the test.
// Step 5 restarts this VM, which must exist in the fabric running on the pod (step 5 fails fast if it does not).
const VM = process.env.FS_MCP_VM ?? 'fgt74';
const FABRIC = process.env.FS_MCP_FABRIC ?? 'docs-demo';
// The fabric steps 7-11 create. Defaults to FABRIC; name a new one when FABRIC is the fabric already running (a plan for a fabric that exists says "nothing to build").
const BUILD_FABRIC = process.env.FS_MCP_BUILD_FABRIC ?? FABRIC;

/** The pod login, from the `pod` device (env DOCUBOT_POD_* over labconfig.local.yaml over labconfig.yaml); a placeholder is no login. */
function podLogin(lab: LabConfig): { user: string; pass: string } {
  const dev = getGuiDevice(lab, 'pod');
  return { user: dev.user || 'admin', pass: /^set-/.test(dev.pass ?? '') ? '' : dev.pass ?? '' };
}


test('Connect Claude Code to the fabric-studio MCP server', async ({ page, local, capture, gui, lab }) => {
  const { user: POD_USER, pass: POD_PASS } = podLogin(lab);
  assertPodAllowed(POD);   // named for this run, not locked, not on the deny list: checked before anything is launched
  test.setTimeout(75 * 60_000);   // a real Claude conversation can take minutes, and the build steps wait for a fabric install
  // The root sits under the operator's real home: Claude's login is found through HOME, so the folder is real. Its random name is
  // the only part boxed in pictures; the folder the page names (fabric-studio-demo) is the real working folder.
  const root = mkdtempSync(join(homedir(), 'fsmcp-'));
  // Boxed in every Claude picture: the temp folder's random name, and the names of the operator's other background Claude sessions
  // (Claude draws a live session's name in the prompt box's border; it is not something a student has).
  // The footer's "← N agents" counts the operator's other background sessions: boxed too.
  const HIDE = [basename(root), 'fsmcp-', ...operatorClaudeTitles(), ...Array.from({ length: 20 }, (_, i) => `← ${i + 1} agent${i ? 's' : ''}`)];
  const tools = join(root, 'tools');
  const work = join(root, 'fabric-studio-demo');
  mkdirSync(work);
  // `fabric-studio-mcp setup` creates this registry, as it does for a student. Nothing is written by hand.
  const registry = join(root, 'instances.json');
  const runsDir = defaultRunsDir(registry);
  const swap: Array<[string | RegExp, string]> = [
    [join(tools, 'bin'), '~/.local/bin'],
    [work, '~/fabric-studio-demo'],
    [homedir(), '~'],
    // Same width as the real host: the swap runs after the text is laid out, so a longer or shorter text would break its borders.
    [POD, '192.0.2.10'.padEnd(POD.length)],
  ];
  const title = 'student@laptop: ~/fabric-studio-demo';
  const agents = createAgentLab({ name: 'fsmcp' });
  const shellEnvFor = (bin: string) => ({ PATH: `${bin}:${process.env.PATH}`, FSH_INSTANCES_FILE: registry });
  let shellEnv: Record<string, string> = shellEnvFor(join(tools, 'bin'));
  let session: Awaited<ReturnType<typeof agents.startClaudeApproval>> | undefined;

  try {
    // The Install page: unzip the download and install from the folder. Real commands, run in a throwaway tool folder.
    await step('fsm09-12-install', async () => {
      const installed = installFabricStudioMcp({ zip: ZIP, dir: root, toolsDir: tools });
      shellEnv = shellEnvFor(installed.bin);
      await capture.terminal('fsm09-12-install', installed.shown, { title: 'student@laptop: ~/Downloads', replace: swap });
    });

    // The Connect a Pod page: add the pod with the real command, answering its prompts through responders as a student would.
    await step('fsm09-13-setup', async () => {
      if (!POD || !POD_PASS) throw new Error('set FS_MCP_POD and DOCUBOT_POD_PASS: the chapter adds the pod with fabric-studio-mcp setup');
      const { output } = await setupPod({ pod: POD, user: POD_USER, password: POD_PASS, name: 'mypod', command: join(tools, 'bin', 'fabric-studio-mcp'), cwd: work, env: shellEnv });
      await capture.terminal('fsm09-13-setup', output, { title, command: 'fabric-studio-mcp setup', replace: swap });
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

    // `claude mcp add` is a plain command, not a TUI: it runs without a terminal and its output is the picture's text.
    await step('fsm09-01-register', async () => {
      const cmd = 'claude mcp add fabric-studio --scope project -- fabric-studio-mcp';
      const r = spawnSync('claude', cmd.split(' ').slice(1), { cwd: work, env: { ...process.env, ...shellEnv }, encoding: 'utf8' });
      const said = `${r.stdout}${r.stderr}`;
      if (r.status !== 0 || !/Added stdio MCP server/.test(said)) throw new Error(`claude mcp add failed:\n${said}`);
      const out = said.slice(said.indexOf('Added stdio MCP server')).trimEnd().replace(/File modified: .*/, 'File modified: ~/fabric-studio-demo/.mcp.json');
      await capture.terminal('fsm09-01-register', out, { title, command: cmd, replace: swap });
    });

    // Claude Code runs in a real terminal. --strict-mcp-config limits the session to the file step 1 wrote, so the shots show only this
    // server; --no-chrome leaves the operator's claude-in-chrome out (a built-in server /mcp would list). The read and change tool lists
    // come from the server itself (tools/list); a tool it adds later is denied until classified. Captures use the operator's login and
    // the Sonnet header; `--setting-sources ''` drops their rules and hooks. DOCUBOT_APPROVAL_ISOLATION=config-dir switches to the
    // throwaway config + ANTHROPIC_API_KEY + Haiku (CI/canary).
    const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    /** The picture starts at the question the student typed (what is above it is an earlier step's screen). */
    const fromQuestion = (q: string) => new RegExp(`^\\s*[>❯]\\s+${escapeRe(q.slice(0, 24))}`);
    // One Claude conversation runs through steps 02-17, so a step cannot run alone: when the fingerprint gate skipped the steps
    // before it, run with FORCE=1 (or --from fsm09-02-trust-folder) so the session exists.
    const S = (): NonNullable<typeof session> => {
      if (!session) throw new Error('this step continues the Claude conversation started by fsm09-02-trust-folder, which did not run (skipped as unchanged?): run with FORCE=1');
      return session;
    };
    // A finished turn ends with "Worked for 7s · done 8:56 AM": non-dialog pictures end there (no empty rows, no idle input box below).
    const DONE = /\bfor (?:\d+m )?\d+s\b.*\bdone \d/;
    const real = () => S().real;
    const approval = () => S().approval;
    /** Which tools Claude called since `from` events ago: the pick is asserted, never hinted at in the prompt. A wrong pick is a finding. */
    const eventCount = () => approval().events().length;
    const assertPicked = (what: string, from: number, tools: RegExp): void => {
      const called = approval().events().slice(from).filter((e) => e.hook_event_name === 'PreToolUse').map((e) => String(e.tool_name).replace(/^mcp__[^_]+(?:-[^_]+)*__/, ''));
      if (!called.some((t) => tools.test(t))) throw new Error(`FINDING (${what}): Claude did not pick a tool matching ${tools}; it called: ${called.join(', ') || '(no tool)'}`);
    };
    const expectChange = (e: Omit<Expect, 'decision'>): Expect => {
      const expected = buildExpect(S().policy, { ...e, decision: 'approve' });
      approval().setExpect(expected);
      return expected;
    };
    const plain = () => real().term.plainScreen();

    // Claude asks whether to trust a folder the first time it opens it: the gate itself is photographed (onGate), then answered.
    await step('fsm09-02-trust-folder', async () => {
      session = await agents.startClaudeApproval(page, {
        mcpConfig: join(work, '.mcp.json'), cwd: work, server: 'fabric-studio', policyExtra: { builtins: ['ToolSearch'] },
        env: shellEnv, args: ['--no-chrome'], cols: 110, rows: 70,
        isolation: process.env.DOCUBOT_APPROVAL_ISOLATION === 'config-dir' ? 'config-dir' : 'operator-login',
        onGate: async (_gate, r) => { await capture.agent('fsm09-02-trust-folder', r, { terms: HIDE, startAt: /\S/ }); },
      });
    });

    await step('fsm09-03-check-mcp', async () => {
      await slashCommand(real().term, '/mcp');
      await pollUntil('the /mcp dialog to list fabric-studio', () => /fabric-studio\s+\d+ tools/.test(plain()), { timeoutMs: 60_000, intervalMs: 200 });
      // The /mcp dialog sits at the bottom of the terminal: the picture starts at the dialog (nothing is cut out of the middle).
      await capture.agent('fsm09-03-check-mcp', real(), { terms: HIDE, startAt: /Manage MCP servers/ });
      real().term.write('\x1b');
      await pollUntil('the /mcp dialog to close', () => !/Manage MCP servers/.test(plain().split('\n').slice(-30).join('\n')), { timeoutMs: 15_000, intervalMs: 200 });
    });

    // `claude mcp list` health-checks every server on the machine, including the author's own. Run it against a throwaway Claude
    // config, registered the way the page says (user scope), so it shows only this server and the real ~/.claude.json is never touched.
    await step('fsm09-15-mcp-list', async () => {
      const cfg = join(root, 'claude-config');
      mkdirSync(cfg);
      const env = { ...process.env, ...shellEnv, CLAUDE_CONFIG_DIR: cfg };
      const add = spawnSync('claude', ['mcp', 'add', 'fabric-studio', '--scope', 'user', '--', 'fabric-studio-mcp'], { cwd: work, env, encoding: 'utf8' });
      if (add.status !== 0) throw new Error(`claude mcp add (user scope) failed: ${add.stderr || add.stdout}`);
      const list = spawnSync('claude', ['mcp', 'list'], { cwd: work, env, encoding: 'utf8', timeout: 180_000 });
      const line = `${list.stdout}${list.stderr}`.split('\n').map((l) => l.trim()).filter((l) => /^fabric-studio: fabric-studio-mcp/.test(l)).pop();
      if (!line || !/Connected/.test(line)) throw new Error(`the server is not connected: ${line}`);
      await capture.terminal('fsm09-15-mcp-list', `Checking MCP server health…\n\n${line}`, { title, command: 'claude mcp list', replace: swap });
    });

    await step('fsm09-04-ask-pods', async () => {
      const q = 'Which lab pods do I have, and are they up?';
      const from = eventCount();
      await slashCommand(real().term, '/clear');   // drops the setup steps' "MCP dialog dismissed" noise; the picture starts at the question
      await S().session.send(q);
      await approval().turnDone(180_000);   // reads run unprompted: the policy allows them
      assertPicked('which pods', from, /^pods$/);
      await pollUntil('the answer to name the pod', () => /mypod/.test(plain().split(q.slice(0, 20)).pop() ?? ''), { timeoutMs: 30_000, intervalMs: 200 });
      await capture.agent('fsm09-04-ask-pods', real(), { terms: HIDE, startAt: fromQuestion(q), endAt: DONE });
    });

    // The call step 5 pauses on, answered by step 6.
    let change: PendingCall | undefined;
    await step('fsm09-05-approve-change', async () => {
      if (!POD) throw new Error('set FS_MCP_POD to the host of a pod you may change');
      // The fabric is pinned: the pod can hold the same VM name in two fabrics (docs-demo and docs-fail both have an fgt), so an
      // expectation without it would approve a restart of the wrong one.
      const expected = expectChange({ tool: 'vm_lifecycle', args: { host: POD_NAME, action: 'restart', vm: VM, fabric: FABRIC, confirm: true } });
      const q = `Restart the VM ${VM} in the fabric ${FABRIC} on mypod.`;
      await S().session.send(q);   // what a student would type; the model may preview first and ask
      // Resolves on Claude's own permission event for exactly this call; a different change is denied and fails here.
      change = await approval().pendingOrNudge(S().session, expected, { timeoutMs: 240_000, nudge: 'Yes, go ahead.' });
      log(`waiting for approval: ${change.tool} ${JSON.stringify(change.args)}`);
      await capture.agent('fsm09-05-approve-change', await approval().snapDialog(change, real(), { terms: HIDE, startAt: fromQuestion(q) }));
    });

    await step('fsm09-06-approved', async () => {
      const q = `Restart the VM ${VM} in the fabric ${FABRIC} on mypod.`;
      await approval().answer(change!, 'approve');   // the "Yes" row, by name; "always" is never chosen
      // The restart takes about a minute: power off, power on, wait for ready. The turn's Stop event ends the wait.
      await approval().turnDone(240_000);
      await pollUntil('Claude to report the restart', () => /restarted|power/i.test(plain()), { timeoutMs: 30_000, intervalMs: 200 });
      await capture.agent('fsm09-06-approved', real(), { terms: HIDE, startAt: fromQuestion(q), endAt: DONE });
    });

    // Steps 7-11 build a fabric on the pod.
    let buildBefore = new Set<string>();
    let runsBefore = new Set<string>();
    await step('fsm09-07-build-plan', async () => {
      if (!BUILD) return skipStep('fsm09-07-build-plan', 'set FS_MCP_BUILD=1 to build a fabric on the pod');
      approval().setExpect(undefined);   // a plan changes nothing: any approval request for a change is denied
      await slashCommand(real().term, '/clear');   // the picture starts at the question
      const q = `Plan a fabric called ${BUILD_FABRIC} on mypod with a FortiGate, a FortiManager and a FortiAnalyzer, using version 7.6 for all three. Do not build it yet: tell me what it would stop and which firmware each device gets.`;
      const from = eventCount();
      await S().session.send(q);
      await approval().turnDone(420_000);
      assertPicked('the plan', from, /^(build_plan|build)$/);
      // A plan that failed is not a screenshot to publish: the page promises a plan. Judge only what Claude said after
      // the question, and ask for what a plan has, not for absent bad words. A plan for a fabric that is already running
      // reads "nothing to build" and contradicts the next step, so that is refused too.
      const marker = 'which firmware each device gets.';
      const answer = plain().slice(plain().lastIndexOf(marker) + marker.length);
      const has = (re: RegExp) => re.test(answer);
      const problems = [
        !has(new RegExp(BUILD_FABRIC)) && `the fabric name ${BUILD_FABRIC}`,
        !has(/\bstop/i) && 'what it would stop',
        !has(/FortiGate|\bfgt\b/i) && 'a FortiGate',
        !has(/FortiManager|\bfmg\b/i) && 'a FortiManager',
        !has(/FortiAnalyzer|\bfaz\b/i) && 'a FortiAnalyzer',
        !has(/\d+\.\d+\.\d+/) && 'a firmware version',
        has(/image not found|repository root/i) && 'an image or repository error',
        has(/no-?op|nothing to (build|do|change)|already (exists|running|built)/i) && 'a "no-op / already exists" plan (use a fabric name that is not on the pod)',
      ].filter(Boolean);
      if (problems.length) throw new Error(`Claude did not produce a plan (missing or wrong: ${problems.join(', ')}). After the question:\n${answer.split('\n').filter((l) => l.trim()).slice(-30).join('\n')}`);
      log('plan has the fabric, a stop statement, three devices and firmware versions');
      await capture.agent('fsm09-07-build-plan', real(), { terms: HIDE, startAt: fromQuestion(q), endAt: DONE });
    });

    await step('fsm09-08-build-approve', async () => {
      if (!BUILD) return skipStep('fsm09-08-build-approve', 'set FS_MCP_BUILD=1 to build a fabric on the pod');
      const expected = expectChange({ tool: 'build', args: { action: 'apply', host: POD_NAME, confirm: true } });
      const q = 'Yes, build it.';
      await S().session.send(q);
      const call = await approval().pending(expected, 420_000);
      await capture.agent('fsm09-08-build-approve', await approval().snapDialog(call, real(), { terms: HIDE, startAt: fromQuestion(q) }));
      // FS_MCP_DECLINE_BUILD=1 declines instead (the dialog is identical and the pod is not changed); steps 09-11 then have nothing to show.
      buildBefore = waitForBuildRun.snapshot(runsDir);
      runsBefore = listRuns(runsDir);
      await approval().answer(call, DECLINE_BUILD ? 'decline' : 'approve');   // the build runs
    });

    await step('fsm09-09-build-done', async () => {
      if (!BUILD) return skipStep('fsm09-09-build-done', 'set FS_MCP_BUILD=1 to build a fabric on the pod');
      if (DECLINE_BUILD) return skipStep('fsm09-09-build-done', 'the build was declined');
      await approval().turnDone(300_000);
      // The build runs detached: it records its run within seconds, and writes <run>.rc when it exits. Watch the folder.
      await waitForRunStart(runsDir, { before: runsBefore, timeoutMs: 180_000 });
      const exit = await waitForBuildRun(runsDir, { before: buildBefore, timeoutMs: 25 * 60_000, onEvent: log });
      log(`build run exited ${exit}`);
      if (exit !== '0') throw new Error(`the build run exited ${exit}: the picture would show a failed build, not a fabric that is up`);
      approval().setExpect(undefined);
      const q = 'Is the fabric up?';
      await S().session.send(q);
      await approval().turnDone(420_000);
      if (/isn.t up|not up|failed|can.t (currently )?see the pod/i.test(plain().split(q.slice(0, 20)).pop() ?? '')) throw new Error(`Claude did not report the fabric as up:\n${plain().slice(-1500)}`);
      await capture.agent('fsm09-09-build-done', real(), { terms: HIDE, startAt: fromQuestion(q), endAt: DONE });
    });

    // The same build as Fabric Studio records it: the Events page and the fabric's topology.
    await step('fsm09-10-fs-events', async () => {
      if (!BUILD || DECLINE_BUILD) return skipStep('fsm09-10-fs-events', 'set FS_MCP_BUILD=1 (and do not decline) to build a fabric on the pod');
      const p = await gui('pod');
      await p.setViewportSize({ width: 1280, height: 640 });
      await fsGoto(p, getGuiDevice(lab, 'pod').url, 'eventsAll');
      await capture.shot(p, 'fsm09-10-fs-events', fsShot(p));
    });

    await step('fsm09-11-fs-topology', async () => {
      if (!BUILD || DECLINE_BUILD) return skipStep('fsm09-11-fs-topology', 'set FS_MCP_BUILD=1 (and do not decline) to build a fabric on the pod');
      const p = await gui('pod');
      await p.setViewportSize({ width: 1280, height: 760 });
      await fsOpenFabric(p, getGuiDevice(lab, 'pod').url, BUILD_FABRIC);
      await capture.shot(p, 'fsm09-11-fs-topology', fsShot(p));
    });

    // A build that fails on purpose, for the failed-install page: FortiManager 8.0.0 does not install on the lab pod.
    await step('fsm09-16-build-failed', async () => {
      if (!FAIL) return skipStep('fsm09-16-build-failed', 'set FS_MCP_FAIL=1 to build a fabric that fails');
      const before = waitForBuildRun.snapshot(runsDir);
      const expected = expectChange({ tool: 'build', args: { action: 'apply', host: POD_NAME, confirm: true } });
      await S().session.send(`Build a fabric called ${FAIL_FABRIC} on mypod with a FortiGate, a FortiManager and a FortiAnalyzer. Use version 8.0.0 for the FortiManager and 7.6 for the other two.`);
      // The model may ask first instead of calling: when the turn ends with no call, tell it to go ahead (up to 3 times).
      const call = await approval().pendingOrNudge(S().session, expected, { timeoutMs: 420_000, nudge: 'Yes, build it.' });
      await approval().answer(call, 'approve');
      await approval().turnDone(300_000);
      const exit = await waitForBuildRun(runsDir, { before, timeoutMs: 25 * 60_000, onEvent: log });
      if (exit === '0') throw new Error('the build that was meant to fail succeeded');   // the 8.0.0 FortiManager installed: there is no failure to show
      approval().setExpect(undefined);
      const q = 'Did the build finish? Give me the result in a sentence or two.';
      await S().session.send(q);
      await approval().turnDone(420_000);
      await capture.agent('fsm09-16-build-failed', real(), { terms: HIDE, startAt: fromQuestion(q), endAt: DONE });
    });

    await step('fsm09-17-diagnose', async () => {
      if (!FAIL) return skipStep('fsm09-17-diagnose', 'set FS_MCP_FAIL=1 to build a fabric that fails');
      const q = 'Why did it fail?';
      const from = eventCount();
      await S().session.send(q);
      await approval().turnDone(420_000);
      assertPicked('why the build failed', from, /^(diagnose|build|pods|vm|fabric|tasks)$/);
      const said = plain();
      if (!/254|log|login|FortiManager|image/i.test(said)) throw new Error(`no diagnosis on screen:\n${said}`);
      await capture.agent('fsm09-17-diagnose', real(), { terms: HIDE, startAt: fromQuestion(q), endAt: DONE });
    });
  } finally {
    session?.session.kill();
    rmSync(root, { recursive: true, force: true });
  }
});
