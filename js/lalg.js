/*jslint node: true , browser: true */
/*global window */
"use strict";

var INF = 0x7FFFFFF;

function ND(f) {
	return Math.round(f*256);
}

function g(x) {
	var R;
	R =-x;
	if (x<ND(2.2)) {
		if (x<ND(1.6)) {
			if (x<ND(0.5)) {
				R >>= 1;
				R += ND(0.7);
			} else {
				R >>= 2;
				R += ND(0.575);
			}
		} else {
			R >>= 3;
			R += ND(0.375);
		}
	} else {
		if (x<ND(3.2)) {
			R >>= 4;
			R += ND(0.2375);
		} else {
			if (x<ND(4.4)) {
				R >>= 5;
				R += ND(0.1375);
			} else {
				R=0;
			}
		}
	}
	return R;
}

function lSum(l1,l2) {
	var R;
	var al1,al2,sig,d,s;

	sig=false;
	if (l1>0) {
		al1=l1;
	} else {
		al1=-l1;
		sig=!sig;
	}
	if (l2>0) {
		al2=l2;
	} else {
		al2=-l2;
		sig=!sig;
	}

	d=al1-al2;
	if (d>0) {
		R=al2;
	} else {
		R=al1;
	}

	if (sig) R=-R;
	s=l1+l2;
	if (s<0) s=-s;
	R+=g(s);
	d=l1-l2;
	if (d<0) d=-d;
	R-=g(d);
	return R;
}

function lMax(l1, l2) {
	var d, ad, ml;
	d = l1-l2;
	if (d>0) {
		ml=l1;
	} else {
		ml=l2;
		d=-d;
	}
	return ml + g(d);
}

exports.lSum = lSum;
exports.lMax = lMax;
exports.INF = INF;
