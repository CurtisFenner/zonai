import logic from "./dependencies/logic-solver/logic-solver.mjs";

/**
 * @return {Promise<ZonaiSample[]>}
 */
async function loadZonaiSamples() {
	const sampleText = await (await fetch("samples.txt")).text();
	/**
	 * @type { { title: string, grid: string[], attributes: string[] }[] }
	 */
	const samples = [];
	for (const line of sampleText.split("\n")) {
		if (line.startsWith("#")) {
			samples.push({
				title: line.substring(1).trim(),
				grid: [],
				attributes: [],
			});
		} else if (line.startsWith("//")) {
			// samples[samples.length - 1].comments.push(line.substring(2));
		} else if (line.match(/^[a-z: -]+$/)) {
			samples[samples.length - 1].attributes.push(line);
		} else if (line.trim() !== "") {
			samples[samples.length - 1].grid.push(line);
		}
	}
	return samples.map(p => new ZonaiSample(p));
}

/**
 * @typedef {{alphabet: string}} Lang
 */
const ZonaiLang = { alphabet: "BCDHJLMNRSTUWY" };
const RomajiLang = { alphabet: "aeioukstnhmyrw" };

class ZonaiSample {
	/**
	 * @param data { { title: string, grid: string[], attributes: string[] } }
	 */
	constructor(data) {
		const width = Math.max(...data.grid.map(x => x.length));
		this.title = data.title;
		this.grid = data.grid.map(x => x + " ".repeat(width - x.length));
		this.attributes = data.attributes;
		this.rejected = false;
	}

	isCircular() {
		return this.attributes.includes("ring") || this.attributes.includes("rings");
	}

	/**
	 * @param {ReadingDirection} direction 
	 * @return string[]
	 */
	readColumns(direction) {
		const width = this.grid[0].length;
		const out = [];
		const delta = direction === "left-to-right" ? +1 : -1;
		const start = direction === "left-to-right" ? 0 : width - 1;
		for (let column = start; 0 <= column && column < direction.length; column += delta) {
			let str = "";
			for (let row = 0; row < this.grid.length; row++) {
				str += this.grid[row][column];
			}
			out.push(str);
		}
		return out;
	}

	/**
	 * @param direction {"left-to-right" | "right-to-left"}
	 * @return string[]
	 */
	readRows(direction) {
		if (direction === "left-to-right") {
			return this.grid;
		} else if (direction === "right-to-left") {
			return this.grid.map(x => x.split("").reverse().join(""));
		}
		throw new Error("bad direction `" + JSON.stringify(direction) + "`");
	}

	/**
	 * @param direction {"left-to-right" | "right-to-left"}
	 * @param repeat {number}
	 * @return string[]
	 */
	readRingsAsRows(direction, repeat) {
		return this.readRows(direction).map(x => x.repeat(repeat));
	}
}

/**
 * @typedef {"left-to-right" | "right-to-left"} ReadingDirection
 * @typedef { { defaultRings: ReadingDirection, defaultColumns: ReadingDirection }} Reading
 */

/**
 * @param {ZonaiSample[]} samples
 * @param {Reading} reading
 * @param {boolean} simplification
 * @return {{line: string, sources: string[]}[]}
 */
function readZonaiCorpus(samples, reading, simplification, p = { minLength: 1 }) {
	const sentences = [];
	for (const sample of samples.filter(x => !x.rejected)) {
		let x;
		if (sample.isCircular()) {
			if (sample.attributes.includes("read-in-columns")) {
				x = sample.readColumns(reading.defaultColumns);
			} else {
				if (sample.attributes.includes("read-clockwise")) {
					x = sample.readRingsAsRows("left-to-right", 1);
				} else if (sample.attributes.includes("read-counterclockwise")) {
					x = sample.readRingsAsRows("right-to-left", 1);
				} else {
					x = sample.readRingsAsRows(reading.defaultRings, 1);
				}
			}
		} else {
			x = sample.readColumns(reading.defaultColumns);
		}


		sentences.push(
			...x
				.filter(line => line.replace(/[^a-zA-Z]+/g, "").length >= p.minLength)
				.map(line => ({
					line,
					source: sample.title,
				}))
		);
	}

	if (simplification) {
		const deduplicated = reduceDuplication(
			sentences.map(x => ({
				...x,
				line: x.line.replace(/\A+/g, " ").trim(),
			}))
		);
		return Object.entries(deduplicated).map(([k, v]) => ({
			line: k,
			sources: v,
		}));
	}
	return sentences.map(s => ({ line: s.line, sources: [s.source] }));
}

