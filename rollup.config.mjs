import commonjs from '@rollup/plugin-commonjs';

export default {
	input: 'node_modules/logic-solver/logic-solver.js',
	output: {
		entryFileNames: '[name].mjs',
		dir: 'dependencies/logic-solver',
		format: 'esm'
	},
	plugins: [commonjs()]
};
