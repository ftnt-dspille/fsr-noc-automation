import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { test } from 'docubot';

// The Install page's `fabric-studio-mcp connect`: install from the published zip into a throwaway tool folder, then run
// the real command. It needs no pod. Claude Code and Codex are pointed at throwaway config folders, so this machine's
// own agents are never touched (FortiAgent and opencode have no such switch, so the page shows them in text only).
// Every wait is on text on screen; there are no fixed sleeps.
const ZIP = process.env.FS_MCP_ZIP ?? join(__dirname, '..', '..', 'content', '09-mcp-server', '01-install', 'fabric-studio.zip');

test('Connect the server to coding agents with one command', async ({ local, capture }) => {
  test.setTimeout(10 * 60_000);
  const root = mkdtempSync(join(homedir(), '.docubot-fsmcp-connect-'));
  const tools = join(root, 'tools');
  const dl = join(root, 'download');
  const work = join(root, 'demo');
  mkdirSync(dl);
  mkdirSync(work);
  const claudeCfg = join(root, 'claude-config');
  const codexHome = join(root, 'codex-home');
  mkdirSync(claudeCfg);
  mkdirSync(codexHome);
  const bin = join(tools, 'bin');
  const swap: Array<[string | RegExp, string]> = [
    [bin, '~/.local/bin'], [work, '~/fabric-studio-demo'],
    // the throwaway config folders stand in for the agents' real ones
    [/~\/\.docubot-fsmcp-connect-[A-Za-z0-9]+\/claude-config/g, '~/.claude'],
    [/~\/\.docubot-fsmcp-connect-[A-Za-z0-9]+\/codex-home/g, '~/.codex'],
    [homedir(), '~'],
  ];
  const title = 'student@laptop: ~/fabric-studio-demo';
  try {
    const install = (cmd: string, args: string[]) => {
      const r = spawnSync(cmd, args, { cwd: dl, env: { ...process.env, UV_TOOL_DIR: tools, UV_TOOL_BIN_DIR: bin, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
    };
    copyFileSync(ZIP, join(dl, 'fabric-studio.zip'));
    install('unzip', ['-q', 'fabric-studio.zip']);
    install('uv', ['tool', 'install', './fabric-studio[mcp]']);

    await test.step('fsm09-18-connect', async () => {
      const env = { PATH: `${bin}:${process.env.PATH}`, CLAUDE_CONFIG_DIR: claudeCfg, CODEX_HOME: codexHome };
      const s = await local('laptop', { file: 'fabric-studio-mcp', args: ['connect', 'claude', 'codex'], cwd: work, env, cols: 110, rows: 24 });
      await s.waitFor(/Run these\? \[Y\/n\]/, { where: 'transcript', timeoutMs: 60_000 });
      s.send('');   // Enter takes the default, Yes
      await s.waitFor(/Next: ask the agent|failed|could not/, { where: 'transcript', timeoutMs: 120_000 });
      const out = s.transcript().trimEnd();
      if (!/Claude Code: connected/.test(out) || !/Codex: connected/.test(out)) throw new Error(`connect did not finish for both agents:\n${out}`);
      // the skill really landed where each agent reads it
      for (const dir of [join(claudeCfg, 'skills', 'fabric-studio'), join(codexHome, 'skills', 'fabric-studio')]) {
        if (!existsSync(join(dir, 'SKILL.md')) || !existsSync(join(dir, 'api-index.md'))) throw new Error(`the skill is not in ${dir}:\n${out}`);
      }
      await capture.terminal('fsm09-18-connect', out, { title, command: 'fabric-studio-mcp connect claude codex', replace: swap });
      s.kill();
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
