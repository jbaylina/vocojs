/*jslint node: true , browser: true */
/*global window */
"use strict";

// BCJR decoding algorithm
// Follow this doc: http://repositorio-aberto.up.pt/bitstream/10216/19735/2/12017.pdf
// Lu: output it is the LLR(u) give LLR(y)
// y is the LLR(y). It is the sequence that we want to decode.
// LLR(y) = ln(P(0)/p(1)) = ln(P(u=+1)/P(u=-1))
// nums is an array of numeratos of the encoder.
// den is the denominator of the encoder


var ByteBit = require('./bytebit.js');
var lAlg = require('./lalg.js');


function Convolution(nums, den) {
	var self=this;

	function getDegree(p) {
		var d=0;
		var ps = p >>1;
		while (ps) {
			ps = ps >>1;
			d +=1;
		}
		return d;
	}

	function xor(p, mask) {
		var x =0;
		var ps = p;
		var m= mask;
		while (m) {
			if (m & 1) {
				x = x ^ (ps & 1);
			}
			m = m >> 1;
			ps = ps >> 1;
		}
		return x;
	}

	var i;
	self.nMem=getDegree(den);
	for (i=0; i<nums.length; i++) {
		self.nMem= Math.max(self.nMem, getDegree(nums[i]));
	}

	self.nStates = 1 << self.nMem;

	self.nums = nums;
	self.den = den;
	self.nOuts = nums.length;

	var s,x;
	self.tr = [];
	for (s=0; s<self.nStates; s+=1) {
		self.tr[s]=[];
		for (x=0; x<=1; x+=1) {
			var fb = xor( s , self.den >> 1 );
			var res = {
				fb: fb,
				s: ((s<<1) | (fb ^ x)) & (self.nStates -1),
				out: []
			};
			fb = xor( res.s , self.den >> 1 );
			var k;
			for (k=0; k<self.nOuts; k+=1) {
				res.out[k] = fb ^ x ^ xor(res.s , self.nums[k] >> 1);
			}
			self.tr[s][x] = res;
		}
	}

	self.transition = function(s, x) {
		return self.tr[s][x];
	};

	return self;
}


