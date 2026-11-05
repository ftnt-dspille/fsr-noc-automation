import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { assertPodAllowed, test } from 'docubot';

// The Connect FortiAgent page, followed as a new student would: install from the zip the Install page offers
// (uv tool install, so the command lands in ~/.local/bin as the page says), add the pod with
// `fabric-studio-mcp setup`, then add the server in FortiAgent's own Settings and ask about the pod.
// FortiAgent is the real desktop app, launched through Playwright's Electron support: quit it before a run.
// Every wait is on something on screen (never a fixed sleep), and each screen change is logged and written to
// FS_MCP_LIVE_SHOT, so a stall is visible while it happens.
const ZIP = process.env.FS_MCP_ZIP ?? join(__dirname, '..', '..', 'content', '09-mcp-server', '01-install', 'fabric-studio.zip');
const POD = process.env.FS_MCP_POD ?? '';
const POD_USER = process.env.DOCUBOT_POD_USER ?? 'admin';
const POD_PASS = process.env.DOCUBOT_POD_PASS ?? '';
const LIVE = process.env.FS_MCP_LIVE_SHOT ?? '';
const NAME = 'Fabric Studio';
const QUESTION = 'Using the Fabric Studio tools, what is running on my pod?';
const log = (m: string) => console.log(`[fortiagent ${new Date().toISOString().slice(11, 19)}] ${m}`);

