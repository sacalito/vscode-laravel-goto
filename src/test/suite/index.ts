import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';
import * as fs from 'fs';
import * as vscode from 'vscode';

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true
	});

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise(async (c, e) => {
		let filePattern = '**/**.test.js';

		if (process.env.TEST_FILE) {
			const prevousFilename = process.env.EXTENSION_PATH + '/.vscode-test/.prevous';
			let lineNumber = '';
			if (process.env.TEST_FILE.endsWith('test.ts')) {
				filePattern = process.env.TEST_FILE;
				if (process.env.TEST_FILE_LINE) {
					lineNumber = process.env.TEST_FILE_LINE;
				}

				fs.writeFile(prevousFilename, filePattern + ':' + lineNumber, err => null);
			} else {
				if (fs.existsSync(prevousFilename) ) {
					const content = fs.readFileSync(prevousFilename, 'utf8').split(':');
					filePattern = content[0];
					lineNumber = content[1];
				}
			}

			const testCase = await getTestCase(filePattern, +lineNumber);
			if (testCase) {
				mocha.grep(testCase);
			}
			filePattern = filePattern.replace('src/test/', 'out/test');
			filePattern = filePattern.replace('.ts', '.js');
			filePattern = filePattern.replace(testsRoot, '');
		}

		glob(filePattern, { cwd: testsRoot }, (err, files) => {
			if (err) {
				return e(err);
			}

			// Add files to the test suite
			files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

			try {
				// Run the mocha test
				mocha.run(failures => {
					if (failures > 0) {
						e(new Error(`${failures} tests failed.`));
					} else {
						c();
					}
				});
			} catch (err) {
				e(err);
			}
		});
	});
}

async function getTestCase(filename: string, lineNumber: number) : Promise<string> {
	const document = await vscode.workspace.openTextDocument(filename);
	while (lineNumber > 0) {
		const lineText = document.lineAt(lineNumber).text;
		const match = lineText.match(/test\(\s*['"`]([^'"`]+)/);
		if (match) {
			return match[1];
		}
		--lineNumber;
	}

	return '';
}
