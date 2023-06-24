const sampleText = await (await fetch("samples.txt")).text();

/**
 * @type {Array<{ title: string, content: string[], comments: string[], directives: string[]}>}
 */
const samples = [];
for (const line of sampleText.split("\n")) {
	if (line.startsWith("#")) {
		samples.push({
			title: line.substring(1).trim(),
			content: [],
			comments: [],
			directives: [],
		});
	} else if (line.startsWith("//")) {
		samples[samples.length - 1].comments.push(line.substring(2));
	} else if (line.match(/^[a-z: -]+$/)) {
		samples[samples.length - 1].directives.push(line);
	} else if (line.trim() !== "") {
		samples[samples.length - 1].content.push(line);
	}
}

/**
 * @type {T}
 * @param elements {T[]}
 * @param size {number}
 * @return {Generator<{in: T[], out: T[]}>}
 */
function* subsetsOfSize(elements, size) {
	if (size === 0) {
		yield { in: [], out: elements };
	} else if (size > elements.length) {
		return;
	}

	for (let i = 0; i < elements.length; i++) {
		for (const fromRest of subsetsOfSize(elements.slice(i + 1), size - 1)) {
			yield { in: [elements[i], ...fromRest.in], out: [...elements.slice(0, i), ...fromRest.out] };
		}
	}
}


/**
 * @type {T}
 * @param elements {T[]}
 * @param sizes {number[]}
 * @return {Generator<T[]>}
 */
function* partitionsIntoSizes(elements, sizes) {
	if (sizes.length === 1) {
		if (sizes[0] !== elements.length) {
			throw new Error("sizes total != elements.length");
		}
		return yield [elements];
	} else if (sizes.length === 0) {
		throw new Error("must provide at least one size");
	}

	for (const split of subsetsOfSize(elements, sizes[0])) {
		for (const remainder of partitionsIntoSizes(split.out, sizes.slice(1))) {
			yield [split.in, ...remainder];
		}
	}
}

const cipherLetterList = {};
function elCipherLetter(letter) {
	cipherLetterList[letter] = cipherLetterList[letter] || [];
	const e = el("span", letter, { "data-cipher": letter });
	cipherLetterList[letter].push(e);
	return e;
}

function renderZonaiSample(sample) {
	const box = document.createElement("div");
	box.className = "sample-box";
	const tableWrapper = document.createElement("div");
	tableWrapper.className = "table-wrapper";
	const label = document.createElement("div");
	label.textContent = sample.title;
	label.className = "label";
	box.appendChild(label);

	if (sample.directives.includes("counterclockwise")) {
		const ring = createTextRing(sample.content);
		tableWrapper.appendChild(ring);
	} else if (sample.directives.includes("clockwise")) {
		const ring = createTextRing(sample.content.map(x => x.split("").reverse().join("")));
		tableWrapper.appendChild(ring);
	} else {
		const table = createTextGridTable(sample.content);
		tableWrapper.appendChild(table);
		table.style.setProperty("--border-color", "transparent");
	}
	tableWrapper.className = "zonai";
	box.appendChild(tableWrapper);
	return box;
}

const container = document.getElementById("text-samples");
for (const sample of samples) {
	container.appendChild(renderZonaiSample(sample));
}

for (const match of document.getElementsByClassName("display-zonai")) {
	const title = match.getAttribute("data-display-zonai-title");
	const sample = samples.find(x => x.title === title);
	if (!sample) {
		throw new Error("did not find any sample with title `" + title + "`");
	}
	match.appendChild(renderZonaiSample(sample));
}

/**
 * @param lines {string[]}
 * @return {HTMLTableElement}
 */
function createTextGridTable(lines) {
	const table = document.createElement("table");
	for (const line of lines) {
		const tr = document.createElement("tr");
		for (const c of line) {
			tr.appendChild(el("td", elCipherLetter(c)));
		}
		table.appendChild(tr);
	}
	return table;
}

