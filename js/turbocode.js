/*jslint node: true , browser: true */
/*global window */
"use strict";

var BCJR = require('./bcjr.js');
var ByteBit = require('./bytebit.js');

function TCEncoder(nums1, den1, nums2, den2, perm, destination) {
	var self=this;

	self.bcjr1 = new BCJR(nums1,den1);
	self.bcjr2 = new BCJR(nums2,den2);
	self.destination = destination;
	self.perm = perm;


	self.processData = function(inB) {
		var i,j;
		var outB=[];


		var u = ByteBit.bytes2bits(inB);
		while (u.length < self.perm.convert.length) u.push(1);

		var up = [];
		for (i=0; i< u.length; i++) {
			up[self.perm.convert[i]] = u[i];
		}
		var x1 = self.bcjr1.encode(u);
		var x2 = self.bcjr2.encode(up);

		for (i=0; i< x1.length / self.bcjr1.nOuts; i++) {
			for (j=0; j< self.bcjr1.nOuts; j++) {
				outB.push(x1[i*self.bcjr1.nOuts + j]);
			}
			for (j=0; j< self.bcjr2.nOuts; j++) {
				outB.push(x2[i*self.bcjr2.nOuts + j]);
			}
		}

		destination.processData(outB);
	};

	return self;
}

function TCDecoder(nums1, den1, nums2, den2, perm, nIterations, destination) {
	var self=this;

	self.nIterations = nIterations;

	self.bcjr1 = new BCJR(nums1,den1);
	self.bcjr2 = new BCJR(nums2,den2);
	self.destination = destination;
	self.perm = perm;


	self.processData = function(inB) {
		var i,j,k;
		var segs = self.bcjr1.nOuts + self.bcjr2.nOuts;
		var n=Math.floor(inB.length / segs);

		var y1 = [];
		var y2 = [];
		var lu = [];
		var lu2 = [];
		var lue = [];

		var c=0;
		for (i=0; i< n; i++) {
			lu.push(0);

			for (j=0; j<self.bcjr1.nOuts; j++) {
				y1.push(inB[c]);
				c++;
			}

			for (j=0; j<self.bcjr2.nOuts; j++) {
				y2.push(inB[c]);
				c++;
			}

		}

		for (i=0; i<self.nIterations; i++) {
			lue = self.bcjr1.decode(y1, lu);
			for (k=0; k<n; k++) {
				if (k<self.perm.convert.length) {
					lu2[self.perm.convert[k]] = lue[k] - lu[k];
				} else {
					lu2[k]=0;
				}
			}

			lue = self.bcjr2.decode(y2, lu2);
			for (k=0; k<n; k++) {
				if (k<self.perm.convert.length) {
					lu[k] = lue[self.perm.convert[k]] - lu2[self.perm.convert[k]] - y1[k*self.bcjr1.nOuts];
				} else {
					lu[k] = 0;
				}
			}
		}

		while (lu.length> self.perm.convert.length) lu.pop();

		var outB = ByteBit.bits2bytes(lu);

		destination.processData(outB);
	};


	return self;
}

exports.Encoder = TCEncoder;
exports.Decoder = TCDecoder;
