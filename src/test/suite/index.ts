// Copyright Kani Contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT
import * as path from 'path';

// eslint-disable-next-line import/no-named-as-default
import glob from 'glob';
import Mocha from 'mocha';

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true,
	});

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((resolve, reject) => {
		glob('**/**.test.js', { cwd: testsRoot }, (err: any, files: any[]) => {
			if (err) {
				return reject(err);
			}

			// Add files to the test suite
			files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

			try {
				// Run the mocha test
				mocha.run((failures) => {
					if (failures > 0) {
						reject(new Error(`${failures} tests failed.`));
					} else {
						resolve();
					}
				});
			} catch (err) {
				console.error(err);
				reject(err);
			}
		});
	});
}
