/**
 * A language server that starts, then sits on every request.
 *
 * It answers initialize and publishes empty diagnostics for each file
 * it is shown, so the backend thinks it ready, and then never answers
 * a type-intelligence request at all: the shape of a real server busy
 * on a large program. Every cancellation it is sent is written, one
 * line per method, to the file named by its first argument, so a test
 * can tell a caller that stopped waiting from one that also told the
 * server to stop working.
 */

import { appendFileSync } from "node:fs";
import {
	createMessageConnection,
	StreamMessageReader,
	StreamMessageWriter,
} from "vscode-languageserver-protocol/node";

const log = process.argv[2];

const connection = createMessageConnection(
	new StreamMessageReader(process.stdin),
	new StreamMessageWriter(process.stdout),
);

connection.onRequest("initialize", () => ({ capabilities: {} }));

connection.onNotification("textDocument/didOpen", (params) => {
	connection.sendNotification("textDocument/publishDiagnostics", {
		uri: params.textDocument.uri,
		diagnostics: [],
	});
});

const SILENT = [
	"textDocument/definition",
	"textDocument/references",
	"textDocument/hover",
	"textDocument/documentSymbol",
	"textDocument/rename",
	"textDocument/codeAction",
	"workspace/symbol",
];

for (const method of SILENT) {
	connection.onRequest(
		method,
		(_params, token) =>
			new Promise(() => {
				token.onCancellationRequested(() => {
					if (log) appendFileSync(log, `${method}\n`);
				});
			}),
	);
}

connection.listen();