/**
 * @template T
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
 * @param {Lang} lang
 * @param {string[]} samples
 * @param {number} n 
 * @returns {{total: number, frequencies: Record<string, number>}[]}
 */
function frequencyByPosition(samples, lang, n) {
	const out = [];
	for (let i = 0; i < n; i++) {
		/**
		 * @type { {total: number, frequencies: Record<string, number>} }
		 */
		const row = { total: 0, frequencies: {} };
		for (const letter of lang.alphabet) {
			row.frequencies[letter] = 0;
		}
		out.push(row);
	}
	for (const sample of samples) {
		for (let i = 0; i < n && i < sample.length; i++) {
			const letter = sample[i];
			if (letter in out[i].frequencies) {
				out[i].frequencies[letter] += 1;
				out[i].total += 1;
			}
		}
	}
	return out;
}

/**
 * @type {Record<string, HTMLElement[]>}
 */
const cipherLetterList = {};

/**
 * @param {string} letter
 * @returns { NestedArrays<ElArg> | ElArg }
 */
function elCipherLetter(letter) {
	if (typeof letter !== "string") {
		throw new Error("expected string");
	} else if (letter.length === 0) {
		return [];
	} else if (letter.length > 1) {
		return letter.split("").map(elCipherLetter);
	}

	const zonaiText = el("span", letter, {
		class: "center-label zonai",
		style: {
			"font-weight": "bold",
		},
	});
	const decipheredText =
		el("span", "", {
			class: "center-label",
		});
	const better = el("span", [zonaiText, decipheredText], {
		style: {
			position: "relative",
			display: "inline-block",
			width: "1.9em",
			height: "1.9em",
		},
		"data-cipher": letter,
	});

	cipherLetterList[letter] = cipherLetterList[letter] || [];
	cipherLetterList[letter].push(decipheredText);

	return better;
}

/**
 * @param {ZonaiSample} sample 
 * @param {Reading} reading
 */
function renderZonaiSample(sample, reading) {
	const asPresented = document.createElement("div");
	asPresented.className = "table-wrapper";

	const brokenTitle = sample.title.split("/").map((x, i) => i === 0 ? [x] : [el("br"), x]);
	const label = el("div", brokenTitle, { class: "label" });

	if (sample.isCircular()) {
		const ring = createTextRing(sample.grid);
		asPresented.appendChild(ring);
	} else {
		const table = createTextGridTable(sample.grid);
		asPresented.appendChild(table);
		table.style.setProperty("--border-color", "transparent");
	}

	const linearized = readZonaiCorpus([sample], reading, false).map(x => x.line);
	const asLinear = el("div", linearized.map(x => x.trim()).filter(x => x).map(x => el("div", elCipherLetter(x))));

	asPresented.classList.add("mode-presented");
	asLinear.classList.add("mode-linear");

	return el("div", [label, asPresented, el("hr"), asLinear], { class: "sample-box" });
}

/**
 * @param {ZonaiSample[]} zonaiSamples
 * @param {Reading} reading 
 */
