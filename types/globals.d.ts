// Globals of the Bedrock script engine that are not in the ES library.
declare const console: {
	log(...data: unknown[]): void;
	warn(...data: unknown[]): void;
	error(...data: unknown[]): void;
};
