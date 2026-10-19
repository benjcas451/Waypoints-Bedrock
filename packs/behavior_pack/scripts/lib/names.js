// @ts-check

export const MAX_NAME_LENGTH = 32;

/**
 * Removes formatting codes and control characters, trims and limits the length.
 *
 * @param {string} input
 */
export function sanitizeName(input) {
	let name = "";
	for (const char of input) {
		const code = char.codePointAt(0) ?? 0;
		if (char !== "§" && code >= 0x20 && !(code >= 0x7f && code <= 0x9f)) {
			name += char;
		}
	}
	name = name.trim().replace(/\s+/g, " ");
	const chars = [...name];
	return chars.length > MAX_NAME_LENGTH ? chars.slice(0, MAX_NAME_LENGTH).join("").trim() : name;
}