async function sectionTextSamples(zonaiSamples, reading) {
	const linear = readZonaiCorpus(zonaiSamples, reading, false).map(x => x.line);
	const unigrams = ngrams(linear.join("|"), 1, { alphabet: ZonaiLang.alphabet, add: 0 });
	const uniform = uniformDistribution(ZonaiLang.alphabet);

	/**
	 * @param {ZonaiSample} sample 
	 */
	function completeRenderSample(sample) {
		const div = renderZonaiSample(sample, reading);

		const sampleLinear = readZonaiCorpus([sample], reading, false).map(x => x.line).join("|");
		const relative = relativeUnigramLikelihood(sampleLinear, uniform, unigrams);

		if (relative > 10) {
			div.classList.add("rejected");
			div.appendChild(el("hr"));
			div.appendChild(
				el("div",
					el("small", [
						"The letter distribution is ",
						relative.toFixed(1),
						"x more likely to be uniform than Zonai",
					])));
			sample.rejected = true;
		} else if (relative < 0.0) {
			div.classList.add("exemplar");
			div.appendChild(el("hr"));
			div.appendChild(el("small", [
				"The letter distribution is ",
				(1 / relative).toFixed(1),
				"x more likely to be Zonai than uniform",
			]));
		}

		return { div, sampleLinear };
	}

	const container = document.getElementById("text-samples");
	if (!container) throw new Error("text-samples does not exist");
	/**
	 * @type {{div: HTMLElement, sampleLinear: string}[]}
	 */
	const renderedSamples = [];
	for (const sample of zonaiSamples) {
		const rendered = completeRenderSample(sample);
		renderedSamples.push(rendered);
		container.appendChild(rendered.div);
	}

	for (const match of document.getElementsByClassName("display-zonai")) {
		const title = match.getAttribute("data-display-zonai-title");
		const sample = zonaiSamples.find(x => x.title === title);
		if (!sample) {
			throw new Error("did not find any sample with title `" + title + "`");
		}
		match.appendChild(completeRenderSample(sample).div);
	}

	const searchInput = document.getElementById("filter-input");
	if (!(searchInput instanceof HTMLInputElement)) {
		throw new Error("filter-input does not exist");
	}
	searchInput.oninput = () => {
		const terms = searchInput.value.trim().toUpperCase().replace(/[^A-Z]+/g, " ").split(/\s+/g);
		for (const sample of renderedSamples) {
			const match = terms.every(term => sample.sampleLinear.includes(term));
			if (match) {
				sample.div.classList.remove("filter-hide");
			} else {
				sample.div.classList.add("filter-hide");
			}
		}
	};
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

/**
 * @param lines {string[]}
 */
function createTextRing(lines) {
	if (!Array.isArray(lines)) {
		throw new Error("expected string[]");
	}

	const characterSpaceEm = 2;
	const width = Math.max(...lines.map(x => x.length));
	const circumferenceEm = width * characterSpaceEm;
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
		// Each line is presented CLOCKWISE.
		const line = lines[row];
		let i = 0;
		for (const c of line) {
			const angleDeg = (i / width) * 360;
			const wrapper = el("div", elCipherLetter(c), {
				class: "radial",
				style: {
					display: "inline-block",
					position: "absolute",
					textAlign: "center",
					"--radial-angle": angleDeg.toFixed(2) + "deg",
					"--radial-radius": (radiusEm + (lines.length - row) * characterSpaceEm).toFixed(2) + "em",
				},
			});
			i++;
			center.appendChild(wrapper);
		}
	}
	return div;
}

/**
 * @param {Iterable<string>} ngrams
 * @returns {{entries: {ngram: string, count: number}[], total: number}}
 */
function uniformDistribution(ngrams) {
	/**
	 * @type {{entries: {ngram: string, count: number}[], total: number}}
	 */
	const out = { total: 0, entries: [] };
	for (const ngram of ngrams) {
		out.entries.push({ ngram, count: 1 });
		out.total += 1;
	}
	return out;
}

/**
 * @param {string} sample
 * @param {{entries: {ngram: string, count: number}[], total: number}} unigrams
 */
function unigramLogLikelihood(sample, unigrams) {
	let sum = 0;
	for (const c of sample) {
		const entry = unigrams.entries.find(x => x.ngram === c);
		if (entry) {
			const p = entry.count / unigrams.total;
			sum += Math.log(p);
		}
	}
	return sum;
}

/**
 * @param {string} sample
 * @param {{entries: {ngram: string, count: number}[], total: number}} numerator
 * @param {{entries: {ngram: string, count: number}[], total: number}} denominator
 */
function relativeUnigramLikelihood(sample, numerator, denominator) {
	const numeratorLikelihood = unigramLogLikelihood(sample, numerator);
	const denominatorLikelihood = unigramLogLikelihood(sample, denominator);
	const difference = numeratorLikelihood - denominatorLikelihood;
	return Math.exp(difference);
}

////////////////////////////////////////////////////////////////////////////////

document.createElement

/**
 * @typedef {string | number | HTMLElement} ElArg 
 */

/**
 * @template T
 * @typedef {(T | NestedArrays<T>)[]} NestedArrays
 */

/**
 * @template {keyof HTMLElementTagNameMap} K 
 * @param tag {K}
 * @param content {NestedArrays<ElArg> | ElArg}
 * @param attributes {object}
 * @return {HTMLElementTagNameMap[K]}
 */
