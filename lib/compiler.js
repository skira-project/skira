const o = JSON.stringify.bind(JSON)
const serialize = require("serialize-javascript")

function buildNav(pages) {
	// initiale output object
	var nav = {}

	// come up with a creative name to store the name temporarily
	// the goal is not to overwrite / conflict with other data
	// (hence the Math.random call)
	var nameProperty = "SAVE_CPU_CYCLES_" + Math.random()

	// check all pages
	for (var pageName in pages) {
		// make a reference to the page itself
		var page = pages[pageName]

		// skip pages that don't want to be in any nav
		if (!page.navorder) {
			continue
		}

		// loop through all different navs
		for (var navName in page.navorder) {
			// if there isn't an entry yet, we create one
			if (typeof nav[navName] == "undefined") {
				nav[navName] = []
			}

			// store the page name temporarily
			page[nameProperty] = pageName

			nav[navName].push(page)
		}
	}

	// sort every nav based on their specified nav order
	for (var navName in nav) {
		nav[navName].sort((pageA, pageB) => (
			pageA.navorder[navName] - pageB.navorder[navName]
		))
	}

	// map every nav page object back to its original name
	for (var navName in nav) {
		nav[navName] = nav[navName].map((page) => {
			var name = page[nameProperty]
			delete page[nameProperty]
			return name
		})
	}

	return nav
}

function getExtends(site, pageName, buffer) {
	// continue where left of if possible, otherwise start fresh
	var buffer = buffer || []

	// get page by name
	var page = site.pages[pageName]

	// if this is the last page in the chain we're done
	if (!page.extends) {
		return buffer
	}

	// check if we haven't seen this page before to stop a stack overflow
	if (buffer.indexOf(page.extends) != -1) {
		// this message is a lot more sensible than a stack overflow
		throw new Error(`Recursion: ${page.extends} (${pageName})`)
	}

	// this isn't the last page, so we carry on, concatenating our progress
	return getExtends(site, page.extends, buffer.concat(page.extends))
}

function siteCodeGenerator(site) {
	// initialize output buffer
	var s = []

	// import modules
	s.push(`var EventEmitter = require("eventemitter3-collector")\n`)
	s.push(`var jade = require("jade/runtime")\n`)
	s.push(`var merge = require("merge")\n`)
	s.push(`Site = new EventEmitter()\n`)

	// serialize simple file structures
	Object.keys(site)
		// turn into Site["pages"] = { demo_page: { /* ... */ } }
		.map(n => `Site[${o(n)}] = ${serialize(site[n])}\n`)
		// push every statement
		.forEach(str => s.push(str))

	// generate navigatins before extending page properties
	s.push(`Site.nav = {}\n`)

	// collect all the related pages
	var nav = buildNav(site.pages)

	// output collection
	for (var navName in nav) {
		var _nav = nav[navName]
			// turn into Site.pages["demo_page"]
			.map(p => `Site.pages[${o(p)}]`)
			.join(", ")

		// turn into Site.nav["main_nav"] = [ Site.pages["demo_page"] ]
		s.push(`Site.nav[${o(navName)}] = [ ${_nav} ]\n`)
	}

	// extend all page properties
	for (var page in site.pages) {
		var chain = []
			// populate the chain with the current page
			.concat(page)

		// if this page extends another, build the dependency chain
		if (site.pages[page].extends) {
			chain = chain.concat(getExtends(site, page))

			var _chain = chain
				// reverse the array
				.map(x, n, a => a[a.length - n - 1])
				// turn into Site.pages["demo_page"]
				.map(p => `Site.pages[${o(p)}]`)
				// add together with commas
				.join(", ")

			// turn into Site.pages["demo_page"] =
			// merge.recursive(true, Site.pages["master_page"],
			// /* ... */, Site.pages["demo_page"])
			s.push(`Site.pages[${o(page)}] = merge.recursive(true, ${_chain})\n`)
		}

		// output what views should be rendered sequentially
		var _views = chain
			// first grab all pages by their name (n)
			.map(n => site.pages[n])
			// take out falsy values (false, undefined, 0, etc)
			.filter(Boolean)
			// only use pages that defined a view
			.filter(p => p.view)
			// turn into Site.views["viewName"]
			.map(p => `Site.views[${o(p.view)}]`)
			// add together with commas
			.join(", ")

		// turn into Site.pages["demo_page"]._views =
		// [ Site.views["demo_view"], Site.views["master_view"] ]
		s.push(`Site.pages[${o(page)}]._views = [ ${_views} ]\n`)
	}

	// initialize object
	s.push(`Site.modules = {}\n`)

	// start with an empty array
	;[]
		// make an array regardless of modules being undefined or single
		.concat(site.project.modules)
		// take out falsy values (false, undefined, 0, etc)
		.filter(Boolean)
		// turn into Site.modules["demo"] = require("demo")(Site)
		.map(n => `Site.modules[${o(n)}] = require(${o(n)})(Site)\n`)
		// push every statement
		.forEach(str => s.push(str))

	// export our configuration
	s.push(`module.exports = Site\n`)

	// glue all the pieces together
	return s.join("")
}

// export our compiler
module.exports = siteCodeGenerator