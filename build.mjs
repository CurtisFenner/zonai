import * as fs from "fs";

fs.mkdirSync("dependencies/logic-solver", { recursive: true });
fs.copyFileSync("node_modules/logic-solver/LICENSE", "dependencies/logic-solver/LICENSE");

fs.mkdirSync("dependencies/underscore", { recursive: true });
for (const entry of ["underscore-esm.js", "underscore-esm.js.map", "LICENSE"]) {
	fs.copyFileSync("node_modules/underscore/" + entry, "dependencies/underscore/" + entry);
}