function readColumnsRightToLeft(lines) {
	let widest = Math.max(...lines.map(x => x.length));
	let columns = [];
	for (let c = widest - 1; c >= 0; c--) {
		let column = "";
		for (let r = 0; r < lines.length; r++) {
			if (lines[r][c]) {
				column += lines[r][c];
			}
		}
		columns.push(column);
	}
	return columns;
}

/**
 * @param line {string[]}
 */
function createTextRing(lines) {
	if (!Array.isArray(lines)) {
		throw new Error("expected string[]");
	}

	const characterSpaceEm = 2;
	const circumferenceEm = lines[0].length * characterSpaceEm;
	const radiusEm = circumferenceEm / (2 * Math.PI);
	const div = document.createElement("div");
	const canvasSize = 2 * radiusEm + (1 + 2 * lines.length) * characterSpaceEm;
	div.style.width = canvasSize.toFixed(2) + "em";
	div.style.height = canvasSize.toFixed(2) + "em";
	div.style.position = "relative";
	const center = document.createElement("div");
	center.className = "center";
	center.style.position = "absolute";
	center.style.textAlign = "center";
	div.appendChild(center);
	for (let row = 0; row < lines.length; row++) {
		const line = lines[row];
		let i = 0;
		for (const c of line) {
			const cell = elCipherLetter(c);
			cell.style.display = "inline-block";
			cell.style.position = "absolute";
			cell.style.textAlign = "center";
			cell.textContent = c;
			const angleDeg = (i / line.length) * 360;
			cell.className = "radial";
			cell.style.setProperty("--radial-angle", -angleDeg.toFixed(2) + "deg");
			cell.style.setProperty("--radial-radius", (radiusEm + (lines.length - row) * characterSpaceEm).toFixed(2) + "em");
			i++;
			center.appendChild(cell);
		}
	}
	return div;
}



////////////////////////////////////////////////////////////////////////////////

function el(tag, content = [], attributes = {}) {
	if (!Array.isArray(content)) {
		return el(tag, [content], attributes);
	}

	const e = document.createElement(tag);
	for (const c of content.flat(100)) {
		if (typeof c === "string") {
			e.appendChild(document.createTextNode(c));
		} else if (typeof c === "number" || typeof c === "boolean") {
			e.appendChild(document.createTextNode(String(c)));
		} else {
			if (!(c instanceof Node)) {
				console.error("attempting to append non node", c, "to", e);
			}
			e.appendChild(c);
		}
	}

	for (const [k, v] of Object.entries(attributes)) {
		if (typeof v === "function") {
			e.addEventListener(k, v);
		} else {
			e.setAttribute(k, v);
		}
	}
	for (const [p, v] of Object.entries(attributes.style || {})) {
		e.style.setProperty(p, v);
	}
	return e;
}

/**
 * @param ngrams {{entries: {ngram: string, count: number}[], total: number}}
 */
function renderUnigramTable(ngrams, style, heading = x => x) {
	const most = ngrams.entries[0].count;
	return el(
		"table",
		[
			el("tr", [el("th", "Letter"), el("th", "Relative frequency", { colspan: 2 })]),
			ngrams.entries.map(({ ngram, count }) =>
				el("tr", [
					el("th", heading(ngram), { class: "ngram" }),
					el("td", count.toFixed(0)),
					el("td",
						el(
							"span",
							[el("span", ["-"], { style: { visibility: "hidden" } }), (100 * count / ngrams.total).toFixed(0) + "%"],
							{
								style: {
									background: "black",
									width: (count / most * 100).toFixed(1) + "%",
									display: "inline-block",
									color: "white",
									"padding-top": "0.25em",
									"padding-bottom": "0.25em",
									overflow: "hidden",
								},
							},
						)
					),
				]),
			)
		],
		{
			style: {
				...style
			},
		},
	);
}

/**
 * @returns {HTMLTableElement}
 */
