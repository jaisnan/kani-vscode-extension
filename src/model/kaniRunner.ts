// Copyright Kani Contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import * as vscode from 'vscode';

import { KaniResponse } from '../constants';
import {
	CommandArgs,
	getRootDir,
	getTimeBasedUniqueId,
	showErrorWithReportIssueButton,
	splitCommand,
} from '../utils';
import { checkOutputForError, responseParserInterface } from './kaniOutputParser';
import { promisify } from 'util';
import glob from 'glob';

const globAsync = promisify(glob);

// Store the output from process into a object with this type
interface CommandOutput {
	stdout: string;
	stderr: string;
	errorCode: any;
	error: any;
}

/**
 * Get the system resolved path to the cargo-kani command. Tries to get the installed version first and if that fails, picks up the dev version automatically.
 *
 * @param binaryName - Full sanitized command created by kaniCommandCreate module
 * @returns the path for the binary cargo-kani (either the installed binary or the development one)
 */
export async function getBinaryAbsolutePath(binaryName: string): Promise<string> {
	try {
	  // Try using 'which' command
	  const output = await getKaniPath(binaryName);
	  if (output) {
		return output.trim();
	  }
	} catch (error) {
	  // Ignore 'which' command error
	}

	try {
	  // Try using glob pattern to find the binary
	  const matches = await globAsync(`kani/scripts/cargo-kani`, { absolute: true });
	  if (matches.length > 0) {
		return matches[0];
	  }
	} catch (error) {
	  // Ignore glob error
	}

	// Throw an error if both 'which' and glob failed
	throw new Error(`Failed to find binary: ${binaryName}`);
}

// Displays the version of kani being used to the user as a status bar icon
export async function getKaniVersion(): Promise<void> {
	try {
		const pathKani = await getBinaryAbsolutePath('cargo-kani');
		console.log(pathKani);

		execFile(pathKani, ['--version'], (error, stdout, stderr) => {
			if (error) {
			  console.error(`Error: ${error}`);
			  return;
			}

			if (stdout) {
				// Split the stdout by whitespace to separate words
				const words = stdout.split(/\s+/);
				// Find the word that contains the version number
				const versionWord = words.find((word) => /\d+(\.\d+){1,}/.test(word));
				const versionMessage = `Kani ${versionWord} being used to verify`;

				vscode.window.setStatusBarMessage(versionMessage, 5000);
				return;
			}

			console.log(`stdout: ${stdout}`);
			console.error(`stderr: ${stderr}`);
		  });
	  } catch (error) {
		// Ignore command error
		return;
	  }
	  return;
}

/**
 * Get the system resolved path to the cargo-kani command
 *
 * @param kaniCommand - Full sanitized command created by kaniCommandCreate module
 * @returns the path for the binary cargo-kani (either the installed binary or the development one)
 */
export function getKaniPath(kaniCommand: string): Promise<string> {
	const options = {
		shell: false,
	};

	return new Promise((resolve, reject) => {
		execFile('which', [kaniCommand], options, (error, stdout, stderr) => {
			if (error) {
				console.error(`execFile error: ${error}`);
				reject(new Error(`Kani executable was not found in PATH.`));
				return;
			}
			if (stderr) {
				console.error(`stderr: ${stderr}`);
				return;
			}
			const cargoKaniPath = stdout.trim();
			console.log(`Cargo is located at: ${cargoKaniPath}`);

			// Check if cargo path is valid
			try {
				const stats = fs.statSync(cargoKaniPath);
				if (stats.isFile() && path.basename(cargoKaniPath) === kaniCommand) {
					resolve(path.resolve(cargoKaniPath));
				} else {
					reject(new Error(`Invalid kani path: ${cargoKaniPath}`));
				}
			} catch (err) {
				reject(err);
			}
		});
	});
}

/**
 * Function that runs `cargo kani [args]`
 *
 * @param kaniCommand - Full sanitized command created by kaniCommandCreate module
 * @returns the path for the binary cargo-kani (either the installed binary or the development one)
 */
export async function runKaniCommand(
	harnessCommand: string,
	cargoKaniMode: boolean = false,
): Promise<any> {
	// Get the full resolved path for the root directory of the crate
	const directory = path.resolve(getRootDir());
	const commandSplit: CommandArgs = splitCommand(harnessCommand);

	// Get cargo command and args for the command to be executed
	const command = commandSplit.commandPath;
	const args = commandSplit.args;

	if (command == 'cargo' || command == 'cargo kani') {
		const kaniBinaryPath = await getBinaryAbsolutePath('cargo-kani');
		console.log(`The path to kani is - ${kaniBinaryPath}`);
		const options = {
			shell: false,
			cwd: directory,
		};

		try {
			const executionResult = await executeKaniProcess(
				kaniBinaryPath,
				args,
				options,
				cargoKaniMode,
			);
			return executionResult;
		} catch (error: any) {
			showErrorWithReportIssueButton(`Could not run Kani on harness: ${error}`);
			return new Error(`Kani executable was unable to detect or run harness.`);
		}
	} else {
		return false;
	}
}

