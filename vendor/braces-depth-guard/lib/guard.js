'use strict';

// Private, fixed ceiling. Unknown options such as maxDepth remain ignored.
const MAX_DEPTH = 100;
const depthError = Type => {
  const error = new Type('Braces nesting exceeds the internal depth limit (100)');
  error.code = 'ERR_BRACES_DEPTH';
  return error;
};

exports.parse = depth => {
  if (depth > MAX_DEPTH) throw depthError(SyntaxError);
};

// Count only the original walk's visited child-bearing nodes. Leaves are free;
// only its initial synthetic root is exempt, including in private fallbacks.
exports.depth = (node, ancestorDepth, initial) => {
  if (!Number.isInteger(ancestorDepth) || ancestorDepth < 0 || ancestorDepth > MAX_DEPTH || typeof initial !== 'boolean') {
    throw depthError(RangeError);
  }
  const depth = ancestorDepth + (node.nodes && !(initial && node.type === 'root') ? 1 : 0);
  if (depth > MAX_DEPTH) throw depthError(RangeError);
  return depth;
};

// Each expansion upward path has its own prefix identity set and counter.
// A repeat observed within the bounded prefix is an invalid AST; a longer
// unseen path reaches the depth ceiling without an unbounded cycle search.
exports.parent = (node, seen, depth) => {
  if (seen.has(node)) {
    const error = new RangeError('Braces AST contains a parent cycle');
    error.code = 'ERR_BRACES_INVALID_AST';
    throw error;
  }
  if (depth > MAX_DEPTH) throw depthError(RangeError);
  seen.add(node);
};
