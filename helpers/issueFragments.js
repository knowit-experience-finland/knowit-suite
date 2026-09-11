import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const fragmentDirectory = path.resolve('test-results/issue-fragments');

export const writeIssueFragment = async (name, data) => {
  await mkdir(fragmentDirectory, { recursive: true });
  await writeFile(
    path.join(fragmentDirectory, `${randomUUID()}.json`),
    `${JSON.stringify({ name, data })}\n`
  );
};

export const readIssueFragments = async () => {
  let files;
  try {
    files = await readdir(fragmentDirectory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  return Promise.all(
    files
      .filter((file) => file.endsWith('.json'))
      .map(async (file) =>
        JSON.parse(await readFile(path.join(fragmentDirectory, file), 'utf8'))
      )
  );
};
