import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { test } from 'docubot';

// Installs fabric-studio from the Git server exactly as the page says, registers it for a fresh folder,
// then drives the real Claude Code TUI. The pod is read from the machine's own registry (~/.fsh).
const REPO = process.env.FSM_REPO ?? 'ssh://git@git.fndn.fortinet.net:2222/dspille/fabric-studio.git';
const POD = process.env.FSM_POD ?? '';           // host of a lab pod you may change; step 6 accepts the restart, so it runs on that pod
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Show the folder the page tells a student to use, and drop the warning that comes from the
// author's own second registration (a student with a single registration never sees it).
const tidy = (screen: string) =>
  screen.replace(/MCP config diagnostics[\s\S]*?(?=\s*Manage MCP servers)/, '');

test('Connect Claude Code to the fabric-studio MCP server', async ({ local, capture }) => {
  test.setTimeout(600_000);   // a real Claude conversation, with a pod login, can take minutes
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
      await claude.waitFor(/(?:Brewed|Baked|Cogitated|Crunched|Worked|Sautéed)[^\n]*for/, { timeoutMs: 180_000 });
      await sleep(1500);
      await capture.screen('fsm09-04-ask-pods', claude.screen(), { title, replace: swap, cols: 110 });
    });

    await test.step('fsm09-05-approve-change', async () => {
      if (!POD) throw new Error('set FSM_POD to the host of a pod you may change');
      claude.type(`Restart the fgt74 VM on mypod. Call vm_lifecycle with confirm=true straight away.`);
      await sleep(2000); claude.enter();
      // Claude's own "Do you want to proceed?" comes first; the server's approval question is the one to capture.
      for (let i = 0; i < 4 && !/requests your input/.test(claude.plainScreen()); i++) {
        await sleep(8000);
        if (/Do you want to proceed/.test(claude.plainScreen())) { claude.write('\r'); }
      }
      await claude.waitFor(/requests your input/, { timeoutMs: 120_000 });
      await sleep(1500);
      await capture.screen('fsm09-05-approve-change', claude.screen(), { title, replace: swap, cols: 110 });
    });

    await test.step('fsm09-06-approved', async () => {
      claude.write(' '); await sleep(800);       // tick Approve
      claude.write('\x1b[B'); await sleep(600);  // move to Accept
      claude.write('\r');
      // The restart takes about a minute: power off, power on, wait for ready.
      // Wait for Claude's own report (the step 4 "Brewed for" line is still on screen, so it cannot be the cue).
      await claude.waitFor(/restarted|powered on and ready/i, { timeoutMs: 240_000 });
      await sleep(10_000);                       // let the closing "Brewed for" line settle
      await capture.screen('fsm09-06-approved', claude.screen(), { title, replace: swap, cols: 110 });
    });
    claude.kill();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
