/*jshint browser:true, eqnull:true */
/*global define */
define(function(){
'use strict';

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
		return dom.byId(any);
	}
	return any;
}

var dom = {
	create: function(elem, attribs, parent, text){
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

		dom.innerText(node, text);
		if (parent != null) {
			any2node(parent).appendChild(node);
		}
		return node;
	},

	empty: function(node){
		any2node(node).innerHTML = '';
	},

	isNode: function(thing){
		return thing.nodeType && thing.nodeType === 1;
	},

	innerText: function(node, text){
		var n = any2node(node);
		n.innerHTML = '';
		dom.appendText(node, text);
	},

	appendText: function(node, text){
		var i, n = any2node(node);
		if (text == null) {return;}

		if (typeof text === 'string') {
			n.appendChild(document.createTextNode(text));
		} else if (dom.isNode(text)) {
			n.appendChild(text);
		} else if (text instanceof Array) {
			for (i=0; i<text.length; i++) {
				n.appendChild(
					dom.isNode(text[i]) ?
						text[i] : document.createTextNode(text[i])
				);
			}
		} else {
			throw new Error('Type "'+typeof text+'" not supported');
		}
	},

	onclick: function(id, f){
		dom.byId(id).onclick = f;
	},

	byId: function(id){
		return document.getElementById(id);
	}
};

return dom;
});
