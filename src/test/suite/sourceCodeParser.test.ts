// Copyright Kani Contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT
import * as assert from 'assert';

import { SourceCodeParser, loadParser } from '../../ui/sourceCodeParser';
import {
	kaniConcreteTestsMetaData,
	rustFileWithUnitTestsOnly,
} from '../test-programs/concretePlaybackTests';
import {
	kaniConcreteTestsMetaData,
	rustFileWithUnitTestsOnly,
} from '../test-programs/concretePlaybackTests';
import {
	attributeMetadataUnsupported,
	boleroProofs,
	findHarnessesResultBolero,
	findHarnessesResultKani,
	fullProgramSource,
	harnessMetadata,
	kaniProofs,
	kaniProofsUnsupported,
	rustFileWithoutProof,
} from '../test-programs/sampleRustString';

const listofHarnesses: Set<string> = new Set<string>([
	'insert_test',
	'insert_test_2',
	'random_name',
	'function_abc',
	'function_xyz',
]);

suite('test source code parsing', () => {
	// Parse for kani::proof helper function
	test('Test if proofs exist in file', async () => {
		assert.strictEqual(await SourceCodeParser.checkFileForProofs(fullProgramSource), true);
		assert.strictEqual(await SourceCodeParser.checkFileForProofs(rustFileWithoutProof), false);
	});

	test('Test if all kani harnesses are detected', async () => {
		const parser = await loadParser();
		const tree = parser.parse(kaniProofs);
		assert.deepStrictEqual(
			SourceCodeParser.findHarnesses(tree.rootNode.namedChildren),
			findHarnessesResultKani,
		);
	});

	test('Test if all Bolero harnesses are detected', async () => {
		const parser = await loadParser();
		const tree = parser.parse(boleroProofs);
		assert.deepStrictEqual(
			SourceCodeParser.searchParseTreeForFunctions(tree.rootNode),
			findHarnessesResultBolero,
		);
	});

	test('Test if all attributes are detected', async () => {
		assert.deepStrictEqual(
			await SourceCodeParser.getAttributeFromRustFile(kaniProofsUnsupported),
			attributeMetadataUnsupported,
		);
	});

	test('Test if final metadata map is structured right', async () => {
		assert.deepStrictEqual(
			await SourceCodeParser.getAttributeFromRustFile(fullProgramSource),
			harnessMetadata,
		);
	});

	test('Test if concrete playback unit tests are picked up and placed at the right location', async () => {
		assert.deepStrictEqual(
			await SourceCodeParser.extractKaniTestMetadata(rustFileWithUnitTestsOnly),
			kaniConcreteTestsMetaData,
		);
	});
});