function tableTable(bigrams, letterOrder, makeTh = (text, side) => el("th", text)) {
	let max = Math.max(...Object.values(bigrams));
	const heading = el("tr",
		[el("th"), letterOrder.map(trailing => makeTh(trailing, "column"))]
	);
	const body = letterOrder.map(leading =>
		el("tr", [
			makeTh(leading, "row"),
			letterOrder.map(trailing => {
				const bigram = leading + trailing;
				const occurrences = bigrams[bigram] || 0;
				const percentage = [(occurrences * 100).toFixed(0), el("sup", "%", { style: { "vertical-align": "text-top" } })];
				return el(
					"td",
					[occurrences > 0 ? percentage : ""],
					{
						"data-table-max": max,
						"data-table-value": occurrences,
						"data-table-shade": occurrences / max,

						style: {
							"--table-shade": occurrences / max,
						},
					},
				);
			}),
		])
	);

	return el("table", [heading, body]);
}

/**
 * @param text {string}
 * @param n {number}
 * @returns { {frequency: Record<string, number>, entries: {ngram: string, count: number}[], total: number} }
 */
function ngrams(text, n) {
	let total = 0;
	const frequency = {};
	const dense = text.replace(/[^a-zA-Z|]/g, "");
	for (let i = 0; i + n < dense.length; i++) {
		const s = dense.substring(i, i + n);
		if (s.indexOf("|") >= 0) {
			continue;
		}
		frequency[s] = (frequency[s] || 0) + 1;
		total += 1;
	}
	return {
		frequency,
		total,
		entries: Object.entries(frequency)
			.map(([ngram, count]) => ({ ngram, count }))
			.sort((a, b) => b.count - a.count),
	};
}

/**
 * @param text {string}
 */
function makeBigramTable(text, makeTh) {
	const unigrams = ngrams(text, 1);
	const bigrams = ngrams(text, 2);

	const letterOrder = unigrams.entries.map(({ ngram }) => ngram);
	const relative = {};
	for (const leading of letterOrder) {
		for (const trailing of letterOrder) {
			const bigram = leading + trailing;
			const bigramFraction = (bigrams.frequency[bigram] || 0) / bigrams.total;
			relative[bigram] = bigramFraction;
		}
	}

	const flexy = tableTable(relative, letterOrder, makeTh);
	flexy.classList.add("bigrams", "heatmap", "square-cell-1-5");
	return flexy;
}

// Determine letter frequency
function sectionLetterFrequency() {
	const section = document.getElementById("letter-frequency");

	const zonaiCorpus = samples.map(sample => sample.content.join("")).join("");
	const zonaiUnigrams = ngrams(zonaiCorpus, 1);
	const japaneseUnigrams = ngrams(processedRomaji, 1);

	section.appendChild(
		el("p", `The samples included in this page include ${zonaiUnigrams.total} Zonai letters total.`)
	);

	const least = zonaiUnigrams.entries[zonaiUnigrams.entries.length - 1];
	const most = zonaiUnigrams.entries[0];

	section.appendChild(
		el("p", [
			"The letter with the least occurrences is ",
			el("span", least.ngram, { class: "zonai" }),
			", with ",
			least.count,
			" occurrences.",
		])
	);

	section.appendChild(
		el("p", [
			"The letter with the most occurrences is ",
			el("span", most.ngram, { class: "zonai" }),
			", with " + most.count + " occurrences.",
		])
	);

	const zonaiTable = renderUnigramTable(zonaiUnigrams, {
		"min-width": "10em",
		"flex-grow": "1",
		"flex-basis": "10em",
	}, elCipherLetter);
	zonaiTable.classList.add("zonai-ngram");

	const japaneseTable = renderUnigramTable(japaneseUnigrams, {
		"min-width": "10em",
		"flex-grow": "1",
		"flex-basis": "10em",
	});

	const sideBySide = el("div",
		[zonaiTable, japaneseTable],
		{
			style: {
				display: "flex",
				"flex-direction": "row",
				"flex-wrap": "wrap",
				"justify-content": "space-between",
				gap: "1em",
			},
		},
	);

	section.appendChild(sideBySide);
}

