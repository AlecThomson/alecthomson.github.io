(function () {
	var body = document.body;
	var main = document.getElementById('main');
	var panels = Array.from(main.querySelectorAll('.panel'));
	var navLinks = Array.from(document.querySelectorAll('#nav a'));

	body.classList.remove('is-preload');

	navLinks.forEach(function (link) {
		link.addEventListener('click', function (event) {
			var href = link.getAttribute('href');
			if (href.charAt(0) !== '#') return;
			var target = document.querySelector(href);
			if (!target || !target.classList.contains('panel')) return;
			event.preventDefault();
			event.stopPropagation();
			if (window.location.hash !== href) window.location.hash = href;
		});
	});

	function resolvePanel() {
		var hash = window.location.hash;
		if (hash) {
			var el = document.querySelector(hash);
			if (el && el.classList.contains('panel')) return el;
		}
		return panels[0];
	}

	function resolveLink(panel) {
		var href = '#' + panel.id;
		return navLinks.find(function (l) { return l.getAttribute('href') === href; }) || navLinks[0];
	}

	(function () {
		var panel = resolvePanel();
		var link = resolveLink(panel);
		panels.forEach(function (p) {
			if (p !== panel) { p.classList.add('inactive'); p.style.display = 'none'; }
		});
		link.classList.add('active');
		window.scrollTo(0, 0);
	})();

	window.addEventListener('hashchange', function () {
		var panel = resolvePanel();
		var link = resolveLink(panel);
		navLinks.forEach(function (l) { l.classList.remove('active'); });
		link.classList.add('active');
		panels.forEach(function (p) { p.classList.add('inactive'); p.style.display = 'none'; });
		panel.style.display = '';
		window.scrollTo(0, 0);
		requestAnimationFrame(function () {
			panel.classList.remove('inactive');
			if (panel.id === 'research') loadPublications();
		});
	});

	// ── Publications ────────────────────────────────────────────────────────────
	var pubLoaded = false;

	var JOURNALS = {
		'\\apj':'ApJ', '\\apjs':'ApJS', '\\apjl':'ApJL', '\\apjlett':'ApJL',
		'\\aap':'A&A', '\\aaps':'A&AS',
		'\\mnras':'MNRAS', '\\pasp':'PASP', '\\aj':'AJ',
		'\\nat':'Nature', '\\araa':'ARA&A', '\\pasa':'PASA',
		'\\aapr':'A&A Rev.', '\\ssr':'Space Sci. Rev.',
		'\\jcap':'JCAP', '\\prd':'Phys. Rev. D', '\\prl':'Phys. Rev. Lett.',
	};

	function esc(s) {
		return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
	}

	function cleanTex(s) {
		if (!s) return '';
		var dia = {
			'"': {a:'ä',e:'ë',i:'ï',o:'ö',u:'ü',A:'Ä',E:'Ë',O:'Ö',U:'Ü'},
			"'": {a:'á',e:'é',i:'í',o:'ó',u:'ú',y:'ý',A:'Á',E:'É',O:'Ó',U:'Ú'},
			'`': {a:'à',e:'è',i:'ì',o:'ò',u:'ù'},
			'^': {a:'â',e:'ê',i:'î',o:'ô',u:'û'},
			'~': {a:'ã',n:'ñ',o:'õ'},
			'c': {c:'ç',C:'Ç'},
			'.': {z:'ż',Z:'Ż'},
		};
		s = s.replace(/\\([`'"^~c.])(?:\{(\w)\}|(\w))/g, function(_, cmd, c1, c2) {
			var c = c1 || c2;
			return (dia[cmd] && dia[cmd][c]) ? dia[cmd][c] : c;
		});
		s = s.replace(/\\([a-zA-Z]+)/g, function(_, name) {
			var k = '\\' + name.toLowerCase();
			return JOURNALS[k] !== undefined ? JOURNALS[k] : '';
		});
		for (var n = 0; n < 6; n++) s = s.replace(/\{([^{}]*)\}/g, '$1');
		s = s.replace(/[{}]/g, '').replace(/~/g, ' ');
		return s.replace(/\s+/g, ' ').trim();
	}

	function parseBibtex(text) {
		var entries = [], m, entryRe = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
		while ((m = entryRe.exec(text)) !== null) {
			var type = m[1].toLowerCase();
			if (type === 'string' || type === 'preamble' || type === 'comment') continue;
			var pos = m.index + m[0].length, depth = 1, i = pos;
			while (i < text.length && depth > 0) {
				if (text[i] === '{') depth++;
				else if (text[i] === '}') depth--;
				i++;
			}
			var body = text.slice(pos, i - 1);
			var fields = { _type: type };
			var fi = 0;
			while (fi < body.length) {
				while (fi < body.length && /[\s,]/.test(body[fi])) fi++;
				if (fi >= body.length) break;
				var ns = fi;
				while (fi < body.length && !/[=\s]/.test(body[fi])) fi++;
				var fname = body.slice(ns, fi).trim().toLowerCase();
				while (fi < body.length && body[fi] !== '=') fi++;
				if (fi >= body.length || !fname) break;
				fi++;
				while (fi < body.length && /\s/.test(body[fi])) fi++;
				var val = '', vs;
				if (body[fi] === '{') {
					var d = 0; vs = fi + 1;
					while (fi < body.length) {
						if (body[fi] === '{') d++;
						else if (body[fi] === '}') { d--; if (d === 0) break; }
						fi++;
					}
					val = body.slice(vs, fi); fi++;
				} else if (body[fi] === '"') {
					fi++; vs = fi;
					while (fi < body.length && body[fi] !== '"') fi++;
					val = body.slice(vs, fi); fi++;
				} else {
					vs = fi;
					while (fi < body.length && !/[,}]/.test(body[fi])) fi++;
					val = body.slice(vs, fi).trim();
				}
				if (fname) fields[fname] = val;
			}
			entries.push(fields);
		}
		return entries;
	}

	function formatAuthors(raw) {
		var parts = raw.split(/\s+and\s+/i);
		var MAX = 5;
		var formatted = parts.slice(0, MAX).map(function (a) {
			var clean = cleanTex(a).trim();
			var comma = clean.indexOf(',');
			var last = comma >= 0 ? clean.slice(0, comma).trim() : clean;
			var first = comma >= 0 ? clean.slice(comma + 1).trim() : '';
			var inits = first.split(/[\s.]+/).filter(Boolean).map(function (p) { return p[0] + '.'; }).join(' ');
			var name = (inits ? inits + ' ' : '') + last;
			var isOwner = /thomson/i.test(last) && /alec/i.test(first);
			return isOwner ? '<strong>' + esc(name) + '</strong>' : esc(name);
		});
		var etAl = parts.length > MAX ? ',&nbsp;et&nbsp;al.' : '';
		if (!etAl && formatted.length > 1) {
			var last = formatted.pop();
			return formatted.join(', ') + ' &amp; ' + last + etAl;
		}
		return formatted.join(', ') + etAl;
	}

	function renderPubs(entries) {
		entries.sort(function (a, b) { return (parseInt(b.year) || 0) - (parseInt(a.year) || 0); });
		var byYear = {};
		entries.forEach(function (e) { (byYear[e.year || '?'] = byYear[e.year || '?'] || []).push(e); });

		var html = '<div class="pub-list">';
		Object.keys(byYear).sort(function (a, b) { return b - a; }).forEach(function (year) {
			html += '<h4 class="pub-year-heading">' + esc(year) + '</h4><ul class="pub-year-list">';
			byYear[year].forEach(function (e) {
				var title   = esc(cleanTex(e.title || 'Untitled'));
				var authors = e.author ? formatAuthors(e.author) : '';
				var journal = esc(cleanTex(e.journal || e.booktitle || ''));
				var doi     = e.doi ? cleanTex(e.doi) : '';
				var link    = doi ? esc('https://doi.org/' + doi) : esc(cleanTex(e.adsurl || ''));

				var isArxiv = /arxiv/i.test(e.journal || '') && !e.volume;
				var venue;
				if (isArxiv) {
					venue = 'arXiv:' + esc(e.eprint || '');
				} else {
					venue = journal;
					if (e.volume) venue += '&nbsp;<b>' + esc(e.volume) + '</b>';
					var num = e.eid || (e.pages && !/arxiv/i.test(e.pages) ? e.pages : '');
					if (num) venue += ', ' + esc(cleanTex(num));
				}

				html += '<li class="pub-entry">';
				html += link
					? '<a class="pub-title" href="' + link + '" target="_blank" rel="noopener">' + title + '</a>'
					: '<span class="pub-title">' + title + '</span>';
				if (authors || venue) {
					html += '<p class="pub-meta">' + authors;
					if (venue) html += (authors ? ' &mdash; ' : '') + '<em>' + venue + '</em>';
					html += '</p>';
				}
				html += '</li>';
			});
			html += '</ul>';
		});
		return html + '</div>';
	}

	function loadPublications() {
		if (pubLoaded) return;
		var container = document.getElementById('bibbase-publications');
		if (!container) return;
		pubLoaded = true;
		container.textContent = 'Loading publications…';
		fetch('publications.bib')
			.then(function (r) { return r.text(); })
			.then(function (text) { container.innerHTML = renderPubs(parseBibtex(text)); })
			.catch(function () { container.textContent = 'Could not load publications.'; });
	}

	if (resolvePanel().id === 'research') loadPublications();
})();
