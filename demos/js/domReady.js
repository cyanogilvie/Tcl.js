/*
 RequireJS domReady 2.0.1 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 Available via the MIT or new BSD license.
 see: http://github.com/requirejs/domReady for details
*/
define(function(){function a(){if(!c){c=!0;f&&clearInterval(f);var b=g;if(c&&b.length){g=[];var d;for(d=0;d<b.length;d+=1)b[d](j)}}}function e(b){c?b(j):g.push(b);return e}var k,h,f,i="undefined"!==typeof window&&window.document,c=!i,j=i?document:null,g=[];if(i){if(document.addEventListener)document.addEventListener("DOMContentLoaded",a,!1),window.addEventListener("load",a,!1);else if(window.attachEvent){window.attachEvent("onload",a);h=document.createElement("div");try{k=null===window.frameElement}catch(l){}h.doScroll&&
(k&&window.external)&&(f=setInterval(function(){try{h.doScroll(),a()}catch(b){}},30))}"complete"===document.readyState&&a()}e.version="2.0.1";e.load=function(b,d,a,c){c.isBuild?a(null):e(a)};return e});