function zipMaps(a, b) {
	const out = {};
	for (const [k, v] of Object.entries(a)) {
		out[k] = { left: v };
	}
	for (const [k, v] of Object.entries(b)) {
		out[k] = out[k] || {};
		out[k].right = v;
	}
	return out;
}

function sum(seq) {
	let sum = 0;
	for (const v of seq) {
		sum += v;
	}
	return sum;
}

function sectionBigramFrequency() {
	const section = document.getElementById("bigram-frequency");

	let zonaiColumnized = [];
	for (const sample of samples) {
		if (sample.directives.length === 0) {
			const c = readColumnsRightToLeft(sample.content);
			zonaiColumnized.push({ title: sample.title, text: c });
		} else if (sample.directives.includes("counterclockwise")) {
			zonaiColumnized.push({ title: sample.title, text: sample.content });
		}
	}

	const zonaiTh = (text, side) => {
		const cell = elCipherLetter(text);
		return el("th", side === "row" ? [cell, " ◌"] : ["◌ ", cell], {
			class: "zonai",
			style: {
				"font-size": "65%",
			},
		});
	};
	const jTh = (text, side) => {
		return el("th", side === "row" ? text + " ◌" : "◌ " + text, {
			style: {
				"font-size": "75%",
			},
		});
	};

	const zonaiCorpus = zonaiColumnized.map(t => t.text.join("|")).join("|");
	const zonaiTable = makeBigramTable(zonaiCorpus, zonaiTh);
	const romajiTable = makeBigramTable(processedRomaji, jTh);

	const sideBySide = el("div",
		[zonaiTable, romajiTable],
		{
			style: {
				display: "flex",
				"flex-direction": "row",
				"flex-wrap": "wrap",
				"justify-content": "space-between",
				gap: "1em",
			},
		},
	);
	section.appendChild(sideBySide);

	if (false) {
		section.appendChild(el("br"));

		const japaneseStructure = makeBigramTable(
			processedRomaji
				.replace(/[aeiou]/g, "a") // 5/14
				.replace(/[ksmyrht]/g, "k") // 7/9
				.replace(/[w]/g, "w") // 1/2
				.replace(/[n]/g, "n"), // 1/1
			jTh
		);
		section.appendChild(japaneseStructure);

		const zonaiBigrams = ngrams(zonaiCorpus, 2);
		const romajiBigrams = ngrams(processedRomaji, 2);
		const romajiBigramCountMap = Object.fromEntries(romajiBigrams.entries.map(entry => [entry.ngram, entry.count]));

		let best = { error: Infinity, reduction: null };

		for (const [aPart, kPart, wPart, nPart] of partitionsIntoSizes("BCDHJLMNRSTUWY".split(""), [5, 7, 1, 1])) {
			const reduction = {};
			for (const [k, vs] of Object.entries({ a: aPart, k: kPart, w: wPart, n: nPart })) {
				for (const v of vs) {
					reduction[v] = k;
				}
			}

			const reducedBigrams = {};
			for (const entry of zonaiBigrams.entries) {
				const bigram = entry.ngram;
				const reducedBigram = reduction[bigram[0]] + reduction[bigram[1]];
				reducedBigrams[reducedBigram] = (reducedBigrams[reducedBigram] || 0) + 1;
			}

			const zipped = zipMaps(romajiBigramCountMap, reducedBigrams);
			let error = 0;
			for (const { left, right } of Object.values(zipped)) {
				const leftFraction = ((left || 0) + 1) / (romajiBigrams.total + 2);
				const rightFraction = ((right || 0) + 1) / (zonaiBigrams.total + 2);
				const different = leftFraction / rightFraction + rightFraction / leftFraction;
				error += different;
			}

			if (best.error > error) {
				best = { error, reduction };
			}
		}

		console.log(best);
		let reducedZonai = zonaiCorpus;
		for (const [k, v] of Object.entries(best.reduction)) {
			reducedZonai = reducedZonai.replace(new RegExp(k, "g"), v.toUpperCase());
		}
		console.log(reducedZonai.toUpperCase());

		const zonaiStructure = makeBigramTable(
			reducedZonai
		);
		section.appendChild(zonaiStructure);
	}

	function toLetterBox(s) {
		return el("span", s, {
			style: {
				width: "1.7em",
				"text-align": "center",
				display: "inline",
				"letter-spacing": "0.25em",
			},
		});
	}

	function toLetterBoxes(s) {
		const out = [];
		for (const c of s) {
			if ("A" <= c && c <= "Z") {
				out.push(toLetterBox(c));
			} else {
				out.push(c);
			}
		}
		return out;
	}

	container.appendChild(
		el("details", [
			el("summary", "Zonai corpus for ngrams"),
			el("p", "Below is the text, read as columns, right-to-left, for all of the samples."),
			el(
				"blockquote",
				zonaiColumnized.map((z, i) => [
					i === 0 ? [] : el("hr"),
					el(
						"p", [
						el("span", toLetterBoxes(z.text.join(" - ")), { class: "zonai" }),
						el("br"),
						el("small", z.title, { style: { opacity: 0.75 } }),
					]
					)
				]
				),
			)
		])
	);
}

