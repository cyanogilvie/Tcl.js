/*jshint browser:true, eqnull:true */

function apply_styles(node, styles) {
	var e;

	for (e in styles) {
		if (styles.hasOwnProperty(e)) {
			node.style[e] = styles[e];
		}
	}
}

function any2node(any) {
	if (typeof any === 'string') {
		return byId(any);
	}
	return any;
}

export function create(elem, attribs, parent, text) {
	var node = document.createElement(elem), e, v;
	for (e in attribs) {
		if (attribs.hasOwnProperty(e)) {
			v = attribs[e];
			if (e === 'style' && typeof v !== 'string') {
				apply_styles(node, v);
			} else if (e === 'className') {
				node.setAttribute('class', attribs[e]);
			} else {
				node.setAttribute(e, attribs[e]);
			}
		}
	}

	innerText(node, text);
	if (parent != null) {
		any2node(parent).appendChild(node);
	}
	return node;
}

export function empty(node) {
	any2node(node).innerHTML = '';
}

export function isNode(thing){
	return thing.nodeType && thing.nodeType === 1;
}

export function innerText(node, text) {
	var n = any2node(node);
	n.innerHTML = '';
	appendText(node, text);
}

export function appendText(node, text) {
	var i, n = any2node(node);
	if (text == null) {return;}

	if (typeof text === 'string') {
		n.appendChild(document.createTextNode(text));
	} else if (isNode(text)) {
		n.appendChild(text);
	} else if (text instanceof Array) {
		for (i=0; i<text.length; i++) {
			n.appendChild(
				isNode(text[i]) ?
					text[i] : document.createTextNode(text[i])
			);
		}
	} else {
		throw new Error('Type "'+typeof text+'" not supported');
	}
}

export function onclick(id, f) {
	byId(id).onclick = f;
}

export function onkeydown(id, f) {
	byId(id).onkeydown = f;
}

export function byId(id) {
	return document.getElementById(id);
}

export function head() {
	return document.getElementsByTagName('head')[0];
}
