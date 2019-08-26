module.exports = {
  env: {
    es6: true,
    node: true
  },
  extends: 'eslint:recommended',
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 8
  },
  "overrides": [
   {
    "files": ["*interFormConditionals.js"],
     "rules": {
        "no-new-func": "warn"
     }
   }],
  rules: {
    'accessor-pairs': 'error',
    'array-bracket-spacing': 'warn',
    'array-callback-return': 'warn',
    'arrow-body-style': 'warn',
    'arrow-parens': 'off',
    'arrow-spacing': [
      'error',
      {
        after: true,
        before: true
      }
    ],
    'block-scoped-var': 'warn',
    'block-spacing': 'error',
    'brace-style': 'off',
    'callback-return': 'warn',
    camelcase: 'warn',
    'capitalized-comments': 'off',
    'class-methods-use-this': 'warn',
    'comma-dangle': 'off',
    'comma-spacing': 'off',
    'comma-style': ['error', 'last'],
    complexity: 'warn',
    'computed-property-spacing': 'error',
    'consistent-return': 'warn',
    'consistent-this': 'warn',
    curly: 'off',
    'default-case': 'error',
    'dot-location': 'off',
    'dot-notation': 'warn',
    'eol-last': 'off',
    eqeqeq: 'warn',
    'func-call-spacing': 'error',
    'func-name-matching': 'error',
    'func-names': 'warn',
    'func-style': 'warn',
    'generator-star-spacing': 'off',
    'global-require': 'off',
    'guard-for-in': 'warn',
    'handle-callback-err': 'warn',
    'id-blacklist': 'error',
    'id-length': 'off',
    'id-match': 'error',
    indent: 'off',
    'init-declarations': 'off',
    'jsx-quotes': 'error',
    'key-spacing': 'error',
    'keyword-spacing': [
      'error',
      {
        after: true,
        before: true
      }
    ],
    'line-comment-position': 'warn',
    'linebreak-style': ['error', 'unix'],
    'lines-around-comment': 'off',
    'lines-around-directive': 'off',
    'max-depth': 'error',
    'max-len': 'off',
    'max-lines': 'warn',
    'max-nested-callbacks': 'error',
    'max-params': 'warn',
    'max-statements': 'off',
    'max-statements-per-line': 'off',
    'multiline-ternary': 'warn',
    'new-cap': 'warn',
    'new-parens': 'error',
    'newline-after-var': 'off',
    'newline-before-return': 'off',
    'newline-per-chained-call': 'warn',
    'no-alert': 'error',
    'no-array-constructor': 'error',
    'no-await-in-loop': 'warn',
    'no-bitwise': 'error',
    'no-caller': 'error',
    'no-case-declarations': 'warn',
    'no-catch-shadow': 'warn',
    'no-cond-assign': 'warn',
    'no-confusing-arrow': 'warn',
    'no-console': 'warn',
    'no-constant-condition': 'warn',
    'no-continue': 'warn',
    'no-debugger': 'warn',
    'no-div-regex': 'error',
    'no-duplicate-imports': 'error',
    'no-else-return': 'warn',
    'no-ex-assign': 'off',
    'no-empty': [
      'warn',
      {
        allowEmptyCatch: false
      }
    ],
    'no-empty-block': 'warn',
    'no-empty-function': 'off',
    'no-eq-null': 'warn',
    'no-eval': 'error',
    'no-extend-native': 'error',
    'no-extra-bind': 'error',
    'no-extra-label': 'error',
    'no-extra-parens': 'warn',
    'no-extra-semi': 'warn',
    'no-floating-decimal': 'error',
    'no-implicit-coercion': 'warn',
    'no-implicit-globals': 'error',
    'no-implied-eval': 'error',
    'no-inline-comments': 'off',
    'no-invalid-this': 'warn',
    'no-iterator': 'error',
    'no-label-var': 'error',
    'no-labels': 'error',
    'no-lone-blocks': 'error',
    'no-lonely-if': 'error',
    'no-loop-func': 'error',
    'no-magic-numbers': 'off',
    'no-mixed-operators': 'warn',
    'no-mixed-requires': 'error',
    'no-multi-assign': 'warn',
    'no-multi-spaces': 'error',
    'no-multi-str': 'error',
    'no-multiple-empty-lines': 'error',
    'no-native-reassign': 'error',
    'no-negated-condition': 'warn',
    'no-negated-in-lhs': 'error',
    'no-nested-ternary': 'error',
    'no-new': 'error',
    'no-new-func': 'error',
    'no-new-object': 'error',
    'no-new-require': 'error',
    'no-new-wrappers': 'error',
    'no-octal-escape': 'error',
    'no-param-reassign': 'warn',
    'no-path-concat': 'error',
    'no-process-env': 'off',
    'no-process-exit': 'off',
    'no-proto': 'error',
    'no-prototype-builtins': 'error',
    'no-redeclare': 'warn',
    'no-restricted-globals': 'error',
    'no-restricted-imports': 'error',
    'no-restricted-modules': 'error',
    'no-restricted-properties': 'error',
    'no-restricted-syntax': 'error',
    'no-return-assign': 'warn',
    'no-return-await': 'warn',
    'no-script-url': 'error',
    'no-self-compare': 'error',
    'no-sequences': 'error',
    'no-shadow': 'warn',
    'no-shadow-restricted-names': 'error',
    'no-spaced-func': 'error',
    'no-sync': 'off',
    'no-tabs': 'error',
    'no-template-curly-in-string': 'warn',
    'no-ternary': 'off',
    'no-throw-literal': 'error',
    'no-trailing-spaces': 'warn',
    'no-undef-init': 'warn',
    'no-undefined': 'warn',
    'no-underscore-dangle': 'off',
    'no-unmodified-loop-condition': 'error',
    'no-unneeded-ternary': 'warn',
    'no-unused-expressions': 'off',
    'no-unused-vars': 'warn',
    'no-use-before-define': 'off',
    'no-useless-call': 'error',
    'no-useless-computed-key': 'error',
    'no-useless-concat': 'error',
    'no-useless-constructor': 'error',
    'no-useless-escape': 'warn',
    'no-useless-rename': 'error',
    'no-useless-return': 'warn',
    'no-var': 'warn',
    'no-void': 'off',
    'no-warning-comments': 'warn',
    'no-whitespace-before-property': 'error',
    'no-with': 'error',
    'object-curly-newline': 'off',
    'object-curly-spacing': ['error', 'always'],
    'object-property-newline': 'warn',
    'object-shorthand': 'warn',
    'one-var': 'off',
    'one-var-declaration-per-line': 'warn',
    'operator-assignment': 'error',
    'operator-linebreak': 'warn',
    'padded-blocks': 'off',
    'prefer-const': 'warn',
    'prefer-destructuring': 'warn',
    'prefer-numeric-literals': 'error',
    'prefer-promise-reject-errors': 'error',
    'prefer-reflect': 'warn',
    'prefer-rest-params': 'warn',
    'prefer-spread': 'error',
    'prefer-template': 'off',
    'quote-props': 'off',
    quotes: 'off',
    radix: 'warn',
    'require-await': 'warn',
    'require-jsdoc': 'off',
    'require-yield': 'off',
    'rest-spread-spacing': ['error', 'never'],
    semi: 'off',
    'semi-spacing': 'error',
    'sort-imports': 'error',
    'sort-keys': 'off',
    'sort-vars': 'off',
    'space-before-blocks': 'error',
    'space-before-function-paren': 'off',
    'space-in-parens': ['error', 'never'],
    'space-infix-ops': 'off',
    'space-unary-ops': 'error',
    'spaced-comment': 'off',
    strict: 'warn',
    'symbol-description': 'error',
    'template-curly-spacing': ['error', 'never'],
    'unicode-bom': ['error', 'never'],
    'valid-jsdoc': 'warn',
    'vars-on-top': 'warn',
    'wrap-iife': 'warn',
    'wrap-regex': 'warn',
    'yield-star-spacing': 'error',
    yoda: ['error', 'never']
  }
}