let processedRomaji = "";

function simplifyRomaji(romaji) {
	return romaji
		.replace(/fu/g, "hu")
		.replace(/ch([aeuo])/g, "tiy$1")
		.replace(/(?:sh|j)([aeuo])/g, "siy$1")
		.replace(/shi/g, "si")
		.replace(/chi/g, "ti")
		.replace(/tsu/g, "tu")
		.replace(/d/g, "t")
		.replace(/[jz]/g, "s")
		.replace(/g/g, "k")
		.replace(/[pb]/g, "h")
		.replace(/([kshnmr])y/g, "$1iy")
		.replace(/([skth])\1/g, "tu$1")
		.replace(/([aeiou])\1/g, "$1");
}

async function processRomajiSample() {
	const romaji = document.getElementById("romaji-sample").textContent.trim();

	const processed = simplifyRomaji(romaji);

	const wikipedia = await (await fetch("wikipedia-romaji.txt")).text();
	const processedWikipedia = simplifyRomaji(wikipedia.normalize("NFKD").toLowerCase()
		.replace(/[^a-z]/g, ""))
		.replace(/[^aeiouksthrmnyw]/g, "");

	document.getElementById("romaji-sample-processed").textContent = processed;
	processedRomaji = processed + processedWikipedia;
}

function cipherSelectorBox(zonaiLetter) {
	const urlState = new URL(window.location.href);
	return el("label", [
		el("span", zonaiLetter, {
			class: "zonai",
			style: {
				display: "inline-block",
				"text-align": "center",
				width: "2em",
			},
		}),
		el("input", [], {
			maxlength: 1,
			value: urlState.searchParams.get(zonaiLetter) || "",
			input: (e) => {
				const setting = e.target.value.trim();
				for (const cell of cipherLetterList[zonaiLetter]) {
					if (setting) {
						cell.classList.remove("zonai");
						cell.classList.add("romaji");
						cell.textContent = setting;
					} else {
						cell.textContent = zonaiLetter;
						cell.classList.remove("romaji");
						cell.classList.add("zonai");
					}
				}

				const newURL = new URL(window.location.href);
				if (setting) {
					newURL.searchParams.set(zonaiLetter, setting);
				} else {
					newURL.searchParams.delete(zonaiLetter);
				}
				window.history.replaceState({}, "", newURL.toString());
			},
			style: { padding: "0.7em", width: "1.5em", "text-align": "center" },
		})
	]);
}

function sectionTryACipher() {
	const boxes = "NDSBLHMRJCWUYT".split("").map(cipherSelectorBox);

	const table = el(
		"table",
		[
			el("tr", boxes.slice(0, 7).map(x => el("td", x))),
			el("tr", boxes.slice(7, 14).map(x => el("td", x))),
		],
	);

	const section = document.getElementById("try-a-cipher");
	section.appendChild(table);
}

await processRomajiSample();
sectionLetterFrequency();
sectionBigramFrequency();
sectionTryACipher();