function BCJR(nums, den) {

	var self = this;

	self.decode = function(y, lu) {

		var u=[];

		var n= y.length / self.nOuts;

		var lc = 1;   // lc is the Chanel reliability.

		var g = [];			// gama(k, s', s)
		var a = [];			// alfa(k,s')
		var b = [];			// beta(k, s)

		var res, d, i,j,k, s, sf;


	// Initial values
		a[0] = [];
		a[0][0] = 0;
		b[n]=[];
		b[n][0] = 0;
		for (s=1; s<self.nStates; s++) {
			a[0][s] = -lAlg.INF;
			b[n][s] = -lAlg.INF;
		}

	// First we calculate a and g
		for (k=0; k<n; k++) {
			g[k] = [];
			a[k+1] = [];

			for (sf =0; sf<self.nStates; sf ++ ) {      // sf stands for "state from"
				g[k][sf] = [];
				for (i=0; i<2; i +=1) {
					res = self.tr[sf][i];   // Returns res.s -> new state and res.out the output LSB -> x0, MSB -> xN

					if (i === 0) {
						g[k][sf][res.s] = lu[k];
					} else {
						g[k][sf][res.s] = -lu[k];
					}


					for (j=0; j< self.nOuts; j++) {
						d = (res.out[j] ) ? -1 : 1;
						if (d > 0) {
							g[k][sf][res.s] += y[k*self.nOuts + j]*lc;
						} else {
							g[k][sf][res.s] -= y[k*self.nOuts + j]*lc;
						}
					}


					if (a[k+1][res.s] === undefined) {
						a[k+1][res.s] = a[k][sf] + g[k][sf][res.s];
					} else {
						a[k+1][res.s] = lAlg.lMax(  a[k+1][res.s],   a[k][sf] + g[k][sf][res.s]  );
					}
				}
			}
		}

	// now calculate the b

		for (k=n-1; k>0; k--) {
			b[k]=[];

			for (sf =0; sf<self.nStates; sf ++ ) {      // sf stands for "state from"
				for (i=0; i<2; i +=1) {
					res = self.tr[sf][i];   // Returns res.s -> new state and res.out the output LSB -> x0, MSB -> xN

					if (b[k][sf] === undefined) {
						b[k][sf] = b[k+1][res.s] + g[k][sf][res.s];
					} else {
						b[k][sf] = lAlg.lMax(  b[k][sf],   b[k+1][res.s] + g[k][sf][res.s]  );
					}
				}
			}
		}

	// Calculate the output
		for (k=0; k<n; k++) {
			var r= [-lAlg.INF, -lAlg.INF];

			for (sf =0; sf<self.nStates; sf ++ ) {      // sf stands for "state from"
				for (i=0; i<2; i +=1) {
					res = self.tr[sf][i];   // Returns res.s -> new state and res.out the output LSB -> x0, MSB -> xN
					r[i] = lAlg.lMax(r[i] , a[k][sf] + g[k][sf][res.s] + b[k+1][res.s]);
				}
			}
			u[k] = r[0] -r[1];
		}

		return u;

	};

	self.encode = function(u) {
		var x=[];
		var d,k, i;
		var res = {s: 0};

		for (k=0; k<u.length; k+=1) {
				d = (u[k]<0) ? 1 :  0;
				res = self.tr[res.s][d];

				for (i=0; i<self.nOuts; i++) {
					x.push(res.out[i] ? -1 : 1);
				}
		}

		// Trailing bits to return to state 0
		for (k=0; k<self.nMem; k+=1) {
			res = self.tr[res.s][d];
			for (i=0; i<self.nOuts; i++) {
				x.push(res.out[i] ? -1 : 1);
			}
		}

		return x;
	};


	self.init = function(nums, den) {

		function getDegree(p) {
			var d=0;
			var ps = p >>1;
			while (ps) {
				ps = ps >>1;
				d +=1;
			}
			return d;
		}

		function xor(p, mask) {
			var x =0;
			var ps = p;
			var m= mask;
			while (m) {
				if (m & 1) {
					x = x ^ (ps & 1);
				}
				m = m >> 1;
				ps = ps >> 1;
			}
			return x;
		}

		var i;
		self.nMem=getDegree(den);
		for (i=0; i<nums.length; i++) {
			self.nMem= Math.max(self.nMem, getDegree(nums[i]));
		}

		self.nStates = 1 << self.nMem;

		self.nums = nums;
		self.den = den;
		self.nOuts = nums.length;

		var s,x;
		self.tr = [];
		for (s=0; s<self.nStates; s+=1) {
			self.tr[s]=[];
			for (x=0; x<=1; x+=1) {
				var fb = xor( s , self.den >> 1 );
				var res = {
					fb: fb,
					s: ((s<<1) | (fb ^ x)) & (self.nStates -1),
					out: []
				};
				fb = xor( res.s , self.den >> 1 );
				var k;
				for (k=0; k<self.nOuts; k+=1) {
					res.out[k] = fb ^ x ^ xor(res.s , self.nums[k] >> 1);
				}
				self.tr[s][x] = res;
			}
		}
	};

	self.init(nums,den);

	return self;
}


function BCJREncoder(nums, den, destination) {
	var self = this;

	self.bcjr = BCJR(nums,den);
	self.destination=destination;

	self.processData = function(inB) {
		var i,j;
		var outB=[];

		var u = ByteBit.bytes2bits(inB);
		var x = self.bcjr.encode(u);

		for (i=0; i< u.length; i++) {
			outB.push(u[i]);
			for (j=0; j< self.bcjr.nOuts; j++) {
				outB.push(x[i*self.bcjr.nOuts + j]);
			}
		}

		destination.processData(outB);
	};

	return self;
}


function BCJRDecoder(nums, den, destination) {
	var self = this;

	self.bcjr = new BCJR(nums, den);
	self.destination=destination;

	self.processData = function(inB) {
		var i,j;
		var n = Math.floor(inB.length / (1 + self.bcjr.nOuts));
		var y=[];
		var lu=[];
		for (i=0; i<n; i++) {
			lu.push( inB[i * (1 + self.bcjr.nOuts)] );
			for (j=0; j<self.bcjr.nOuts; j++) {
				y.push(inB[i * (1 + self.bcjr.nOuts) +j +1] );
			}
		}


		var outBits= self.bcjr.decode(y,lu);
		var outBytes = ByteBit.bits2bytes(outBits);
		destination.processData(outBytes);
	};

	return self;

}

module.exports = BCJR;
