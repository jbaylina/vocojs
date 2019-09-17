/*jslint node: true , browser: true */
/*global window */
"use strict";

function bytes2bits(inB) {
	var d,i,j;
	var outB=[];
	for (i=0; i<inB.length; i+=1) {
		for (j=0; j<8; j++) {
			d = (inB[i] & (1 << j)) ? -1 :  1;
			outB.push(d);
		}
	}
	return outB;
}

function bits2bytes(inBits ) {
		var outBytes = [];
		var by,bi, i;
		for (i=0; i<inBits.length  ; i+=1) {
			by = i >> 3;
			bi = i & 0x7;
			outBytes[by] = outBytes[by] || 0;
			if (inBits[i]<0) {
				outBytes[by] = outBytes[by] | (1<< bi);
			}
		}
		return outBytes;
}

exports.bytes2bits = bytes2bits;
exports.bits2bytes = bits2bytes;
