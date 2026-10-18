'use strict';

const utils = require('./utils');
const guard = require('./guard');

// The final two arguments carry private expansion context, not a public option.
module.exports = (ast, options = {}, ancestorDepth = 0, initial = true) => {
  const stringify = (node, parent = {}, depth = 0, isInitial = false) => {
    depth = guard.depth(node, depth, isInitial);
    const invalidBlock = options.escapeInvalid && utils.isInvalidBrace(parent);
    const invalidNode = node.invalid === true && options.escapeInvalid === true;
    let output = '';

    if (node.value) {
      if ((invalidBlock || invalidNode) && utils.isOpenOrClose(node)) {
        return '\\' + node.value;
      }
      return node.value;
    }

    if (node.value) {
      return node.value;
    }

    if (node.nodes) {
      for (const child of node.nodes) {
        output += stringify(child, undefined, depth);
      }
    }
    return output;
  };

  return stringify(ast, undefined, ancestorDepth, initial);
};

