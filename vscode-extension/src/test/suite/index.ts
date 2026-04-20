import Mocha from 'mocha';
import * as path from 'path';

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 30_000, // scanning can take a few seconds
  });

  mocha.addFile(path.join(__dirname, 'extension.test.js'));

  return new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      failures > 0
        ? reject(new Error(`${failures} test(s) failed`))
        : resolve();
    });
  });
}