/**
 * Function that returns the diff message to be displayed
 *
 * @param command - Full sanitized command created by kaniCommandCreate module
 * @returns the path for the binary cargo-kani (either the installed binary or the development one)
 */
export async function createFailedDiffMessage(command: string): Promise<KaniResponse> {
	// Root dir of the crate and the command and args to be executed
	const directory = path.resolve(getRootDir());
	const commandSplit: CommandArgs = splitCommand(command);

	// Get the args for the kani command to run
	const args = commandSplit.args;

	// Check the command running and execute that with the full path and safe options
	if (commandSplit.commandPath == 'cargo' || commandSplit.commandPath == 'cargo kani') {
		const kaniBinaryPath = await getBinaryAbsolutePath('cargo-kani');
		console.log(`The path to kani for executing is - ${kaniBinaryPath}`);
		const options = {
			shell: false,
			cwd: directory,
		};

		return new Promise((resolve, _reject) => {
			execFile(kaniBinaryPath, args, options, (_error, stdout, _stderr) => {
				if (stdout) {
					const responseObject: KaniResponse = responseParserInterface(stdout);
					resolve(responseObject);
				}
			});
		});
	} else {
		// Error Case
		showErrorWithReportIssueButton('Kani executable crashed while parsing error message');
		return new Promise((resolve, _reject) => {
			resolve({ failedProperty: 'error', failedMessages: 'error' });
		});
	}
}

/**
 * Function that executes the sanitized command
 *
 * @param kaniBinaryPath - Full sanitized command created by kaniCommandCreate module
 * @param args - full arg list to provide to the subprocess
 * @param options - options to pass to the cargo-kani command i.e shell, working directory
 * @param cargoKaniMode - Whether it's running in `cargo-kani` or not
 * @returns the path for the binary cargo-kani (either the installed binary or the development one)
 */
async function executeKaniProcess(
	kaniBinaryPath: string,
	args: string[],
	options: any,
	cargoKaniMode: boolean,
): Promise<any> {
	return new Promise((resolve, reject) => {
		execFile(kaniBinaryPath, args, options, async (error, stdout, stderr) => {
			// Store the output of the process into an object
			const output: CommandOutput = {
				stdout: stdout.toString(),
				stderr: stderr.toString(),
				errorCode: error?.code,
				error: error,
			};

			// Send output to diagnostics and return if there is an error in stdout
			// this means that the command could not be executed.
			if (checkOutputForError(output.stdout, output.stderr)) {
				sendErrorToChannel(output, args);
				reject(new Error(error?.message));
			}

			// Send output to output channel specific to the harness
			sendOutputToChannel(output, args);

			if (stderr && !stdout) {
				if (cargoKaniMode) {
					// stderr is an output stream that happens when there are no problems executing the kani command but kani itself throws an error due to (most likely)
					// a rustc error or an unhandled kani error
					showErrorWithReportIssueButton(
						`Kani Executable Crashed due to an underlying rustc error ->\n ${stderr}`,
					);
					reject();
				} else {
					resolve(2);
				}
			} else if (error) {
				if (error.code === 1) {
					resolve(1);
				} else {
					// Error is an object created by nodejs created when nodejs cannot execute the command
					showErrorWithReportIssueButton(
						`Kani Extension could not execute command due to error ->\n ${error}`,
					);
					reject();
				}
			} else {
				// verification successful
				resolve(0);
			}
		});
	});
}

// Creates a unique name and adds a channel for the harness output to Output Logs
function sendErrorToChannel(output: CommandOutput, args: string[]): void {
	const harnessName = args.at(1)!;

	// Create unique ID for the output channel
	const timestamp = getTimeBasedUniqueId();
	const channel = vscode.window.createOutputChannel(`Error: ${harnessName} - ${timestamp}`);

	// Append stdout to the output channel
	channel.appendLine(output.error?.message);
	// Open channel but don't change focus
	channel.show(true);
}

// Creates a unique name and adds a channel for the harness output to Output Logs
function sendOutputToChannel(output: CommandOutput, args: string[]): void {
	const harnessName = args.at(1)!;

	// Create unique ID for the output channel
	const timestamp = getTimeBasedUniqueId();
	const channel = vscode.window.createOutputChannel(`Output (Kani): ${harnessName} - ${timestamp}`);

	// Append stdout to the output channel
	channel.appendLine(output.stdout);
	// Open channel but don't change focus
	channel.show(true);
}
