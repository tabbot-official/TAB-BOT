// Structural gate for generated command files (security audit v7.2.4).
// The codegen wrapper embeds an AI-written body verbatim inside run(); a crafted
// body can close the wrapper early and inject object properties or top-level
// statements that EXECUTE AT IMPORT TIME (proven with a synthetic canary).
// Regex scans cannot see structure - this gate parses the built file with acorn
// and requires the exact wrapper shape:
//   [import { logFailure } ...] [export default { fixed literal props, async run }]
// run() must contain exactly: const __ctx = {...}; const __run = async (ctx) => {
// <body> }; await __run(__ctx);  Everything outside __run's block is fixed text;
// when the expected body string is known, its source slice must match exactly.
// Anything inside __run is invocation-time only and out of scope for this gate.
import * as acorn from 'acorn';

const FIXED_KEYS = ['name', 'aliases', 'category', 'description', 'usage', 'minArgs', 'run'];

function isLiteralish(node) {
  if (!node) return false;
  if (node.type === 'Literal') return true;
  if (node.type === 'TemplateLiteral') return node.expressions.length === 0;
  if (node.type === 'UnaryExpression' && (node.operator === '-' || node.operator === '+')) return isLiteralish(node.argument);
  if (node.type === 'ArrayExpression') return node.elements.every((e) => e && isLiteralish(e));
  return false;
}

function keyName(prop) {
  return prop.key && (prop.key.type === 'Identifier' ? prop.key.name : prop.key.type === 'Literal' ? String(prop.key.value) : null);
}

export function validateGeneratedSource(code, expectedBody) {
  const fail = (why) => ({ ok: false, why });
  let ast;
  try { ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' }); }
  catch (e) { return fail('the built file did not parse: ' + String(e.message || e).slice(0, 120)); }
  if (ast.body.length !== 2) return fail('top level must be exactly the logFailure import plus one default export (found ' + ast.body.length + ' statements)');
  const [imp, exp] = ast.body;
  if (imp.type !== 'ImportDeclaration' || imp.source.value !== '../utils/genregistry.js') return fail('first statement must be the fixed genregistry import');
  if (exp.type !== 'ExportDefaultDeclaration' || exp.declaration.type !== 'ObjectExpression') return fail('second statement must be the fixed default-export object');
  const obj = exp.declaration;
  if (obj.properties.some((p) => p.type !== 'Property' || p.computed)) return fail('the export object must contain only plain non-computed properties');
  const keys = obj.properties.map(keyName);
  if (JSON.stringify(keys) !== JSON.stringify(FIXED_KEYS)) return fail('export object keys must be exactly ' + FIXED_KEYS.join(',') + ' (found ' + keys.join(',') + ')');
  for (const p of obj.properties) {
    const k = keyName(p);
    if (k === 'run') continue;
    if (!isLiteralish(p.value)) return fail('property "' + k + '" must be a plain literal (no calls, initializers or references)');
  }
  const runProp = obj.properties.find((p) => keyName(p) === 'run');
  const runFn = runProp.value;
  if (runFn.type !== 'FunctionExpression' || !runFn.async || runFn.generator) return fail('run must be a plain async function');
  if (!runProp.method) return fail('run must use the fixed method shorthand');
  const stmts = runFn.body.body;
  if (stmts.length !== 3) return fail('run() must contain exactly the fixed 3 statements (__ctx, __run, await __run) - found ' + stmts.length);
  const [d1, d2, d3] = stmts;
  const isConst = (s, name) => s.type === 'VariableDeclaration' && s.kind === 'const' && s.declarations.length === 1 && s.declarations[0].id.type === 'Identifier' && s.declarations[0].id.name === name;
  if (!isConst(d1, '__ctx')) return fail('first statement in run() must be the fixed __ctx declaration');
  if (!isConst(d2, '__run')) return fail('second statement in run() must be the fixed __run declaration');
  const run2 = d2.declarations[0].init;
  if (!run2 || run2.type !== 'ArrowFunctionExpression' || !run2.async || run2.body.type !== 'BlockStatement') return fail('__run must be the fixed async arrow with a block body');
  if (d3.type !== 'ExpressionStatement' || d3.expression.type !== 'AwaitExpression') return fail('last statement in run() must be the fixed await __run(__ctx)');
  if (expectedBody != null) {
    const inner = code.slice(run2.body.start + 1, run2.body.end - 1);
    if (inner !== '\n' + expectedBody + '\n    ') return fail('the code inside __run does not match the approved body - the wrapper was escaped');
  }
  return { ok: true };
}

// Relaxed gate for registry-provenanced files that are NOT the exact wrapper
// shape (e.g. hand-published wrappers like remini2): the module may only
// DECLARE at import time - import statements plus one default-export object
// whose property values are literals or (possibly async) functions. Functions
// do not execute at import; any call/await/computed key/extra statement does.
export function validateGeneratedLoose(code) {
  const fail = (why) => ({ ok: false, why });
  let ast;
  try { ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' }); }
  catch (e) { return fail('the file did not parse: ' + String(e.message || e).slice(0, 120)); }
  let sawDefault = false;
  for (const stmt of ast.body) {
    if (stmt.type === 'ImportDeclaration') {
      // Side-effect and dependency imports EXECUTE at load. Allow only: node:
      // builtins, installed bare packages, known repo helpers. No other relative
      // or parent paths, no absolute paths, no file: URLs.
      const src = String(stmt.source && stmt.source.value || '');
      const okImport = src.startsWith('node:')
        || /^[a-z@][a-z0-9._\/-]*$/i.test(src) && !src.startsWith('.') && !src.startsWith('/')
        || src.startsWith('../utils/') || /^\.\/_[a-z0-9]+\.js$/i.test(src);
      if (!okImport) return fail('import from an unapproved source: ' + src.slice(0, 60));
      continue;
    }
    if (stmt.type !== 'ExportDefaultDeclaration') return fail('unexpected top-level statement: ' + stmt.type);
    if (sawDefault) return fail('more than one default export');
    sawDefault = true;
    const d = stmt.declaration;
    if (d.type !== 'ObjectExpression') return fail('default export must be an object literal');
    for (const p of d.properties) {
      if (p.type !== 'Property' || p.computed) return fail('export object must contain only plain non-computed properties');
      if (p.kind !== 'init') return fail('getters/setters run on access - only plain properties allowed ("' + keyName(p) + '")');
      const v = p.value;
      const okValue = isLiteralish(v) || v.type === 'FunctionExpression' || v.type === 'ArrowFunctionExpression';
      if (!okValue) return fail('property "' + keyName(p) + '" is neither a literal nor a function (' + v.type + ') - it could execute at import');
    }
  }
  return { ok: true };
}
