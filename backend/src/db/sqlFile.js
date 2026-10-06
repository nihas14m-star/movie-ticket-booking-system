/**
 * Minimal SQL script reader.
 *
 * The MySQL server has no idea what `DELIMITER` means — it is a client side
 * command that the mysql CLI and workbench implement. Our triggers and stored
 * procedure need it (their bodies contain semicolons), so instead of shelling
 * out to the mysql binary we implement the same behaviour here. That keeps
 * `npm run db:reset` dependency free on any platform.
 */

/**
 * Split a SQL script into individual statements.
 *
 * - honours `DELIMITER //` blocks (used by triggers / procedures)
 * - drops whole-line comments (`--` and `#`)
 * - keeps inline comments, they are valid inside a statement
 *
 * @param {string} sql raw script contents
 * @returns {string[]} statements ready to be executed one by one
 */
export function splitStatements(sql) {
  const statements = [];
  let delimiter = ';';
  let buffer = '';

  for (const line of sql.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('#')) continue;

    const delimiterCommand = /^DELIMITER\s+(\S+)\s*$/i.exec(trimmed);
    if (delimiterCommand) {
      delimiter = delimiterCommand[1];
      continue;
    }

    buffer += buffer ? `\n${line}` : line;

    const pending = buffer.trimEnd();
    if (pending.endsWith(delimiter)) {
      const statement = pending.slice(0, pending.length - delimiter.length).trim();
      if (statement) statements.push(statement);
      buffer = '';
    }
  }

  const tail = buffer.trim();
  if (tail) statements.push(tail);

  return statements;
}

/** Short, log friendly preview of a statement. */
export function describeStatement(statement) {
  return statement.replace(/\s+/g, ' ').slice(0, 84);
}
