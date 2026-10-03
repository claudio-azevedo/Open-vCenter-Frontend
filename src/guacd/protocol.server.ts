/**
 * Guacamole protocol codec. Server-only - used by the guacd tunnel
 * (`tunnel.server.ts`), never by client code.
 *
 * An instruction is a list of elements, each `LENGTH.VALUE`, separated by
 * `,` and terminated by `;` - e.g. `6.select,3.rdp;`. LENGTH counts Unicode
 * code points (what guacd counts), not bytes and not UTF-16 units, so
 * `string.length` is the wrong measure for anything outside the BMP.
 */

const DOT = 0x2e; // .
const COMMA = 0x2c; // ,
const SEMICOLON = 0x3b; // ;

/** Longest length prefix accepted (guacd's own limit is far below 10^9). */
const MAX_LENGTH_DIGITS = 9;

/** Encodes one instruction, `opcode` first. */
export function encodeInstruction(...elements: string[]): string {
  return (
    elements.map((e) => `${codePointLength(e)}.${e}`).join(",") + ";"
  );
}

function codePointLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/**
 * Decodes a run of complete instructions (as returned by
 * `InstructionSplitter.push`) into their elements, opcode first.
 */
export function decodeInstructions(bytes: Uint8Array): string[][] {
  const chars = Array.from(new TextDecoder().decode(bytes));
  const instructions: string[][] = [];
  let elements: string[] = [];
  let i = 0;
  while (i < chars.length) {
    const dot = chars.indexOf(".", i);
    if (dot === -1) throw new ProtocolError("Element without a length");
    const length = Number(chars.slice(i, dot).join(""));
    if (!Number.isInteger(length) || length < 0)
      throw new ProtocolError("Invalid element length");
    const end = dot + 1 + length;
    elements.push(chars.slice(dot + 1, end).join(""));
    const terminator = chars[end];
    if (terminator === ";") {
      instructions.push(elements);
      elements = [];
    } else if (terminator !== ",") {
      throw new ProtocolError("Invalid terminator");
    }
    i = end + 1;
  }
  if (elements.length > 0) throw new ProtocolError("Incomplete instruction");
  return instructions;
}

export class ProtocolError extends Error {}

const enum State {
  Length,
  Value,
}

/**
 * Splits a raw guacd byte stream into whole instructions. `push()` takes any
 * chunk boundary the socket produced and returns the bytes of every
 * instruction it completed, as one contiguous buffer (empty when none); the
 * partial tail is kept for the next push. Works on UTF-8 bytes directly: a
 * code point is one lead byte (anything but `10xxxxxx`) plus its
 * continuation bytes, so VALUE never needs decoding.
 */
export class InstructionSplitter {
  private pending: Buffer = Buffer.alloc(0);
  /** Scan position in `pending`. */
  private pos = 0;
  /** End of the last complete instruction in `pending`. */
  private complete = 0;
  private state = State.Length;
  private lengthDigits = "";
  /** Code points still to consume in the current VALUE. */
  private remaining = 0;

  push(chunk: Buffer): Buffer {
    this.pending =
      this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);

    const buf = this.pending;
    while (this.pos < buf.length) {
      const b = buf[this.pos];
      if (this.state === State.Length) {
        if (b === DOT) {
          if (this.lengthDigits === "")
            throw new ProtocolError("Element without a length");
          this.remaining = Number(this.lengthDigits);
          this.lengthDigits = "";
          this.state = State.Value;
        } else if (b >= 0x30 && b <= 0x39) {
          this.lengthDigits += String.fromCharCode(b);
          if (this.lengthDigits.length > MAX_LENGTH_DIGITS)
            throw new ProtocolError("Element length too long");
        } else {
          throw new ProtocolError("Invalid element length");
        }
        this.pos++;
        continue;
      }

      // State.Value: continuation bytes belong to the current code point
      if ((b & 0xc0) === 0x80 || this.remaining > 0) {
        if ((b & 0xc0) !== 0x80) this.remaining--;
        this.pos++;
        continue;
      }

      // VALUE consumed; this byte is the terminator
      if (b === SEMICOLON) this.complete = this.pos + 1;
      else if (b !== COMMA) throw new ProtocolError("Invalid terminator");
      this.state = State.Length;
      this.pos++;
    }

    if (this.complete === 0) return Buffer.alloc(0);
    const out = buf.subarray(0, this.complete);
    this.pending = buf.subarray(this.complete);
    this.pos -= this.complete;
    this.complete = 0;
    return out;
  }
}
