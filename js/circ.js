/*jslint node: true , browser: true */
/*global window */
"use strict";

// Operations in the circ_domain

// Calculates the errot btwen a value and a ref

function circ_norm(v) {
	return v - Math.floor(v);
}

function circ_err(a,b) {
	var v = circ_norm(a-b);
	return v>0.5 ? -(1-v) : v;
}

exports.norm = circ_norm;
exports.err = circ_err;
