import * as vscode from 'vscode';
import { IOpenAllArgs } from './IOpenAllArgs';
import { locationRange } from './Locator';

export async function newWindow(content: vscode.ExtensionContext, args: IOpenAllArgs) {
	if (0 === args.files.length) {
		return;
	}
	// store all language files
	content.globalState.update('open_all', args);

	// open a new window
	const uri = vscode.Uri.file(args.files[0]);
    await vscode.commands.executeCommand("vscode.openFolder", uri, {
		forceNewWindow: true,
	});
}

export async function openAllfiles(content: vscode.ExtensionContext) {
	// a new window should be focused
	if (!vscode.window.state.focused) {
		return;
	}

	// first lanaguage file should be loaded
	if (!vscode.window.activeTextEditor) {
		return;
	}

	const args = content.globalState.get('open_all') as IOpenAllArgs;
	content.globalState.update('open_all', []);
	if (args && 0 === args.files?.length) {
		return;
	}

	// if the opened file is not the first language file, return
	const fsPath = vscode.window.activeTextEditor.document.uri.fsPath;
	if (fsPath !== args.files[0]) {
		return;
	}
	locate(args.location);

	// open all other language files
	for (let index = 1; index < args.files.length; index++) {
		const uri = vscode.Uri.file(args.files[index]);
		const doc = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
		locate(args.location);
	}

	// set layout by total number of language files
	const size = 1 / args.files.length;
	const groups:Array<Object> = [];
	groups.fill({ size: size } ,0 , args.files.length - 1);
	vscode.commands.executeCommand("vscode.setEditorLayout", {
		orientation: 0,
		groups: groups,
	});
}

function locate(location: string) {
	if (!location) {
		return;
	}

	const editor = vscode.window.activeTextEditor as vscode.TextEditor;
	const range = locationRange(editor.document, location);
	if (range) {
		editor.selection = new vscode.Selection(range.start, range.end);
		editor.revealRange(range);
	}
}

