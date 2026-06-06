(function () {
	var body = document.body;
	var main = document.getElementById('main');
	var panels = Array.from(main.querySelectorAll('.panel'));
	var navLinks = Array.from(document.querySelectorAll('#nav a'));
	var isSmall = window.matchMedia('(max-width: 736px)');

	// Remove preload class after page load to trigger entrance animations
	window.addEventListener('load', function () {
		setTimeout(function () {
			body.classList.remove('is-preload');
		}, 100);
	});

	// Nav: intercept hash-link clicks so the hashchange handler drives all transitions
	navLinks.forEach(function (link) {
		link.addEventListener('click', function (event) {
			var href = link.getAttribute('href');
			if (href.charAt(0) !== '#') return;
			var target = document.querySelector(href);
			if (!target || !target.classList.contains('panel')) return;
			event.preventDefault();
			event.stopPropagation();
			if (window.location.hash !== href) {
				window.location.hash = href;
			}
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

	// Set initial panel state without animation
	(function () {
		var panel = resolvePanel();
		var link = resolveLink(panel);
		panels.forEach(function (p) {
			if (p !== panel) {
				p.classList.add('inactive');
				p.style.display = 'none';
			}
		});
		link.classList.add('active');
		window.scrollTo(0, 0);
	})();

	// Animate between panels on hash change
	window.addEventListener('hashchange', function () {
		var panel = resolvePanel();
		var link = resolveLink(panel);

		panels.forEach(function (p) { p.classList.add('inactive'); });
		navLinks.forEach(function (l) { l.classList.remove('active'); });
		link.classList.add('active');

		var h = main.offsetHeight;
		main.style.maxHeight = h + 'px';
		main.style.minHeight = h + 'px';

		setTimeout(function () {
			panels.forEach(function (p) { p.style.display = 'none'; });
			panel.style.display = '';

			var newH = panel.offsetHeight;
			main.style.maxHeight = newH + 'px';
			main.style.minHeight = newH + 'px';

			window.scrollTo(0, 0);

			setTimeout(function () {
				panel.classList.remove('inactive');
				main.style.maxHeight = '';
				main.style.minHeight = '';
			}, isSmall.matches ? 0 : 500);
		}, 250);
	});

	// Load publications asynchronously after page is interactive
	window.addEventListener('load', function () {
		var container = document.getElementById('bibbase-publications');
		if (!container) return;
		var script = document.createElement('script');
		script.src = 'https://bibbase.org/show?bib=alecthomson.github.io%2Fpublications.bib&commas=true&jsonp=1';
		container.appendChild(script);
	});
})();
