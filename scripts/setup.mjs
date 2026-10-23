import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, copyFile, chmod, rm, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const releases = {
  'darwin-arm64': [
    ['pandoc', 'https://github.com/jgm/pandoc/releases/download/3.12.1/pandoc-3.12.1-arm64-macOS.zip', 'c2146cf33a583f3ac93eccddf1bb662371d5cfcce1aad1c87ad860cca1435d46', 'pandoc-3.12.1-arm64/bin/pandoc'],
    ['tectonic', 'https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.17.0/tectonic-0.17.0-aarch64-apple-darwin.tar.gz', 'a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667', 'tectonic'],
  ],
  'linux-x64': [
    ['pandoc', 'https://github.com/jgm/pandoc/releases/download/3.12.1/pandoc-3.12.1-linux-amd64.tar.gz', 'd0c90410e90204c9ca83b8539fac5c7aed01fd537207e4585849f8abc5df20b8', 'pandoc-3.12.1/bin/pandoc'],
    ['tectonic', 'https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.17.0/tectonic-0.17.0-x86_64-unknown-linux-musl.tar.gz', '8533d07f9ccbd7a65824b9e0459041bca34af1eb33daba48f59215593753a3b7', 'tectonic'],
  ],
};

// Only pinned official release binaries; all tools stay in this ignored checkout.
// SHA-256 digests were checked against publishers' GitHub release metadata.
export async function setup() {
  const platform = process.platform + '-' + process.arch;
  const assets = releases[platform];
  if (!assets) throw new Error('Automatic setup supports macOS Apple Silicon and Linux x64. Install Pandoc 3.12.1 and Tectonic 0.17.0 and set PANDOC_PATH / TECTONIC_PATH on ' + platform + '.');
  const bin = resolve(root, '.tools/bin');
  await mkdir(bin, { recursive: true });
  for (const [name, url, checksum, member] of assets) {
    const destination = join(bin, name);
    const expected = name === 'pandoc' ? 'pandoc 3.12.1' : 'Tectonic 0.17.0';
    try {
      await access(destination);
      if (execFileSync(destination, ['--version'], { encoding: 'utf8' }).startsWith(expected)) {
        console.log(expected + ' already available.');
        continue;
      }
    } catch { /* Download a missing/incompatible local tool. */ }
    const temp = await mkdtemp(join(tmpdir(), 'resume-tool-'));
    try {
      console.log('Downloading ' + name + ' from its official pinned release…');
      const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      if (!response.ok) throw new Error(name + ' download failed: HTTP ' + response.status);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (createHash('sha256').update(bytes).digest('hex') !== checksum) throw new Error(name + ' checksum mismatch; installation stopped.');
      const archive = join(temp, url.endsWith('.zip') ? 'release.zip' : 'release.tar.gz');
      await writeFile(archive, bytes);
      execFileSync('tar', ['-xf', archive, '-C', temp], { stdio: 'pipe' });
      await copyFile(join(temp, member), destination);
      await chmod(destination, 0o755);
      const version = execFileSync(destination, ['--version'], { encoding: 'utf8' });
      if (!version.startsWith(expected)) throw new Error('Unexpected ' + name + ' version: ' + version.split('\n')[0]);
      console.log(expected + ' installed in .tools/bin.');
    } finally { await rm(temp, { recursive: true, force: true }); }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  setup().catch(error => { console.error(error.message); process.exitCode = 1; });
}
