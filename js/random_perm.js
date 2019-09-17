/*jslint node: true , browser: true */
/*global window */
"use strict";

require("../seedrandom/seedrandom.js");
var permdata=require('./permdata.js');

function RandomPerm(L) {

	if (L===3696) {
		this.convert=permdata.convert3696;
		this.iConvert=permdata.iConvert3696;
		return;
	}

	var NM =0;
	var MASK =0;
	function randomizer(i, M, inv) {
		var r, x;
		if (!NM) {
			x=M-1;
			while (x) {
				x >>= 1;
				NM +=1;
				MASK = (MASK << 1) | 1;
			}
		}

		function rotL(a, n) {
			var aux = a | (a<<NM);
			aux >>= NM-n;
			aux &= MASK;
			return aux;
		}

		function rotR(a, n) {
			var aux = a | (a<<NM);
			aux >>= n;
			aux &= MASK;
			return aux;
		}

		function enc(aux) {
			var i, M=0x2A32;
			for (i=0; i<NM/3; i++) {
				aux = (aux ^M) & MASK;
				aux=rotR(aux,1);
			}
			return aux;
		}

		function dec(aux) {
			var i, M=0x2A32;
			for (i=0; i<NM/3; i++) {
				aux=rotL(aux,1);
				aux = (aux ^M) & MASK;
			}
			return aux;
		}

		if (inv) {
			x = dec(i);
			while (x>=M) x=dec(x-1);
		} else {
			x = enc(i);
			while (x>=M) x=enc(x);
		}

		return x;

	}


	this.convert = [];
	this.iConvert = [];


	Math.seedrandom('hello.');
	var r;

	var LHalf = Math.floor(L/2 + 0.5);

	var remaining=[];
	var i;
	for (i=0;i<LHalf;i++) {
		remaining[i]=i*2;
	}
	for (i=0;i<LHalf;i++) {
		r=Math.floor(Math.random() * (LHalf-i) );
		this.convert[i] = remaining[r];
		remaining[r]= remaining[LHalf-i-1];
		this.iConvert[this.convert[i]] = i;
	}
	for (i=0;i<L-LHalf;i++) {
		remaining[i]=i*2+1;
	}
	for (i=0;i< L -LHalf;i++) {
		r=Math.floor(Math.random() * (L -LHalf-i) );
		this.convert[ LHalf + i ] = remaining[r];
		remaining[r]= remaining[ L-LHalf -i -1 ];
		this.iConvert[this.convert[ LHalf + i ]] = LHalf + i;
	}


/*
	for (i=0;i<L;i++) {
		this.convert[i]=randomizer(i, L);
		this.iConvert[this.convert[i]] = i;
	}
*/

	console.log(this.convert);
	console.log(this.iConvert);

	return this;
}

module.exports = RandomPerm;
