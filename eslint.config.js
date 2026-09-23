import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
const browserGlobals = { console:'readonly', window:'readonly', document:'readonly', navigator:'readonly', localStorage:'readonly', confirm:'readonly', alert:'readonly', FileReader:'readonly', Blob:'readonly', URL:'readonly', caches:'readonly', self:'readonly', fetch:'readonly' };
export default ts.config({ignores:['dist/**','node_modules/**','artifacts/**']}, js.configs.recommended, ...ts.configs.recommended, {files:['**/*.{ts,tsx}'],languageOptions:{globals:browserGlobals},plugins:{'react-hooks':hooks},rules:hooks.configs.recommended.rules}, {files:['scripts/*.mjs','public/*.js'],languageOptions:{globals:{...browserGlobals, process:'readonly', Buffer:'readonly'}}});