/** Log each new piece of page text and refresh the live screenshot whenever the page changes. */
async function watch(w: Page): Promise<void> {
  let seen = '';
  await w.exposeFunction('docubotChanged', async () => {
    const text = await w.evaluate(() => document.body.innerText).catch(() => '');
    const fresh = text.length > seen.length ? text.slice(seen.length).replace(/\s+/g, ' ').trim() : '';
    seen = text;
    if (fresh) log(`+ ${fresh.slice(0, 160)}`);
    if (LIVE) await w.screenshot({ path: LIVE }).catch(() => undefined);
  });
  await w.evaluate(() => {
    let pending: ReturnType<typeof setTimeout> | undefined;
    new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(() => (window as unknown as { docubotChanged: () => void }).docubotChanged(), 400);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

const FA = '/Applications/FortiAgent.app/Contents/Resources/bin/fortiagent';
/** Run the fortiagent command-line client; it talks to the engine, which runs with or without the window. */
function fa(args: string[]): string {
  const r = spawnSync(FA, args, { encoding: 'utf8', input: '', timeout: 60_000 });
  if (r.status !== 0) throw new Error(`fortiagent ${args.join(' ')}: ${r.stderr || r.stdout}`);
  return r.stdout;
}
/** The MCP servers named Fabric Studio that the engine holds. */
const ours = (): { id: string; label: string }[] =>
  (JSON.parse(fa(['mcp', 'list', '--json'])) as { id: string; label: string }[]).filter((s) => s.label === NAME);

async function openMcpSettings(w: Page): Promise<void> {
  await w.getByRole('link', { name: 'Settings' }).click();
  await w.getByRole('link', { name: 'MCP servers', exact: true }).click();
  await w.getByRole('heading', { name: 'MCP servers', level: 1 }).waitFor();
}

test('Connect FortiAgent to the fabric-studio MCP server', async ({ app, capture, local }) => {
  assertPodAllowed(POD);   // named for this run, not locked, not on the deny list
  test.setTimeout(20 * 60_000);
  if (!POD || !POD_PASS) throw new Error('set FS_MCP_POD and DOCUBOT_POD_PASS: the page adds the pod with fabric-studio-mcp setup');
  const root = mkdtempSync(join(homedir(), '.docubot-fsagent-'));
  // A student's registry starts empty, at the default place the page relies on. FortiAgent starts MCP servers from
  // its background engine, which outlives the window and never sees an environment handed to the app, so the run
  // cannot point the server at another file: it moves the operator's ~/.fsh/instances.json aside and always puts it
  // back. A backup left by a killed run stops the next one until it is restored by hand.
  const registry = join(homedir(), '.fsh', 'instances.json');
  const backup = `${registry}.docubot-backup`;
  if (existsSync(backup)) throw new Error(`${backup} exists from an earlier run: move it back to ${registry} first`);
  const hadRegistry = existsSync(registry);
  const security = (args: string[]) => spawnSync('/usr/bin/security', args, { encoding: 'utf8' });
  const podItem = ['-s', 'fabric-studio-fixer', '-a', POD];
  const hadPodItem = security(['find-generic-password', ...podItem]).status === 0;   // attributes only: never asks
  const bin = join(homedir(), '.local', 'bin');
  const env = { PATH: `${bin}:${process.env.PATH}` };
  if (hadRegistry) renameSync(registry, backup);
  try {
    // Before you start: the Install page's commands, then setup. Not captured here (the Install and Connect a Pod
    // pages show them); a failure stops the chapter, because the rest depends on them.
    log('installing from the download zip');
    const dl = join(root, 'download');
    mkdirSync(dl);
    copyFileSync(ZIP, join(dl, 'fabric-studio.zip'));
    for (const [cmd, args] of [['unzip', ['-q', 'fabric-studio.zip']], ['uv', ['tool', 'install', '--force', './fabric-studio[mcp]']]] as const) {
      const r = spawnSync(cmd, [...args], { cwd: dl, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr || r.stdout}`);
    }
    log('fabric-studio-mcp setup');
    const s = await local('laptop', { file: join(bin, 'fabric-studio-mcp'), args: ['setup'], env, cols: 100, rows: 16 });
    await s.waitFor(/Pod hostname or IP/, { where: 'transcript', timeoutMs: 60_000 }); s.send(POD);
    await s.waitFor(/Username \[admin\]/, { where: 'transcript', timeoutMs: 30_000 }); s.send(POD_USER === 'admin' ? '' : POD_USER);
    await s.waitFor(/Name for this pod/, { where: 'transcript', timeoutMs: 30_000 }); s.send('mypod');
    await s.waitFor(/Password for/, { where: 'transcript', timeoutMs: 30_000 }); s.send(POD_PASS);
    await s.waitFor(/Next: run\s+fabric-studio-mcp connect|Not registered/, { where: 'transcript', timeoutMs: 120_000 });
    if (s.transcript().includes(POD_PASS)) throw new Error('the password reached the terminal output');
    if (/Not registered/.test(s.transcript())) throw new Error(`setup failed: ${s.transcript().split('Not registered')[1]?.trim()}`);
    s.kill();
    const command = spawnSync('which', ['fabric-studio-mcp'], { env: { ...process.env, ...env }, encoding: 'utf8' }).stdout.trim();
    if (command !== join(bin, 'fabric-studio-mcp')) throw new Error(`which fabric-studio-mcp gave ${command}, not ~/.local/bin`);

    // A rerun starts from no Fabric Studio server, as a student does. The Settings page reads "No MCP servers
    // configured yet" until its list loads, so the cleanup asks the engine instead (fortiagent mcp, FortiAgent 0.2.6+).
    for (const s of ours()) {
      log(`removing the "${NAME}" server an earlier run added (${s.id})`);
      fa(['mcp', 'remove', s.id, '--yes']);
    }

    log('launching FortiAgent');
    const skill = join(dl, 'fabric-studio', 'skills', 'fabric-studio', 'SKILL.md');
    const w = await app('fortiagent', { env, openFiles: [skill] });   // the page's file pick: the skill from the zip
    await watch(w);
    // After FortiAgent updates itself it greets the next launch with "has been updated to <version>": not part of
    // the page, so it is dismissed whenever it shows up.
    await w.addLocatorHandler(w.getByRole('dialog', { name: /has been updated to/ }), async (d) => {
      log('dismissing the "FortiAgent has been updated" notice');
      await d.getByRole('button', { name: 'Continue' }).click();
    });
    // The page shows the path as /Users/<you>/...; the shots show a student's home, not the operator's.
    const showAs = { [homedir()]: '/Users/student' };

    // The Configured rows for this server (the imported skill also shows the name, outside this list).
    const servers = w.getByRole('listitem').filter({ has: w.getByRole('button', { name: 'Remove MCP server' }) })
      .filter({ hasText: NAME });

    await test.step('fsm09-20-fortiagent-mcp-settings', async () => {
      await openMcpSettings(w);
      await capture.shot(w, 'fsm09-20-fortiagent-mcp-settings', { highlight: [w.getByRole('button', { name: 'Add an MCP server' })] });
    });

    await test.step('fsm09-21-fortiagent-add-server', async () => {
      await w.getByRole('button', { name: 'Add an MCP server' }).click();
      await w.getByRole('button', { name: 'Local command' }).click();
      await w.getByPlaceholder('e.g. Jira').fill(NAME);
      await w.getByPlaceholder('/path/to/server or npx').fill(command);
      // The command is an input's value, which showAs (page text) does not reach: show the student's path in it.
      await w.getByPlaceholder('/path/to/server or npx').evaluate((el, v) => { (el as HTMLInputElement).value = v; }, command.replace(homedir(), '/Users/student'));
      await capture.shot(w, 'fsm09-21-fortiagent-add-server', { highlight: [w.getByRole('button', { name: 'Add server' })] });
      await w.getByPlaceholder('/path/to/server or npx').fill(command);   // the real path goes in
      await w.getByRole('button', { name: 'Add server' }).click();
    });

    await test.step('fsm09-22-fortiagent-server-ready', async () => {
      // Listed under Configured with its name and command: FortiAgent shows no status until a chat starts it.
      const row = servers.first();
      await row.waitFor({ timeout: 30_000 });
      // The name gives the ID the skill requires: a second "Fabric Studio" would be fabric-studio-2.
      const ids = ours().map((s) => s.id);
      if (ids.join() !== 'fabric-studio') throw new Error(`the Fabric Studio servers are ${ids.join(', ') || 'none'}, not fabric-studio`);
      log('server listed under Configured, ID fabric-studio');
      await capture.shot(w, 'fsm09-22-fortiagent-server-ready', { highlight: [row], showAs });
    });

    await test.step('fsm09-25-fortiagent-import-skill', async () => {
      await w.getByRole('button', { name: 'Close' }).click();
      await w.getByRole('link', { name: 'Skills' }).click();
      await w.getByRole('button', { name: 'Check and update now' }).waitFor();
      // A rerun starts without the skill, as a student does: delete the one an earlier run imported.
      if (await w.getByRole('button', { name: `Show details for ${NAME}` }).count()) {
        log(`deleting the "${NAME}" skill an earlier run imported`);
        const total = Number((await w.getByText(/of \d+ skills/).innerText()).match(/of (\d+)/)![1]);
        await w.getByRole('button', { name: `Show details for ${NAME}` }).click();
        await w.getByRole('button', { name: `Actions for ${NAME}` }).click();
        await w.getByRole('menuitem', { name: 'Delete' }).click();
        await w.getByRole('alertdialog', { name: `Delete ${NAME}?` }).getByRole('button', { name: 'Delete' }).click();
        // Done when the count drops: the row goes first, and an import before then is deleted with it.
        await w.getByText(`${total - 1} of ${total - 1} skills`).waitFor({ timeout: 30_000 });
      }
      await w.getByRole('button', { name: /^Import/ }).click();
      await w.getByRole('menuitem', { name: 'Import from SKILL.md' }).click();
      const dialog = w.getByRole('dialog').filter({ hasText: 'Import skill' }).last();   // nested in the Skills dialog
      await dialog.getByText('Auto-load').waitFor();
      log('import form filled from SKILL.md');
      await capture.shot(w, 'fsm09-25-fortiagent-import-skill', { highlight: [dialog.getByText('Auto-load'), dialog.getByRole('button', { name: 'Import' })] });
      await dialog.getByRole('button', { name: 'Import' }).click();
      await dialog.waitFor({ state: 'detached', timeout: 30_000 });
    });

    await test.step('fsm09-26-fortiagent-skill-listed', async () => {
      // After an import FortiAgent shows the Changelog entry ("Applied"); the skill itself is on Installed.
      await w.getByRole('tab', { name: 'Changelog', selected: true }).waitFor({ timeout: 30_000 });
      await w.getByRole('tab', { name: 'Installed' }).click();
      const row = w.getByRole('button', { name: `Show details for ${NAME}` });
      await row.waitFor({ timeout: 30_000 });
      // Its requirement (the fabric-studio server) is met: the row carries no warning.
      if (await row.getByText('Requirements not met').count()) throw new Error('the skill says Requirements not met');
      log('skill listed, requirements met');
      await capture.shot(w, 'fsm09-26-fortiagent-skill-listed', { highlight: [row] });
    });

    await test.step('ask about the pod', async () => {
      await w.getByRole('button', { name: 'Close' }).click();
      await w.getByRole('button', { name: /New chat/ }).click();
      const box = w.getByRole('textbox').first();
      await box.click();
      await box.fill(QUESTION);
      const send = w.getByRole('button', { name: 'Send' });
      await send.click();
      await send.waitFor({ state: 'detached', timeout: 30_000 });
      log('asked; answering (Send became Stop)');
      // Done when Send is back; an approval card on the way is answered the way the page says.
      const card = w.getByText('Allow FortiAgent to run this action?');
      for (;;) {
        const next = await Promise.race([
          send.waitFor({ timeout: 8 * 60_000 }).then(() => 'done' as const),
          card.first().waitFor({ timeout: 8 * 60_000 }).then(() => 'approve' as const),
        ]);
        if (next === 'done') break;
        log('FortiAgent asks to run a Fabric Studio tool');
        await w.getByText("Always · this server's reads").first().click();
        await w.getByRole('button', { name: /Submit/ }).first().click();
        await card.first().waitFor({ state: 'detached', timeout: 30_000 });
      }
      log('answer done');
    });

    await test.step('fsm09-24-fortiagent-answer', async () => {
      const said = await w.evaluate(() => document.body.innerText);
      const answer = said.slice(said.lastIndexOf(QUESTION) + QUESTION.length);
      if (!/fabric|pod|running/i.test(answer)) throw new Error('FortiAgent did not answer about the pod');
      // The operator's own chats are not the student's: fold the Recents list.
      const recents = w.getByRole('button', { name: /^Recents \d/i });
      if ((await recents.getAttribute('aria-expanded')) === 'true') await recents.click();
      // An app-update banner is about the operator's install, not this step.
      const banner = w.locator('div', { hasText: /is ready to install/ }).filter({ has: w.getByRole('button', { name: 'Restart' }) }).last();
      if (await banner.count()) {
        await banner.getByRole('button').filter({ hasNotText: 'Restart' }).last().click();
        await banner.waitFor({ state: 'detached' });
      }
      // Lab addresses read as documentation addresses (RFC 5737), and the host label the server derives from the
      // pod's address reads as the pod's name, so the answer stays readable instead of blacked out.
      const label = POD.split('.').slice(-2).join('-');
      await w.evaluate(([label, pod]) => {
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const seen = new Map<string, string>();
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          n.textContent = n.textContent!.replaceAll(pod, 'fabric-studio.example.com').replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, (ip) => {
            if (!seen.has(ip)) seen.set(ip, `192.0.2.${seen.size + 10}`);
            return seen.get(ip)!;
          }).replaceAll(label, 'mypod');
        }
      }, [label, POD]);
      await capture.shot(w, 'fsm09-24-fortiagent-answer', {
        showAs: { ...showAs, [POD]: 'fabric-studio.example.com' }, scrubSkip: ['date-or-time'] });
    });
  } finally {
    rmSync(registry, { force: true });
    if (hadRegistry) renameSync(backup, registry);
    if (!hadPodItem) security(['delete-generic-password', ...podItem]);   // the student pod's password, if this run added it
    log(`restored the operator's registry${hadPodItem ? '' : ' and removed the test pod\'s keychain entry'}`);
    rmSync(root, { recursive: true, force: true });
  }
});