function el(tag, content = [], attributes = {}) {
	if (typeof content === "string" || typeof content === "number" || content instanceof HTMLElement) {
		return el(tag, [content], attributes);
	}

	const e = document.createElement(tag);
	for (const c of content.flat(5)) {
		if (typeof c === "string") {
			e.appendChild(document.createTextNode(c));
		} else if (typeof c === "number" || typeof c === "boolean") {
			e.appendChild(document.createTextNode(String(c)));
		} else {
			if (!(c instanceof Node)) {
				console.error("attempting to append non-node", c, "to", e);
				throw new Error("attepmtin to append non-node");
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
	for (const [p, v] of Object.entries({ style: {}, ...attributes }.style || {})) {
		e.style.setProperty(p, v);
	}
	return e;
}

/**
 * @param ngrams {{entries: {ngram: string, count: number}[], total: number}}
 * @param {any} style
 * @param {(x: string) => ElArg | NestedArrays<ElArg>} [heading=x => x] 
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
 * @param {Record<string, number>} bigrams
 * @param {string[]} letterOrder
 * @param {(text: string, side: "row" | "column") => ElArg} [makeTh=(text, side) => el("th", text)] 
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
 * @template T
 * @param {T[][]} lists
 * @returns {Generator<T[]>}
 */
function* cartesianProduct(...lists) {
	if (lists.length === 0) {
		yield [];
		return;
	}
	const [head, ...rest] = lists;
	for (const element of head) {
		for (const restProduct of cartesianProduct(...rest)) {
			yield [element, ...restProduct];
		}
	}
}

/**
 * @param text {string}
 * @param n {number}
 * @param {{alphabet: string, add: number}} smoothing
 * @returns { {frequency: Record<string, number>, entries: {ngram: string, count: number}[], total: number} }
 */
function ngrams(text, n, smoothing) {
	let total = 0;

	/**
	 * @type {Record<string, number>}
	*/
	const frequency = {};
	if (smoothing.add) {
		const alphabets = [];
		for (let i = 0; i < n; i++) {
			alphabets.push(smoothing.alphabet.split(""));
		}
		for (const smoothNgram of cartesianProduct(...alphabets)) {
			frequency[smoothNgram.join("")] = smoothing.add;
			total += smoothing.add;
		}
	}

	const dense = text;
	for (let i = 0; i + n <= dense.length; i++) {
		const s = dense.substring(i, i + n);
		if (smoothing.alphabet) {
			if (new RegExp("[^" + smoothing.alphabet + "]").test(s)) {
				continue;
			}
		} else {
			if (s.indexOf("|") >= 0) {
				continue;
			}
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
 * @param {(text: string, side: "row" | "column") => ElArg} makeTh 
 * @param {Lang} lang 
 */
function makeBigramTable(text, makeTh, lang) {
	const unigrams = ngrams(text, 1, { alphabet: lang.alphabet, add: 0 });
	const bigrams = ngrams(text, 2, { alphabet: lang.alphabet, add: 0 });

	const letterOrder = unigrams.entries.map(({ ngram }) => ngram);

	/**
	 * @type {Record<string, number>}
	 */
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
/**
 * @param {ZonaiSample[]} zonaiSamples 
 * @param {string} processedRomaji 
 */
function sectionLetterFrequency(zonaiSamples, processedRomaji) {
	const section = document.getElementById("letter-frequency");
	if (!section) {
		throw new Error("missing letter-frequency");
	}

	const zonaiCorpus = readZonaiCorpus(zonaiSamples, { defaultColumns: "right-to-left", defaultRings: "right-to-left" }, true)
		.map(x => x.line)
		.join("  ");
	const zonaiUnigrams = ngrams(zonaiCorpus, 1, { alphabet: ZonaiLang.alphabet, add: 0 });
	const japaneseUnigrams = ngrams(processedRomaji, 1, { alphabet: RomajiLang.alphabet, add: 0 });

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

/**
 * @param {Reading} reading
 * @param {ZonaiSample[]} zonaiSamples
 * @param {string} processedRomaji 
 */
function sectionBigramFrequency(zonaiSamples, reading, processedRomaji) {
	const section = document.getElementById("bigram-frequency");
	if (!section) throw new Error("missing bigram-frequency section");

	const zonaiCorpus = readZonaiCorpus(zonaiSamples, reading, true, { minLength: 3 });

	/**
	 * @param {string} text
	 * @param {unknown} side
	 */
	const zonaiTh = (text, side) => {
		const cell = elCipherLetter(text);
		return el("th", side === "row" ? [cell, " ◌"] : ["◌ ", cell], {
			style: {
				"font-size": "65%",
			},
		});
	};

	/**
	 * @param {string} text
	 * @param {unknown} side
	 */
	const jTh = (text, side) => {
		return el("th", side === "row" ? text + " ◌" : "◌ " + text, {
			style: {
				"font-size": "75%",
			},
		});
	};

	const zonaiTable = makeBigramTable(zonaiCorpus.map(x => x.line).join("|"), zonaiTh, ZonaiLang);
	const romajiTable = makeBigramTable(processedRomaji, jTh, RomajiLang);

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

	section.appendChild(el("br"));
	section.appendChild(
		el("details", [
			el("summary", "Zonai corpus for ngrams"),
			el("p", "Below is the text read as columns / around rings appropriately. Duplicates have been merged."),
			el(
				"blockquote",
				zonaiCorpus.map(line => {
					const trim = line.line.replace(/[^A-Z]+/g, " ").trim().replace(/[^A-Z]+/g, "-");
					return [
						el("p", elCipherLetter(trim), { style: { "margin-bottom": 0 } }),
						el(
							"ul",
							line.sources.map(source => el("li", source, { class: "inline" })),
							{ class: "label", style: { "margin-top": "0", "font-size": "1em" } },
						),
					];
				}),
			)
		], { "class": "section-box", style: { "text-align": "left" } })
	);
	section.appendChild(el("p"));
}

/**
 * @param {ZonaiSample[]} zonaiSamples
 * @param {Reading} reading
 * @param {string} processedRomaji 
 */
function sectionTrigramFrequency(zonaiSamples, reading, processedRomaji) {
	const section = document.getElementById("trigram-frequency");
	if (!section) {
		throw new Error("missing trigram-frequency section");
	}

	const zonaiCorpus = readZonaiCorpus(zonaiSamples, reading, true);
	const zonaiTrigrams = ngrams(zonaiCorpus.map(x => x.line).join("|"), 3, { alphabet: ZonaiLang.alphabet, add: 0 });
	const japaneseTrigrams = ngrams(processedRomaji, 3, { alphabet: RomajiLang.alphabet, add: 0 });

	zonaiTrigrams.entries.splice(15);
	const zonaiTable = renderUnigramTable(zonaiTrigrams, {
		"min-width": "10em",
		"flex-grow": "1",
		"flex-basis": "10em",
	}, elCipherLetter);

	japaneseTrigrams.entries.splice(15);
	const japaneseTable = renderUnigramTable(japaneseTrigrams, {
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

/**
 * @param {string} romaji
 */
function simplifyRomaji(romaji) {
	return romaji
		.replace(/fu/g, "hu")
		.replace(/ch([aeuo])/g, "ty$1")
		.replace(/(?:sh|j)([aeuo])/g, "sy$1")
		.replace(/shi/g, "si")
		.replace(/chi/g, "ti")
		.replace(/tsu/g, "tu")
		.replace(/d/g, "t")
		.replace(/[jz]/g, "s")
		.replace(/g/g, "k")
		.replace(/[pb]/g, "h")
		// .replace(/([kshnmrt])y/g, "$1iy")
		.replace(/([skth])\1/g, "tu$1")
		.replace(/([aeiou])\1/g, "$1");
}

async function processRomajiSample() {
	const sourceDiv = document.getElementById("romaji-sample");
	if (!sourceDiv) {
		throw new Error("missing romaji-sample element");
	}

	const romaji = (sourceDiv.textContent || "").trim();

	const processed = simplifyRomaji(romaji);

	const wikipedia = await (await fetch("wikipedia-romaji.txt")).text();
	const processedWikipedia = simplifyRomaji(wikipedia.normalize("NFKD").toLowerCase());

	const section = document.getElementById("romaji-sample-processed");
	if (!section) {
		throw new Error("missing romaji-sample-processed");
	}

	section.textContent = processed;
	return processed + "\n" + processedWikipedia
		.replace(/[^aeiouksthrmnyw.]/g, "");
}

/**
 * @param {string} parameter
 */
function getUrlParameter(parameter) {
	const urlState = new URL(window.location.href);
	return urlState.searchParams.get(parameter) || "";
}

/**
 * @param {string} parameter
 * @param {string} value
 */
function setUrlParameter(parameter, value) {
	const newURL = new URL(window.location.href);
	if (value) {
		newURL.searchParams.set(parameter, value);
	} else {
		newURL.searchParams.delete(parameter);
	}
	window.history.replaceState({}, "", newURL.toString());
}

/**
 * @param {string} zonaiLetter 
 */
function cipherSelectorBox(zonaiLetter) {

	/**
	 * @param { {target: {value: string}} } e
	 */
	const updateCipher = e => {
		const setting = e.target.value.trim();
		for (const cell of cipherLetterList[zonaiLetter]) {
			if (setting) {
				if (cell.parentElement) {
					cell.parentElement.classList.add("zonai-fade");
					cell.textContent = setting;
				}
			} else {
				if (cell.parentElement) {
					cell.textContent = "";
					cell.parentElement.classList.remove("zonai-fade");
				}
			}
		}

		setUrlParameter(zonaiLetter, setting);
	}

	const initialValue = getUrlParameter(zonaiLetter);
	updateCipher({ target: { value: initialValue } });

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
			maxlength: 3,
			value: initialValue,
			input: updateCipher,
			style: { padding: "0.7em", width: "1.5em", "text-align": "center" },
		})
	]);
}

/**
 * @param {string} romajiCorpus 
 * @param {ZonaiSample[]} zonaiSamples 
 * @param {Reading} reading
 */
function sectionWordStarts(zonaiSamples, romajiCorpus, reading) {
	/**
	 * @param frequencies { {total: number, frequencies: Record<string, number>}[] }
	 * @param {Lang} lang 
	 * @param {(i: string) => NestedArrays<ElArg> | ElArg} [th=i => i] 
	 */
	function makeTable(frequencies, lang, th = i => i) {
		const rows = [];
		rows.push(el("tr",
			[
				el("th", []),
				frequencies.map((_, positionIndex) => el("th", positionIndex + 1)),
			]
		));
		for (const letter of lang.alphabet) {
			rows.push(el("tr",
				[
					el("th", th(letter)),
					frequencies.map(statsForPosition => {
						const count = statsForPosition.frequencies[letter] || 0;
						return el("td", (100 * count / statsForPosition.total).toFixed(1) + "%");
					}),
				],
			));
		}

		return el("table", rows);
	}

	const count = 3;
	const romajiFrequenciesByPosition = frequencyByPosition(romajiCorpus.split(/[^a-z]+/g), RomajiLang, count)
	const zonaiFrequenciesByPosition = frequencyByPosition(readZonaiCorpus(zonaiSamples, reading, true).map(x => x.line), ZonaiLang, count);

	const section = document.getElementById("word-starts");
	if (!section) throw new Error("missing word-starts");
	const japaneseTable = makeTable(romajiFrequenciesByPosition, RomajiLang);
	const zonaiTable = makeTable(zonaiFrequenciesByPosition, ZonaiLang, elCipherLetter);
	const flexy = el("div", [
		zonaiTable, japaneseTable
	], {
		style: {
			display: "flex",
			"flex-direction": "row",
			"justify-content": "space-between",
		},
	});
	section.appendChild(flexy);
}

function sectionTryACipher() {
	const boxes = "SDNLBHMJRUWCYT".split("").map(cipherSelectorBox);

	const table = el(
		"table",
		[
			el("tr", boxes.slice(0, 7).map(x => el("td", x))),
			el("tr", boxes.slice(7, 14).map(x => el("td", x))),
		],
		{
			style: {
				display: "inline-block",
			},
		},
	);

	const section = document.getElementById("try-a-cipher");
	if (!section) {
		throw new Error("missing try-a-cipher section");
	}
	section.appendChild(table);
}

/**
 * @param {unknown[]} list
 */
function allUnique(list) {
	return new Set(list).size === list.length;
}

/**
 * @template T
 * @template K
 * @param {Iterable<T>} seq
 * @param {(t: T) => K} f
 * @return {Map<K, T[]>}
 */
function groupBy(seq, f) {
	const out = new Map();
	for (const x of seq) {
		const key = f(x);
		let group = out.get(key);
		if (!group) {
			group = [];
			out.set(key, group);
		}
		group.push(x);
	}
	return out;
}

/**
 * @param {string} from
 * @param {string} to
 * @return {string[] | null}
 */
function cipherForStrings(from, to) {
	if (from.length !== to.length) {
		console.error("cipherForStrings", { from, to });
		throw new Error("length mismatch");
	}

	const arrows = new Set();
	for (let i = 0; i < from.length; i++) {
		arrows.add(from[i] + "->" + to[i]);
	}
	const zipped = [...arrows].map(([a, _1, _2, b]) => [a, b]);
	if (!allUnique(zipped.map(x => x[0])) || !allUnique(zipped.map(x => x[1]))) {
		return null;
	}
	return [...arrows];
}

/**
 * @param {string} from 
 * @param {string} to
 * @param {Lang} fromLang
 * @param {Lang} toLang
 * @return {null | string[]}
 */
function cipherForLangs(from, to, fromLang, toLang) {
	const cipher = cipherForStrings(from, to);
	if (!cipher) {
		return null;
	}

	const letters = cipher.map(arrow => {
		const from = arrow[0];
		const to = arrow[3];
		if (fromLang.alphabet.includes(from) && toLang.alphabet.includes(to)) {
			return arrow;
		}
		return from === to;
	});

	if (letters.includes(false)) {
		// No cipher is possible, because non-alphabet characters cannot be changed.
		return null;
	}

	const out = [];
	for (const letter of letters) {
		if (typeof letter === "string") {
			out.push(letter);
		}
	}
	return out;
}

/**
 * @param {string} [msg]
 * @param {unknown} tru
 */
function assert(tru, msg) {
	if (!tru) {
		throw new Error("assertion failed: " + msg);
	}
}

{
	const p1 = cipherForStrings("cat", "dog");
	assert(p1?.length === 3);
	assert((p1 && p1[0]) === "c->d");
	assert((p1 && p1[1]) === "a->o");
	assert((p1 && p1[2]) === "t->g");

	const p2 = cipherForStrings("cat", "gag");
	assert(p2 === null);

	const p3 = cipherForStrings("gag", "cat");
	assert(p3 === null);
}
{
	const q1 = cipherForLangs("cat", "dog", ZonaiLang, RomajiLang);
	assert(q1 === null);

	const q2 = cipherForLangs("CSTC", "tokt", ZonaiLang, RomajiLang);
	assert(q2 !== null, "cipher must exist");
	assert(q2?.includes("C->t"));
	assert(q2?.includes("S->o"));
	assert(q2?.includes("T->k"));
	assert(q2?.length === 3);

	const q3 = cipherForLangs("C.B", "t.k", ZonaiLang, RomajiLang);
	assert(q3 !== null);


	const q4 = cipherForLangs("C.B", "t1k", ZonaiLang, RomajiLang);
	assert(q4 === null);
}

{
	const solver = new logic.Solver();
	solver.require("true");
	solver.require(logic.or("Q", "!Q"));

	const formulas = ["Q"];
	const weights = [5431];
	for (let i = 0; i < 5432; i++) {
		formulas.push("true");
		weights.push(1);
	}

	const badSolution = solver.solveAssuming("Q");
	const answer = solver.minimizeWeightedSum(badSolution, formulas, weights);

	// throw new Error("STOP");
}

/**
 * @template T
 * @param {T[]} list
 * @return {void}
 */
function makeRandomSwap(list) {
	const a = Math.floor(Math.random() * list.length);
	const b = Math.floor(Math.random() * list.length);
	[list[a], list[b]] = [list[b], list[a]];
}

/**
 * @template T
 * @param {T[]} list
 * @param {number} n
 * @return {T[]}
 */
function withRandomSwaps(list, n) {
	const out = [...list];
	for (let i = 0; i < n; i++) {
		makeRandomSwap(out);
	}
	return out;
}

/**
 * @param {string} text 
 * @param {Record<string, number>} logLikelihoods 
 * @param {number} n 
 * @returns {number}
 */
function measureNgramLogLikelihood(text, logLikelihoods, n) {
	let sum = 0;
	for (let i = 0; i + n <= text.length; i++) {
		const slice = text.substring(i, i + n);
		if (slice in logLikelihoods) {
			sum += logLikelihoods[slice];
		}
	}
	return sum;
}

/**
 * @typedef {{froms: string[], tos: string[]}} Substitution
 */

/**
 * @param {string} from 
 * @param {Substitution} substitution 
 */
function applySubstitution(from, substitution) {
	let out = "";
	for (const c of from) {
		const i = substitution.froms.indexOf(c);
		if (i < 0) {
			out += "-";
		} else {
			out += substitution.tos[i];
		}
	}
	return out;
}

/**
 * @param {string} processedRomaji
 */
function sectionOptimization(processedRomaji) {
	const section = document.getElementById("optimization");
	if (!(section instanceof HTMLElement)) {
		throw new Error("missing optimization section");
	}

	const bigrams = ngrams(processedRomaji, 2, {
		alphabet: RomajiLang.alphabet,
		add: 1,
	});

	const logLikelihoods = Object.fromEntries(
		bigrams.entries.map(record => [record.ngram, Math.log(record.count / bigrams.total)])
	);

	/**
	 * @param {Substitution} substitution
	 */
	const evaluateSubstitution = substitution => {
		const inTarget = applySubstitution(input, substitution);
		return measureNgramLogLikelihood(inTarget, logLikelihoods, 2);
	};

	const input = `
	devices/floating-block/1
	BSJ
	SWCL
	RNCS
	devices/floating-block/2
	RTY
	LSCWMW
	RTYLD
	The letter distribution is 32.1x more likely to be uniform than Zonai
	devices/floating-block/3
	BJ
	SWCL
	RNC
	BJRNC
	SWCL
	devices/floating-block/4
	RTY
	LSC
	LDW
	`;

	let state = {
		froms: ZonaiLang.alphabet.split(""),
		tos: RomajiLang.alphabet.split(""),
	};
	let stateEvaluation = evaluateSubstitution(state);
	let stale = 0;
	/**
	 * @param {boolean} log 
	 */
	function work(log) {
		const swaps = Math.ceil(Math.sqrt(stale / 1e3));
		const alternate = { froms: withRandomSwaps(state.froms, swaps), tos: state.tos };
		let alternateEvaluation = evaluateSubstitution(alternate);
		if (alternateEvaluation > stateEvaluation) {
			console.log("improvement!", stateEvaluation, "->", alternateEvaluation, "with", alternate);
			console.log("after", stale, "mutations");
			stateEvaluation = alternateEvaluation;
			state = alternate;
			console.log(applySubstitution(input, state));
			console.log(" ");
			stale = 0;
		}
		stale += 1;
		if (log) {
			console.log("work:", { swaps, stale });
		}
	}

	setInterval(() => {
		if (stale > 1e5) {
			return;
		}
		for (let i = 0; i < 200; i++) {
			work(false);
		}
		work(true);
	}, 50);

}

/**
 * @param {{line: string, source: string}[]} corpus
 * @return {Record<string, string[]>}
 */
function reduceDuplication(corpus) {
	/**
	 * @type {Record<string, string[]>}
	 */
	let nonContained = {};
	for (const line of corpus.sort((a, b) => b.line.length - a.line.length)) {
		let contained = false;
		for (const possibleContainer in nonContained) {
			if (possibleContainer.repeat(3).includes(line.line)) {
				contained = true;
				nonContained[possibleContainer].push(line.source);
				break;
			}
		}
		if (!contained) {
			nonContained[line.line] = [line.source];
		}
	}
	return nonContained;
}

{
	/**
	 * @type {Reading}
	 */
	const reading = {
		defaultColumns: "right-to-left",
		// counter-clockwise
		defaultRings: "right-to-left",
	};

	const zonaiSamples = await loadZonaiSamples();
	await sectionTextSamples(zonaiSamples, reading);
	const romajiCorpus = await processRomajiSample();

	sectionLetterFrequency(zonaiSamples, romajiCorpus);
	sectionBigramFrequency(zonaiSamples, reading, romajiCorpus);
	sectionTrigramFrequency(zonaiSamples, reading, romajiCorpus);
	sectionWordStarts(zonaiSamples, romajiCorpus, reading);
	sectionTryACipher();

	for (const radio of document.getElementsByName("sample-mode")) {
		const section = document.getElementById("text-samples");
		if (!section) {
			throw new Error("missing text-samples section");
		}
		if (!(radio instanceof HTMLInputElement)) {
			throw new Error("unexpected name='sample-mode' element");
		}
		if (getUrlParameter("samples") === radio.value || (getUrlParameter("samples") === "" && radio.checked)) {
			radio.checked = true;
			section.setAttribute("data-sample-mode", radio.value);
		}
		radio.oninput = () => {
			setUrlParameter("samples", radio.value);
			section.setAttribute("data-sample-mode", radio.value);
		};
	}

	sectionOptimization(romajiCorpus);
}
