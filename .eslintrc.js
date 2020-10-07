module.exports = {
  'env': {
    'browser': true,
    'commonjs': true,
    'es6': true,
  },
  'extends': [
    'eslint:recommended',
  ],
  'globals': {
    'Atomics': 'readonly',
    'SharedArrayBuffer': 'readonly',
    'process': 'readonly',
    'web3': 'readonly',
    'artifacts': 'readonly',
    'contract': 'readonly',
    'describe': 'readonly',
    'it': 'readonly',
    'before': 'readonly',
    'beforeEach': 'readonly',
    'after': 'readonly',
    'afterEach': 'readonly',
    'assert': 'readonly',
    'usePlugin': 'readonly'
  },
  'parserOptions': {
    'ecmaVersion': 2018,
    'sourceType': 'module',
  },
  'rules': {
    'indent': [
      'error',
      2,
    ],
    'linebreak-style': [
      'error',
      'unix',
    ],
    'no-trailing-spaces': [
      'error'
    ],
    'quotes': [
      'error',
      'single',
    ],
    'semi': [
      'error',
      'always',
    ],
    'no-var': [
      'error',
    ],
    'comma-dangle': [
      'error',
      {
        'objects': 'always-multiline',
        'arrays': 'always-multiline',
      },
    ],
    'object-curly-spacing': [
      'error',
      'always',
    ],
    'key-spacing': [
      'error',
      {
        'afterColon': true,
        'mode': 'minimum',
      },
    ],
    // override
    'vue/max-attributes-per-line': 0,
  },
};
