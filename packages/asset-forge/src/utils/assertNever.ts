/**
 * Exhaustive type check utility.
 * Use in switch default cases to ensure all union members are handled.
 *
 * @example
 * switch (action.type) {
 *   case "A": ...
 *   case "B": ...
 *   default: assertNever(action.type); // compile error if union has unhandled members
 * }
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}
