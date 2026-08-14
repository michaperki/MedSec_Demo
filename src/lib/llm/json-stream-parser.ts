/**
 * Incrementally extracts complete top-level array elements from a growing
 * JSON text shaped like `{"someKey": [ {...}, {...}, ... ]}` — used to yield
 * each concern from the concerns-stage model output as soon as its object
 * closes, instead of waiting for the full response.
 *
 * Tracks bracket depth character-by-character, skipping content inside
 * string literals (respecting `\"` escapes) so braces/brackets inside
 * evidence text don't confuse the scanner. An object closing brace marks a
 * complete top-level array element when, immediately after popping it, the
 * stack is exactly [outer object, the array] — i.e. depth 2. This works
 * regardless of the array's key name, since our schemas only ever have one
 * top-level array field.
 */
export function createJsonArrayElementParser<T>(validate: (value: unknown) => T | undefined) {
  let buffer = "";
  let consumedUpTo = 0;
  const stack: { char: "{" | "["; start: number }[] = [];
  let inString = false;
  let escaped = false;

  function feed(chunk: string): T[] {
    buffer += chunk;
    const results: T[] = [];

    for (let i = consumedUpTo; i < buffer.length; i++) {
      const ch = buffer[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "{" || ch === "[") {
        stack.push({ char: ch, start: i });
        continue;
      }

      if (ch === "}" || ch === "]") {
        const opened = stack.pop();
        if (!opened) continue; // malformed/defensive — ignore a stray closer

        const closesTopLevelArrayElement =
          ch === "}" && opened.char === "{" && stack.length === 2 && stack[1].char === "[";
        if (closesTopLevelArrayElement) {
          const text = buffer.slice(opened.start, i + 1);
          const parsed = tryParseJson(text);
          const validated = parsed !== undefined ? validate(parsed) : undefined;
          if (validated !== undefined) results.push(validated);
        }
      }
    }

    consumedUpTo = buffer.length;
    return results;
  }

  return { feed };
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
