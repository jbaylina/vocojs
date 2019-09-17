(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{"./bytebit.js":2,"./lalg.js":7}],2:[function(require,module,exports){
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

},{}],3:[function(require,module,exports){
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

},{}],4:[function(require,module,exports){
/*jslint node: true , browser: true */
/*global window */
"use strict";

/////// CONFIGURATION CONSTANTS
exports.N_BUFF_IN = 4096;
exports.FDIV=128;
exports.N_FRAMES_PACKET=48;


//var usedChannels=[2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101,103,107,109,113,127]; // 31
exports.usedChannels=[]; // 27
var i;
for (i=6; i<=82; i++) {
    exports.usedChannels.push(i);
}

exports.N_PREAMBLE_FRAMES= 1;
exports.N_POSTAMBLE_FRAMES= 1;
exports.LDPC_MAX_ITERS=500;


exports.NUMS1 = [ 0x19, 0xB, 0x15, 0x1F];
exports.DEN1 = 0x19;
exports.NUMS2 = [ 0xB, 0x1F];
exports.DEN2 = 0x19;

//// END CONSTANTS

},{}],5:[function(require,module,exports){
/*jslint node: true , browser: true */
/*global window */
"use strict";

// https://www.google.com/url?sa=t&rct=j&q=&esrc=s&source=web&cd=1&cad=rja&uact=8&ved=0CB8QFjAA&url=http%3A%2F%2Fweb.stanford.edu%2Fclass%2Fee379b%2Fclass_reader%2Fatt3.pdf&ei=8Ya_U9SkGsOU0AWsp4DACA&usg=AFQjCNFxGCBeF1-KTl62fDM-0DQZKF7_3Q
// Following the doc: Design of Flexible-Length S-Random Interleaver for Turbo Codes

function FLSInterleaver(n) {
	var self=this;

//	self.convert = [5,1,3,0,4,2];
	self.convert = [284,49,10,176,75,222,140,191,60,31,252,99,203,118,
	44,233,161,5,276,70,133,25,149,55,185,105,39,224,248,282,210,172,82,126,19,236,265,113,1,65,143,164,194,
	245,302,274,76,95,227,257,13,285,28,204,151,182,86,108,59,130,221,169,35,291,71,239,22,278,188,8,52,259,
	160,138,216,120,100,77,296,16,195,45,235,3,90,268,68,26,287,153,209,168,38,254,128,277,183,111,81,57,293,
	219,20,246,146,174,201,103,269,32,303,134,12,74,228,93,253,42,290,62,116,180,211,152,240,264,127,6,23,170,
	220,69,297,249,36,87,110,200,56,144,177,266,226,131,29,280,157,244,294,208,187,18,256,48,0,92,273,123,165,
	288,150,229,197,9,263,40,84,107,64,299,158,179,205,247,271,53,129,289,225,193,258,141,34,237,214,14,281,79,
	97,171,122,46,4,189,154,207,58,30,132,89,261,231,163,102,196,66,218,51,286,145,24,184,115,83,37,242,270,155,
	202,136,17,223,73,178,283,250,192,94,121,61,298,238,148,43,11,260,109,199,166,88,33,279,139,67,215,234,101,
	54,80,190,114,251,272,206,301,147,173,125,27,47,91,243,106,162,137,267,213,292,72,119,181,21,98,198,232,275,
	85,63,156,112,255,7,142,300,241,124,167,212,78,104,186,15,41,262,135,230,295,175,159,117,217,50,96,2];

	function minCicleLength(p) {
		var i,j;
		var minc = p.length*2;
		var nminc = 0;
		var c;
		for (i=0; i<p.length-1; i++) {
			for (j=i+1; j<p.length; j++) {
				c = Math.abs(i-j) + Math.abs(p[i]-p[j]);
				if (c < minc) {
					minc = c;
					nminc = 0;
				}
				if (c === minc) {
					nminc += 1;
				}
			}
		}

		return {minc: minc, nminc: nminc};
	}

	function findNextPerm(p) {
		var i;

		// Step 1 and 2 and 3
		var mu=-1;
		var lampda = p.length*2;
		var d=[];

		for (i=0; i<p.length; i++) {
			var xi = p.slice(0,i);
			xi.push(p.length);
			xi = xi.concat(p.slice(i,p.length));

			var  res = minCicleLength(xi);

			if ((res.minc > mu) || ((res.minc === mu)&&(res.nminc < lampda)))  {
				mu = res.minc;
				lampda = res.nminc;
				d = [];
			}
			if ((res.minc === mu)&&(res.nminc === lampda )) {
				d.push(xi);
			}

		}


		// step4

		i = Math.floor(Math.random()*d.length);
		return d[i];
	}

	while (self.convert.length <n) self.convert = findNextPerm(self.convert);

	var i;
	self.iConvert = [];
	for (i=0; i<self.convert.length; i++) {
		self.iConvert[self.convert[i]] = i;
	}


	return self;
}

module.exports = FLSInterleaver;

},{}],6:[function(require,module,exports){
/*jslint node: true , browser: true */
/*global window */
"use strict";

var Utf8Utils = require('./utf8.js');

function CRC() {
	var self= this;



	function makeCRCTable () {
		var c;
		self.crcTable = [];
		for(var n =0; n < 256; n++){
			c = n;
			for(var k =0; k < 8; k++){
				c = ((c&1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
			}
			self.crcTable[n] = c;
		}
	}

	self.calculate = function(inArr) {
		var crc = 0 ^ (-1);

		for (var i = 0; i < inArr.length; i++ ) {
			crc = (crc >>> 8) ^ self.crcTable[(crc ^ inArr[i]) & 0xFF];
		}

		return (crc ^ (-1)) >>> 0;
	};



	makeCRCTable();

	return self;
}

function IdCRCEncoder(destination) {

	var self = this;
	self.crc = new CRC();
	self.lastSend = Math.floor(Math.random() * 0x10000);

	self.destination = destination;

	self.processData = function(inB) {
		if (inB.length > 32) {
			throw new Error("Too much data");
		}
		var outB = inB.slice();

		while (outB.length<32) outB.push(0);

		outB.push( (self.lastSend>>8) & 0xFF);
		outB.push( self.lastSend & 0xFF);
		self.lastSend = (self.lastSend +1 ) & 0xFFFF;

		var crc = self.crc.calculate(outB);

		console.log("CRC Gen: "+ crc );

		outB.push( (crc>>24) & 0xFF);
		outB.push( (crc>>16) & 0xFF);
		outB.push( (crc>>8) & 0xFF);
		outB.push( crc & 0xFF);

		destination.processData(outB);
	};

	return self;
}

function IdCRCDecoder(destination) {

	var self = this;
	self.crc = new CRC();
	self.lastCrcReceived = -1;

	self.destination = destination;

	self.processData = function(inB) {
		var crcSended=0;
		var i;
		for (i=0; i<4 ; i++) {
			crcSended = crcSended | (inB[inB.length- 1 - i] << (i*8));
		}

		crcSended = crcSended ^(-1) ^(-1);

		var id= inB[inB.length-5] | (inB[inB.length-6] << 8);

		if (crcSended === self.lastCrcReceived) {
			console.log("Repeated packet received");
			return;
		}

		var crcCalculated = self.crc.calculate(inB.slice(0,inB.length-4));

		crcCalculated = crcCalculated ^(-1)^(-1);

		console.log("crcCalculated: "+crcCalculated);
		console.log("crcSended: "+crcSended);


		if (crcSended !== crcCalculated) {
			var S = Utf8Utils.decode(inB.slice(0,inB.length-6));
			console.log("Invalid packet received: "+id+" - "+S );
			return;
		}

		self.lastCrcReceived =crcCalculated;

		destination.processData(inB.slice(0,inB.length-6));
	};

	return self;
}

exports.Encoder = IdCRCEncoder;
exports.Decoder = IdCRCDecoder;

},{"./utf8.js":15}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
/*jslint node: true , browser: true */
/*global window */
"use strict";

var circ = require("./circ");
var ComplexArray = require("../jsfft/lib/complex_array.js").ComplexArray;
var FFT = require("../jsfft/lib/fft.js");

function OfdmDecoder(aFDIV, aUsedChannels, aDestination) {

	var self=this;


		/////// VARIABLES USED
	self.FDIV=aFDIV;
	self.usedChannels = aUsedChannels;
	self.destination = aDestination;


	//Here is where we store the input data
	self.oldData = new Array(self.FDIV);

	// Here is where we store the phase of the las frame to calculate the diference
	self.oldArg= [  new Array(self.usedChannels.length),
                    new Array(self.usedChannels.length),
                    new Array(self.usedChannels.length),
                    new Array(self.usedChannels.length)];


	// Each frame is codified in 4*FDIV samples
	// We analize chunks of 2*FDIV samples once every FDIV samples.
	// So we analize 4 interlieved times every frame.
	//  |-------*-------*-------*-------|-------*-------*-------*-------|-------*--   Original Signal
	//    |-------*-------|               |-------*-------|                           RxA
	//            |-------*-------|               |-------*-------|                   RxB
	//                    |-------*-------|               |-------*-------|           RxC
	//  --|                       |-------*-------|               |-------*-------|   RxD

	self.curReceiver=0;  // Current receiver beeing analitzed 0..3 )a,b,c,d)

	// We expect data every FDIV samples.
	this.processData= function(inL, of) {

		var i;
		var data = new ComplexArray(self.FDIV*2);

		for (i=0; i<self.FDIV;i++) {
			data.real[i] = self.oldData[i];
			data.real[self.FDIV+i] = inL[of+i];
			self.oldData[i] = inL[of+i];
		}

		var freq = data.FFT();
		var buffOut = new Array(self.usedChannels.length);

		for (i=0; i<self.usedChannels.length; i++) {
			var ch=self.usedChannels[i];
			var arg = 0.5 + Math.atan2(freq.real[ch], freq.imag[ch]) / (2 * Math.PI);
			var darg = circ.norm(arg-self.oldArg[self.curReceiver][i]);
			buffOut[i] = {
				arg: darg,
				mod: Math.sqrt(freq.real[ch]*freq.real[ch] + freq.imag[ch] * freq.imag[ch])
			};
			self.oldArg[self.curReceiver][i] = arg;
		}

		self.destination.processData(buffOut,0);

		self.curReceiver = (self.curReceiver + 1) %4;
	};

	return self;
}

function OfdmEncoder(aNPreambleFrames, aNPostambleFrames, aFDIV, aUsedChannels, aDestination) {
	var self = this;

	self.nPreambleFrames = aNPreambleFrames;
	self.nPostableFrames = aNPostambleFrames;
	self.FDIV = aFDIV;
	self.usedChannels = aUsedChannels;
	self.destination = aDestination;
	self.oldF = [];

	this.getPreambleFrame = function() {
		var i;
		var dataFrame = new Array(self.usedChannels.length);
		for (i=0; i< self.usedChannels.length; i+=1 ) {
			dataFrame[i] = Math.random() > 0.5 ? -1 : 1;
		}
		return dataFrame;
	};

	this.generateFrame = function(oBuff,oOf, iBuff, iOf) {
		var i, A;
		var fdata = new ComplexArray(self.FDIV*4);
		for (i=0; i<self.usedChannels.length; i+=1) {
			var d = self.oldF[i];
			if ((iOf + i >= iBuff.length) || (iBuff[iOf + i] < 0)) {
				d = -d;
			}
			A= self.usedChannels[i]< self.FDIV/10 ? self.FDIV/10 : self.usedChannels[i];
			A= self.usedChannels[i]<13 ? 32*13 : 32 * (self.usedChannels[i] -13) +(32 *13);
			fdata.imag[self.usedChannels[i]*2] = d * A;
			fdata.imag[4*self.FDIV - self.usedChannels[i]*2] = - d * A;

			self.oldF[i]=d;

		}

		var data = fdata.InvFFT();

		for (i=0; i<self.FDIV*4; i++) {
				oBuff[oOf+i] = data.real[i]*0.001;
		}
	};

	this.processData= function(inL) {
		var i;
		var nDataFrames = Math.ceil(inL.length / self.usedChannels.length);
		var dataFrame;

		var outL = new Array( (self.nPreambleFrames + nDataFrames + self.nPostableFrames)* self.FDIV * 4 );
		var of =0;

		for (i=0; i<self.usedChannels.length; i++) {
			self.oldF[i]=-1;
		}

		for (i=0; i<self.nPreambleFrames; i++) {
			dataFrame = self.getPreambleFrame();
			self.generateFrame(outL, of, dataFrame, 0);
			of += self.FDIV*4;
		}

		for (i=0; i<nDataFrames; i++) {
			self.generateFrame(outL, of, inL, i*self.usedChannels.length);
			of += self.FDIV*4;
		}

		for (i=0; i<self.nPostableFrames; i++) {
			dataFrame = self.getPreambleFrame();
			self.generateFrame(outL, of, dataFrame, 0);
			of += self.FDIV*4;
		}

		self.destination.processData(outL);
	};

	return self;
}

exports.Encoder = OfdmEncoder;
exports.Decoder = OfdmDecoder;




},{"../jsfft/lib/complex_array.js":17,"../jsfft/lib/fft.js":18,"./circ":3}],9:[function(require,module,exports){
/*jslint node: true , browser: true */
/*global window */
"use strict";

// This module, takes data from the ofdm and try to detect frames.
var circ = require("./circ");


function PacketDetector(aNChanels, aNFrames, aPerm, aDestination) {
	var self=this;
	var i;


	self.perm=aPerm;
	self.nChanels = aNChanels;
	self.nFrames = aNFrames;
	self.destination = aDestination;
	self.nSyncBits = Math.floor(aNFrames * aNChanels / 2 + 0.5);
	self.nSyncThreshold =  7 * 0.5*Math.sqrt(self.nSyncBits);
//	self.nSyncThreshold = 450;
	self.curReceiver=0;  // Current receiver beeing analitzed 0..3 )a,b,c,d)

	self.rxBuf = [];
	self.rxBufMod = [];
	self.curRxBuf =[];

	self.bestAcc=0;
	self.bestT=0;

	self.lastPacket=[];
	self.lastPacketMod=[];

	self.t=0;   // This is just an interval sended to the output. This is generaly used by the destination to check that the same frame
				// is not received more than once from the diferent interleaved receivers.

	for (i=0; i<4; i+=1) {
		self.rxBuf[i] = new Array(self.nChanels * self.nFrames);
		self.rxBufMod[i] = new Array(self.nChanels * self.nFrames);
		self.curRxBuf[i]=0;
	}

	this.getBit = function(b) {
		var p = self.perm.convert[b];
		var i = (self.curRxBuf[ self.curReceiver ] + p ) % (self.nChanels*self.nFrames);

		var res = 4*Math.abs(self.rxBuf[self.curReceiver][i]-0.5) -1;

		if (b&1) res = -res;

		return res;
	};

	self.isSybcBitOk = function(b) {
		var p = self.perm.convert[b];
		var i;
		var pp, bb, l;
		var err=0;
		var nerr=0;
		var arg;
		if (p>=2*self.nChanels) {
			pp = p - 2*self.nChanels;
			bb = self.perm.iConvert[pp];
			i = (self.curRxBuf[ self.curReceiver ] + pp ) % (self.nChanels*self.nFrames);
			l = (bb & 1) ? 0.5 : 0;
			err += circ.err(self.rxBuf[self.curReceiver][i], l);
			nerr ++;
		}
		if (p<  (self.nChanels*self.nFrames) - 2*self.nChanels) {
			pp = p + 2*self.nChanels;
			bb = self.perm.iConvert[pp];
			i = (self.curRxBuf[ self.curReceiver ] + pp ) % (self.nChanels*self.nFrames);
			l = (bb & 1) ? 0.5 : 0;
			err += circ.err(self.rxBuf[self.curReceiver][i], l);
			nerr ++;
		}
		err = err / nerr;
		i = (self.curRxBuf[ self.curReceiver ] + p ) % (self.nChanels*self.nFrames);

		arg = circ.norm(self.rxBuf[self.curReceiver][i] - err);

		var res = 4*Math.abs(arg-0.5) -1;

		if (b &1) res= -res;
		return res;
	};


// This function is called 4 times in every frame period. This is equivalent to having 4 receivers and rotating the reception on
// each call. curReceiver is incremented in a nod4 basis.
//  |-------*-------*-------*-------|-------*-------*-------*-------|-------*--   Original Signal
//    |-------*-------|               |-------*-------|                           RxA self.curReceiver=0
//            |-------*-------|               |-------*-------|                   RxB self.curReceiver=1
//                    |-------*-------|               |-------*-------|           RxC self.curReceiver=2
//  --|                       |-------*-------|               |-------*-------|   RxD self.curReceiver=3

	self.processData= function(inL, of) {
		var i,j;
		var tt=self.t;
		for (i=0; i<self.nChanels; i+=1) {
			self.rxBuf[self.curReceiver][self.curRxBuf[ self.curReceiver ] + i ] = inL[i].arg;
			self.rxBufMod[self.curReceiver][self.curRxBuf[ self.curReceiver ] + i ] = inL[i].mod;
		}
		self.curRxBuf[ self.curReceiver ] += self.nChanels;
		if (self.curRxBuf[ self.curReceiver ] === self.nChanels*self.nFrames) {
			self.curRxBuf[ self.curReceiver ] = 0;
		}

/*		if (self.t> self.nFrames*4) {
			console.log("in");
		}
*/
		var acc =0;
		for (i=0; i<self.nSyncBits; i++) {
//			if (self.getBit(i) > 0) {
			acc += self.isSybcBitOk(i);
		}

		if (acc <= -self.nSyncThreshold) {
			console.log("Inverted packet detected");
		}

		var buffOut = [];
		if ((acc>= self.nSyncThreshold) &&
			((acc>self.bestAcc) || (self.t-self.bestT > 4*self.nFrames)))
		{


			var packet = self.rxBuf[self.curReceiver]
										.slice(self.curRxBuf[ self.curReceiver ], (self.nChanels * self.nFrames))
								.concat( self.rxBuf[self.curReceiver]
										.slice(0, self.curRxBuf[ self.curReceiver ]));

			var packetMod = self.rxBufMod[self.curReceiver]
							.slice(self.curRxBuf[ self.curReceiver ], (self.nChanels * self.nFrames))
					.concat( self.rxBufMod[self.curReceiver]
							.slice(0, self.curRxBuf[ self.curReceiver ]));

			self.lastPacket = packet;
			self.lastPacketMod = packetMod;
			self.bestAcc=acc;
			self.bestT = self.t;

			window.setTimeout(function() {
				console.log("Packet received: "+ acc+ "/" + self.nSyncThreshold);
				self.destination.processData(packet, acc);
//				updateAnalizer();
			},0);
		}

		self.curReceiver = (self.curReceiver + 1) %4;
		self.t += 1;
	};

	return self;
}

function PacketGenerator(aNChanels, aNFrames, aPerm, aDestination) {
	var self=this;


	self.perm=aPerm;
	self.nChanels = aNChanels;
	self.nFrames = aNFrames;
	self.destination = aDestination;
	self.nSyncBits = Math.floor(aNFrames * aNChanels / 2 + 0.5);

	self.putBit = function(oBuff, oOf, d) {
		if (d === undefined) d = 1;
		var p = self.perm.convert[oOf];
		oBuff[ p] = (oOf & 1) ? -d : d;
	};

	self.processData= function(inL) {
		var i;
		var outB = new Array(self.nChanels* self.nFrames);

		for (i=0; i< self.nSyncBits; i+=1) {
			self.putBit(outB, i , 1);
		}

		for (i=0; i< self.nChanels* self.nFrames - self.nSyncBits; i+=1) {
			self.putBit(outB, self.nSyncBits + i , inL[i]);
		}

		self.destination.processData(outB);

	};

	return self;
}

exports.PacketDetector = PacketDetector;
exports.PacketGenerator = PacketGenerator;


},{"./circ":3}],10:[function(require,module,exports){
exports.convert3696 = [3430,1386,2700,874,222,2376,3050,2942,2938,2594,3526,556,2808,1124,1776,798,246,564,1286,1514,3356,528,3104,2298,2276,3654,3010,2624,2950,964,2584,722,1616,2256,386,576,3684,286,2386,2930,240,1596,3022,2796,2738,1958,68,1992,1130,92,314,1436,928,3308,2350,1914,886,2142,2060,708,2014,3458,3096,1720,3488,3650,1084,268,3102,1706,412,1668,3566,568,374,3244,1670,574,852,2922,736,2248,2384,808,2214,2104,2992,894,900,694,2274,3382,1498,3118,1222,1350,2788,1856,2206,3264,3422,540,3562,180,3272,1726,912,1924,1116,3686,2954,1014,1564,2656,2476,1806,2998,1878,34,2496,1492,3462,1320,1476,1620,2776,90,2140,3360,1610,140,2148,1178,976,1420,1784,2472,212,1602,376,3150,2212,3536,954,1466,1088,2146,1788,1086,1462,916,1110,1260,1122,3538,560,2842,3590,2262,1506,3124,2698,3328,1900,590,1918,608,2620,2092,2686,1516,2096,1690,290,1844,998,2976,1594,2156,794,2598,1740,150,550,2260,1418,2834,2510,100,3250,3380,2076,2986,1994,2692,220,354,3174,3614,2506,638,2388,2644,1546,2068,3254,934,3484,3436,918,1644,1926,3386,1750,3520,402,1998,3242,750,614,552,1308,2486,1892,2730,3152,486,3064,2548,2164,2848,1870,1584,2100,2844,654,1984,3238,842,3006,616,154,502,1164,2666,1456,2896,1406,1582,2404,558,1812,2798,1154,542,238,1322,3574,78,1268,1550,2220,2282,892,406,1340,2154,768,3676,356,2394,3448,2714,2970,3460,1820,3390,1402,3404,938,1360,1762,1638,1236,292,3476,986,2268,1024,3222,188,3416,854,2898,1630,94,2812,414,660,1152,1814,1830,3008,2802,3564,1628,1366,2428,2202,350,3206,416,2640,2706,2278,2642,382,1094,650,1210,2000,960,466,2580,3214,2924,1310,2850,2852,224,2344,76,2632,2204,3636,2516,3034,218,338,666,756,972,1934,1218,1606,2716,1332,2574,1126,326,1612,130,1868,2782,2056,2186,3496,446,1274,3302,3342,1248,804,982,3256,26,898,2600,370,1954,2890,2436,1030,448,2070,2634,752,754,696,3156,946,1772,2294,248,1432,3674,944,1182,3550,3168,1202,516,170,1356,2828,328,2236,3410,2576,2448,2244,2498,2676,2480,3314,1488,440,316,566,2066,200,3084,3198,2072,3682,74,424,2292,1888,3274,3072,1450,588,3548,3054,2602,3508,2124,1500,594,2684,2582,602,2442,622,2868,1624,3454,1836,2790,830,880,1656,2106,2006,2770,1134,2360,3202,2912,1410,2228,3140,3338,156,3216,732,2252,1066,1300,1574,2712,1128,796,1570,1278,2894,84,2764,282,2010,1398,2554,1174,254,1754,2778,1646,2670,1224,2742,742,2904,178,1940,2546,1654,266,2090,10,1798,2786,1688,118,3612,1864,3092,3110,322,480,2892,1266,144,2532,3504,2982,274,724,1338,690,604,3658,1768,772,1288,398,686,2026,1962,1302,1534,1970,822,2512,2708,702,970,1474,3182,2694,3420,276,1200,1708,512,1316,1234,132,2324,2590,2586,3586,3666,1802,2900,2872,450,2088,2144,102,1138,2784,2658,1422,942,2502,1662,3582,1442,1894,2,242,1906,3116,3240,2910,3464,2934,3394,2422,2210,3068,1556,208,404,2544,24,3120,1342,1098,3426,2804,3366,3384,2034,644,2618,3310,3544,2484,2222,3236,1252,1448,3080,3100,2398,1922,904,3074,872,6,2652,2366,2780,3530,2128,346,2846,652,3446,632,352,1352,990,2826,3518,1150,1484,1522,2762,2162,3224,3170,3106,2932,1746,3512,3680,1160,1038,2200,3348,3282,2340,3200,426,388,2596,2352,1034,3370,1728,3108,786,1068,2094,3192,184,344,3414,1336,70,2346,2864,3532,2638,2194,2724,3352,2876,2978,1692,744,1324,994,362,3262,1394,782,882,2408,3158,2908,2654,1250,136,234,1214,2080,46,2420,948,2752,3284,680,2338,776,2440,1988,420,1938,1334,1240,310,3490,1404,3688,2604,1774,778,1392,1558,3154,1262,1378,2178,2720,3258,3456,2082,2414,3450,3280,408,2818,456,204,2534,28,2036,3598,2964,1976,1312,1854,2958,3648,3398,2312,3412,3048,2746,306,1440,1532,2114,530,3180,2822,2438,312,1786,3616,2432,1010,2792,1810,1080,2646,1840,2474,2866,2246,1408,2098,2860,2242,1204,3510,1364,978,1254,2920,1074,72,488,848,600,1966,1056,3346,66,436,2882,3136,3320,2566,294,1686,3276,1766,1578,3218,3046,3324,2836,40,458,3260,2748,1808,1972,2158,32,2974,1858,2690,358,202,1538,3646,3630,3558,1486,860,3542,1850,1428,1140,1044,720,952,196,1220,198,260,3524,4,3088,840,1764,106,3056,734,3000,3032,3234,214,2078,1744,298,2042,3364,668,2054,434,1460,1502,3228,3278,1370,2492,3298,3498,2048,1598,1672,2134,1562,1374,2952,2862,3270,520,1284,3662,1948,1194,2524,120,2012,3036,2518,802,2452,3122,598,2468,1568,3334,2928,54,1586,1600,1264,392,2028,2446,226,80,3340,3540,774,2270,2050,1702,3208,3660,1238,3014,30,522,468,2370,846,3196,3640,956,2316,138,3522,16,820,3692,3288,1212,1852,2906,544,2874,2774,230,2736,1794,1102,3486,3126,1060,3514,2494,3638,3078,2182,2578,1664,3322,1096,656,672,2674,844,3402,1704,3452,2326,534,2062,2382,3062,336,3478,2682,2288,2772,252,390,3210,1058,3634,2300,2936,3444,828,182,1928,1974,896,3020,748,284,1158,3576,3178,210,3350,3434,2342,2240,1002,876,2378,580,372,3304,2460,2150,2392,1908,324,2336,3392,3016,410,1714,2004,1120,3326,460,3026,22,1244,2540,1132,3112,902,856,2280,2728,914,698,706,2536,3670,1942,2688,628,738,334,232,1512,1148,476,2482,216,1736,1146,3418,1184,1022,1614,2356,2286,1684,2680,2820,3306,582,642,612,1090,3226,304,2956,1722,1770,1792,538,2120,1540,1078,1718,1996,548,1848,1290,1698,780,3220,1054,1524,264,2272,1666,788,2612,2608,766,1592,3600,2322,2726,764,1072,2306,360,2410,1400,1258,728,44,3644,3166,648,1348,674,2588,2564,1170,1536,2902,2858,2704,1076,518,726,1230,3516,3584,1828,2044,472,924,172,1832,104,2526,3024,910,2760,1860,864,2504,1572,3030,2462,2196,98,2570,272,2610,1882,3144,968,1494,2592,866,380,1282,3252,1032,1206,2254,3466,1710,2184,1530,2052,1916,836,1198,634,2152,3358,2558,1294,3428,1956,194,1482,1298,888,2990,2968,770,3176,3568,1622,2458,1216,2320,824,258,624,640,3528,348,2138,3492,3400,2308,908,3678,3368,746,1092,2084,716,38,1650,3578,1454,3626,670,3128,1446,330,510,1136,2074,1012,1932,2110,2008,1682,1800,2530,1780,2562,42,2722,302,2456,1304,1508,152,454,3248,496,1478,1738,1642,2166,1872,192,2880,3332,2940,1026,1528,3442,88,2400,2572,1896,2020,3052,494,1296,2330,1028,3620,658,1396,2814,1036,1272,2988,500,2710,1678,1232,2190,296,2664,1796,884,1372,430,250,3232,1416,1782,168,974,2870,2108,684,2854,2832,980,578,2672,1712,812,3552,2800,2354,3286,332,3042,3432,1724,2520,1004,2794,1470,2996,2180,514,718,2556,606,2296,1380,1434,730,1330,364,1676,2886,2678,1186,784,1904,146,3344,160,176,906,2426,56,1388,164,2284,340,758,3312,1042,148,3038,1424,2630,3090,1228,1804,878,114,3268,2364,2732,2888,1468,1694,1226,2734,2668,1838,1700,2980,3354,814,158,2170,1730,1912,806,2132,2430,1188,3162,3656,1946,0,2390,422,2024,1208,3572,3094,432,2040,1376,586,1950,3378,142,2550,596,800,2168,504,922,1640,1884,320,3076,816,124,112,1944,1648,1608,2750,2192,2984,1242,1104,1176,2856,3160,1292,498,442,2412,2368,2290,692,2660,464,868,3114,50,700,932,280,1920,2332,3138,318,3294,3438,2216,2756,506,3374,1070,2560,996,524,2884,2508,1114,834,1680,52,64,2488,1898,2226,2372,2948,1346,1548,992,1930,936,2718,1358,1760,1018,1480,1306,1554,418,3066,278,3694,2198,2348,2944,1196,126,1826,1748,570,1458,826,1876,1880,1566,2176,1952,1618,1822,1590,1390,108,2266,1270,532,3330,2188,3396,546,562,3132,428,1362,1046,1384,1834,1180,3472,1902,2310,2514,1846,1982,3318,2766,3628,166,2130,3148,3570,1980,1886,3622,664,1696,62,3316,8,2116,1964,2490,484,2416,2224,2250,3610,2740,162,3388,1326,1000,1652,190,396,1632,2334,1752,1016,400,366,2838,2542,122,3086,3468,1328,490,1008,2824,206,962,1758,1430,3592,3494,2648,270,3212,2424,3186,3266,3606,1276,926,1190,1452,2522,2918,3172,2994,128,2454,2122,60,572,20,3594,1100,3546,482,96,342,3058,2406,988,438,2118,474,2232,792,1576,2650,2916,1816,2478,1382,2702,478,2258,2018,3146,2174,626,2264,2314,2806,2972,1910,1732,1172,1168,3580,1990,48,940,1604,470,2374,2606,2380,1542,2840,1658,3002,3004,1936,536,1986,1674,1280,1580,58,3134,1192,1756,1862,704,592,3296,3588,620,1734,1544,174,2946,3652,1246,1472,2960,228,2112,3290,2696,244,1166,2626,2914,2304,2058,1978,2362,3012,610,1866,920,1526,850,790,3372,2628,630,2636,2444,1790,678,300,1426,1818,3408,3070,2086,2538,2754,984,3632,1412,2966,1588,2002,2302,3336,662,760,462,3406,1354,682,3204,1118,1162,1256,1414,930,3194,1510,1518,1040,966,740,2926,3500,186,1106,554,492,2234,2160,1824,2470,1438,3560,368,1368,3690,2230,1496,1444,3040,2218,3424,2614,1960,3362,1716,3664,2022,256,3482,2208,676,3082,3188,1890,890,2046,2358,1560,3184,14,1006,2450,1660,1048,710,2396,1504,2500,384,2318,308,2810,1052,958,18,1064,1142,2238,618,1082,3440,3190,1636,2528,3474,116,1842,810,2744,2616,3292,82,1968,236,3672,1050,3642,3130,1742,2032,1874,2464,12,444,3534,452,584,838,134,3300,3028,3624,3608,2878,3164,262,2662,1020,2768,3142,2126,636,1626,3596,1314,3668,3376,3602,3230,1062,394,36,2552,3018,3554,818,858,3556,2568,1490,1344,762,2102,950,378,3618,1144,2064,646,714,832,508,3044,3604,2030,1112,2418,1318,870,2038,1464,3098,688,3502,288,2172,1108,2758,3480,862,1520,2402,2016,1634,3470,2136,2328,3246,2816,1156,110,712,1778,526,1552,3506,2434,3060,2962,2830,86,2466,2622,2345,2433,1289,2329,2653,829,107,1993,905,3347,3271,907,3385,1903,2539,287,1519,1401,2597,3575,1273,1069,2735,189,1647,3115,437,2823,1791,31,1139,3101,1787,2047,1251,2145,103,1201,2097,283,1767,493,3279,3057,3049,397,1687,77,215,1857,1097,951,597,3499,1575,1747,983,2403,603,1617,1033,2993,3177,1867,3205,467,3085,219,341,2529,2951,1535,2665,3555,589,3095,761,1337,2183,1003,229,2983,3315,269,557,2861,2231,1293,2445,2509,1723,2067,3121,3613,2785,1667,125,2177,3431,751,3567,133,1189,715,3293,1513,541,935,3039,3275,1391,689,1623,1443,669,1023,3391,1233,1737,1893,927,2045,461,1423,255,2195,3581,987,1183,577,1689,3587,795,3483,3487,865,1611,3251,1703,3501,3147,2371,1837,27,391,1653,729,1153,2065,3471,2493,2083,777,3181,3519,3505,1953,2425,1995,2931,1035,3367,2281,379,1503,3677,333,2567,1291,3175,3573,2119,1743,2795,3197,875,3441,3685,3439,9,2121,631,101,3253,3659,3029,143,2727,1301,3083,327,425,3109,1099,2107,3219,1277,3379,3637,2031,1945,2625,3105,3461,3585,3001,1471,1013,947,49,3401,3539,2869,1677,2481,491,2099,3569,1815,3299,711,779,2351,2479,1075,2325,3459,1751,827,3629,831,2443,3201,393,3037,2321,91,475,2943,405,1249,1407,2761,1205,1431,2633,297,449,135,1915,2053,2353,3435,2117,3241,2639,1047,1319,3087,2753,1771,3489,2781,231,1157,2075,2431,2109,2363,1377,2849,2847,2645,887,3023,1147,1495,1171,2397,849,2515,1963,1635,121,3503,3537,41,177,3229,2365,421,43,2237,2971,2221,451,481,1913,1733,2737,2589,2739,911,3547,2839,871,675,2755,1389,3093,1685,2779,1041,697,3421,1275,723,509,2541,1559,811,3389,3051,965,1989,1083,1765,2379,1591,1039,497,853,3297,2629,813,2655,2803,2829,2253,3157,1163,1371,1485,2553,3353,683,1191,2807,3437,1711,2435,3179,3081,3089,2683,23,1515,227,3235,3623,835,1417,2919,2963,3139,903,3563,3541,1011,2233,1641,3579,1645,3509,753,2863,453,1507,1841,2845,71,1311,1057,1971,1985,771,2495,1755,1457,3639,1983,3451,2039,2711,2893,2559,113,1865,1563,995,2647,2059,2297,2707,2723,2875,2079,3515,3525,667,3689,1339,2251,989,1353,1091,2333,1621,3661,1009,2391,2407,3485,3133,717,1043,2793,3239,1759,81,2029,2199,1113,2517,583,203,2911,2463,2587,1987,3565,3653,743,941,489,1901,2809,411,2035,2989,3021,681,2265,571,1997,2501,39,285,1445,759,339,1161,1579,1357,455,1757,149,1891,2973,3593,2249,713,2327,279,2775,3345,687,2373,2923,3055,789,15,151,1347,2275,435,3073,2887,2383,897,2891,1843,3611,2877,1753,3599,889,2979,273,2497,895,1279,1217,2409,1613,2855,2471,385,433,3285,3237,1123,1683,187,3663,1169,3137,1873,1045,53,1231,1385,837,1381,1805,3633,1597,1967,281,3011,973,1567,511,885,1907,763,651,877,2451,2187,409,199,2709,2687,787,2569,2247,3531,2455,1795,67,2657,2935,169,1489,2765,1259,197,3495,2235,2977,1121,191,823,1469,2733,1539,1351,1,2757,2267,1819,3277,3469,1303,797,815,1081,1245,2411,3695,3577,2899,967,3589,3671,3557,2643,2811,3269,1829,2189,609,195,3061,145,921,1399,1863,559,3045,63,783,2169,2873,3595,2193,3445,747,2349,2305,1235,1659,2627,661,3225,2997,2017,2125,2503,665,3305,3259,1131,2581,1195,2815,1015,1827,3511,1937,55,2571,2175,1141,773,3457,223,1731,727,247,2717,1655,619,617,1525,3423,1211,2663,1835,971,1315,1849,1523,1923,733,2447,2507,1887,117,1727,859,3527,2991,1885,3619,2229,1387,1851,2013,213,2851,3687,1807,2801,1433,749,1817,2393,267,955,3287,757,139,2619,2401,845,1951,3209,35,2799,2611,1219,3447,141,3407,2565,1625,137,3409,1543,3161,1101,3053,3159,1897,2667,3301,381,85,2269,3523,1749,3189,2063,1223,2585,1825,2465,2857,2259,1763,1103,2331,1547,147,2641,1435,1483,2671,517,573,2033,2635,545,305,2751,1509,1481,329,2377,1379,1715,2773,2337,737,387,2987,533,1333,575,441,3267,1895,1409,2601,3211,3123,1159,3319,3195,1919,3185,2419,931,767,2299,2311,2651,2173,933,65,1257,3513,2441,3397,1721,1769,561,957,399,549,2817,1367,1975,1941,2907,3369,2149,3413,1295,1643,423,1741,363,2593,1133,2139,1855,519,531,2813,1879,1135,1605,1661,303,781,1925,3069,499,2085,1499,51,961,3419,2003,459,1517,1143,1403,2897,525,1631,2725,1019,1129,1783,331,2171,351,275,1185,2835,1125,2701,239,201,3027,847,1797,1577,699,1601,3015,155,641,591,33,2913,2909,945,1155,1053,1193,2969,2413,3377,3307,981,925,1173,1151,2287,2057,1981,943,535,3601,369,2825,2405,3327,3047,2355,3605,2511,843,2623,1459,899,3291,2703,2697,1927,2731,413,3507,3325,909,17,505,465,3425,2759,1627,3303,257,1581,367,3479,357,2689,3339,1537,869,809,115,1905,639,2693,963,251,171,563,2133,3165,3543,301,1665,2583,3333,937,245,2859,2113,3131,565,1021,319,207,3119,745,1785,2043,2921,1955,395,2263,1477,1405,3349,615,217,3169,2153,237,123,769,1413,1679,3323,1821,2477,1177,1213,2609,419,1229,2749,401,3065,1119,3145,1395,1979,1877,2357,1943,2313,75,1991,643,507,1511,111,2271,3609,1541,2131,1571,2037,1373,1593,57,183,3043,1935,1067,741,3673,2771,2485,2461,2747,1595,3151,2061,443,1899,1961,3559,2679,991,3111,2783,775,841,3607,1725,1281,3683,3467,851,2661,1959,293,3675,2101,3077,2713,2335,3335,553,307,1359,1917,663,185,2491,59,2051,999,2399,685,2429,1167,1225,153,593,3155,1269,445,3449,3041,335,659,1375,3621,3,3331,861,1615,881,2303,2007,375,2273,3223,801,317,2387,2023,2203,2201,2719,581,2579,309,1411,1609,3135,2685,1439,1533,1637,1599,407,355,2077,2185,1363,1325,361,1699,3597,2959,997,595,3667,2767,3059,265,1165,607,719,2049,3075,3359,1527,709,3005,1729,3309,1709,513,3417,1671,1187,3375,2595,1441,2929,2673,2219,97,2385,431,2905,1529,3273,2603,2631,3643,3561,1263,2025,3193,2081,1117,1999,2127,2073,1573,1109,79,1639,2359,3265,2375,1845,469,3207,1393,539,1241,501,1261,2215,429,1453,923,1497,2881,1673,3571,3665,3603,2879,1427,3649,3317,1105,457,3473,913,3617,2533,1831,2291,1969,1063,225,2925,2255,1811,3167,1947,2551,2927,1789,3103,1077,1209,1505,2213,3199,1813,3153,2307,735,233,2743,1335,3113,2487,127,1781,2469,2207,2555,2531,1939,647,1823,673,2883,129,2945,2769,855,3213,1127,2289,377,3249,793,3373,2535,2885,3217,2985,1089,839,879,2457,3669,2021,503,373,2279,3693,3313,3627,1345,3255,73,791,1059,277,807,1629,1305,2981,3491,165,803,629,1419,627,2179,919,2961,61,241,2155,417,163,701,2833,1957,1717,3233,3433,2227,1307,69,2853,3141,2341,785,1327,1977,3017,821,1871,2301,2677,2965,599,1007,2011,635,3475,979,1283,2369,3263,479,2827,3099,657,2831,707,649,1271,2999,2211,3231,739,2225,1397,343,3551,2389,1739,1861,1087,3455,2821,2315,2649,3031,3641,3679,625,3429,2475,1341,3019,1793,1447,2069,2949,2437,2523,1085,2763,2967,953,3013,601,109,2395,613,3071,2151,2915,2137,2889,1803,605,2439,3247,819,521,1005,2489,1247,1569,83,1745,25,1521,1889,1501,2089,1001,2347,3025,3191,359,2449,579,3399,1343,1349,1847,3403,2319,2115,1633,2549,1115,3481,1331,2041,1197,3655,2729,1199,193,3143,1921,209,3443,2819,3521,637,2527,3171,2867,1299,403,1287,1649,985,463,2205,2277,1467,1179,159,1675,2159,2953,173,1455,383,3355,1933,2245,1461,2681,2975,1463,2453,1799,3067,2129,2181,1695,1619,1761,2901,175,3363,95,2165,1773,1475,2787,959,2071,3341,1839,1181,2573,3465,543,7,3337,1557,857,243,2309,3533,3365,3477,2143,47,2423,1973,439,2087,567,1553,2903,2957,3221,3635,2895,1451,2615,1911,2605,2805,671,3289,2789,3183,1051,473,2741,3033,1859,1603,19,3549,1061,313,1227,1383,3535,1071,1421,1691,3415,2547,1361,389,1321,2521,1221,2545,3149,2157,2417,37,587,1681,2797,3343,2467,2285,939,3615,2339,2871,515,1329,691,1049,1239,167,2917,3427,3645,1285,703,3261,2027,693,2093,1255,261,1705,119,1713,1833,893,1589,427,337,3497,3657,2841,3357,323,3243,2483,2843,2095,3361,289,2459,1137,977,1853,29,1531,45,2865,2241,415,1065,3173,1429,1875,2621,2135,3203,325,917,3395,2947,3009,2257,633,1909,2675,495,3035,2705,1309,2699,1565,3311,2261,1149,2019,3245,93,537,3079,181,3129,1869,3117,1323,2295,2505,551,3583,1697,2415,3651,1587,891,1317,1243,2293,1207,2791,1437,993,1355,2563,1801,1093,105,3007,901,2209,1545,2837,731,235,1775,2473,1145,2659,2367,3329,259,817,3411,2323,13,1949,2055,295,1267,3463,487,1487,99,2091,477,3405,2217,3097,1025,2361,2147,2525,1549,2745,1735,653,3371,211,1265,623,179,3125,315,1883,2001,253,2105,1029,529,547,3631,87,447,157,2607,611,1585,2223,833,2103,1465,2715,345,2239,3381,353,1493,3647,2669,2283,2937,1175,3383,2695,2191,1561,2427,2009,825,1931,3257,523,2591,1881,1037,2123,11,655,3227,2557,3215,3387,3281,1203,3591,883,2519,1473,1555,527,1779,1107,2243,2955,725,2343,3295,2691,2577,765,929,1449,1369,271,2141,2161,3393,2421,2995,205,2637,2575,2537,721,2015,1079,1719,1297,1701,1583,3453,1607,2317,645,3163,1777,949,1809,3063,1669,1017,3003,1425,585,1663,371,2939,249,131,2561,471,221,3127,21,2777,555,1965,3625,3553,3091,3529,347,1095,2613,1929,2933,569,291,3691,677,3321,873,1027,299,1237,1365,321,621,2941,485,863,1693,3351,1551,2599,1215,161,3681,3545,1073,969,805,3517,1055,2111,1031,1111,915,695,2721,1415,679,365,311,3187,3107,2381,1651,1253,3493,263,1707,867,1657,799,3283,705,483,975,1491,2005,2499,5,2197,755,1313,349,89,2167,1479,2617,2163,2513,2543];
exports.iConvert3696 = [1333,2416,560,2897,818,3684,601,3288,1483,2027,489,3548,1757,3476,1714,2329,902,2738,1729,3325,1541,3615,990,2203,576,3200,365,1991,719,3397,891,1877,794,2696,118,2537,1786,3346,1168,2304,787,2134,1189,2139,1070,3399,680,3298,1579,2057,1382,2661,1405,2367,872,2479,1291,2832,1597,2878,1539,3101,1481,2449,1406,2619,772,2398,46,3114,652,2228,765,3084,415,2818,331,1895,258,2983,880,2277,1746,3198,467,2557,1845,3513,1211,3689,126,2084,49,3430,295,3275,1546,2963,1107,3484,188,2030,549,1884,1095,3458,822,1854,1447,3180,1835,2823,1359,2244,1307,2755,1740,2507,493,3375,860,2131,1508,2795,1358,1944,1432,3044,1536,3055,351,3610,537,1949,1763,2096,676,2546,900,2531,130,2542,1346,2034,502,2443,1285,2573,1299,2314,182,2330,1195,2886,241,2693,454,3515,1322,3250,1287,3648,1493,3105,1293,3093,1472,3362,1243,2401,392,2761,1093,3254,1609,3273,1288,2135,483,3502,103,3433,954,2833,648,2876,1677,2361,290,1871,1498,2410,1204,3229,1138,2441,813,2405,815,2389,410,2685,799,2283,717,3581,1515,2778,573,3232,964,3499,137,2518,828,1896,1014,2791,337,1915,195,3613,4,2485,329,3020,879,2205,1615,1928,912,2111,1009,3039,677,3465,1748,2794,255,2684,40,3102,561,3292,1619,2771,16,2488,383,3609,1239,2760,945,3507,474,1972,1702,2745,1152,3472,816,3373,1770,3672,1051,2940,487,2527,67,1931,1522,3575,1109,2346,506,2679,531,3087,1426,2321,1385,2376,469,1887,960,2305,37,1863,1819,3392,173,3629,284,2864,778,3479,1233,2094,831,3635,1641,2766,1191,2654,1032,2583,733,2872,1725,2916,694,3665,741,3328,50,3504,407,2908,1389,2777,1355,3638,498,3386,979,3410,349,2038,395,2587,1176,2676,1259,2014,1008,2893,940,3381,338,2308,1295,1916,1547,3150,649,3524,607,3623,1156,3688,309,2678,612,3527,196,2926,269,2749,798,3209,1065,2931,666,2642,1278,3664,1505,2747,1687,2717,368,3607,973,3077,74,2904,139,3062,1799,2011,1117,2556,316,3256,1723,2355,34,2594,637,3338,946,1992,876,2081,1785,2785,1499,1893,515,2628,1504,2808,215,3241,574,2087,264,2925,714,2388,983,2295,70,2734,297,3402,311,3104,1424,2805,690,2138,1335,2640,416,2039,636,3380,1457,2997,1238,2965,1340,2356,836,2333,773,1874,1551,3301,406,2599,1373,2846,1758,2890,357,3514,373,2095,546,2143,1760,2224,1196,2312,716,3011,788,2665,988,1970,1659,3245,1379,2740,322,1913,893,2989,1582,3612,1091,3320,1553,2085,1012,3486,1563,3136,499,2144,1545,3679,1487,3641,226,3482,766,2292,1512,2063,1680,1889,1217,3419,1198,2178,1372,2658,1228,2994,242,3076,1351,2739,1394,2821,1806,2165,1177,2380,534,2953,1269,3357,391,2578,1084,2647,854,3193,892,3543,1399,2670,1838,3561,21,3510,737,2648,1450,2596,936,2715,1592,3431,1037,2992,101,1954,254,3287,909,2582,1454,3511,1043,2629,183,3440,220,2871,1679,3617,11,1932,250,2447,155,2626,1455,2762,17,2775,408,3303,73,3628,1435,2301,1540,2579,77,2598,35,1977,1251,3211,972,2914,1027,2282,1761,3605,1343,3347,422,1922,164,2695,1603,2887,429,2936,1348,1900,867,3127,768,3179,432,1906,510,3189,1272,2942,166,2440,1628,3517,1029,3182,219,2790,240,2492,1733,2491,1606,3639,434,3501,1153,3163,1568,3097,1006,3095,1636,2029,611,3416,1131,3130,1776,3236,200,2757,1154,2694,1028,2820,585,3595,1803,3051,1073,3142,318,2384,609,3497,235,3549,928,3139,1222,2894,298,2462,1657,2875,1479,2468,339,2257,834,1962,1173,3315,929,3053,1075,2154,1705,3631,1640,3663,685,2299,1662,2193,1247,2882,516,2324,1817,1959,509,3359,1377,3370,89,3660,378,2161,1000,2690,1383,3106,525,3367,1602,3678,1001,3141,59,2948,1719,2068,1836,2319,1804,1951,1167,2272,1270,2943,811,3585,31,2164,507,3566,1085,2487,1069,1994,1276,3464,456,2503,824,3038,80,2593,1007,3147,1674,2837,481,2290,663,2780,1164,2456,959,2524,218,1947,376,2222,377,3686,340,2530,1296,2307,1658,1924,1796,2383,1062,3571,1057,2613,267,2796,1144,2233,513,2483,883,2854,687,2000,700,2069,1047,2655,669,2450,1283,3118,644,2392,1054,2328,1633,3085,1555,3064,179,1980,463,2423,15,3676,1349,2907,864,3094,362,3653,1326,3088,83,2754,1742,2168,1254,2182,1321,2424,1357,3473,1790,3192,903,3122,522,2411,1151,3540,1437,2076,953,1853,440,2078,1805,3520,1403,2208,1129,2370,1762,3071,820,2855,238,2725,931,2534,895,2687,767,2127,1632,2861,78,2179,292,3058,996,3291,1791,2509,805,2899,1824,3642,1101,1983,1116,3674,1380,2753,1813,2153,600,3633,3,2023,970,2385,1306,3072,441,2901,670,3557,1236,2381,56,2121,1141,2344,1709,3446,263,3378,87,2348,957,2337,366,2728,88,3460,995,2213,598,1856,1289,1859,1161,2737,1098,2150,106,3013,999,3659,150,3411,209,3099,1630,2444,1352,2999,1092,2708,1529,1968,52,3572,1668,2612,1384,2618,206,1955,1416,2770,279,3353,1580,2291,554,2714,386,2699,380,2056,682,3598,1798,1899,812,3177,143,2528,898,2627,1728,3280,321,2662,1516,2759,29,2171,1673,2431,1113,3652,526,2498,341,2378,1244,3680,133,3395,761,3132,1250,2707,363,1904,1649,3244,286,1975,1550,2261,614,2851,1414,3453,665,2247,1398,2935,175,2880,1496,3205,969,1927,1264,3194,1715,3128,1513,2267,745,2216,1180,2055,111,2475,1503,3602,1420,2673,1772,2776,1019,1963,288,3490,1208,3634,1220,3509,372,3657,1120,1908,640,2008,1225,3546,630,2177,1672,2160,1298,2273,810,2366,1459,2104,1718,3360,1750,3319,1727,2701,1049,3655,770,2230,948,3086,918,3327,1784,3019,1730,3403,458,2836,645,1869,1396,3332,1063,3651,764,2072,1083,3030,1040,3587,748,2425,1734,2173,66,3174,148,3155,145,3070,1030,2263,1165,3457,317,3624,927,1898,579,2041,1543,2550,915,2570,1367,3010,1678,3563,1821,2982,151,3658,1810,2280,1402,3221,108,2977,1664,2810,986,2409,153,2359,13,2682,348,3060,462,2674,48,2471,993,2644,446,2651,1178,3394,550,1878,809,2482,1731,2667,1801,3468,1016,2123,1011,3427,617,2710,299,1995,253,2700,1834,2112,961,2606,629,2309,1665,2188,243,2941,1620,2884,1576,2363,1078,2125,1575,2709,473,3533,1368,2802,132,3249,1462,3284,387,1976,1018,2680,1282,2956,1329,1950,1530,2194,1599,2702,858,2473,1431,3225,1130,3228,532,1885,390,3555,758,2091,1121,3450,1337,3031,319,2495,906,2803,678,3647,1149,2350,343,2540,814,3341,94,2563,479,2885,1314,3329,1304,2806,1086,2368,1231,1965,536,2459,283,3636,889,3361,693,2993,1366,3448,991,2426,1612,3196,361,2088,675,1882,592,3670,762,3372,1666,2620,1068,2404,152,2995,704,2973,875,3500,501,3480,259,2889,1449,3143,1226,1868,358,2163,1528,2044,465,2349,1595,2858,1118,3133,855,3366,18,3242,514,1850,1045,2016,1371,1935,1135,2638,1218,3589,1140,3240,459,2036,519,2422,1193,3090,1422,3113,221,3422,326,2229,724,3687,1779,2499,535,3447,1812,2105,122,3339,256,3437,664,2930,1495,3119,1511,3358,1277,3223,346,2597,692,3041,651,1925,508,2259,265,3166,578,3213,1795,3082,1412,2331,1074,3214,95,2415,613,2262,1661,3454,393,2311,1418,2873,280,3337,1458,2929,760,3637,306,2631,1688,3574,841,2189,1237,2830,850,2895,1342,2117,705,2589,1274,2371,1561,3330,1460,2369,1,2515,1292,2156,1446,1958,701,2991,668,2812,1223,3149,471,2445,1067,1865,277,2668,696,2788,247,2089,754,2602,450,2917,1651,2797,1667,3662,1241,2209,185,3096,134,3333,553,1971,1301,3604,1642,3007,808,3405,1518,2092,384,2523,1275,2575,51,3452,1685,2921,734,2959,558,1961,1692,2306,1175,3169,593,3573,421,3310,1531,2998,1171,3255,245,2236,1436,2727,837,3260,149,3263,1815,3522,144,3248,1312,2412,1266,2054,1613,3559,527,3278,123,2787,1199,3691,1421,2586,1139,2576,618,2190,804,3483,405,2402,1794,3681,120,3528,1114,2124,1691,3000,92,2660,428,3203,838,2012,1721,3032,159,2225,1194,2585,1670,2822,1010,1953,19,2204,170,2666,1671,1864,1825,3201,619,2501,1050,2493,1631,2947,1209,2967,1126,3398,735,2922,520,1919,1079,2752,800,2414,1039,2826,1586,2548,1608,3462,203,2572,1413,3494,260,3645,1839,3304,1423,3560,572,3290,702,2167,1712,3537,849,2246,112,3424,1440,2379,869,3197,464,2828,1103,2981,460,1902,1556,2689,782,2310,1596,2746,248,3591,232,3518,873,3445,1653,3379,1445,2176,1058,2831,177,2843,41,2374,846,2924,874,2691,138,3324,1581,2652,344,3593,1362,2918,129,1984,350,2352,1020,2900,32,1907,1443,3270,124,2265,1147,1960,436,2545,1777,2743,305,3089,294,2671,1500,3219,1828,2130,1737,2923,282,2984,1353,2218,1201,2639,210,2220,477,1872,1361,3243,1169,3669,1497,1993,486,2490,442,3675,1588,2460,1717,2653,556,3606,925,2767,1053,1943,71,3601,76,2955,847,3002,1594,3251,1279,2061,1230,2798,1404,3348,1184,2360,1023,2158,779,1894,492,1978,172,3334,662,3643,1313,3269,1480,3442,1046,2932,1318,3590,886,1986,933,3374,69,3673,533,2952,1124,2197,1253,3376,984,2590,1699,3109,1041,3588,63,2624,1034,1938,1262,2857,105,2508,642,2950,1324,2486,1574,2146,1607,3496,1015,1966,1200,3153,181,2641,1753,2020,830,3199,626,1903,1434,2560,213,2075,1502,2342,475,2235,1600,2313,1517,2276,1419,3271,281,2569,821,2174,781,1888,512,2625,1035,2108,381,3277,699,3466,14,3597,1837,3562,1187,3045,1242,2675,135,2781,742,1880,147,3028,1639,1876,1036,3168,914,2397,1235,2688,490,3265,1185,3456,543,3188,1305,2372,115,2521,791,3599,747,3023,251,3035,300,2066,1559,2525,1643,2419,275,2800,1444,3052,1683,2565,1433,2476,1089,2438,301,3016,1094,3377,1461,2497,438,1990,1317,3283,750,2226,1741,2339,174,2988,1467,3215,1044,2500,807,2516,907,3396,725,2646,97,1897,796,3323,1100,3154,1601,2446,495,2245,1629,1911,352,3435,231,3123,1203,2365,1755,3406,1438,2814,117,2650,1439,3545,1111,3505,1354,2512,1477,2506,418,3202,1708,2315,223,1967,559,2601,1214,2553,1408,2847,163,2293,1464,1861,1284,2756,562,2382,978,3417,1573,3312,1325,2145,55,2097,1128,2874,165,2609,1386,3231,597,2502,107,2656,211,2732,955,3626,1415,3541,1181,3258,342,2835,1591,2478,691,3050,484,2633,1004,2816,1360,2048,1332,3025,857,3477,1344,2535,1442,2004,369,2784,1137,3108,45,2863,1697,2848,518,2129,1485,3618,769,2375,1747,3018,521,2231,792,3300,956,2632,723,3120,1625,2813,1476,2713,1468,2238,236,2232,1593,2287,689,2172,1578,2819,47,1855,193,2006,1042,2302,216,2978,320,3506,1654,2664,985,3682,444,2903,1183,3539,470,3129,861,2517,60,3586,1827,2465,1565,3428,1215,3075,1701,2910,1336,2974,517,3369,877,2278,1809,2047,1754,2580,584,2296,720,2829,1814,2240,1341,3224,832,2782,1090,1969,1710,1881,845,2944,885,2879,1127,2098,835,3478,354,2712,1624,2249,58,2845,937,2562,1802,1996,409,1939,204,3170,374,3281,413,2980,1179,2113,191,2927,829,2254,679,2976,710,1999,1166,2659,1646,3302,547,3204,488,3485,168,3371,646,3390,171,1886,755,2064,233,2866,1797,3521,85,3508,443,2042,1246,2115,1182,3656,1616,2773,736,3218,1484,2101,1552,2019,1038,2028,1538,3547,427,2466,1775,2979,606,3267,1473,2827,1327,2763,848,3408,1830,3186,1157,2645,127,3576,57,3297,548,1883,146,3492,131,2636,976,3184,1132,2793,266,3103,178,3344,793,3252,1682,3577,621,3693,229,3276,1202,3690,1350,2451,1323,2677,1820,2617,1567,2481,1441,1945,706,3098,1268,3268,923,1926,1125,2928,355,2387,1452,2439,1232,3536,1364,2454,657,1973,1106,3685,1428,2279,631,2912,308,2911,333,3246,98,3047,1704,3461,570,3145,141,3033,84,2996,1392,3488,1694,2962,261,2142,590,3519,1489,3148,1409,3112,451,2514,1690,1934,1554,2217,1681,2407,396,2140,1732,3525,968,3401,757,3564,400,3259,753,2394,81,2318,1490,2260,457,2186,1122,3022,33,3415,1564,2568,184,3426,158,2786,1569,2300,1448,2418,287,2558,884,2824,1052,2905,90,2332,24,3247,314,3078,997,2010,262,3531,1294,3352,1022,2711,943,3061,1376,3017,417,3449,382,3438,1273,2250,23,2614,950,3124,1655,2902,1623,2458,1064,3037,1160,3293,1465,2615,729,2817,1570,3158,899,3594,1724,3217,1150,2083,1060,3475,538,2073,935,2320,1831,1851,1219,2571,1387,2264,1501,2869,980,2592,686,3355,634,3117,967,3567,330,1848,653,3206,1429,2457,54,2070,639,2099,1257,2722,1021,2815,1711,2985,447,3491,1626,2116,1309,2137,603,3470,1375,3134,894,1989,1410,2325,1583,2987,5,2588,971,2175,1585,3668,938,2336,82,2964,38,2909,201,3152,1334,2268,977,2526,270,3181,1720,2126,596,2881,1212,2533,1826,1905,249,2719,1549,2269,671,2351,1066,2427,1374,2704,711,3443,1488,3345,1811,2611,681,3579,569,3299,1524,2005,1290,3538,307,2883,1328,2114,744,1849,1841,2198,371,3172,740,3190,688,2622,433,2079,1638,1936,878,2504,399,3210,1716,2386,865,3264,1537,2396,1192,3073,1148,3393,975,2841,1105,2285,1756,2566,1846,3351,868,3046,1684,2354,136,3467,751,3165,114,2801,1560,2071,403,2062,1013,3388,589,2840,222,3043,1407,3195,1486,2877,842,1998,920,2234,119,2347,401,3683,1722,2303,555,2467,1102,3439,199,2505,1401,1937,187,2724,523,3694,1466,2128,335,2281,863,3558,1263,3340,1532,3173,859,3493,1096,3237,1738,1917,1186,3049,503,3015,718,3066,1002,3584,1647,1862,992,2166,1507,3695,575,3342,485,3336,228,3220,1347,3026,1787,2191,472,3048,1271,3551,1134,2243,1397,3611,1188,3455,1077,2544,777,2015,1793,2393,1108,2480,1213,3285,347,3583,398,3570,924,2915,323,2472,431,2768,30,2564,540,2286,1076,2148,539,3544,1115,2643,9,2958,638,1866,180,3646,367,2603,425,2969,698,3313,1584,3516,1056,2804,1110,2539,1055,3625,1696,3311,1744,3692,586,2532,167,3407,1847,2726,27,2049,1621,2461,1635,2181,1302,2970,332,2093,375,2581,1637,3582,656,2103,312,2574,315,2435,202,2120,749,2248,1521,3159,1557,2616,602,1852,674,2183,113,2399,552,3469,1378,2862,1771,2496,1234,1920,244,2554,1316,3530,478,2577,1252,2961,930,3418,402,3125,1281,2850,1024,3261,942,2202,430,2920,169,2391,1005,2750,797,3569,194,2758,529,3535,1618,2731,161,3423,2,2683,1562,2730,1082,3421,313,2251,524,2390,1229,2241,461,2868,272,3523,345,2489,1417,2913,707,3661,1190,2252,658,2672,1061,2035,998,3227,224,2733,1310,2413,1315,1870,913,2147,44,2149,1492,3321,480,3040,1743,3495,732,2842,790,2807,1363,2584,683,2107,1648,2155,1393,2417,1822,2742,1099,2090,620,3175,468,2403,1470,2938,1773,3057,445,2839,944,2591,911,2322,125,3616,476,2159,604,2110,353,2853,551,1942,491,3279,96,3317,439,3451,746,2274,1265,2021,43,3349,252,2538,1256,2522,303,2184,581,3314,1571,2195,12,2294,1726,2436,296,2649,1224,2474,1833,2630,715,3234,1025,3157,739,1875,1514,2718,615,3137,394,2185,1844,3140,1249,3107,186,2681,786,3463,1506,2152,1587,3384,156,3389,234,2227,608,2119,230,2118,327,2519,328,3115,1248,2353,1369,2567,1081,2772,756,1933,852,2223,654,3400,752,3239,435,2060,1245,3356,545,2452,910,2253,660,2341,1768,3006,1205,3001,774,3054,1400,3067,1280,2335,1311,3187,370,2338,500,2242,466,3309,246,2669,293,2430,544,3272,1080,3305,482,2966,908,2634,673,2698,565,2284,449,2697,1622,3185,1558,3363,1533,2210,763,2783,79,2326,325,3021,1675,3027,871,2960,39,2007,625,3627,567,2400,951,3532,8,3608,1207,3640,7,2086,1430,3056,1610,3413,1411,3171,28,1918,851,3253,110,3565,1033,3306,726,2934,1614,3100,1843,2211,722,3126,1652,3176,1143,2703,273,2141,1572,2316,795,3262,176,2408,661,2345,1319,3091,505,1929,1365,3069,192,2595,1227,2297,1142,2511,86,1909,1535,3580,1267,2464,116,3144,825,2053,1589,3603,1590,2949,239,3459,302,3414,26,2377,1627,3178,890,2692,982,3121,1788,3167,958,2298,42,2122,1097,3207,989,2686,1765,2033,1104,3160,826,3322,336,3420,862,2082,1300,1956,1693,2892,1260,2834,1807,2448,784,2721,731,1892,6,2170,1216,2551,424,2327,823,1891,1548,2939,1842,2442,939,3600,227,2809,1425,3266,571,2657,1645,3183,420,2334,599,2945,1356,2867,922,3432,594,2200,1706,2037,411,1914,1509,2106,819,2201,1303,3621,496,2157,1339,1923,62,3489,1816,3138,595,1879,68,3029,22,2050,624,3667,643,2040,497,2852,994,3042,1381,1873,563,3436,93,2779,577,1940,866,2605,160,3503,917,3614,1174,3434,1752,2774,1456,2271,1598,2919,775,2364,1388,2212,452,3116,1774,3230,1112,2811,1566,1988,1474,3343,140,2844,225,3036,703,2888,379,2187,672,2552,1370,2549,1330,3596,1769,2764,1072,3024,389,2792,623,3238,1534,3404,197,2017,1145,1910,963,2199,738,2001,528,3318,1713,2610,1525,3666,1707,2561,1736,3208,647,2975,1669,2608,896,2022,412,3034,635,2080,448,3409,1663,1912,310,2990,887,2536,947,2604,1523,3059,324,3552,455,3068,783,2043,1048,3307,289,2906,622,2463,1031,3550,839,2136,1783,3146,1240,3110,827,2206,591,2358,237,2275,564,2102,217,3387,75,3429,1832,3191,1197,3063,189,1985,1119,2031,205,3083,364,3542,708,2470,789,3368,667,3135,99,2986,1526,2600,1308,2437,853,1858,104,2968,419,1957,780,2420,840,1890,713,3554,633,3677,684,2357,1258,2529,905,3316,1617,2729,1745,1952,1390,3568,1604,2180,843,2067,1764,2555,359,2744,974,2469,1026,2706,53,2951,587,3425,1297,3080,404,1930,1482,3009,1469,2607,776,3632,926,2799,785,2736,987,2720,162,3471,1451,2898,1206,2769,870,2870,1656,3289,453,2751,881,3282,360,3350,1286,2323,771,1857,632,2789,965,3644,659,2192,1320,3257,20,3385,1133,2946,128,3391,1698,3274,833,3295,582,2009,1163,2635,641,3498,1634,3065,1395,2957,1781,2705,1345,2045,190,3526,91,3534,583,1860,212,3553,1494,2169,276,1964,981,3578,568,3412,1453,2623,728,3212,1159,2058,932,3216,278,3487,1660,2543,1644,2547,397,3474,730,2637,650,3335,291,2954,1017,2663,530,2162,100,2494,1695,2741,580,3364,1136,3164,0,1946,1261,3111,966,2100,208,2196,1391,2026,1735,2024,1210,3233,952,2455,610,2541,271,2891,712,2239,934,3592,437,3156,709,2484,61,2074,274,2051,121,3481,566,3286,1123,2860,1510,2421,1829,1997,1463,3012,1739,3131,285,3296,941,2748,1823,3222,1703,1981,207,2270,916,1982,64,2109,695,3092,1158,3671,1520,2406,356,3382,844,1901,1676,1987,1818,2132,504,2003,1840,2735,426,2221,759,2477,627,2621,919,2255,1087,3654,616,2002,214,3235,901,2559,817,2256,10,2510,1155,3622,605,2395,655,3294,1759,3331,142,2133,154,2059,882,2215,806,2765,588,3650,1544,2151,423,3326,388,3151,1255,3620,1789,1921,1792,2434,803,2849,1686,2972,102,2214,304,2288,72,1948,1146,2065,1475,3003,1338,2018,257,1867,962,2429,1170,2219,1577,1974,557,3441,1088,2052,541,1979,1605,2432,157,3556,1519,2317,1542,2453,1778,2933,721,2343,1059,2716,1782,3005,1808,2723,1527,2856,1767,2825,1491,2340,494,1941,198,3354,743,3014,1800,2513,1221,2896,1478,2207,1766,3619,1172,3081,1471,2077,802,3512,1650,2373,949,3308,334,2046,921,2237,897,3161,1751,2971,1071,3365,801,3529,727,3008,65,3444,1611,2289,25,3226,1331,3383,511,2032,888,2266,856,2362,1700,3004,542,2937,1780,3074,1003,2433,1749,2838,385,2865,268,2013,1162,3162,628,3649,414,2859,36,2025,109,2520,697,2258,1689,3630,904,3079,1427,2428];

},{}],11:[function(require,module,exports){
/*jslint node: true , browser: true */
/*global window */
"use strict";

var circ = require('./circ');

function Predictor(aNChanels, aNFrames, aPerm, aDestination) {

	var self=this;


	// The excel estimator_map
	// This calculate an LLR (The index) given a error^2

	self.pr_arr = [  1.099054669,0.409119007,0.205950937,0.127219495,0.089325723,0.067993884,0.054580733,0.045453976,
			0.038874677,0.033921102,0.030063963,0.026979339,0.024458544,0.022361355,0.020590201,0.019075171,
			0.017764896,0.016620811,0.015613416,0.014719766,0.013921758,0.013204918,0.012557538,0.011970052,
			0.011434564,0.010944502,0.010494353,0.010079457,0.009695852,0.009340143,0.009009409,0.008701122,
			0.008413082,0.008143366,0.007890289,0.007652362,0.007428270,0.007216847,0.007017051,0.006827952,
			0.006648718,0.006478598,0.006316918,0.006163066,0.006016490,0.005876687,0.005743200,0.005615612,
			0.005493541,0.005376638,0.005264583,0.005157082,0.005053862,0.004954675,0.004859289,0.004767490,
			0.004679080,0.004593876,0.004511706,0.004432412,0.004355846,0.004281870,0.004210354,0.004141179,
			0.004074232,0.004009407,0.003946605,0.003885732,0.003826703,0.003769433,0.003713847,0.003659870,
			0.003607435,0.003556476,0.003506932,0.003458745,0.003411860,0.003366225,0.003321790,0.003278510,
			0.003236340,0.003195238,0.003155163,0.003116078,0.003077947,0.003040735,0.003004410,0.002968939,
			0.002934295,0.002900447,0.002867369,0.002835035,0.002803420,0.002772501,0.002742254,0.002712658,
			0.002683693,0.002655339,0.002627575,0.002600385,0.002573751,0.002547655,0.002522082,0.002497016,
			0.002472442,0.002448345,0.002424713,0.002401532,0.002378789,0.002356471,0.002334568,0.002313067,
			0.002291957,0.002271229,0.002250871,0.002230874,0.002211229,0.002191926,0.002172956,0.002154311,
			0.002135983,0.002117963,0.002100244,0.002082819,0.002065680,0.002048820,0.002032232,0.002015910,
			0.001999848,0.001984040,0.001968479,0.001953159,0.001938076,0.001923223,0.001908596,0.001894190,
			0.001879999,0.001866018,0.001852244,0.001838671,0.001825295,0.001812112,0.001799118,0.001786308,
			0.001773680,0.001761228,0.001748950,0.001736841,0.001724898,0.001713119,0.001701499,0.001690035,
			0.001678724,0.001667564,0.001656551,0.001645682,0.001634954,0.001624366,0.001613913,0.001603594,
			0.001593405,0.001583345,0.001573412,0.001563601,0.001553913,0.001544343,0.001534890,0.001525553,
			0.001516327,0.001507213,0.001498208,0.001489309,0.001480515,0.001471824,0.001463235,0.001454745,
			0.001446353,0.001438057,0.001429855,0.001421747,0.001413730,0.001405802,0.001397963,0.001390211,
			0.001382544,0.001374961,0.001367460,0.001360041,0.001352702,0.001345442,0.001338259,0.001331152,
			0.001324120,0.001317162,0.001310277,0.001303463,0.001296719,0.001290045,0.001283439,0.001276901,
			0.001270428,0.001264021,0.001257678,0.001251398,0.001245181,0.001239025,0.001232929,0.001226893,
			0.001220916,0.001214997,0.001209135,0.001203329,0.001197578,0.001191882,0.001186240,0.001180651,
			0.001175114,0.001169629,0.001164195,0.001158811,0.001153477,0.001148191,0.001142954,0.001137764,
			0.001132621,0.001127524,0.001122473,0.001117467,0.001112505,0.001107588,0.001102713,0.001097881,
			0.001093091,0.001088343,0.001083635,0.001078969,0.001074342,0.001069754,0.001065206,0.001060696,
			0.001056224,0.001051790,0.001047393,0.001043032,0.001038707,0.001034418,0.001030164,0.001025945,
			0.001021761,0.001017610,0.001013493,0.001009409,0.001005358,0.001001339,0.000997353,0.000993397];


	self.err2llr = function(err) {
		var llr=0;
		for (var b=0x80; b>0; b = b >> 1) {
			if (err < self.pr_arr[llr | b ]) {
				llr = llr | b;
			}
		}
		return llr;
	};





	self.perm=aPerm;
	self.nChanels = aNChanels;
	self.nFrames = aNFrames;
	self.destination = aDestination;
	self.nSyncBits = Math.floor(aNFrames * aNChanels / 2 + 0.5);

	self.estimate = function(inB, p) {
		var pp,bb, l, arg, res;

		var err=0;
		var nerr=0;
		var err2=0;
		var nerr2=0;
		var e;
		var fr = Math.floor(p / self.nChanels);
		var ch = p % self.nChanels;

		if (fr>0) {
			pp = p - self.nChanels;
			bb = self.perm.iConvert[pp];
			l = (bb & 1) ? 0.5 : 0;
			e = circ.err(inB[pp], l);
			err += e;
			nerr ++;
			err2 += e*e;
			nerr2 ++;
		}
		if (fr<self.nFrames-1) {
			pp = p + self.nChanels;
			bb = self.perm.iConvert[pp];
			l = (bb & 1) ? 0.5 : 0;
			e = circ.err(inB[pp], l);
			err += e;
			nerr ++;
			err2 += e*e;
			nerr2 ++;
		}
		if (ch >0) {
			pp = p -1;
			bb = self.perm.iConvert[pp];
			l = (bb & 1) ? 0.5 : 0;
			e = circ.err(inB[pp], l);
			err2 += e*e;
			nerr2 ++;
		}
		if (ch < self.nChanels-1) {
			pp = p +1;
			bb = self.perm.iConvert[pp];
			l = (bb & 1) ? 0.5 : 0;
			e = circ.err(inB[pp], l);
			err2 += e*e;
			nerr2 ++;
		}

		err = err /nerr;
		arg = circ.norm(inB[p] - err);
		res = 4*Math.abs(arg-0.5) -1;

		e = 1 - Math.abs(res);
		err2 += e*e;
		nerr2 ++;

		res = res>0 ? 1 : -1;

		bb = self.perm.iConvert[p];
		if (bb & 1) res = -res;

//		err2 = err2 / nerr2;

		res = res * self.err2llr( err2) * 64;

		return res;

	};

	self.processData= function(inB) {
		var i;
		var outB = [];
		for (i = self.nSyncBits; i < self.nChanels * self.nFrames;  i++) {

			outB.push( self.estimate(inB, self.perm.convert[i]));
		}

		self.destination.processData(outB);
	};

	return self;
}

module.exports = Predictor;

},{"./circ":3}],12:[function(require,module,exports){
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

},{"../seedrandom/seedrandom.js":19,"./permdata.js":10}],13:[function(require,module,exports){
/*jslint node: true , browser: true */
/*global window */
"use strict";



function createSoundPlayer(cb) {

    if (window.vocoSoundDriver) {
        return cb(null, window.vocoSoundDriver);
    }

    var sp = {};

    var context;
    try {
        // Fix up for prefixing
        window.AudioContext = window.AudioContext||window.webkitAudioContext;
        context = new window.AudioContext();
    }
    catch(e) {
        console.log('Web Audio API is not supported in this browser' + e);
        cb(new Error('Web Audio API is not supported in this browser'));
    }


    sp.processData = function(inBuff) {
        var buff = context.createBuffer(2, inBuff.length, 44100);
        var outL = buff.getChannelData(0);
        var i;
        for (i=0; i<inBuff.length; i+=1) {
            outL[i] = inBuff[i];
        }

        var source = context.createBufferSource();
        source.buffer = buff;
        source.connect(context.destination);
        source.start(0);
    };

    var hidden, visibilityChange;
    if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support
      hidden = "hidden";
      visibilityChange = "visibilitychange";
    } else if (typeof document.mozHidden !== "undefined") {
      hidden = "mozHidden";
      visibilityChange = "mozvisibilitychange";
    } else if (typeof document.msHidden !== "undefined") {
      hidden = "msHidden";
      visibilityChange = "msvisibilitychange";
    } else if (typeof document.webkitHidden !== "undefined") {
      hidden = "webkitHidden";
      visibilityChange = "webkitvisibilitychange";
    }

    document.addEventListener(visibilityChange, function() {
        if (document[hidden]) {
            console.log("onBlurTx");
            context.suspend();
        } else {
            console.log("onFocusTx");
            context.resume();
        }
    }, false);

/*
    window.addEventListener('blur', function() {
        console.log("onBlurTx");
        context.suspend();
    });

    window.addEventListener('focus', function() {
        console.log("onFocusTx");
        context.resume();
    });
*/
    cb(null, sp);
}


function createSoundGrabber(N_BUFF_IN, FDIV, processor, cb) {
    var context;
    var bytesReceived =0;
    var startTime = (new Date()).getTime();

    function printProcessor() {
        var now = (new Date()).getTime();
        console.log(bytesReceived*1000 / (now-startTime));
    }

    setInterval(printProcessor,3000);

    try {
        // Fix up for prefixing
        window.AudioContext = window.AudioContext||window.webkitAudioContext;
        context = new window.AudioContext();
    }
    catch(e) {
        console.log('Web Audio API is not supported in this browser' + e);
        window.alert('Web Audio API is not supported in this browser');
    }

    if (!navigator.getUserMedia)
        navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    if (!navigator.cancelAnimationFrame)
        navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
    if (!navigator.requestAnimationFrame)
        navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;


    var receptor = context.createScriptProcessor(N_BUFF_IN, 2, 2);
    receptor.onaudioprocess = function(e) {
        var of, bf, i, j;
        var inL = e.inputBuffer.getChannelData(0);
        for (of= 0 ; of<N_BUFF_IN; of+=FDIV) {
            processor.processData(inL,of);
        }
        bytesReceived += N_BUFF_IN;
//        console.log("rx");
    };

    var hidden, visibilityChange;
    if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support
      hidden = "hidden";
      visibilityChange = "visibilitychange";
    } else if (typeof document.mozHidden !== "undefined") {
      hidden = "mozHidden";
      visibilityChange = "mozvisibilitychange";
    } else if (typeof document.msHidden !== "undefined") {
      hidden = "msHidden";
      visibilityChange = "msvisibilitychange";
    } else if (typeof document.webkitHidden !== "undefined") {
      hidden = "webkitHidden";
      visibilityChange = "webkitvisibilitychange";
    }


    document.addEventListener(visibilityChange, function() {
        if (document[hidden]) {
            console.log("onBlurRx");
            context.suspend();
        } else {
            console.log("onFocusRx");
            context.resume();
        }
    }, false);
/*
    window.addEventListener('blur', function() {
        console.log("onBlurRx");
        context.suspend();
    });

    window.addEventListener('focus', function() {
        console.log("onFocusRx");
        context.resume();
    });
*/

// Configure and set W3 ctx

    navigator.getUserMedia({audio:true}, function(stream) {


        var audioInput = context.createMediaStreamSource(stream);
        audioInput.connect(receptor);


        var zeroGain = context.createGain();
        zeroGain.gain.value = 0.0;
        receptor.connect( zeroGain );
        zeroGain.connect( context.destination );

        window.inStream = stream;
        window.audioInput = audioInput;
        window.zeroGain = zeroGain;
        window.context = context;

        cb(null, receptor);
    }, function(err) {
        console.log(err);
        return cb(err);
    });
}

exports.createSoundPlayer = createSoundPlayer;
exports.createSoundGrabber = createSoundGrabber;


},{}],14:[function(require,module,exports){
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

},{"./bcjr.js":1,"./bytebit.js":2}],15:[function(require,module,exports){
/*jslint node: true , browser: true */
/*global window */
"use strict";

//************************************************************************************
// UTF-8 Encoding helpers.
// based on the code at http://www.webtoolkit.info
//************************************************************************************
var Utf8Utils= function() {
    function _encode(stringToEncode, insertBOM) {
        stringToEncode = stringToEncode.replace(/\r\n/g,"\n");
        var utftext = [];
        if( insertBOM === true )  {
            utftext[0]=  0xef;
            utftext[1]=  0xbb;
            utftext[2]=  0xbf;
        }

        for (var n = 0; n < stringToEncode.length; n++) {

            var c = stringToEncode.charCodeAt(n);

            if (c < 128) {
                utftext[utftext.length]= c;
            }
            else if((c > 127) && (c < 2048)) {
                utftext[utftext.length]= (c >> 6) | 192;
                utftext[utftext.length]= (c & 63) | 128;
            }
            else {
                utftext[utftext.length]= (c >> 12) | 224;
                utftext[utftext.length]= ((c >> 6) & 63) | 128;
                utftext[utftext.length]= (c & 63) | 128;
            }

        }
        return utftext;
    }

    var obj= {
        /**
         * Encode javascript string as utf8 byte array
         */
        encode : function(stringToEncode) {
            return _encode( stringToEncode, false);
        },

        /**
         * Encode javascript string as utf8 byte array, with a BOM at the start
         */
        encodeWithBOM: function(stringToEncode) {
            return _encode(stringToEncode, true);
        },

        /**
         * Decode utf8 byte array to javascript string....
         */
        decode : function(dotNetBytes) {
            var result= "";
            var i= 0;
            var c=0, c1=0, c2=0;

            // Perform byte-order check.
            if( dotNetBytes.length >= 3 ) {
                if( (dotNetBytes[0] & 0xef) === 0xef && (dotNetBytes[1] & 0xbb) === 0xbb && (dotNetBytes[2] & 0xbf) === 0xbf ) {
                    // Hmm byte stream has a BOM at the start, we'll skip this.
                    i= 3;
                }
            }

            while( i < dotNetBytes.length ) {
                c= dotNetBytes[i]&0xff;

                if( c < 128 ) {
                    result+= String.fromCharCode(c);
                    i++;
                }
                else if( (c > 191) && (c < 224) ) {
                    if( i+1 >= dotNetBytes.length ) {
//                        throw "Un-expected encoding error, UTF-8 stream truncated, or incorrect";
                        i+=2;
                    } else {
                        c2= dotNetBytes[i+1]&0xff;
                        result+= String.fromCharCode( ((c&31)<<6) | (c2&63) );
                        i+=2;
                    }
                }
                else {
                    if( i+2 >= dotNetBytes.length  || i+1 >= dotNetBytes.length ) {
//                        throw "Un-expected encoding error, UTF-8 stream truncated, or incorrect";
                        i+=3;
                    } else {
                        c2= dotNetBytes[i+1]&0xff;
                        var c3= dotNetBytes[i+2]&0xff;
                        result+= String.fromCharCode( ((c&15)<<12) | ((c2&63)<<6) | (c3&63) );
                        i+=3;
                    }
                }
            }
            return result;
        }
    };
    return obj;
}();

module.exports = Utf8Utils;

},{}],16:[function(require,module,exports){
/*jslint node: true , browser: true */
/*global window */
"use strict";

var config = require('./config.js');
var SoundDriver = require('./sound_driver.js');
var RandomPerm = require('./random_perm.js');
var OFDM = require('./ofdm.js');
var Packetizer = require('./packetizer.js');
var TurboCode = require('./turbocode.js');
var FLSInterleaver = require('./flsinterleaver.js');
var IdCRC = require('./idcrc.js');
var Utf8Utils = require('./utf8.js');
var Predictor = require('./predictor.js');
var circ = require('./circ.js');

var VocoJS = function() {

    var self = this;
    var txInitialized = false;
    var rxInitialized = false;
    this.randomPerm = new RandomPerm(config.N_FRAMES_PACKET * config.usedChannels.length);
    this.tcPerm = new FLSInterleaver(304);

    var rxCallBacksBin = [];
    var rxCallBacksString = [];

    this.config = config;
    this.circ = circ;

    this.initTx = function(cb) {
        if (!cb) cb = function(){};
        if (txInitialized) return cb();

        SoundDriver.createSoundPlayer(function(err, sp) {
            self.soundPlayer = sp;
            try {
                self.ofdmCoder = new OFDM.Encoder(config.N_PREAMBLE_FRAMES, config.N_POSTAMBLE_FRAMES, config.FDIV, config.usedChannels, self.soundPlayer);
                self.packetGenerator = new Packetizer.PacketGenerator(config.usedChannels.length, config.N_FRAMES_PACKET, self.randomPerm, self.ofdmCoder);
            //  ldpc=new LDPCEncoder("alist/l1848_128.alist", packetGenerator);

                self.eccEncoder = new TurboCode.Encoder(config.NUMS1, config.DEN1, config.NUMS2, config.DEN2, self.tcPerm, self.packetGenerator);

                self.idCrcEncoder = new IdCRC.Encoder(self.eccEncoder);

            } catch (err) {
                cb(err);
            }
            txInitialized= true;
            cb();
        });
    };
    this.initRx = function(cb) {
        if (!cb) cb = function(){};
        if (rxInitialized) return cb();


        this.packetReceiver = {
            processData: function(packet) {
                var stringReceived = Utf8Utils.decode(packet);
                console.log("Packet received: "+ stringReceived);
                rxCallBacksBin.forEach(function(cb) {
                    cb(packet);
                });
                rxCallBacksString.forEach(function(cb) {
                    cb(stringReceived);
                });
            }
        };



        this.idCrcDecoder = new IdCRC.Decoder(this.packetReceiver);


        this.eccDecoder = new TurboCode.Decoder(config.NUMS1, config.DEN1, config.NUMS2, config.DEN2, this.tcPerm, 10, this.idCrcDecoder);

        this.predictor = new Predictor(config.usedChannels.length, config.N_FRAMES_PACKET, this.randomPerm, this.eccDecoder);

        this.packetDetector = new Packetizer.PacketDetector(config.usedChannels.length, config.N_FRAMES_PACKET, this.randomPerm, this.predictor);
        this.ofdmDecoder = new OFDM.Decoder(config.FDIV, config.usedChannels, this.packetDetector);
        rxInitialized = true;
        this.receptor = SoundDriver.createSoundGrabber(config.N_BUFF_IN, config.FDIV, this.ofdmDecoder, cb);
    };
    this.onRxBin = function(rxCallBack, cb) {
        if (!cb) cb = function(){};

        var pos = rxCallBacksBin.length;
        rxCallBacksBin[pos] = rxCallBack;
        this.initRx(cb);

        return function() {
            delete rxCallBacksBin[pos];
        };
    };

    this.onRxString = function(rxCallBack, cb) {
        if (!cb) cb = function(){};

        var pos = rxCallBacksString.length;
        rxCallBacksString[pos] = rxCallBack;
        this.initRx(cb);

        return function() {
            delete rxCallBacksString[pos];
        };
    };

    this.txString = function(data, cb) {
            var rawData = Utf8Utils.encode(data);
            self.txBin(rawData, cb);
    };
    this.txBin = function(data, cb) {
        this.initTx(function(err) {
            if (err) return cb(err);
            self.idCrcEncoder.processData(data);
        });
    };
    this.txSilence = function() {
        this.initTx(function(err) {
            var dataFrame;
            var L = (config.N_PREAMBLE_FRAMES + config.N_FRAMES_PACKET +  config.N_POSTAMBLE_FRAMES)* config.FDIV * 4;

            var outL = new Array( L );

            var i;
            for (i=0; i<L; i++) {
                outL[i]=0;
            }

            self.soundPlayer.processData(outL);
        });
    };
};

window.vocojs = new VocoJS();




},{"./circ.js":3,"./config.js":4,"./flsinterleaver.js":5,"./idcrc.js":6,"./ofdm.js":8,"./packetizer.js":9,"./predictor.js":11,"./random_perm.js":12,"./sound_driver.js":13,"./turbocode.js":14,"./utf8.js":15}],17:[function(require,module,exports){
'use strict';

!function(exports, undefined) {

  var
    // If the typed array is unspecified, use this.
    DefaultArrayType = Float32Array,
    // Simple math functions we need.
    sqrt = Math.sqrt,
    sqr = function(number) {return Math.pow(number, 2)},
    // Internal convenience copies of the exported functions
    isComplexArray,
    ComplexArray

  exports.isComplexArray = isComplexArray = function(obj) {
    return obj !== undefined &&
      obj.hasOwnProperty !== undefined &&
      obj.hasOwnProperty('real') &&
      obj.hasOwnProperty('imag')
  }

  exports.ComplexArray = ComplexArray = function(other, opt_array_type){
    if (isComplexArray(other)) {
      // Copy constuctor.
      this.ArrayType = other.ArrayType
      this.real = new this.ArrayType(other.real)
      this.imag = new this.ArrayType(other.imag)
    } else {
      this.ArrayType = opt_array_type || DefaultArrayType
      // other can be either an array or a number.
      this.real = new this.ArrayType(other)
      this.imag = new this.ArrayType(this.real.length)
    }

    this.length = this.real.length
  }

  ComplexArray.prototype.toString = function() {
    var components = []

    this.forEach(function(c_value, i) {
      components.push(
        '(' +
        c_value.real.toFixed(2) + ',' +
        c_value.imag.toFixed(2) +
        ')'
      )
    })

    return '[' + components.join(',') + ']'
  }

  // In-place mapper.
  ComplexArray.prototype.map = function(mapper) {
    var
      i,
      n = this.length,
      // For GC efficiency, pass a single c_value object to the mapper.
      c_value = {}

    for (i = 0; i < n; i++) {
      c_value.real = this.real[i]
      c_value.imag = this.imag[i]
      mapper(c_value, i, n)
      this.real[i] = c_value.real
      this.imag[i] = c_value.imag
    }

    return this
  }

  ComplexArray.prototype.forEach = function(iterator) {
    var
      i,
      n = this.length,
      // For consistency with .map.
      c_value = {}

    for (i = 0; i < n; i++) {
      c_value.real = this.real[i]
      c_value.imag = this.imag[i]
      iterator(c_value, i, n)
    }
  }

  ComplexArray.prototype.conjugate = function() {
    return (new ComplexArray(this)).map(function(value) {
      value.imag *= -1
    })
  }

  // Helper so we can make ArrayType objects returned have similar interfaces
  //   to ComplexArrays.
  function iterable(obj) {
    if (!obj.forEach)
      obj.forEach = function(iterator) {
        var i, n = this.length

        for (i = 0; i < n; i++)
          iterator(this[i], i, n)
      }

    return obj
  }

  ComplexArray.prototype.magnitude = function() {
    var mags = new this.ArrayType(this.length)

    this.forEach(function(value, i) {
      mags[i] = sqrt(sqr(value.real) + sqr(value.imag))
    })

    // ArrayType will not necessarily be iterable: make it so.
    return iterable(mags)
  }
}(typeof exports === 'undefined' && (this.complex_array = {}) || exports)

},{}],18:[function(require,module,exports){
'use strict';

!function(exports, complex_array) {

  var
    ComplexArray = complex_array.ComplexArray,
    // Math constants and functions we need.
    PI = Math.PI,
    SQRT1_2 = Math.SQRT1_2,
    sqrt = Math.sqrt,
    cos = Math.cos,
    sin = Math.sin

  ComplexArray.prototype.FFT = function() {
    return FFT(this, false)
  }

  exports.FFT = function(input) {
    return ensureComplexArray(input).FFT()
  }

  ComplexArray.prototype.InvFFT = function() {
    return FFT(this, true)
  }

  exports.InvFFT = function(input) {
    return ensureComplexArray(input).InvFFT()
  }

  // Applies a frequency-space filter to input, and returns the real-space
  // filtered input.
  // filterer accepts freq, i, n and modifies freq.real and freq.imag.
  ComplexArray.prototype.frequencyMap = function(filterer) {
    return this.FFT().map(filterer).InvFFT()
  }

  exports.frequencyMap = function(input, filterer) {
    return ensureComplexArray(input).frequencyMap(filterer)
  }

  function ensureComplexArray(input) {
    return complex_array.isComplexArray(input) && input ||
        new ComplexArray(input)
  }

  function FFT(input, inverse) {
    var n = input.length

    if (n & (n - 1)) {
      return FFT_Recursive(input, inverse)
    } else {
      return FFT_2_Iterative(input, inverse)
    }
  }

  function FFT_Recursive(input, inverse) {
    var
      n = input.length,
      // Counters.
      i, j,
      output,
      // Complex multiplier and its delta.
      f_r, f_i, del_f_r, del_f_i,
      // Lowest divisor and remainder.
      p, m,
      normalisation,
      recursive_result,
      _swap, _real, _imag

    if (n === 1) {
      return input
    }

    output = new ComplexArray(n, input.ArrayType)

    // Use the lowest odd factor, so we are able to use FFT_2_Iterative in the
    // recursive transforms optimally.
    p = LowestOddFactor(n)
    m = n / p
    normalisation = 1 / sqrt(p)
    recursive_result = new ComplexArray(m, input.ArrayType)

    // Loops go like O(n Σ p_i), where p_i are the prime factors of n.
    // for a power of a prime, p, this reduces to O(n p log_p n)
    for(j = 0; j < p; j++) {
      for(i = 0; i < m; i++) {
        recursive_result.real[i] = input.real[i * p + j]
        recursive_result.imag[i] = input.imag[i * p + j]
      }
      // Don't go deeper unless necessary to save allocs.
      if (m > 1) {
        recursive_result = FFT(recursive_result, inverse)
      }

      del_f_r = cos(2*PI*j/n)
      del_f_i = (inverse ? -1 : 1) * sin(2*PI*j/n)
      f_r = 1
      f_i = 0

      for(i = 0; i < n; i++) {
        _real = recursive_result.real[i % m]
        _imag = recursive_result.imag[i % m]

        output.real[i] += f_r * _real - f_i * _imag
        output.imag[i] += f_r * _imag + f_i * _real

        _swap = f_r * del_f_r - f_i * del_f_i
        f_i = f_r * del_f_i + f_i * del_f_r
        f_r = _swap
      }
    }

    // Copy back to input to match FFT_2_Iterative in-placeness
    // TODO: faster way of making this in-place?
    for(i = 0; i < n; i++) {
      input.real[i] = normalisation * output.real[i]
      input.imag[i] = normalisation * output.imag[i]
    }

    return input
  }

  function FFT_2_Iterative(input, inverse) {
    var
      n = input.length,
      // Counters.
      i, j,
      output, output_r, output_i,
      // Complex multiplier and its delta.
      f_r, f_i, del_f_r, del_f_i, temp,
      // Temporary loop variables.
      l_index, r_index,
      left_r, left_i, right_r, right_i,
      // width of each sub-array for which we're iteratively calculating FFT.
      width

    output = BitReverseComplexArray(input)
    output_r = output.real
    output_i = output.imag
    // Loops go like O(n log n):
    //   width ~ log n; i,j ~ n
    width = 1
    while (width < n) {
      del_f_r = cos(PI/width)
      del_f_i = (inverse ? -1 : 1) * sin(PI/width)
      for (i = 0; i < n/(2*width); i++) {
        f_r = 1
        f_i = 0
        for (j = 0; j < width; j++) {
          l_index = 2*i*width + j
          r_index = l_index + width

          left_r = output_r[l_index]
          left_i = output_i[l_index]
          right_r = f_r * output_r[r_index] - f_i * output_i[r_index]
          right_i = f_i * output_r[r_index] + f_r * output_i[r_index]

          output_r[l_index] = SQRT1_2 * (left_r + right_r)
          output_i[l_index] = SQRT1_2 * (left_i + right_i)
          output_r[r_index] = SQRT1_2 * (left_r - right_r)
          output_i[r_index] = SQRT1_2 * (left_i - right_i)
          temp = f_r * del_f_r - f_i * del_f_i
          f_i = f_r * del_f_i + f_i * del_f_r
          f_r = temp
        }
      }
      width <<= 1
    }

    return output
  }

  function BitReverseIndex(index, n) {
    var bitreversed_index = 0

    while (n > 1) {
      bitreversed_index <<= 1
      bitreversed_index += index & 1
      index >>= 1
      n >>= 1
    }
    return bitreversed_index
  }

  function BitReverseComplexArray(array) {
    var n = array.length,
        flips = {},
        swap,
        i

    for(i = 0; i < n; i++) {
      var r_i = BitReverseIndex(i, n)

      if (flips.hasOwnProperty(i) || flips.hasOwnProperty(r_i)) continue

      swap = array.real[r_i]
      array.real[r_i] = array.real[i]
      array.real[i] = swap

      swap = array.imag[r_i]
      array.imag[r_i] = array.imag[i]
      array.imag[i] = swap

      flips[i] = flips[r_i] = true
    }

    return array
  }

  function LowestOddFactor(n) {
    var factor = 3,
        sqrt_n = sqrt(n)

    while(factor <= sqrt_n) {
      if (n % factor === 0) return factor
      factor = factor + 2
    }
    return n
  }

}(
  typeof exports === 'undefined' && (this.fft = {}) || exports,
  typeof require === 'undefined' && (this.complex_array) ||
    require('./complex_array')
)

},{"./complex_array":17}],19:[function(require,module,exports){
/**

seedrandom.js
=============

Seeded random number generator for Javascript.

version 2.3.6<br>
Author: David Bau<br>
Date: 2014 May 14

Can be used as a plain script, a node.js module or an AMD module.

Script tag usage
----------------

<script src=//cdnjs.cloudflare.com/ajax/libs/seedrandom/2.3.6/seedrandom.min.js>
</script>

// Sets Math.random to a PRNG initialized using the given explicit seed.
Math.seedrandom('hello.');
console.log(Math.random());          // Always 0.9282578795792454
console.log(Math.random());          // Always 0.3752569768646784

// Sets Math.random to an ARC4-based PRNG that is autoseeded using the
// current time, dom state, and other accumulated local entropy.
// The generated seed string is returned.
Math.seedrandom();
console.log(Math.random());          // Reasonably unpredictable.

// Seeds using the given explicit seed mixed with accumulated entropy.
Math.seedrandom('added entropy.', { entropy: true });
console.log(Math.random());          // As unpredictable as added entropy.

// Use "new" to create a local prng without altering Math.random.
var myrng = new Math.seedrandom('hello.');
console.log(myrng());                // Always 0.9282578795792454


Node.js usage
-------------

npm install seedrandom

// Local PRNG: does not affect Math.random.
var seedrandom = require('seedrandom');
var rng = seedrandom('hello.');
console.log(rng());                  // Always 0.9282578795792454

// Autoseeded ARC4-based PRNG.
rng = seedrandom();
console.log(rng());                  // Reasonably unpredictable.

// Global PRNG: set Math.random.
seedrandom('hello.', { global: true });
console.log(Math.random());          // Always 0.9282578795792454

// Mixing accumulated entropy.
rng = seedrandom('added entropy.', { entropy: true });
console.log(rng());                  // As unpredictable as added entropy.


Require.js usage
----------------

Similar to node.js usage:

bower install seedrandom

require(['seedrandom'], function(seedrandom) {
  var rng = seedrandom('hello.');
  console.log(rng());                  // Always 0.9282578795792454
});


Network seeding via a script tag
--------------------------------

<script src=//cdnjs.cloudflare.com/ajax/libs/seedrandom/2.3.6/seedrandom.min.js>
</script>
<!-- Seeds using urandom bits from a server. -->
<script src=//jsonlib.appspot.com/urandom?callback=Math.seedrandom">
</script>

Examples of manipulating the seed for various purposes:

var seed = Math.seedrandom();        // Use prng with an automatic seed.
document.write(Math.random());       // Pretty much unpredictable x.

var rng = new Math.seedrandom(seed); // A new prng with the same seed.
document.write(rng());               // Repeat the 'unpredictable' x.

function reseed(event, count) {      // Define a custom entropy collector.
  var t = [];
  function w(e) {
    t.push([e.pageX, e.pageY, +new Date]);
    if (t.length < count) { return; }
    document.removeEventListener(event, w);
    Math.seedrandom(t, { entropy: true });
  }
  document.addEventListener(event, w);
}
reseed('mousemove', 100);            // Reseed after 100 mouse moves.

The "pass" option can be used to get both the prng and the seed.
The following returns both an autoseeded prng and the seed as an object,
without mutating Math.random:

var obj = Math.seedrandom(null, { pass: function(prng, seed) {
  return { random: prng, seed: seed };
}});


Version notes
-------------

The random number sequence is the same as version 1.0 for string seeds.
* Version 2.0 changed the sequence for non-string seeds.
* Version 2.1 speeds seeding and uses window.crypto to autoseed if present.
* Version 2.2 alters non-crypto autoseeding to sweep up entropy from plugins.
* Version 2.3 adds support for "new", module loading, and a null seed arg.
* Version 2.3.1 adds a build environment, module packaging, and tests.
* Version 2.3.4 fixes bugs on IE8, and switches to MIT license.
* Version 2.3.6 adds a readable options object argument.

The standard ARC4 key scheduler cycles short keys, which means that
seedrandom('ab') is equivalent to seedrandom('abab') and 'ababab'.
Therefore it is a good idea to add a terminator to avoid trivial
equivalences on short string seeds, e.g., Math.seedrandom(str + '\0').
Starting with version 2.0, a terminator is added automatically for
non-string seeds, so seeding with the number 111 is the same as seeding
with '111\0'.

When seedrandom() is called with zero args or a null seed, it uses a
seed drawn from the browser crypto object if present.  If there is no
crypto support, seedrandom() uses the current time, the native rng,
and a walk of several DOM objects to collect a few bits of entropy.

Each time the one- or two-argument forms of seedrandom are called,
entropy from the passed seed is accumulated in a pool to help generate
future seeds for the zero- and two-argument forms of seedrandom.

On speed - This javascript implementation of Math.random() is several
times slower than the built-in Math.random() because it is not native
code, but that is typically fast enough.  Some details (timings on
Chrome 25 on a 2010 vintage macbook):

* seeded Math.random()          - avg less than 0.0002 milliseconds per call
* seedrandom('explicit.')       - avg less than 0.2 milliseconds per call
* seedrandom('explicit.', true) - avg less than 0.2 milliseconds per call
* seedrandom() with crypto      - avg less than 0.2 milliseconds per call

Autoseeding without crypto is somewhat slower, about 20-30 milliseconds on
a 2012 windows 7 1.5ghz i5 laptop, as seen on Firefox 19, IE 10, and Opera.
Seeded rng calls themselves are fast across these browsers, with slowest
numbers on Opera at about 0.0005 ms per seeded Math.random().


LICENSE (MIT)
-------------

Copyright (c)2014 David Bau.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

/**
 * All code is in an anonymous closure to keep the global namespace clean.
 */
(function (
    global, pool, math, width, chunks, digits, module, define, rngname) {

//
// The following constants are related to IEEE 754 limits.
//
var startdenom = math.pow(width, chunks),
    significance = math.pow(2, digits),
    overflow = significance * 2,
    mask = width - 1,

//
// seedrandom()
// This is the seedrandom function described above.
//
impl = math['seed' + rngname] = function(seed, options, callback) {
  var key = [];
  options = (options == true) ? { entropy: true } : (options || {});

  // Flatten the seed string or build one from local entropy if needed.
  var shortseed = mixkey(flatten(
    options.entropy ? [seed, tostring(pool)] :
    (seed == null) ? autoseed() : seed, 3), key);

  // Use the seed to initialize an ARC4 generator.
  var arc4 = new ARC4(key);

  // Mix the randomness into accumulated entropy.
  mixkey(tostring(arc4.S), pool);

  // Calling convention: what to return as a function of prng, seed, is_math.
  return (options.pass || callback ||
      // If called as a method of Math (Math.seedrandom()), mutate Math.random
      // because that is how seedrandom.js has worked since v1.0.  Otherwise,
      // it is a newer calling convention, so return the prng directly.
      function(prng, seed, is_math_call) {
        if (is_math_call) { math[rngname] = prng; return seed; }
        else return prng;
      })(

  // This function returns a random double in [0, 1) that contains
  // randomness in every bit of the mantissa of the IEEE 754 value.
  function() {
    var n = arc4.g(chunks),             // Start with a numerator n < 2 ^ 48
        d = startdenom,                 //   and denominator d = 2 ^ 48.
        x = 0;                          //   and no 'extra last byte'.
    while (n < significance) {          // Fill up all significant digits by
      n = (n + x) * width;              //   shifting numerator and
      d *= width;                       //   denominator and generating a
      x = arc4.g(1);                    //   new least-significant-byte.
    }
    while (n >= overflow) {             // To avoid rounding up, before adding
      n /= 2;                           //   last byte, shift everything
      d /= 2;                           //   right using integer math until
      x >>>= 1;                         //   we have exactly the desired bits.
    }
    return (n + x) / d;                 // Form the number within [0, 1).
  }, shortseed, 'global' in options ? options.global : (this == math));
};

//
// ARC4
//
// An ARC4 implementation.  The constructor takes a key in the form of
// an array of at most (width) integers that should be 0 <= x < (width).
//
// The g(count) method returns a pseudorandom integer that concatenates
// the next (count) outputs from ARC4.  Its return value is a number x
// that is in the range 0 <= x < (width ^ count).
//
/** @constructor */
function ARC4(key) {
  var t, keylen = key.length,
      me = this, i = 0, j = me.i = me.j = 0, s = me.S = [];

  // The empty key [] is treated as [0].
  if (!keylen) { key = [keylen++]; }

  // Set up S using the standard key scheduling algorithm.
  while (i < width) {
    s[i] = i++;
  }
  for (i = 0; i < width; i++) {
    s[i] = s[j = mask & (j + key[i % keylen] + (t = s[i]))];
    s[j] = t;
  }

  // The "g" method returns the next (count) outputs as one number.
  (me.g = function(count) {
    // Using instance members instead of closure state nearly doubles speed.
    var t, r = 0,
        i = me.i, j = me.j, s = me.S;
    while (count--) {
      t = s[i = mask & (i + 1)];
      r = r * width + s[mask & ((s[i] = s[j = mask & (j + t)]) + (s[j] = t))];
    }
    me.i = i; me.j = j;
    return r;
    // For robust unpredictability discard an initial batch of values.
    // See http://www.rsa.com/rsalabs/node.asp?id=2009
  })(width);
}

//
// flatten()
// Converts an object tree to nested arrays of strings.
//
function flatten(obj, depth) {
  var result = [], typ = (typeof obj), prop;
  if (depth && typ == 'object') {
    for (prop in obj) {
      try { result.push(flatten(obj[prop], depth - 1)); } catch (e) {}
    }
  }
  return (result.length ? result : typ == 'string' ? obj : obj + '\0');
}

//
// mixkey()
// Mixes a string seed into a key that is an array of integers, and
// returns a shortened string seed that is equivalent to the result key.
//
function mixkey(seed, key) {
  var stringseed = seed + '', smear, j = 0;
  while (j < stringseed.length) {
    key[mask & j] =
      mask & ((smear ^= key[mask & j] * 19) + stringseed.charCodeAt(j++));
  }
  return tostring(key);
}

//
// autoseed()
// Returns an object for autoseeding, using window.crypto if available.
//
/** @param {Uint8Array|Navigator=} seed */
function autoseed(seed) {
  try {
    global.crypto.getRandomValues(seed = new Uint8Array(width));
    return tostring(seed);
  } catch (e) {
    return [+new Date, global, (seed = global.navigator) && seed.plugins,
            global.screen, tostring(pool)];
  }
}

//
// tostring()
// Converts an array of charcodes to a string
//
function tostring(a) {
  return String.fromCharCode.apply(0, a);
}

//
// When seedrandom.js is loaded, we immediately mix a few bits
// from the built-in RNG into the entropy pool.  Because we do
// not want to intefere with determinstic PRNG state later,
// seedrandom will not call math.random on its own again after
// initialization.
//
mixkey(math[rngname](), pool);

//
// Nodejs and AMD support: export the implemenation as a module using
// either convention.
//
if (module && module.exports) {
  module.exports = impl;
} else if (define && define.amd) {
  define(function() { return impl; });
}

// End anonymous scope, and pass initial values.
})(
  this,   // global window object
  [],     // pool: entropy pool starts empty
  Math,   // math: package containing random, pow, and seedrandom
  256,    // width: each RC4 output is 0 <= x < 256
  6,      // chunks: at least six RC4 outputs for each double
  52,     // digits: there are 52 significant digits in a double
  (typeof module) == 'object' && module,    // present in node.js
  (typeof define) == 'function' && define,  // present with an AMD loader
  'random'// rngname: name for Math.random and Math.seedrandom
);
},{}]},{},[16])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJqcy9iY2pyLmpzIiwianMvYnl0ZWJpdC5qcyIsImpzL2NpcmMuanMiLCJqcy9jb25maWcuanMiLCJqcy9mbHNpbnRlcmxlYXZlci5qcyIsImpzL2lkY3JjLmpzIiwianMvbGFsZy5qcyIsImpzL29mZG0uanMiLCJqcy9wYWNrZXRpemVyLmpzIiwianMvcGVybWRhdGEuanMiLCJqcy9wcmVkaWN0b3IuanMiLCJqcy9yYW5kb21fcGVybS5qcyIsImpzL3NvdW5kX2RyaXZlci5qcyIsImpzL3R1cmJvY29kZS5qcyIsImpzL3V0ZjguanMiLCJqcy92b2NvY2xhc3MuanMiLCJqc2ZmdC9saWIvY29tcGxleF9hcnJheS5qcyIsImpzZmZ0L2xpYi9mZnQuanMiLCJzZWVkcmFuZG9tL3NlZWRyYW5kb20uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbE1BO0FBQ0E7QUFDQTs7QUNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLypqc2xpbnQgbm9kZTogdHJ1ZSAsIGJyb3dzZXI6IHRydWUgKi9cbi8qZ2xvYmFsIHdpbmRvdyAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbi8vIEJDSlIgZGVjb2RpbmcgYWxnb3JpdGhtXG4vLyBGb2xsb3cgdGhpcyBkb2M6IGh0dHA6Ly9yZXBvc2l0b3Jpby1hYmVydG8udXAucHQvYml0c3RyZWFtLzEwMjE2LzE5NzM1LzIvMTIwMTcucGRmXG4vLyBMdTogb3V0cHV0IGl0IGlzIHRoZSBMTFIodSkgZ2l2ZSBMTFIoeSlcbi8vIHkgaXMgdGhlIExMUih5KS4gSXQgaXMgdGhlIHNlcXVlbmNlIHRoYXQgd2Ugd2FudCB0byBkZWNvZGUuXG4vLyBMTFIoeSkgPSBsbihQKDApL3AoMSkpID0gbG4oUCh1PSsxKS9QKHU9LTEpKVxuLy8gbnVtcyBpcyBhbiBhcnJheSBvZiBudW1lcmF0b3Mgb2YgdGhlIGVuY29kZXIuXG4vLyBkZW4gaXMgdGhlIGRlbm9taW5hdG9yIG9mIHRoZSBlbmNvZGVyXG5cblxudmFyIEJ5dGVCaXQgPSByZXF1aXJlKCcuL2J5dGViaXQuanMnKTtcbnZhciBsQWxnID0gcmVxdWlyZSgnLi9sYWxnLmpzJyk7XG5cblxuZnVuY3Rpb24gQ29udm9sdXRpb24obnVtcywgZGVuKSB7XG5cdHZhciBzZWxmPXRoaXM7XG5cblx0ZnVuY3Rpb24gZ2V0RGVncmVlKHApIHtcblx0XHR2YXIgZD0wO1xuXHRcdHZhciBwcyA9IHAgPj4xO1xuXHRcdHdoaWxlIChwcykge1xuXHRcdFx0cHMgPSBwcyA+PjE7XG5cdFx0XHRkICs9MTtcblx0XHR9XG5cdFx0cmV0dXJuIGQ7XG5cdH1cblxuXHRmdW5jdGlvbiB4b3IocCwgbWFzaykge1xuXHRcdHZhciB4ID0wO1xuXHRcdHZhciBwcyA9IHA7XG5cdFx0dmFyIG09IG1hc2s7XG5cdFx0d2hpbGUgKG0pIHtcblx0XHRcdGlmIChtICYgMSkge1xuXHRcdFx0XHR4ID0geCBeIChwcyAmIDEpO1xuXHRcdFx0fVxuXHRcdFx0bSA9IG0gPj4gMTtcblx0XHRcdHBzID0gcHMgPj4gMTtcblx0XHR9XG5cdFx0cmV0dXJuIHg7XG5cdH1cblxuXHR2YXIgaTtcblx0c2VsZi5uTWVtPWdldERlZ3JlZShkZW4pO1xuXHRmb3IgKGk9MDsgaTxudW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0c2VsZi5uTWVtPSBNYXRoLm1heChzZWxmLm5NZW0sIGdldERlZ3JlZShudW1zW2ldKSk7XG5cdH1cblxuXHRzZWxmLm5TdGF0ZXMgPSAxIDw8IHNlbGYubk1lbTtcblxuXHRzZWxmLm51bXMgPSBudW1zO1xuXHRzZWxmLmRlbiA9IGRlbjtcblx0c2VsZi5uT3V0cyA9IG51bXMubGVuZ3RoO1xuXG5cdHZhciBzLHg7XG5cdHNlbGYudHIgPSBbXTtcblx0Zm9yIChzPTA7IHM8c2VsZi5uU3RhdGVzOyBzKz0xKSB7XG5cdFx0c2VsZi50cltzXT1bXTtcblx0XHRmb3IgKHg9MDsgeDw9MTsgeCs9MSkge1xuXHRcdFx0dmFyIGZiID0geG9yKCBzICwgc2VsZi5kZW4gPj4gMSApO1xuXHRcdFx0dmFyIHJlcyA9IHtcblx0XHRcdFx0ZmI6IGZiLFxuXHRcdFx0XHRzOiAoKHM8PDEpIHwgKGZiIF4geCkpICYgKHNlbGYublN0YXRlcyAtMSksXG5cdFx0XHRcdG91dDogW11cblx0XHRcdH07XG5cdFx0XHRmYiA9IHhvciggcmVzLnMgLCBzZWxmLmRlbiA+PiAxICk7XG5cdFx0XHR2YXIgaztcblx0XHRcdGZvciAoaz0wOyBrPHNlbGYubk91dHM7IGsrPTEpIHtcblx0XHRcdFx0cmVzLm91dFtrXSA9IGZiIF4geCBeIHhvcihyZXMucyAsIHNlbGYubnVtc1trXSA+PiAxKTtcblx0XHRcdH1cblx0XHRcdHNlbGYudHJbc11beF0gPSByZXM7XG5cdFx0fVxuXHR9XG5cblx0c2VsZi50cmFuc2l0aW9uID0gZnVuY3Rpb24ocywgeCkge1xuXHRcdHJldHVybiBzZWxmLnRyW3NdW3hdO1xuXHR9O1xuXG5cdHJldHVybiBzZWxmO1xufVxuXG5cbmZ1bmN0aW9uIEJDSlIobnVtcywgZGVuKSB7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdHNlbGYuZGVjb2RlID0gZnVuY3Rpb24oeSwgbHUpIHtcblxuXHRcdHZhciB1PVtdO1xuXG5cdFx0dmFyIG49IHkubGVuZ3RoIC8gc2VsZi5uT3V0cztcblxuXHRcdHZhciBsYyA9IDE7ICAgLy8gbGMgaXMgdGhlIENoYW5lbCByZWxpYWJpbGl0eS5cblxuXHRcdHZhciBnID0gW107XHRcdFx0Ly8gZ2FtYShrLCBzJywgcylcblx0XHR2YXIgYSA9IFtdO1x0XHRcdC8vIGFsZmEoayxzJylcblx0XHR2YXIgYiA9IFtdO1x0XHRcdC8vIGJldGEoaywgcylcblxuXHRcdHZhciByZXMsIGQsIGksaixrLCBzLCBzZjtcblxuXG5cdC8vIEluaXRpYWwgdmFsdWVzXG5cdFx0YVswXSA9IFtdO1xuXHRcdGFbMF1bMF0gPSAwO1xuXHRcdGJbbl09W107XG5cdFx0YltuXVswXSA9IDA7XG5cdFx0Zm9yIChzPTE7IHM8c2VsZi5uU3RhdGVzOyBzKyspIHtcblx0XHRcdGFbMF1bc10gPSAtbEFsZy5JTkY7XG5cdFx0XHRiW25dW3NdID0gLWxBbGcuSU5GO1xuXHRcdH1cblxuXHQvLyBGaXJzdCB3ZSBjYWxjdWxhdGUgYSBhbmQgZ1xuXHRcdGZvciAoaz0wOyBrPG47IGsrKykge1xuXHRcdFx0Z1trXSA9IFtdO1xuXHRcdFx0YVtrKzFdID0gW107XG5cblx0XHRcdGZvciAoc2YgPTA7IHNmPHNlbGYublN0YXRlczsgc2YgKysgKSB7ICAgICAgLy8gc2Ygc3RhbmRzIGZvciBcInN0YXRlIGZyb21cIlxuXHRcdFx0XHRnW2tdW3NmXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGk9MDsgaTwyOyBpICs9MSkge1xuXHRcdFx0XHRcdHJlcyA9IHNlbGYudHJbc2ZdW2ldOyAgIC8vIFJldHVybnMgcmVzLnMgLT4gbmV3IHN0YXRlIGFuZCByZXMub3V0IHRoZSBvdXRwdXQgTFNCIC0+IHgwLCBNU0IgLT4geE5cblxuXHRcdFx0XHRcdGlmIChpID09PSAwKSB7XG5cdFx0XHRcdFx0XHRnW2tdW3NmXVtyZXMuc10gPSBsdVtrXTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Z1trXVtzZl1bcmVzLnNdID0gLWx1W2tdO1xuXHRcdFx0XHRcdH1cblxuXG5cdFx0XHRcdFx0Zm9yIChqPTA7IGo8IHNlbGYubk91dHM7IGorKykge1xuXHRcdFx0XHRcdFx0ZCA9IChyZXMub3V0W2pdICkgPyAtMSA6IDE7XG5cdFx0XHRcdFx0XHRpZiAoZCA+IDApIHtcblx0XHRcdFx0XHRcdFx0Z1trXVtzZl1bcmVzLnNdICs9IHlbaypzZWxmLm5PdXRzICsgal0qbGM7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRnW2tdW3NmXVtyZXMuc10gLT0geVtrKnNlbGYubk91dHMgKyBqXSpsYztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblxuXHRcdFx0XHRcdGlmIChhW2srMV1bcmVzLnNdID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGFbaysxXVtyZXMuc10gPSBhW2tdW3NmXSArIGdba11bc2ZdW3Jlcy5zXTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YVtrKzFdW3Jlcy5zXSA9IGxBbGcubE1heCggIGFbaysxXVtyZXMuc10sICAgYVtrXVtzZl0gKyBnW2tdW3NmXVtyZXMuc10gICk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdC8vIG5vdyBjYWxjdWxhdGUgdGhlIGJcblxuXHRcdGZvciAoaz1uLTE7IGs+MDsgay0tKSB7XG5cdFx0XHRiW2tdPVtdO1xuXG5cdFx0XHRmb3IgKHNmID0wOyBzZjxzZWxmLm5TdGF0ZXM7IHNmICsrICkgeyAgICAgIC8vIHNmIHN0YW5kcyBmb3IgXCJzdGF0ZSBmcm9tXCJcblx0XHRcdFx0Zm9yIChpPTA7IGk8MjsgaSArPTEpIHtcblx0XHRcdFx0XHRyZXMgPSBzZWxmLnRyW3NmXVtpXTsgICAvLyBSZXR1cm5zIHJlcy5zIC0+IG5ldyBzdGF0ZSBhbmQgcmVzLm91dCB0aGUgb3V0cHV0IExTQiAtPiB4MCwgTVNCIC0+IHhOXG5cblx0XHRcdFx0XHRpZiAoYltrXVtzZl0gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0YltrXVtzZl0gPSBiW2srMV1bcmVzLnNdICsgZ1trXVtzZl1bcmVzLnNdO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRiW2tdW3NmXSA9IGxBbGcubE1heCggIGJba11bc2ZdLCAgIGJbaysxXVtyZXMuc10gKyBnW2tdW3NmXVtyZXMuc10gICk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdC8vIENhbGN1bGF0ZSB0aGUgb3V0cHV0XG5cdFx0Zm9yIChrPTA7IGs8bjsgaysrKSB7XG5cdFx0XHR2YXIgcj0gWy1sQWxnLklORiwgLWxBbGcuSU5GXTtcblxuXHRcdFx0Zm9yIChzZiA9MDsgc2Y8c2VsZi5uU3RhdGVzOyBzZiArKyApIHsgICAgICAvLyBzZiBzdGFuZHMgZm9yIFwic3RhdGUgZnJvbVwiXG5cdFx0XHRcdGZvciAoaT0wOyBpPDI7IGkgKz0xKSB7XG5cdFx0XHRcdFx0cmVzID0gc2VsZi50cltzZl1baV07ICAgLy8gUmV0dXJucyByZXMucyAtPiBuZXcgc3RhdGUgYW5kIHJlcy5vdXQgdGhlIG91dHB1dCBMU0IgLT4geDAsIE1TQiAtPiB4TlxuXHRcdFx0XHRcdHJbaV0gPSBsQWxnLmxNYXgocltpXSAsIGFba11bc2ZdICsgZ1trXVtzZl1bcmVzLnNdICsgYltrKzFdW3Jlcy5zXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHVba10gPSByWzBdIC1yWzFdO1xuXHRcdH1cblxuXHRcdHJldHVybiB1O1xuXG5cdH07XG5cblx0c2VsZi5lbmNvZGUgPSBmdW5jdGlvbih1KSB7XG5cdFx0dmFyIHg9W107XG5cdFx0dmFyIGQsaywgaTtcblx0XHR2YXIgcmVzID0ge3M6IDB9O1xuXG5cdFx0Zm9yIChrPTA7IGs8dS5sZW5ndGg7IGsrPTEpIHtcblx0XHRcdFx0ZCA9ICh1W2tdPDApID8gMSA6ICAwO1xuXHRcdFx0XHRyZXMgPSBzZWxmLnRyW3Jlcy5zXVtkXTtcblxuXHRcdFx0XHRmb3IgKGk9MDsgaTxzZWxmLm5PdXRzOyBpKyspIHtcblx0XHRcdFx0XHR4LnB1c2gocmVzLm91dFtpXSA/IC0xIDogMSk7XG5cdFx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUcmFpbGluZyBiaXRzIHRvIHJldHVybiB0byBzdGF0ZSAwXG5cdFx0Zm9yIChrPTA7IGs8c2VsZi5uTWVtOyBrKz0xKSB7XG5cdFx0XHRyZXMgPSBzZWxmLnRyW3Jlcy5zXVtkXTtcblx0XHRcdGZvciAoaT0wOyBpPHNlbGYubk91dHM7IGkrKykge1xuXHRcdFx0XHR4LnB1c2gocmVzLm91dFtpXSA/IC0xIDogMSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHg7XG5cdH07XG5cblxuXHRzZWxmLmluaXQgPSBmdW5jdGlvbihudW1zLCBkZW4pIHtcblxuXHRcdGZ1bmN0aW9uIGdldERlZ3JlZShwKSB7XG5cdFx0XHR2YXIgZD0wO1xuXHRcdFx0dmFyIHBzID0gcCA+PjE7XG5cdFx0XHR3aGlsZSAocHMpIHtcblx0XHRcdFx0cHMgPSBwcyA+PjE7XG5cdFx0XHRcdGQgKz0xO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGQ7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24geG9yKHAsIG1hc2spIHtcblx0XHRcdHZhciB4ID0wO1xuXHRcdFx0dmFyIHBzID0gcDtcblx0XHRcdHZhciBtPSBtYXNrO1xuXHRcdFx0d2hpbGUgKG0pIHtcblx0XHRcdFx0aWYgKG0gJiAxKSB7XG5cdFx0XHRcdFx0eCA9IHggXiAocHMgJiAxKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRtID0gbSA+PiAxO1xuXHRcdFx0XHRwcyA9IHBzID4+IDE7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geDtcblx0XHR9XG5cblx0XHR2YXIgaTtcblx0XHRzZWxmLm5NZW09Z2V0RGVncmVlKGRlbik7XG5cdFx0Zm9yIChpPTA7IGk8bnVtcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0c2VsZi5uTWVtPSBNYXRoLm1heChzZWxmLm5NZW0sIGdldERlZ3JlZShudW1zW2ldKSk7XG5cdFx0fVxuXG5cdFx0c2VsZi5uU3RhdGVzID0gMSA8PCBzZWxmLm5NZW07XG5cblx0XHRzZWxmLm51bXMgPSBudW1zO1xuXHRcdHNlbGYuZGVuID0gZGVuO1xuXHRcdHNlbGYubk91dHMgPSBudW1zLmxlbmd0aDtcblxuXHRcdHZhciBzLHg7XG5cdFx0c2VsZi50ciA9IFtdO1xuXHRcdGZvciAocz0wOyBzPHNlbGYublN0YXRlczsgcys9MSkge1xuXHRcdFx0c2VsZi50cltzXT1bXTtcblx0XHRcdGZvciAoeD0wOyB4PD0xOyB4Kz0xKSB7XG5cdFx0XHRcdHZhciBmYiA9IHhvciggcyAsIHNlbGYuZGVuID4+IDEgKTtcblx0XHRcdFx0dmFyIHJlcyA9IHtcblx0XHRcdFx0XHRmYjogZmIsXG5cdFx0XHRcdFx0czogKChzPDwxKSB8IChmYiBeIHgpKSAmIChzZWxmLm5TdGF0ZXMgLTEpLFxuXHRcdFx0XHRcdG91dDogW11cblx0XHRcdFx0fTtcblx0XHRcdFx0ZmIgPSB4b3IoIHJlcy5zICwgc2VsZi5kZW4gPj4gMSApO1xuXHRcdFx0XHR2YXIgaztcblx0XHRcdFx0Zm9yIChrPTA7IGs8c2VsZi5uT3V0czsgays9MSkge1xuXHRcdFx0XHRcdHJlcy5vdXRba10gPSBmYiBeIHggXiB4b3IocmVzLnMgLCBzZWxmLm51bXNba10gPj4gMSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2VsZi50cltzXVt4XSA9IHJlcztcblx0XHRcdH1cblx0XHR9XG5cdH07XG5cblx0c2VsZi5pbml0KG51bXMsZGVuKTtcblxuXHRyZXR1cm4gc2VsZjtcbn1cblxuXG5mdW5jdGlvbiBCQ0pSRW5jb2RlcihudW1zLCBkZW4sIGRlc3RpbmF0aW9uKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRzZWxmLmJjanIgPSBCQ0pSKG51bXMsZGVuKTtcblx0c2VsZi5kZXN0aW5hdGlvbj1kZXN0aW5hdGlvbjtcblxuXHRzZWxmLnByb2Nlc3NEYXRhID0gZnVuY3Rpb24oaW5CKSB7XG5cdFx0dmFyIGksajtcblx0XHR2YXIgb3V0Qj1bXTtcblxuXHRcdHZhciB1ID0gQnl0ZUJpdC5ieXRlczJiaXRzKGluQik7XG5cdFx0dmFyIHggPSBzZWxmLmJjanIuZW5jb2RlKHUpO1xuXG5cdFx0Zm9yIChpPTA7IGk8IHUubGVuZ3RoOyBpKyspIHtcblx0XHRcdG91dEIucHVzaCh1W2ldKTtcblx0XHRcdGZvciAoaj0wOyBqPCBzZWxmLmJjanIubk91dHM7IGorKykge1xuXHRcdFx0XHRvdXRCLnB1c2goeFtpKnNlbGYuYmNqci5uT3V0cyArIGpdKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRkZXN0aW5hdGlvbi5wcm9jZXNzRGF0YShvdXRCKTtcblx0fTtcblxuXHRyZXR1cm4gc2VsZjtcbn1cblxuXG5mdW5jdGlvbiBCQ0pSRGVjb2RlcihudW1zLCBkZW4sIGRlc3RpbmF0aW9uKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRzZWxmLmJjanIgPSBuZXcgQkNKUihudW1zLCBkZW4pO1xuXHRzZWxmLmRlc3RpbmF0aW9uPWRlc3RpbmF0aW9uO1xuXG5cdHNlbGYucHJvY2Vzc0RhdGEgPSBmdW5jdGlvbihpbkIpIHtcblx0XHR2YXIgaSxqO1xuXHRcdHZhciBuID0gTWF0aC5mbG9vcihpbkIubGVuZ3RoIC8gKDEgKyBzZWxmLmJjanIubk91dHMpKTtcblx0XHR2YXIgeT1bXTtcblx0XHR2YXIgbHU9W107XG5cdFx0Zm9yIChpPTA7IGk8bjsgaSsrKSB7XG5cdFx0XHRsdS5wdXNoKCBpbkJbaSAqICgxICsgc2VsZi5iY2pyLm5PdXRzKV0gKTtcblx0XHRcdGZvciAoaj0wOyBqPHNlbGYuYmNqci5uT3V0czsgaisrKSB7XG5cdFx0XHRcdHkucHVzaChpbkJbaSAqICgxICsgc2VsZi5iY2pyLm5PdXRzKSAraiArMV0gKTtcblx0XHRcdH1cblx0XHR9XG5cblxuXHRcdHZhciBvdXRCaXRzPSBzZWxmLmJjanIuZGVjb2RlKHksbHUpO1xuXHRcdHZhciBvdXRCeXRlcyA9IEJ5dGVCaXQuYml0czJieXRlcyhvdXRCaXRzKTtcblx0XHRkZXN0aW5hdGlvbi5wcm9jZXNzRGF0YShvdXRCeXRlcyk7XG5cdH07XG5cblx0cmV0dXJuIHNlbGY7XG5cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBCQ0pSO1xuIiwiLypqc2xpbnQgbm9kZTogdHJ1ZSAsIGJyb3dzZXI6IHRydWUgKi9cbi8qZ2xvYmFsIHdpbmRvdyAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbmZ1bmN0aW9uIGJ5dGVzMmJpdHMoaW5CKSB7XG5cdHZhciBkLGksajtcblx0dmFyIG91dEI9W107XG5cdGZvciAoaT0wOyBpPGluQi5sZW5ndGg7IGkrPTEpIHtcblx0XHRmb3IgKGo9MDsgajw4OyBqKyspIHtcblx0XHRcdGQgPSAoaW5CW2ldICYgKDEgPDwgaikpID8gLTEgOiAgMTtcblx0XHRcdG91dEIucHVzaChkKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG91dEI7XG59XG5cbmZ1bmN0aW9uIGJpdHMyYnl0ZXMoaW5CaXRzICkge1xuXHRcdHZhciBvdXRCeXRlcyA9IFtdO1xuXHRcdHZhciBieSxiaSwgaTtcblx0XHRmb3IgKGk9MDsgaTxpbkJpdHMubGVuZ3RoICA7IGkrPTEpIHtcblx0XHRcdGJ5ID0gaSA+PiAzO1xuXHRcdFx0YmkgPSBpICYgMHg3O1xuXHRcdFx0b3V0Qnl0ZXNbYnldID0gb3V0Qnl0ZXNbYnldIHx8IDA7XG5cdFx0XHRpZiAoaW5CaXRzW2ldPDApIHtcblx0XHRcdFx0b3V0Qnl0ZXNbYnldID0gb3V0Qnl0ZXNbYnldIHwgKDE8PCBiaSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvdXRCeXRlcztcbn1cblxuZXhwb3J0cy5ieXRlczJiaXRzID0gYnl0ZXMyYml0cztcbmV4cG9ydHMuYml0czJieXRlcyA9IGJpdHMyYnl0ZXM7XG4iLCIvKmpzbGludCBub2RlOiB0cnVlICwgYnJvd3NlcjogdHJ1ZSAqL1xuLypnbG9iYWwgd2luZG93ICovXG5cInVzZSBzdHJpY3RcIjtcblxuLy8gT3BlcmF0aW9ucyBpbiB0aGUgY2lyY19kb21haW5cblxuLy8gQ2FsY3VsYXRlcyB0aGUgZXJyb3QgYnR3ZW4gYSB2YWx1ZSBhbmQgYSByZWZcblxuZnVuY3Rpb24gY2lyY19ub3JtKHYpIHtcblx0cmV0dXJuIHYgLSBNYXRoLmZsb29yKHYpO1xufVxuXG5mdW5jdGlvbiBjaXJjX2VycihhLGIpIHtcblx0dmFyIHYgPSBjaXJjX25vcm0oYS1iKTtcblx0cmV0dXJuIHY+MC41ID8gLSgxLXYpIDogdjtcbn1cblxuZXhwb3J0cy5ub3JtID0gY2lyY19ub3JtO1xuZXhwb3J0cy5lcnIgPSBjaXJjX2VycjtcbiIsIi8qanNsaW50IG5vZGU6IHRydWUgLCBicm93c2VyOiB0cnVlICovXG4vKmdsb2JhbCB3aW5kb3cgKi9cblwidXNlIHN0cmljdFwiO1xuXG4vLy8vLy8vIENPTkZJR1VSQVRJT04gQ09OU1RBTlRTXG5leHBvcnRzLk5fQlVGRl9JTiA9IDQwOTY7XG5leHBvcnRzLkZESVY9MTI4O1xuZXhwb3J0cy5OX0ZSQU1FU19QQUNLRVQ9NDg7XG5cblxuLy92YXIgdXNlZENoYW5uZWxzPVsyLDMsNSw3LDExLDEzLDE3LDE5LDIzLDI5LDMxLDM3LDQxLDQzLDQ3LDUzLDU5LDYxLDY3LDcxLDczLDc5LDgzLDg5LDk3LDEwMSwxMDMsMTA3LDEwOSwxMTMsMTI3XTsgLy8gMzFcbmV4cG9ydHMudXNlZENoYW5uZWxzPVtdOyAvLyAyN1xudmFyIGk7XG5mb3IgKGk9NjsgaTw9ODI7IGkrKykge1xuICAgIGV4cG9ydHMudXNlZENoYW5uZWxzLnB1c2goaSk7XG59XG5cbmV4cG9ydHMuTl9QUkVBTUJMRV9GUkFNRVM9IDE7XG5leHBvcnRzLk5fUE9TVEFNQkxFX0ZSQU1FUz0gMTtcbmV4cG9ydHMuTERQQ19NQVhfSVRFUlM9NTAwO1xuXG5cbmV4cG9ydHMuTlVNUzEgPSBbIDB4MTksIDB4QiwgMHgxNSwgMHgxRl07XG5leHBvcnRzLkRFTjEgPSAweDE5O1xuZXhwb3J0cy5OVU1TMiA9IFsgMHhCLCAweDFGXTtcbmV4cG9ydHMuREVOMiA9IDB4MTk7XG5cbi8vLy8gRU5EIENPTlNUQU5UU1xuIiwiLypqc2xpbnQgbm9kZTogdHJ1ZSAsIGJyb3dzZXI6IHRydWUgKi9cbi8qZ2xvYmFsIHdpbmRvdyAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbi8vIGh0dHBzOi8vd3d3Lmdvb2dsZS5jb20vdXJsP3NhPXQmcmN0PWomcT0mZXNyYz1zJnNvdXJjZT13ZWImY2Q9MSZjYWQ9cmphJnVhY3Q9OCZ2ZWQ9MENCOFFGakFBJnVybD1odHRwJTNBJTJGJTJGd2ViLnN0YW5mb3JkLmVkdSUyRmNsYXNzJTJGZWUzNzliJTJGY2xhc3NfcmVhZGVyJTJGYXR0My5wZGYmZWk9OFlhX1U5U2tHc09VMEFXc3A0REFDQSZ1c2c9QUZRakNORnhHQ0JlRjEtS1RsNjJmRE0tMERRWktGN18zUVxuLy8gRm9sbG93aW5nIHRoZSBkb2M6IERlc2lnbiBvZiBGbGV4aWJsZS1MZW5ndGggUy1SYW5kb20gSW50ZXJsZWF2ZXIgZm9yIFR1cmJvIENvZGVzXG5cbmZ1bmN0aW9uIEZMU0ludGVybGVhdmVyKG4pIHtcblx0dmFyIHNlbGY9dGhpcztcblxuLy9cdHNlbGYuY29udmVydCA9IFs1LDEsMywwLDQsMl07XG5cdHNlbGYuY29udmVydCA9IFsyODQsNDksMTAsMTc2LDc1LDIyMiwxNDAsMTkxLDYwLDMxLDI1Miw5OSwyMDMsMTE4LFxuXHQ0NCwyMzMsMTYxLDUsMjc2LDcwLDEzMywyNSwxNDksNTUsMTg1LDEwNSwzOSwyMjQsMjQ4LDI4MiwyMTAsMTcyLDgyLDEyNiwxOSwyMzYsMjY1LDExMywxLDY1LDE0MywxNjQsMTk0LFxuXHQyNDUsMzAyLDI3NCw3Niw5NSwyMjcsMjU3LDEzLDI4NSwyOCwyMDQsMTUxLDE4Miw4NiwxMDgsNTksMTMwLDIyMSwxNjksMzUsMjkxLDcxLDIzOSwyMiwyNzgsMTg4LDgsNTIsMjU5LFxuXHQxNjAsMTM4LDIxNiwxMjAsMTAwLDc3LDI5NiwxNiwxOTUsNDUsMjM1LDMsOTAsMjY4LDY4LDI2LDI4NywxNTMsMjA5LDE2OCwzOCwyNTQsMTI4LDI3NywxODMsMTExLDgxLDU3LDI5Myxcblx0MjE5LDIwLDI0NiwxNDYsMTc0LDIwMSwxMDMsMjY5LDMyLDMwMywxMzQsMTIsNzQsMjI4LDkzLDI1Myw0MiwyOTAsNjIsMTE2LDE4MCwyMTEsMTUyLDI0MCwyNjQsMTI3LDYsMjMsMTcwLFxuXHQyMjAsNjksMjk3LDI0OSwzNiw4NywxMTAsMjAwLDU2LDE0NCwxNzcsMjY2LDIyNiwxMzEsMjksMjgwLDE1NywyNDQsMjk0LDIwOCwxODcsMTgsMjU2LDQ4LDAsOTIsMjczLDEyMywxNjUsXG5cdDI4OCwxNTAsMjI5LDE5Nyw5LDI2Myw0MCw4NCwxMDcsNjQsMjk5LDE1OCwxNzksMjA1LDI0NywyNzEsNTMsMTI5LDI4OSwyMjUsMTkzLDI1OCwxNDEsMzQsMjM3LDIxNCwxNCwyODEsNzksXG5cdDk3LDE3MSwxMjIsNDYsNCwxODksMTU0LDIwNyw1OCwzMCwxMzIsODksMjYxLDIzMSwxNjMsMTAyLDE5Niw2NiwyMTgsNTEsMjg2LDE0NSwyNCwxODQsMTE1LDgzLDM3LDI0MiwyNzAsMTU1LFxuXHQyMDIsMTM2LDE3LDIyMyw3MywxNzgsMjgzLDI1MCwxOTIsOTQsMTIxLDYxLDI5OCwyMzgsMTQ4LDQzLDExLDI2MCwxMDksMTk5LDE2Niw4OCwzMywyNzksMTM5LDY3LDIxNSwyMzQsMTAxLFxuXHQ1NCw4MCwxOTAsMTE0LDI1MSwyNzIsMjA2LDMwMSwxNDcsMTczLDEyNSwyNyw0Nyw5MSwyNDMsMTA2LDE2MiwxMzcsMjY3LDIxMywyOTIsNzIsMTE5LDE4MSwyMSw5OCwxOTgsMjMyLDI3NSxcblx0ODUsNjMsMTU2LDExMiwyNTUsNywxNDIsMzAwLDI0MSwxMjQsMTY3LDIxMiw3OCwxMDQsMTg2LDE1LDQxLDI2MiwxMzUsMjMwLDI5NSwxNzUsMTU5LDExNywyMTcsNTAsOTYsMl07XG5cblx0ZnVuY3Rpb24gbWluQ2ljbGVMZW5ndGgocCkge1xuXHRcdHZhciBpLGo7XG5cdFx0dmFyIG1pbmMgPSBwLmxlbmd0aCoyO1xuXHRcdHZhciBubWluYyA9IDA7XG5cdFx0dmFyIGM7XG5cdFx0Zm9yIChpPTA7IGk8cC5sZW5ndGgtMTsgaSsrKSB7XG5cdFx0XHRmb3IgKGo9aSsxOyBqPHAubGVuZ3RoOyBqKyspIHtcblx0XHRcdFx0YyA9IE1hdGguYWJzKGktaikgKyBNYXRoLmFicyhwW2ldLXBbal0pO1xuXHRcdFx0XHRpZiAoYyA8IG1pbmMpIHtcblx0XHRcdFx0XHRtaW5jID0gYztcblx0XHRcdFx0XHRubWluYyA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGMgPT09IG1pbmMpIHtcblx0XHRcdFx0XHRubWluYyArPSAxO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHttaW5jOiBtaW5jLCBubWluYzogbm1pbmN9O1xuXHR9XG5cblx0ZnVuY3Rpb24gZmluZE5leHRQZXJtKHApIHtcblx0XHR2YXIgaTtcblxuXHRcdC8vIFN0ZXAgMSBhbmQgMiBhbmQgM1xuXHRcdHZhciBtdT0tMTtcblx0XHR2YXIgbGFtcGRhID0gcC5sZW5ndGgqMjtcblx0XHR2YXIgZD1bXTtcblxuXHRcdGZvciAoaT0wOyBpPHAubGVuZ3RoOyBpKyspIHtcblx0XHRcdHZhciB4aSA9IHAuc2xpY2UoMCxpKTtcblx0XHRcdHhpLnB1c2gocC5sZW5ndGgpO1xuXHRcdFx0eGkgPSB4aS5jb25jYXQocC5zbGljZShpLHAubGVuZ3RoKSk7XG5cblx0XHRcdHZhciAgcmVzID0gbWluQ2ljbGVMZW5ndGgoeGkpO1xuXG5cdFx0XHRpZiAoKHJlcy5taW5jID4gbXUpIHx8ICgocmVzLm1pbmMgPT09IG11KSYmKHJlcy5ubWluYyA8IGxhbXBkYSkpKSAge1xuXHRcdFx0XHRtdSA9IHJlcy5taW5jO1xuXHRcdFx0XHRsYW1wZGEgPSByZXMubm1pbmM7XG5cdFx0XHRcdGQgPSBbXTtcblx0XHRcdH1cblx0XHRcdGlmICgocmVzLm1pbmMgPT09IG11KSYmKHJlcy5ubWluYyA9PT0gbGFtcGRhICkpIHtcblx0XHRcdFx0ZC5wdXNoKHhpKTtcblx0XHRcdH1cblxuXHRcdH1cblxuXG5cdFx0Ly8gc3RlcDRcblxuXHRcdGkgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkqZC5sZW5ndGgpO1xuXHRcdHJldHVybiBkW2ldO1xuXHR9XG5cblx0d2hpbGUgKHNlbGYuY29udmVydC5sZW5ndGggPG4pIHNlbGYuY29udmVydCA9IGZpbmROZXh0UGVybShzZWxmLmNvbnZlcnQpO1xuXG5cdHZhciBpO1xuXHRzZWxmLmlDb252ZXJ0ID0gW107XG5cdGZvciAoaT0wOyBpPHNlbGYuY29udmVydC5sZW5ndGg7IGkrKykge1xuXHRcdHNlbGYuaUNvbnZlcnRbc2VsZi5jb252ZXJ0W2ldXSA9IGk7XG5cdH1cblxuXG5cdHJldHVybiBzZWxmO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEZMU0ludGVybGVhdmVyO1xuIiwiLypqc2xpbnQgbm9kZTogdHJ1ZSAsIGJyb3dzZXI6IHRydWUgKi9cbi8qZ2xvYmFsIHdpbmRvdyAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBVdGY4VXRpbHMgPSByZXF1aXJlKCcuL3V0ZjguanMnKTtcblxuZnVuY3Rpb24gQ1JDKCkge1xuXHR2YXIgc2VsZj0gdGhpcztcblxuXG5cblx0ZnVuY3Rpb24gbWFrZUNSQ1RhYmxlICgpIHtcblx0XHR2YXIgYztcblx0XHRzZWxmLmNyY1RhYmxlID0gW107XG5cdFx0Zm9yKHZhciBuID0wOyBuIDwgMjU2OyBuKyspe1xuXHRcdFx0YyA9IG47XG5cdFx0XHRmb3IodmFyIGsgPTA7IGsgPCA4OyBrKyspe1xuXHRcdFx0XHRjID0gKChjJjEpID8gKDB4RURCODgzMjAgXiAoYyA+Pj4gMSkpIDogKGMgPj4+IDEpKTtcblx0XHRcdH1cblx0XHRcdHNlbGYuY3JjVGFibGVbbl0gPSBjO1xuXHRcdH1cblx0fVxuXG5cdHNlbGYuY2FsY3VsYXRlID0gZnVuY3Rpb24oaW5BcnIpIHtcblx0XHR2YXIgY3JjID0gMCBeICgtMSk7XG5cblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGluQXJyLmxlbmd0aDsgaSsrICkge1xuXHRcdFx0Y3JjID0gKGNyYyA+Pj4gOCkgXiBzZWxmLmNyY1RhYmxlWyhjcmMgXiBpbkFycltpXSkgJiAweEZGXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gKGNyYyBeICgtMSkpID4+PiAwO1xuXHR9O1xuXG5cblxuXHRtYWtlQ1JDVGFibGUoKTtcblxuXHRyZXR1cm4gc2VsZjtcbn1cblxuZnVuY3Rpb24gSWRDUkNFbmNvZGVyKGRlc3RpbmF0aW9uKSB7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRzZWxmLmNyYyA9IG5ldyBDUkMoKTtcblx0c2VsZi5sYXN0U2VuZCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDB4MTAwMDApO1xuXG5cdHNlbGYuZGVzdGluYXRpb24gPSBkZXN0aW5hdGlvbjtcblxuXHRzZWxmLnByb2Nlc3NEYXRhID0gZnVuY3Rpb24oaW5CKSB7XG5cdFx0aWYgKGluQi5sZW5ndGggPiAzMikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiVG9vIG11Y2ggZGF0YVwiKTtcblx0XHR9XG5cdFx0dmFyIG91dEIgPSBpbkIuc2xpY2UoKTtcblxuXHRcdHdoaWxlIChvdXRCLmxlbmd0aDwzMikgb3V0Qi5wdXNoKDApO1xuXG5cdFx0b3V0Qi5wdXNoKCAoc2VsZi5sYXN0U2VuZD4+OCkgJiAweEZGKTtcblx0XHRvdXRCLnB1c2goIHNlbGYubGFzdFNlbmQgJiAweEZGKTtcblx0XHRzZWxmLmxhc3RTZW5kID0gKHNlbGYubGFzdFNlbmQgKzEgKSAmIDB4RkZGRjtcblxuXHRcdHZhciBjcmMgPSBzZWxmLmNyYy5jYWxjdWxhdGUob3V0Qik7XG5cblx0XHRjb25zb2xlLmxvZyhcIkNSQyBHZW46IFwiKyBjcmMgKTtcblxuXHRcdG91dEIucHVzaCggKGNyYz4+MjQpICYgMHhGRik7XG5cdFx0b3V0Qi5wdXNoKCAoY3JjPj4xNikgJiAweEZGKTtcblx0XHRvdXRCLnB1c2goIChjcmM+PjgpICYgMHhGRik7XG5cdFx0b3V0Qi5wdXNoKCBjcmMgJiAweEZGKTtcblxuXHRcdGRlc3RpbmF0aW9uLnByb2Nlc3NEYXRhKG91dEIpO1xuXHR9O1xuXG5cdHJldHVybiBzZWxmO1xufVxuXG5mdW5jdGlvbiBJZENSQ0RlY29kZXIoZGVzdGluYXRpb24pIHtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHNlbGYuY3JjID0gbmV3IENSQygpO1xuXHRzZWxmLmxhc3RDcmNSZWNlaXZlZCA9IC0xO1xuXG5cdHNlbGYuZGVzdGluYXRpb24gPSBkZXN0aW5hdGlvbjtcblxuXHRzZWxmLnByb2Nlc3NEYXRhID0gZnVuY3Rpb24oaW5CKSB7XG5cdFx0dmFyIGNyY1NlbmRlZD0wO1xuXHRcdHZhciBpO1xuXHRcdGZvciAoaT0wOyBpPDQgOyBpKyspIHtcblx0XHRcdGNyY1NlbmRlZCA9IGNyY1NlbmRlZCB8IChpbkJbaW5CLmxlbmd0aC0gMSAtIGldIDw8IChpKjgpKTtcblx0XHR9XG5cblx0XHRjcmNTZW5kZWQgPSBjcmNTZW5kZWQgXigtMSkgXigtMSk7XG5cblx0XHR2YXIgaWQ9IGluQltpbkIubGVuZ3RoLTVdIHwgKGluQltpbkIubGVuZ3RoLTZdIDw8IDgpO1xuXG5cdFx0aWYgKGNyY1NlbmRlZCA9PT0gc2VsZi5sYXN0Q3JjUmVjZWl2ZWQpIHtcblx0XHRcdGNvbnNvbGUubG9nKFwiUmVwZWF0ZWQgcGFja2V0IHJlY2VpdmVkXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZhciBjcmNDYWxjdWxhdGVkID0gc2VsZi5jcmMuY2FsY3VsYXRlKGluQi5zbGljZSgwLGluQi5sZW5ndGgtNCkpO1xuXG5cdFx0Y3JjQ2FsY3VsYXRlZCA9IGNyY0NhbGN1bGF0ZWQgXigtMSleKC0xKTtcblxuXHRcdGNvbnNvbGUubG9nKFwiY3JjQ2FsY3VsYXRlZDogXCIrY3JjQ2FsY3VsYXRlZCk7XG5cdFx0Y29uc29sZS5sb2coXCJjcmNTZW5kZWQ6IFwiK2NyY1NlbmRlZCk7XG5cblxuXHRcdGlmIChjcmNTZW5kZWQgIT09IGNyY0NhbGN1bGF0ZWQpIHtcblx0XHRcdHZhciBTID0gVXRmOFV0aWxzLmRlY29kZShpbkIuc2xpY2UoMCxpbkIubGVuZ3RoLTYpKTtcblx0XHRcdGNvbnNvbGUubG9nKFwiSW52YWxpZCBwYWNrZXQgcmVjZWl2ZWQ6IFwiK2lkK1wiIC0gXCIrUyApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHNlbGYubGFzdENyY1JlY2VpdmVkID1jcmNDYWxjdWxhdGVkO1xuXG5cdFx0ZGVzdGluYXRpb24ucHJvY2Vzc0RhdGEoaW5CLnNsaWNlKDAsaW5CLmxlbmd0aC02KSk7XG5cdH07XG5cblx0cmV0dXJuIHNlbGY7XG59XG5cbmV4cG9ydHMuRW5jb2RlciA9IElkQ1JDRW5jb2RlcjtcbmV4cG9ydHMuRGVjb2RlciA9IElkQ1JDRGVjb2RlcjtcbiIsIi8qanNsaW50IG5vZGU6IHRydWUgLCBicm93c2VyOiB0cnVlICovXG4vKmdsb2JhbCB3aW5kb3cgKi9cblwidXNlIHN0cmljdFwiO1xuXG52YXIgSU5GID0gMHg3RkZGRkZGO1xuXG5mdW5jdGlvbiBORChmKSB7XG5cdHJldHVybiBNYXRoLnJvdW5kKGYqMjU2KTtcbn1cblxuZnVuY3Rpb24gZyh4KSB7XG5cdHZhciBSO1xuXHRSID0teDtcblx0aWYgKHg8TkQoMi4yKSkge1xuXHRcdGlmICh4PE5EKDEuNikpIHtcblx0XHRcdGlmICh4PE5EKDAuNSkpIHtcblx0XHRcdFx0UiA+Pj0gMTtcblx0XHRcdFx0UiArPSBORCgwLjcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0UiA+Pj0gMjtcblx0XHRcdFx0UiArPSBORCgwLjU3NSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdFIgPj49IDM7XG5cdFx0XHRSICs9IE5EKDAuMzc1KTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0aWYgKHg8TkQoMy4yKSkge1xuXHRcdFx0UiA+Pj0gNDtcblx0XHRcdFIgKz0gTkQoMC4yMzc1KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHg8TkQoNC40KSkge1xuXHRcdFx0XHRSID4+PSA1O1xuXHRcdFx0XHRSICs9IE5EKDAuMTM3NSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRSPTA7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBSO1xufVxuXG5mdW5jdGlvbiBsU3VtKGwxLGwyKSB7XG5cdHZhciBSO1xuXHR2YXIgYWwxLGFsMixzaWcsZCxzO1xuXG5cdHNpZz1mYWxzZTtcblx0aWYgKGwxPjApIHtcblx0XHRhbDE9bDE7XG5cdH0gZWxzZSB7XG5cdFx0YWwxPS1sMTtcblx0XHRzaWc9IXNpZztcblx0fVxuXHRpZiAobDI+MCkge1xuXHRcdGFsMj1sMjtcblx0fSBlbHNlIHtcblx0XHRhbDI9LWwyO1xuXHRcdHNpZz0hc2lnO1xuXHR9XG5cblx0ZD1hbDEtYWwyO1xuXHRpZiAoZD4wKSB7XG5cdFx0Uj1hbDI7XG5cdH0gZWxzZSB7XG5cdFx0Uj1hbDE7XG5cdH1cblxuXHRpZiAoc2lnKSBSPS1SO1xuXHRzPWwxK2wyO1xuXHRpZiAoczwwKSBzPS1zO1xuXHRSKz1nKHMpO1xuXHRkPWwxLWwyO1xuXHRpZiAoZDwwKSBkPS1kO1xuXHRSLT1nKGQpO1xuXHRyZXR1cm4gUjtcbn1cblxuZnVuY3Rpb24gbE1heChsMSwgbDIpIHtcblx0dmFyIGQsIGFkLCBtbDtcblx0ZCA9IGwxLWwyO1xuXHRpZiAoZD4wKSB7XG5cdFx0bWw9bDE7XG5cdH0gZWxzZSB7XG5cdFx0bWw9bDI7XG5cdFx0ZD0tZDtcblx0fVxuXHRyZXR1cm4gbWwgKyBnKGQpO1xufVxuXG5leHBvcnRzLmxTdW0gPSBsU3VtO1xuZXhwb3J0cy5sTWF4ID0gbE1heDtcbmV4cG9ydHMuSU5GID0gSU5GO1xuIiwiLypqc2xpbnQgbm9kZTogdHJ1ZSAsIGJyb3dzZXI6IHRydWUgKi9cbi8qZ2xvYmFsIHdpbmRvdyAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBjaXJjID0gcmVxdWlyZShcIi4vY2lyY1wiKTtcbnZhciBDb21wbGV4QXJyYXkgPSByZXF1aXJlKFwiLi4vanNmZnQvbGliL2NvbXBsZXhfYXJyYXkuanNcIikuQ29tcGxleEFycmF5O1xudmFyIEZGVCA9IHJlcXVpcmUoXCIuLi9qc2ZmdC9saWIvZmZ0LmpzXCIpO1xuXG5mdW5jdGlvbiBPZmRtRGVjb2RlcihhRkRJViwgYVVzZWRDaGFubmVscywgYURlc3RpbmF0aW9uKSB7XG5cblx0dmFyIHNlbGY9dGhpcztcblxuXG5cdFx0Ly8vLy8vLyBWQVJJQUJMRVMgVVNFRFxuXHRzZWxmLkZESVY9YUZESVY7XG5cdHNlbGYudXNlZENoYW5uZWxzID0gYVVzZWRDaGFubmVscztcblx0c2VsZi5kZXN0aW5hdGlvbiA9IGFEZXN0aW5hdGlvbjtcblxuXG5cdC8vSGVyZSBpcyB3aGVyZSB3ZSBzdG9yZSB0aGUgaW5wdXQgZGF0YVxuXHRzZWxmLm9sZERhdGEgPSBuZXcgQXJyYXkoc2VsZi5GRElWKTtcblxuXHQvLyBIZXJlIGlzIHdoZXJlIHdlIHN0b3JlIHRoZSBwaGFzZSBvZiB0aGUgbGFzIGZyYW1lIHRvIGNhbGN1bGF0ZSB0aGUgZGlmZXJlbmNlXG5cdHNlbGYub2xkQXJnPSBbICBuZXcgQXJyYXkoc2VsZi51c2VkQ2hhbm5lbHMubGVuZ3RoKSxcbiAgICAgICAgICAgICAgICAgICAgbmV3IEFycmF5KHNlbGYudXNlZENoYW5uZWxzLmxlbmd0aCksXG4gICAgICAgICAgICAgICAgICAgIG5ldyBBcnJheShzZWxmLnVzZWRDaGFubmVscy5sZW5ndGgpLFxuICAgICAgICAgICAgICAgICAgICBuZXcgQXJyYXkoc2VsZi51c2VkQ2hhbm5lbHMubGVuZ3RoKV07XG5cblxuXHQvLyBFYWNoIGZyYW1lIGlzIGNvZGlmaWVkIGluIDQqRkRJViBzYW1wbGVzXG5cdC8vIFdlIGFuYWxpemUgY2h1bmtzIG9mIDIqRkRJViBzYW1wbGVzIG9uY2UgZXZlcnkgRkRJViBzYW1wbGVzLlxuXHQvLyBTbyB3ZSBhbmFsaXplIDQgaW50ZXJsaWV2ZWQgdGltZXMgZXZlcnkgZnJhbWUuXG5cdC8vICB8LS0tLS0tLSotLS0tLS0tKi0tLS0tLS0qLS0tLS0tLXwtLS0tLS0tKi0tLS0tLS0qLS0tLS0tLSotLS0tLS0tfC0tLS0tLS0qLS0gICBPcmlnaW5hbCBTaWduYWxcblx0Ly8gICAgfC0tLS0tLS0qLS0tLS0tLXwgICAgICAgICAgICAgICB8LS0tLS0tLSotLS0tLS0tfCAgICAgICAgICAgICAgICAgICAgICAgICAgIFJ4QVxuXHQvLyAgICAgICAgICAgIHwtLS0tLS0tKi0tLS0tLS18ICAgICAgICAgICAgICAgfC0tLS0tLS0qLS0tLS0tLXwgICAgICAgICAgICAgICAgICAgUnhCXG5cdC8vICAgICAgICAgICAgICAgICAgICB8LS0tLS0tLSotLS0tLS0tfCAgICAgICAgICAgICAgIHwtLS0tLS0tKi0tLS0tLS18ICAgICAgICAgICBSeENcblx0Ly8gIC0tfCAgICAgICAgICAgICAgICAgICAgICAgfC0tLS0tLS0qLS0tLS0tLXwgICAgICAgICAgICAgICB8LS0tLS0tLSotLS0tLS0tfCAgIFJ4RFxuXG5cdHNlbGYuY3VyUmVjZWl2ZXI9MDsgIC8vIEN1cnJlbnQgcmVjZWl2ZXIgYmVlaW5nIGFuYWxpdHplZCAwLi4zIClhLGIsYyxkKVxuXG5cdC8vIFdlIGV4cGVjdCBkYXRhIGV2ZXJ5IEZESVYgc2FtcGxlcy5cblx0dGhpcy5wcm9jZXNzRGF0YT0gZnVuY3Rpb24oaW5MLCBvZikge1xuXG5cdFx0dmFyIGk7XG5cdFx0dmFyIGRhdGEgPSBuZXcgQ29tcGxleEFycmF5KHNlbGYuRkRJVioyKTtcblxuXHRcdGZvciAoaT0wOyBpPHNlbGYuRkRJVjtpKyspIHtcblx0XHRcdGRhdGEucmVhbFtpXSA9IHNlbGYub2xkRGF0YVtpXTtcblx0XHRcdGRhdGEucmVhbFtzZWxmLkZESVYraV0gPSBpbkxbb2YraV07XG5cdFx0XHRzZWxmLm9sZERhdGFbaV0gPSBpbkxbb2YraV07XG5cdFx0fVxuXG5cdFx0dmFyIGZyZXEgPSBkYXRhLkZGVCgpO1xuXHRcdHZhciBidWZmT3V0ID0gbmV3IEFycmF5KHNlbGYudXNlZENoYW5uZWxzLmxlbmd0aCk7XG5cblx0XHRmb3IgKGk9MDsgaTxzZWxmLnVzZWRDaGFubmVscy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dmFyIGNoPXNlbGYudXNlZENoYW5uZWxzW2ldO1xuXHRcdFx0dmFyIGFyZyA9IDAuNSArIE1hdGguYXRhbjIoZnJlcS5yZWFsW2NoXSwgZnJlcS5pbWFnW2NoXSkgLyAoMiAqIE1hdGguUEkpO1xuXHRcdFx0dmFyIGRhcmcgPSBjaXJjLm5vcm0oYXJnLXNlbGYub2xkQXJnW3NlbGYuY3VyUmVjZWl2ZXJdW2ldKTtcblx0XHRcdGJ1ZmZPdXRbaV0gPSB7XG5cdFx0XHRcdGFyZzogZGFyZyxcblx0XHRcdFx0bW9kOiBNYXRoLnNxcnQoZnJlcS5yZWFsW2NoXSpmcmVxLnJlYWxbY2hdICsgZnJlcS5pbWFnW2NoXSAqIGZyZXEuaW1hZ1tjaF0pXG5cdFx0XHR9O1xuXHRcdFx0c2VsZi5vbGRBcmdbc2VsZi5jdXJSZWNlaXZlcl1baV0gPSBhcmc7XG5cdFx0fVxuXG5cdFx0c2VsZi5kZXN0aW5hdGlvbi5wcm9jZXNzRGF0YShidWZmT3V0LDApO1xuXG5cdFx0c2VsZi5jdXJSZWNlaXZlciA9IChzZWxmLmN1clJlY2VpdmVyICsgMSkgJTQ7XG5cdH07XG5cblx0cmV0dXJuIHNlbGY7XG59XG5cbmZ1bmN0aW9uIE9mZG1FbmNvZGVyKGFOUHJlYW1ibGVGcmFtZXMsIGFOUG9zdGFtYmxlRnJhbWVzLCBhRkRJViwgYVVzZWRDaGFubmVscywgYURlc3RpbmF0aW9uKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRzZWxmLm5QcmVhbWJsZUZyYW1lcyA9IGFOUHJlYW1ibGVGcmFtZXM7XG5cdHNlbGYublBvc3RhYmxlRnJhbWVzID0gYU5Qb3N0YW1ibGVGcmFtZXM7XG5cdHNlbGYuRkRJViA9IGFGRElWO1xuXHRzZWxmLnVzZWRDaGFubmVscyA9IGFVc2VkQ2hhbm5lbHM7XG5cdHNlbGYuZGVzdGluYXRpb24gPSBhRGVzdGluYXRpb247XG5cdHNlbGYub2xkRiA9IFtdO1xuXG5cdHRoaXMuZ2V0UHJlYW1ibGVGcmFtZSA9IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBpO1xuXHRcdHZhciBkYXRhRnJhbWUgPSBuZXcgQXJyYXkoc2VsZi51c2VkQ2hhbm5lbHMubGVuZ3RoKTtcblx0XHRmb3IgKGk9MDsgaTwgc2VsZi51c2VkQ2hhbm5lbHMubGVuZ3RoOyBpKz0xICkge1xuXHRcdFx0ZGF0YUZyYW1lW2ldID0gTWF0aC5yYW5kb20oKSA+IDAuNSA/IC0xIDogMTtcblx0XHR9XG5cdFx0cmV0dXJuIGRhdGFGcmFtZTtcblx0fTtcblxuXHR0aGlzLmdlbmVyYXRlRnJhbWUgPSBmdW5jdGlvbihvQnVmZixvT2YsIGlCdWZmLCBpT2YpIHtcblx0XHR2YXIgaSwgQTtcblx0XHR2YXIgZmRhdGEgPSBuZXcgQ29tcGxleEFycmF5KHNlbGYuRkRJVio0KTtcblx0XHRmb3IgKGk9MDsgaTxzZWxmLnVzZWRDaGFubmVscy5sZW5ndGg7IGkrPTEpIHtcblx0XHRcdHZhciBkID0gc2VsZi5vbGRGW2ldO1xuXHRcdFx0aWYgKChpT2YgKyBpID49IGlCdWZmLmxlbmd0aCkgfHwgKGlCdWZmW2lPZiArIGldIDwgMCkpIHtcblx0XHRcdFx0ZCA9IC1kO1xuXHRcdFx0fVxuXHRcdFx0QT0gc2VsZi51c2VkQ2hhbm5lbHNbaV08IHNlbGYuRkRJVi8xMCA/IHNlbGYuRkRJVi8xMCA6IHNlbGYudXNlZENoYW5uZWxzW2ldO1xuXHRcdFx0QT0gc2VsZi51c2VkQ2hhbm5lbHNbaV08MTMgPyAzMioxMyA6IDMyICogKHNlbGYudXNlZENoYW5uZWxzW2ldIC0xMykgKygzMiAqMTMpO1xuXHRcdFx0ZmRhdGEuaW1hZ1tzZWxmLnVzZWRDaGFubmVsc1tpXSoyXSA9IGQgKiBBO1xuXHRcdFx0ZmRhdGEuaW1hZ1s0KnNlbGYuRkRJViAtIHNlbGYudXNlZENoYW5uZWxzW2ldKjJdID0gLSBkICogQTtcblxuXHRcdFx0c2VsZi5vbGRGW2ldPWQ7XG5cblx0XHR9XG5cblx0XHR2YXIgZGF0YSA9IGZkYXRhLkludkZGVCgpO1xuXG5cdFx0Zm9yIChpPTA7IGk8c2VsZi5GRElWKjQ7IGkrKykge1xuXHRcdFx0XHRvQnVmZltvT2YraV0gPSBkYXRhLnJlYWxbaV0qMC4wMDE7XG5cdFx0fVxuXHR9O1xuXG5cdHRoaXMucHJvY2Vzc0RhdGE9IGZ1bmN0aW9uKGluTCkge1xuXHRcdHZhciBpO1xuXHRcdHZhciBuRGF0YUZyYW1lcyA9IE1hdGguY2VpbChpbkwubGVuZ3RoIC8gc2VsZi51c2VkQ2hhbm5lbHMubGVuZ3RoKTtcblx0XHR2YXIgZGF0YUZyYW1lO1xuXG5cdFx0dmFyIG91dEwgPSBuZXcgQXJyYXkoIChzZWxmLm5QcmVhbWJsZUZyYW1lcyArIG5EYXRhRnJhbWVzICsgc2VsZi5uUG9zdGFibGVGcmFtZXMpKiBzZWxmLkZESVYgKiA0ICk7XG5cdFx0dmFyIG9mID0wO1xuXG5cdFx0Zm9yIChpPTA7IGk8c2VsZi51c2VkQ2hhbm5lbHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHNlbGYub2xkRltpXT0tMTtcblx0XHR9XG5cblx0XHRmb3IgKGk9MDsgaTxzZWxmLm5QcmVhbWJsZUZyYW1lczsgaSsrKSB7XG5cdFx0XHRkYXRhRnJhbWUgPSBzZWxmLmdldFByZWFtYmxlRnJhbWUoKTtcblx0XHRcdHNlbGYuZ2VuZXJhdGVGcmFtZShvdXRMLCBvZiwgZGF0YUZyYW1lLCAwKTtcblx0XHRcdG9mICs9IHNlbGYuRkRJVio0O1xuXHRcdH1cblxuXHRcdGZvciAoaT0wOyBpPG5EYXRhRnJhbWVzOyBpKyspIHtcblx0XHRcdHNlbGYuZ2VuZXJhdGVGcmFtZShvdXRMLCBvZiwgaW5MLCBpKnNlbGYudXNlZENoYW5uZWxzLmxlbmd0aCk7XG5cdFx0XHRvZiArPSBzZWxmLkZESVYqNDtcblx0XHR9XG5cblx0XHRmb3IgKGk9MDsgaTxzZWxmLm5Qb3N0YWJsZUZyYW1lczsgaSsrKSB7XG5cdFx0XHRkYXRhRnJhbWUgPSBzZWxmLmdldFByZWFtYmxlRnJhbWUoKTtcblx0XHRcdHNlbGYuZ2VuZXJhdGVGcmFtZShvdXRMLCBvZiwgZGF0YUZyYW1lLCAwKTtcblx0XHRcdG9mICs9IHNlbGYuRkRJVio0O1xuXHRcdH1cblxuXHRcdHNlbGYuZGVzdGluYXRpb24ucHJvY2Vzc0RhdGEob3V0TCk7XG5cdH07XG5cblx0cmV0dXJuIHNlbGY7XG59XG5cbmV4cG9ydHMuRW5jb2RlciA9IE9mZG1FbmNvZGVyO1xuZXhwb3J0cy5EZWNvZGVyID0gT2ZkbURlY29kZXI7XG5cblxuXG4iLCIvKmpzbGludCBub2RlOiB0cnVlICwgYnJvd3NlcjogdHJ1ZSAqL1xuLypnbG9iYWwgd2luZG93ICovXG5cInVzZSBzdHJpY3RcIjtcblxuLy8gVGhpcyBtb2R1bGUsIHRha2VzIGRhdGEgZnJvbSB0aGUgb2ZkbSBhbmQgdHJ5IHRvIGRldGVjdCBmcmFtZXMuXG52YXIgY2lyYyA9IHJlcXVpcmUoXCIuL2NpcmNcIik7XG5cblxuZnVuY3Rpb24gUGFja2V0RGV0ZWN0b3IoYU5DaGFuZWxzLCBhTkZyYW1lcywgYVBlcm0sIGFEZXN0aW5hdGlvbikge1xuXHR2YXIgc2VsZj10aGlzO1xuXHR2YXIgaTtcblxuXG5cdHNlbGYucGVybT1hUGVybTtcblx0c2VsZi5uQ2hhbmVscyA9IGFOQ2hhbmVscztcblx0c2VsZi5uRnJhbWVzID0gYU5GcmFtZXM7XG5cdHNlbGYuZGVzdGluYXRpb24gPSBhRGVzdGluYXRpb247XG5cdHNlbGYublN5bmNCaXRzID0gTWF0aC5mbG9vcihhTkZyYW1lcyAqIGFOQ2hhbmVscyAvIDIgKyAwLjUpO1xuXHRzZWxmLm5TeW5jVGhyZXNob2xkID0gIDcgKiAwLjUqTWF0aC5zcXJ0KHNlbGYublN5bmNCaXRzKTtcbi8vXHRzZWxmLm5TeW5jVGhyZXNob2xkID0gNDUwO1xuXHRzZWxmLmN1clJlY2VpdmVyPTA7ICAvLyBDdXJyZW50IHJlY2VpdmVyIGJlZWluZyBhbmFsaXR6ZWQgMC4uMyApYSxiLGMsZClcblxuXHRzZWxmLnJ4QnVmID0gW107XG5cdHNlbGYucnhCdWZNb2QgPSBbXTtcblx0c2VsZi5jdXJSeEJ1ZiA9W107XG5cblx0c2VsZi5iZXN0QWNjPTA7XG5cdHNlbGYuYmVzdFQ9MDtcblxuXHRzZWxmLmxhc3RQYWNrZXQ9W107XG5cdHNlbGYubGFzdFBhY2tldE1vZD1bXTtcblxuXHRzZWxmLnQ9MDsgICAvLyBUaGlzIGlzIGp1c3QgYW4gaW50ZXJ2YWwgc2VuZGVkIHRvIHRoZSBvdXRwdXQuIFRoaXMgaXMgZ2VuZXJhbHkgdXNlZCBieSB0aGUgZGVzdGluYXRpb24gdG8gY2hlY2sgdGhhdCB0aGUgc2FtZSBmcmFtZVxuXHRcdFx0XHQvLyBpcyBub3QgcmVjZWl2ZWQgbW9yZSB0aGFuIG9uY2UgZnJvbSB0aGUgZGlmZXJlbnQgaW50ZXJsZWF2ZWQgcmVjZWl2ZXJzLlxuXG5cdGZvciAoaT0wOyBpPDQ7IGkrPTEpIHtcblx0XHRzZWxmLnJ4QnVmW2ldID0gbmV3IEFycmF5KHNlbGYubkNoYW5lbHMgKiBzZWxmLm5GcmFtZXMpO1xuXHRcdHNlbGYucnhCdWZNb2RbaV0gPSBuZXcgQXJyYXkoc2VsZi5uQ2hhbmVscyAqIHNlbGYubkZyYW1lcyk7XG5cdFx0c2VsZi5jdXJSeEJ1ZltpXT0wO1xuXHR9XG5cblx0dGhpcy5nZXRCaXQgPSBmdW5jdGlvbihiKSB7XG5cdFx0dmFyIHAgPSBzZWxmLnBlcm0uY29udmVydFtiXTtcblx0XHR2YXIgaSA9IChzZWxmLmN1clJ4QnVmWyBzZWxmLmN1clJlY2VpdmVyIF0gKyBwICkgJSAoc2VsZi5uQ2hhbmVscypzZWxmLm5GcmFtZXMpO1xuXG5cdFx0dmFyIHJlcyA9IDQqTWF0aC5hYnMoc2VsZi5yeEJ1ZltzZWxmLmN1clJlY2VpdmVyXVtpXS0wLjUpIC0xO1xuXG5cdFx0aWYgKGImMSkgcmVzID0gLXJlcztcblxuXHRcdHJldHVybiByZXM7XG5cdH07XG5cblx0c2VsZi5pc1N5YmNCaXRPayA9IGZ1bmN0aW9uKGIpIHtcblx0XHR2YXIgcCA9IHNlbGYucGVybS5jb252ZXJ0W2JdO1xuXHRcdHZhciBpO1xuXHRcdHZhciBwcCwgYmIsIGw7XG5cdFx0dmFyIGVycj0wO1xuXHRcdHZhciBuZXJyPTA7XG5cdFx0dmFyIGFyZztcblx0XHRpZiAocD49MipzZWxmLm5DaGFuZWxzKSB7XG5cdFx0XHRwcCA9IHAgLSAyKnNlbGYubkNoYW5lbHM7XG5cdFx0XHRiYiA9IHNlbGYucGVybS5pQ29udmVydFtwcF07XG5cdFx0XHRpID0gKHNlbGYuY3VyUnhCdWZbIHNlbGYuY3VyUmVjZWl2ZXIgXSArIHBwICkgJSAoc2VsZi5uQ2hhbmVscypzZWxmLm5GcmFtZXMpO1xuXHRcdFx0bCA9IChiYiAmIDEpID8gMC41IDogMDtcblx0XHRcdGVyciArPSBjaXJjLmVycihzZWxmLnJ4QnVmW3NlbGYuY3VyUmVjZWl2ZXJdW2ldLCBsKTtcblx0XHRcdG5lcnIgKys7XG5cdFx0fVxuXHRcdGlmIChwPCAgKHNlbGYubkNoYW5lbHMqc2VsZi5uRnJhbWVzKSAtIDIqc2VsZi5uQ2hhbmVscykge1xuXHRcdFx0cHAgPSBwICsgMipzZWxmLm5DaGFuZWxzO1xuXHRcdFx0YmIgPSBzZWxmLnBlcm0uaUNvbnZlcnRbcHBdO1xuXHRcdFx0aSA9IChzZWxmLmN1clJ4QnVmWyBzZWxmLmN1clJlY2VpdmVyIF0gKyBwcCApICUgKHNlbGYubkNoYW5lbHMqc2VsZi5uRnJhbWVzKTtcblx0XHRcdGwgPSAoYmIgJiAxKSA/IDAuNSA6IDA7XG5cdFx0XHRlcnIgKz0gY2lyYy5lcnIoc2VsZi5yeEJ1ZltzZWxmLmN1clJlY2VpdmVyXVtpXSwgbCk7XG5cdFx0XHRuZXJyICsrO1xuXHRcdH1cblx0XHRlcnIgPSBlcnIgLyBuZXJyO1xuXHRcdGkgPSAoc2VsZi5jdXJSeEJ1Zlsgc2VsZi5jdXJSZWNlaXZlciBdICsgcCApICUgKHNlbGYubkNoYW5lbHMqc2VsZi5uRnJhbWVzKTtcblxuXHRcdGFyZyA9IGNpcmMubm9ybShzZWxmLnJ4QnVmW3NlbGYuY3VyUmVjZWl2ZXJdW2ldIC0gZXJyKTtcblxuXHRcdHZhciByZXMgPSA0Kk1hdGguYWJzKGFyZy0wLjUpIC0xO1xuXG5cdFx0aWYgKGIgJjEpIHJlcz0gLXJlcztcblx0XHRyZXR1cm4gcmVzO1xuXHR9O1xuXG5cbi8vIFRoaXMgZnVuY3Rpb24gaXMgY2FsbGVkIDQgdGltZXMgaW4gZXZlcnkgZnJhbWUgcGVyaW9kLiBUaGlzIGlzIGVxdWl2YWxlbnQgdG8gaGF2aW5nIDQgcmVjZWl2ZXJzIGFuZCByb3RhdGluZyB0aGUgcmVjZXB0aW9uIG9uXG4vLyBlYWNoIGNhbGwuIGN1clJlY2VpdmVyIGlzIGluY3JlbWVudGVkIGluIGEgbm9kNCBiYXNpcy5cbi8vICB8LS0tLS0tLSotLS0tLS0tKi0tLS0tLS0qLS0tLS0tLXwtLS0tLS0tKi0tLS0tLS0qLS0tLS0tLSotLS0tLS0tfC0tLS0tLS0qLS0gICBPcmlnaW5hbCBTaWduYWxcbi8vICAgIHwtLS0tLS0tKi0tLS0tLS18ICAgICAgICAgICAgICAgfC0tLS0tLS0qLS0tLS0tLXwgICAgICAgICAgICAgICAgICAgICAgICAgICBSeEEgc2VsZi5jdXJSZWNlaXZlcj0wXG4vLyAgICAgICAgICAgIHwtLS0tLS0tKi0tLS0tLS18ICAgICAgICAgICAgICAgfC0tLS0tLS0qLS0tLS0tLXwgICAgICAgICAgICAgICAgICAgUnhCIHNlbGYuY3VyUmVjZWl2ZXI9MVxuLy8gICAgICAgICAgICAgICAgICAgIHwtLS0tLS0tKi0tLS0tLS18ICAgICAgICAgICAgICAgfC0tLS0tLS0qLS0tLS0tLXwgICAgICAgICAgIFJ4QyBzZWxmLmN1clJlY2VpdmVyPTJcbi8vICAtLXwgICAgICAgICAgICAgICAgICAgICAgIHwtLS0tLS0tKi0tLS0tLS18ICAgICAgICAgICAgICAgfC0tLS0tLS0qLS0tLS0tLXwgICBSeEQgc2VsZi5jdXJSZWNlaXZlcj0zXG5cblx0c2VsZi5wcm9jZXNzRGF0YT0gZnVuY3Rpb24oaW5MLCBvZikge1xuXHRcdHZhciBpLGo7XG5cdFx0dmFyIHR0PXNlbGYudDtcblx0XHRmb3IgKGk9MDsgaTxzZWxmLm5DaGFuZWxzOyBpKz0xKSB7XG5cdFx0XHRzZWxmLnJ4QnVmW3NlbGYuY3VyUmVjZWl2ZXJdW3NlbGYuY3VyUnhCdWZbIHNlbGYuY3VyUmVjZWl2ZXIgXSArIGkgXSA9IGluTFtpXS5hcmc7XG5cdFx0XHRzZWxmLnJ4QnVmTW9kW3NlbGYuY3VyUmVjZWl2ZXJdW3NlbGYuY3VyUnhCdWZbIHNlbGYuY3VyUmVjZWl2ZXIgXSArIGkgXSA9IGluTFtpXS5tb2Q7XG5cdFx0fVxuXHRcdHNlbGYuY3VyUnhCdWZbIHNlbGYuY3VyUmVjZWl2ZXIgXSArPSBzZWxmLm5DaGFuZWxzO1xuXHRcdGlmIChzZWxmLmN1clJ4QnVmWyBzZWxmLmN1clJlY2VpdmVyIF0gPT09IHNlbGYubkNoYW5lbHMqc2VsZi5uRnJhbWVzKSB7XG5cdFx0XHRzZWxmLmN1clJ4QnVmWyBzZWxmLmN1clJlY2VpdmVyIF0gPSAwO1xuXHRcdH1cblxuLypcdFx0aWYgKHNlbGYudD4gc2VsZi5uRnJhbWVzKjQpIHtcblx0XHRcdGNvbnNvbGUubG9nKFwiaW5cIik7XG5cdFx0fVxuKi9cblx0XHR2YXIgYWNjID0wO1xuXHRcdGZvciAoaT0wOyBpPHNlbGYublN5bmNCaXRzOyBpKyspIHtcbi8vXHRcdFx0aWYgKHNlbGYuZ2V0Qml0KGkpID4gMCkge1xuXHRcdFx0YWNjICs9IHNlbGYuaXNTeWJjQml0T2soaSk7XG5cdFx0fVxuXG5cdFx0aWYgKGFjYyA8PSAtc2VsZi5uU3luY1RocmVzaG9sZCkge1xuXHRcdFx0Y29uc29sZS5sb2coXCJJbnZlcnRlZCBwYWNrZXQgZGV0ZWN0ZWRcIik7XG5cdFx0fVxuXG5cdFx0dmFyIGJ1ZmZPdXQgPSBbXTtcblx0XHRpZiAoKGFjYz49IHNlbGYublN5bmNUaHJlc2hvbGQpICYmXG5cdFx0XHQoKGFjYz5zZWxmLmJlc3RBY2MpIHx8IChzZWxmLnQtc2VsZi5iZXN0VCA+IDQqc2VsZi5uRnJhbWVzKSkpXG5cdFx0e1xuXG5cblx0XHRcdHZhciBwYWNrZXQgPSBzZWxmLnJ4QnVmW3NlbGYuY3VyUmVjZWl2ZXJdXG5cdFx0XHRcdFx0XHRcdFx0XHRcdC5zbGljZShzZWxmLmN1clJ4QnVmWyBzZWxmLmN1clJlY2VpdmVyIF0sIChzZWxmLm5DaGFuZWxzICogc2VsZi5uRnJhbWVzKSlcblx0XHRcdFx0XHRcdFx0XHQuY29uY2F0KCBzZWxmLnJ4QnVmW3NlbGYuY3VyUmVjZWl2ZXJdXG5cdFx0XHRcdFx0XHRcdFx0XHRcdC5zbGljZSgwLCBzZWxmLmN1clJ4QnVmWyBzZWxmLmN1clJlY2VpdmVyIF0pKTtcblxuXHRcdFx0dmFyIHBhY2tldE1vZCA9IHNlbGYucnhCdWZNb2Rbc2VsZi5jdXJSZWNlaXZlcl1cblx0XHRcdFx0XHRcdFx0LnNsaWNlKHNlbGYuY3VyUnhCdWZbIHNlbGYuY3VyUmVjZWl2ZXIgXSwgKHNlbGYubkNoYW5lbHMgKiBzZWxmLm5GcmFtZXMpKVxuXHRcdFx0XHRcdC5jb25jYXQoIHNlbGYucnhCdWZNb2Rbc2VsZi5jdXJSZWNlaXZlcl1cblx0XHRcdFx0XHRcdFx0LnNsaWNlKDAsIHNlbGYuY3VyUnhCdWZbIHNlbGYuY3VyUmVjZWl2ZXIgXSkpO1xuXG5cdFx0XHRzZWxmLmxhc3RQYWNrZXQgPSBwYWNrZXQ7XG5cdFx0XHRzZWxmLmxhc3RQYWNrZXRNb2QgPSBwYWNrZXRNb2Q7XG5cdFx0XHRzZWxmLmJlc3RBY2M9YWNjO1xuXHRcdFx0c2VsZi5iZXN0VCA9IHNlbGYudDtcblxuXHRcdFx0d2luZG93LnNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKFwiUGFja2V0IHJlY2VpdmVkOiBcIisgYWNjKyBcIi9cIiArIHNlbGYublN5bmNUaHJlc2hvbGQpO1xuXHRcdFx0XHRzZWxmLmRlc3RpbmF0aW9uLnByb2Nlc3NEYXRhKHBhY2tldCwgYWNjKTtcbi8vXHRcdFx0XHR1cGRhdGVBbmFsaXplcigpO1xuXHRcdFx0fSwwKTtcblx0XHR9XG5cblx0XHRzZWxmLmN1clJlY2VpdmVyID0gKHNlbGYuY3VyUmVjZWl2ZXIgKyAxKSAlNDtcblx0XHRzZWxmLnQgKz0gMTtcblx0fTtcblxuXHRyZXR1cm4gc2VsZjtcbn1cblxuZnVuY3Rpb24gUGFja2V0R2VuZXJhdG9yKGFOQ2hhbmVscywgYU5GcmFtZXMsIGFQZXJtLCBhRGVzdGluYXRpb24pIHtcblx0dmFyIHNlbGY9dGhpcztcblxuXG5cdHNlbGYucGVybT1hUGVybTtcblx0c2VsZi5uQ2hhbmVscyA9IGFOQ2hhbmVscztcblx0c2VsZi5uRnJhbWVzID0gYU5GcmFtZXM7XG5cdHNlbGYuZGVzdGluYXRpb24gPSBhRGVzdGluYXRpb247XG5cdHNlbGYublN5bmNCaXRzID0gTWF0aC5mbG9vcihhTkZyYW1lcyAqIGFOQ2hhbmVscyAvIDIgKyAwLjUpO1xuXG5cdHNlbGYucHV0Qml0ID0gZnVuY3Rpb24ob0J1ZmYsIG9PZiwgZCkge1xuXHRcdGlmIChkID09PSB1bmRlZmluZWQpIGQgPSAxO1xuXHRcdHZhciBwID0gc2VsZi5wZXJtLmNvbnZlcnRbb09mXTtcblx0XHRvQnVmZlsgcF0gPSAob09mICYgMSkgPyAtZCA6IGQ7XG5cdH07XG5cblx0c2VsZi5wcm9jZXNzRGF0YT0gZnVuY3Rpb24oaW5MKSB7XG5cdFx0dmFyIGk7XG5cdFx0dmFyIG91dEIgPSBuZXcgQXJyYXkoc2VsZi5uQ2hhbmVscyogc2VsZi5uRnJhbWVzKTtcblxuXHRcdGZvciAoaT0wOyBpPCBzZWxmLm5TeW5jQml0czsgaSs9MSkge1xuXHRcdFx0c2VsZi5wdXRCaXQob3V0QiwgaSAsIDEpO1xuXHRcdH1cblxuXHRcdGZvciAoaT0wOyBpPCBzZWxmLm5DaGFuZWxzKiBzZWxmLm5GcmFtZXMgLSBzZWxmLm5TeW5jQml0czsgaSs9MSkge1xuXHRcdFx0c2VsZi5wdXRCaXQob3V0Qiwgc2VsZi5uU3luY0JpdHMgKyBpICwgaW5MW2ldKTtcblx0XHR9XG5cblx0XHRzZWxmLmRlc3RpbmF0aW9uLnByb2Nlc3NEYXRhKG91dEIpO1xuXG5cdH07XG5cblx0cmV0dXJuIHNlbGY7XG59XG5cbmV4cG9ydHMuUGFja2V0RGV0ZWN0b3IgPSBQYWNrZXREZXRlY3RvcjtcbmV4cG9ydHMuUGFja2V0R2VuZXJhdG9yID0gUGFja2V0R2VuZXJhdG9yO1xuXG4iLCJleHBvcnRzLmNvbnZlcnQzNjk2ID0gWzM0MzAsMTM4NiwyNzAwLDg3NCwyMjIsMjM3NiwzMDUwLDI5NDIsMjkzOCwyNTk0LDM1MjYsNTU2LDI4MDgsMTEyNCwxNzc2LDc5OCwyNDYsNTY0LDEyODYsMTUxNCwzMzU2LDUyOCwzMTA0LDIyOTgsMjI3NiwzNjU0LDMwMTAsMjYyNCwyOTUwLDk2NCwyNTg0LDcyMiwxNjE2LDIyNTYsMzg2LDU3NiwzNjg0LDI4NiwyMzg2LDI5MzAsMjQwLDE1OTYsMzAyMiwyNzk2LDI3MzgsMTk1OCw2OCwxOTkyLDExMzAsOTIsMzE0LDE0MzYsOTI4LDMzMDgsMjM1MCwxOTE0LDg4NiwyMTQyLDIwNjAsNzA4LDIwMTQsMzQ1OCwzMDk2LDE3MjAsMzQ4OCwzNjUwLDEwODQsMjY4LDMxMDIsMTcwNiw0MTIsMTY2OCwzNTY2LDU2OCwzNzQsMzI0NCwxNjcwLDU3NCw4NTIsMjkyMiw3MzYsMjI0OCwyMzg0LDgwOCwyMjE0LDIxMDQsMjk5Miw4OTQsOTAwLDY5NCwyMjc0LDMzODIsMTQ5OCwzMTE4LDEyMjIsMTM1MCwyNzg4LDE4NTYsMjIwNiwzMjY0LDM0MjIsNTQwLDM1NjIsMTgwLDMyNzIsMTcyNiw5MTIsMTkyNCwxMTE2LDM2ODYsMjk1NCwxMDE0LDE1NjQsMjY1NiwyNDc2LDE4MDYsMjk5OCwxODc4LDM0LDI0OTYsMTQ5MiwzNDYyLDEzMjAsMTQ3NiwxNjIwLDI3NzYsOTAsMjE0MCwzMzYwLDE2MTAsMTQwLDIxNDgsMTE3OCw5NzYsMTQyMCwxNzg0LDI0NzIsMjEyLDE2MDIsMzc2LDMxNTAsMjIxMiwzNTM2LDk1NCwxNDY2LDEwODgsMjE0NiwxNzg4LDEwODYsMTQ2Miw5MTYsMTExMCwxMjYwLDExMjIsMzUzOCw1NjAsMjg0MiwzNTkwLDIyNjIsMTUwNiwzMTI0LDI2OTgsMzMyOCwxOTAwLDU5MCwxOTE4LDYwOCwyNjIwLDIwOTIsMjY4NiwxNTE2LDIwOTYsMTY5MCwyOTAsMTg0NCw5OTgsMjk3NiwxNTk0LDIxNTYsNzk0LDI1OTgsMTc0MCwxNTAsNTUwLDIyNjAsMTQxOCwyODM0LDI1MTAsMTAwLDMyNTAsMzM4MCwyMDc2LDI5ODYsMTk5NCwyNjkyLDIyMCwzNTQsMzE3NCwzNjE0LDI1MDYsNjM4LDIzODgsMjY0NCwxNTQ2LDIwNjgsMzI1NCw5MzQsMzQ4NCwzNDM2LDkxOCwxNjQ0LDE5MjYsMzM4NiwxNzUwLDM1MjAsNDAyLDE5OTgsMzI0Miw3NTAsNjE0LDU1MiwxMzA4LDI0ODYsMTg5MiwyNzMwLDMxNTIsNDg2LDMwNjQsMjU0OCwyMTY0LDI4NDgsMTg3MCwxNTg0LDIxMDAsMjg0NCw2NTQsMTk4NCwzMjM4LDg0MiwzMDA2LDYxNiwxNTQsNTAyLDExNjQsMjY2NiwxNDU2LDI4OTYsMTQwNiwxNTgyLDI0MDQsNTU4LDE4MTIsMjc5OCwxMTU0LDU0MiwyMzgsMTMyMiwzNTc0LDc4LDEyNjgsMTU1MCwyMjIwLDIyODIsODkyLDQwNiwxMzQwLDIxNTQsNzY4LDM2NzYsMzU2LDIzOTQsMzQ0OCwyNzE0LDI5NzAsMzQ2MCwxODIwLDMzOTAsMTQwMiwzNDA0LDkzOCwxMzYwLDE3NjIsMTYzOCwxMjM2LDI5MiwzNDc2LDk4NiwyMjY4LDEwMjQsMzIyMiwxODgsMzQxNiw4NTQsMjg5OCwxNjMwLDk0LDI4MTIsNDE0LDY2MCwxMTUyLDE4MTQsMTgzMCwzMDA4LDI4MDIsMzU2NCwxNjI4LDEzNjYsMjQyOCwyMjAyLDM1MCwzMjA2LDQxNiwyNjQwLDI3MDYsMjI3OCwyNjQyLDM4MiwxMDk0LDY1MCwxMjEwLDIwMDAsOTYwLDQ2NiwyNTgwLDMyMTQsMjkyNCwxMzEwLDI4NTAsMjg1MiwyMjQsMjM0NCw3NiwyNjMyLDIyMDQsMzYzNiwyNTE2LDMwMzQsMjE4LDMzOCw2NjYsNzU2LDk3MiwxOTM0LDEyMTgsMTYwNiwyNzE2LDEzMzIsMjU3NCwxMTI2LDMyNiwxNjEyLDEzMCwxODY4LDI3ODIsMjA1NiwyMTg2LDM0OTYsNDQ2LDEyNzQsMzMwMiwzMzQyLDEyNDgsODA0LDk4MiwzMjU2LDI2LDg5OCwyNjAwLDM3MCwxOTU0LDI4OTAsMjQzNiwxMDMwLDQ0OCwyMDcwLDI2MzQsNzUyLDc1NCw2OTYsMzE1Niw5NDYsMTc3MiwyMjk0LDI0OCwxNDMyLDM2NzQsOTQ0LDExODIsMzU1MCwzMTY4LDEyMDIsNTE2LDE3MCwxMzU2LDI4MjgsMzI4LDIyMzYsMzQxMCwyNTc2LDI0NDgsMjI0NCwyNDk4LDI2NzYsMjQ4MCwzMzE0LDE0ODgsNDQwLDMxNiw1NjYsMjA2NiwyMDAsMzA4NCwzMTk4LDIwNzIsMzY4Miw3NCw0MjQsMjI5MiwxODg4LDMyNzQsMzA3MiwxNDUwLDU4OCwzNTQ4LDMwNTQsMjYwMiwzNTA4LDIxMjQsMTUwMCw1OTQsMjY4NCwyNTgyLDYwMiwyNDQyLDYyMiwyODY4LDE2MjQsMzQ1NCwxODM2LDI3OTAsODMwLDg4MCwxNjU2LDIxMDYsMjAwNiwyNzcwLDExMzQsMjM2MCwzMjAyLDI5MTIsMTQxMCwyMjI4LDMxNDAsMzMzOCwxNTYsMzIxNiw3MzIsMjI1MiwxMDY2LDEzMDAsMTU3NCwyNzEyLDExMjgsNzk2LDE1NzAsMTI3OCwyODk0LDg0LDI3NjQsMjgyLDIwMTAsMTM5OCwyNTU0LDExNzQsMjU0LDE3NTQsMjc3OCwxNjQ2LDI2NzAsMTIyNCwyNzQyLDc0MiwyOTA0LDE3OCwxOTQwLDI1NDYsMTY1NCwyNjYsMjA5MCwxMCwxNzk4LDI3ODYsMTY4OCwxMTgsMzYxMiwxODY0LDMwOTIsMzExMCwzMjIsNDgwLDI4OTIsMTI2NiwxNDQsMjUzMiwzNTA0LDI5ODIsMjc0LDcyNCwxMzM4LDY5MCw2MDQsMzY1OCwxNzY4LDc3MiwxMjg4LDM5OCw2ODYsMjAyNiwxOTYyLDEzMDIsMTUzNCwxOTcwLDgyMiwyNTEyLDI3MDgsNzAyLDk3MCwxNDc0LDMxODIsMjY5NCwzNDIwLDI3NiwxMjAwLDE3MDgsNTEyLDEzMTYsMTIzNCwxMzIsMjMyNCwyNTkwLDI1ODYsMzU4NiwzNjY2LDE4MDIsMjkwMCwyODcyLDQ1MCwyMDg4LDIxNDQsMTAyLDExMzgsMjc4NCwyNjU4LDE0MjIsOTQyLDI1MDIsMTY2MiwzNTgyLDE0NDIsMTg5NCwyLDI0MiwxOTA2LDMxMTYsMzI0MCwyOTEwLDM0NjQsMjkzNCwzMzk0LDI0MjIsMjIxMCwzMDY4LDE1NTYsMjA4LDQwNCwyNTQ0LDI0LDMxMjAsMTM0MiwxMDk4LDM0MjYsMjgwNCwzMzY2LDMzODQsMjAzNCw2NDQsMjYxOCwzMzEwLDM1NDQsMjQ4NCwyMjIyLDMyMzYsMTI1MiwxNDQ4LDMwODAsMzEwMCwyMzk4LDE5MjIsOTA0LDMwNzQsODcyLDYsMjY1MiwyMzY2LDI3ODAsMzUzMCwyMTI4LDM0NiwyODQ2LDY1MiwzNDQ2LDYzMiwzNTIsMTM1Miw5OTAsMjgyNiwzNTE4LDExNTAsMTQ4NCwxNTIyLDI3NjIsMjE2MiwzMjI0LDMxNzAsMzEwNiwyOTMyLDE3NDYsMzUxMiwzNjgwLDExNjAsMTAzOCwyMjAwLDMzNDgsMzI4MiwyMzQwLDMyMDAsNDI2LDM4OCwyNTk2LDIzNTIsMTAzNCwzMzcwLDE3MjgsMzEwOCw3ODYsMTA2OCwyMDk0LDMxOTIsMTg0LDM0NCwzNDE0LDEzMzYsNzAsMjM0NiwyODY0LDM1MzIsMjYzOCwyMTk0LDI3MjQsMzM1MiwyODc2LDI5NzgsMTY5Miw3NDQsMTMyNCw5OTQsMzYyLDMyNjIsMTM5NCw3ODIsODgyLDI0MDgsMzE1OCwyOTA4LDI2NTQsMTI1MCwxMzYsMjM0LDEyMTQsMjA4MCw0NiwyNDIwLDk0OCwyNzUyLDMyODQsNjgwLDIzMzgsNzc2LDI0NDAsMTk4OCw0MjAsMTkzOCwxMzM0LDEyNDAsMzEwLDM0OTAsMTQwNCwzNjg4LDI2MDQsMTc3NCw3NzgsMTM5MiwxNTU4LDMxNTQsMTI2MiwxMzc4LDIxNzgsMjcyMCwzMjU4LDM0NTYsMjA4MiwyNDE0LDM0NTAsMzI4MCw0MDgsMjgxOCw0NTYsMjA0LDI1MzQsMjgsMjAzNiwzNTk4LDI5NjQsMTk3NiwxMzEyLDE4NTQsMjk1OCwzNjQ4LDMzOTgsMjMxMiwzNDEyLDMwNDgsMjc0NiwzMDYsMTQ0MCwxNTMyLDIxMTQsNTMwLDMxODAsMjgyMiwyNDM4LDMxMiwxNzg2LDM2MTYsMjQzMiwxMDEwLDI3OTIsMTgxMCwxMDgwLDI2NDYsMTg0MCwyNDc0LDI4NjYsMjI0NiwxNDA4LDIwOTgsMjg2MCwyMjQyLDEyMDQsMzUxMCwxMzY0LDk3OCwxMjU0LDI5MjAsMTA3NCw3Miw0ODgsODQ4LDYwMCwxOTY2LDEwNTYsMzM0Niw2Niw0MzYsMjg4MiwzMTM2LDMzMjAsMjU2NiwyOTQsMTY4NiwzMjc2LDE3NjYsMTU3OCwzMjE4LDMwNDYsMzMyNCwyODM2LDQwLDQ1OCwzMjYwLDI3NDgsMTgwOCwxOTcyLDIxNTgsMzIsMjk3NCwxODU4LDI2OTAsMzU4LDIwMiwxNTM4LDM2NDYsMzYzMCwzNTU4LDE0ODYsODYwLDM1NDIsMTg1MCwxNDI4LDExNDAsMTA0NCw3MjAsOTUyLDE5NiwxMjIwLDE5OCwyNjAsMzUyNCw0LDMwODgsODQwLDE3NjQsMTA2LDMwNTYsNzM0LDMwMDAsMzAzMiwzMjM0LDIxNCwyMDc4LDE3NDQsMjk4LDIwNDIsMzM2NCw2NjgsMjA1NCw0MzQsMTQ2MCwxNTAyLDMyMjgsMzI3OCwxMzcwLDI0OTIsMzI5OCwzNDk4LDIwNDgsMTU5OCwxNjcyLDIxMzQsMTU2MiwxMzc0LDI5NTIsMjg2MiwzMjcwLDUyMCwxMjg0LDM2NjIsMTk0OCwxMTk0LDI1MjQsMTIwLDIwMTIsMzAzNiwyNTE4LDgwMiwyNDUyLDMxMjIsNTk4LDI0NjgsMTU2OCwzMzM0LDI5MjgsNTQsMTU4NiwxNjAwLDEyNjQsMzkyLDIwMjgsMjQ0NiwyMjYsODAsMzM0MCwzNTQwLDc3NCwyMjcwLDIwNTAsMTcwMiwzMjA4LDM2NjAsMTIzOCwzMDE0LDMwLDUyMiw0NjgsMjM3MCw4NDYsMzE5NiwzNjQwLDk1NiwyMzE2LDEzOCwzNTIyLDE2LDgyMCwzNjkyLDMyODgsMTIxMiwxODUyLDI5MDYsNTQ0LDI4NzQsMjc3NCwyMzAsMjczNiwxNzk0LDExMDIsMzQ4NiwzMTI2LDEwNjAsMzUxNCwyNDk0LDM2MzgsMzA3OCwyMTgyLDI1NzgsMTY2NCwzMzIyLDEwOTYsNjU2LDY3MiwyNjc0LDg0NCwzNDAyLDE3MDQsMzQ1MiwyMzI2LDUzNCwyMDYyLDIzODIsMzA2MiwzMzYsMzQ3OCwyNjgyLDIyODgsMjc3MiwyNTIsMzkwLDMyMTAsMTA1OCwzNjM0LDIzMDAsMjkzNiwzNDQ0LDgyOCwxODIsMTkyOCwxOTc0LDg5NiwzMDIwLDc0OCwyODQsMTE1OCwzNTc2LDMxNzgsMjEwLDMzNTAsMzQzNCwyMzQyLDIyNDAsMTAwMiw4NzYsMjM3OCw1ODAsMzcyLDMzMDQsMjQ2MCwyMTUwLDIzOTIsMTkwOCwzMjQsMjMzNiwzMzkyLDMwMTYsNDEwLDE3MTQsMjAwNCwxMTIwLDMzMjYsNDYwLDMwMjYsMjIsMTI0NCwyNTQwLDExMzIsMzExMiw5MDIsODU2LDIyODAsMjcyOCw5MTQsNjk4LDcwNiwyNTM2LDM2NzAsMTk0MiwyNjg4LDYyOCw3MzgsMzM0LDIzMiwxNTEyLDExNDgsNDc2LDI0ODIsMjE2LDE3MzYsMTE0NiwzNDE4LDExODQsMTAyMiwxNjE0LDIzNTYsMjI4NiwxNjg0LDI2ODAsMjgyMCwzMzA2LDU4Miw2NDIsNjEyLDEwOTAsMzIyNiwzMDQsMjk1NiwxNzIyLDE3NzAsMTc5Miw1MzgsMjEyMCwxNTQwLDEwNzgsMTcxOCwxOTk2LDU0OCwxODQ4LDEyOTAsMTY5OCw3ODAsMzIyMCwxMDU0LDE1MjQsMjY0LDIyNzIsMTY2Niw3ODgsMjYxMiwyNjA4LDc2NiwxNTkyLDM2MDAsMjMyMiwyNzI2LDc2NCwxMDcyLDIzMDYsMzYwLDI0MTAsMTQwMCwxMjU4LDcyOCw0NCwzNjQ0LDMxNjYsNjQ4LDEzNDgsNjc0LDI1ODgsMjU2NCwxMTcwLDE1MzYsMjkwMiwyODU4LDI3MDQsMTA3Niw1MTgsNzI2LDEyMzAsMzUxNiwzNTg0LDE4MjgsMjA0NCw0NzIsOTI0LDE3MiwxODMyLDEwNCwyNTI2LDMwMjQsOTEwLDI3NjAsMTg2MCw4NjQsMjUwNCwxNTcyLDMwMzAsMjQ2MiwyMTk2LDk4LDI1NzAsMjcyLDI2MTAsMTg4MiwzMTQ0LDk2OCwxNDk0LDI1OTIsODY2LDM4MCwxMjgyLDMyNTIsMTAzMiwxMjA2LDIyNTQsMzQ2NiwxNzEwLDIxODQsMTUzMCwyMDUyLDE5MTYsODM2LDExOTgsNjM0LDIxNTIsMzM1OCwyNTU4LDEyOTQsMzQyOCwxOTU2LDE5NCwxNDgyLDEyOTgsODg4LDI5OTAsMjk2OCw3NzAsMzE3NiwzNTY4LDE2MjIsMjQ1OCwxMjE2LDIzMjAsODI0LDI1OCw2MjQsNjQwLDM1MjgsMzQ4LDIxMzgsMzQ5MiwzNDAwLDIzMDgsOTA4LDM2NzgsMzM2OCw3NDYsMTA5MiwyMDg0LDcxNiwzOCwxNjUwLDM1NzgsMTQ1NCwzNjI2LDY3MCwzMTI4LDE0NDYsMzMwLDUxMCwxMTM2LDIwNzQsMTAxMiwxOTMyLDIxMTAsMjAwOCwxNjgyLDE4MDAsMjUzMCwxNzgwLDI1NjIsNDIsMjcyMiwzMDIsMjQ1NiwxMzA0LDE1MDgsMTUyLDQ1NCwzMjQ4LDQ5NiwxNDc4LDE3MzgsMTY0MiwyMTY2LDE4NzIsMTkyLDI4ODAsMzMzMiwyOTQwLDEwMjYsMTUyOCwzNDQyLDg4LDI0MDAsMjU3MiwxODk2LDIwMjAsMzA1Miw0OTQsMTI5NiwyMzMwLDEwMjgsMzYyMCw2NTgsMTM5NiwyODE0LDEwMzYsMTI3MiwyOTg4LDUwMCwyNzEwLDE2NzgsMTIzMiwyMTkwLDI5NiwyNjY0LDE3OTYsODg0LDEzNzIsNDMwLDI1MCwzMjMyLDE0MTYsMTc4MiwxNjgsOTc0LDI4NzAsMjEwOCw2ODQsMjg1NCwyODMyLDk4MCw1NzgsMjY3MiwxNzEyLDgxMiwzNTUyLDI4MDAsMjM1NCwzMjg2LDMzMiwzMDQyLDM0MzIsMTcyNCwyNTIwLDEwMDQsMjc5NCwxNDcwLDI5OTYsMjE4MCw1MTQsNzE4LDI1NTYsNjA2LDIyOTYsMTM4MCwxNDM0LDczMCwxMzMwLDM2NCwxNjc2LDI4ODYsMjY3OCwxMTg2LDc4NCwxOTA0LDE0NiwzMzQ0LDE2MCwxNzYsOTA2LDI0MjYsNTYsMTM4OCwxNjQsMjI4NCwzNDAsNzU4LDMzMTIsMTA0MiwxNDgsMzAzOCwxNDI0LDI2MzAsMzA5MCwxMjI4LDE4MDQsODc4LDExNCwzMjY4LDIzNjQsMjczMiwyODg4LDE0NjgsMTY5NCwxMjI2LDI3MzQsMjY2OCwxODM4LDE3MDAsMjk4MCwzMzU0LDgxNCwxNTgsMjE3MCwxNzMwLDE5MTIsODA2LDIxMzIsMjQzMCwxMTg4LDMxNjIsMzY1NiwxOTQ2LDAsMjM5MCw0MjIsMjAyNCwxMjA4LDM1NzIsMzA5NCw0MzIsMjA0MCwxMzc2LDU4NiwxOTUwLDMzNzgsMTQyLDI1NTAsNTk2LDgwMCwyMTY4LDUwNCw5MjIsMTY0MCwxODg0LDMyMCwzMDc2LDgxNiwxMjQsMTEyLDE5NDQsMTY0OCwxNjA4LDI3NTAsMjE5MiwyOTg0LDEyNDIsMTEwNCwxMTc2LDI4NTYsMzE2MCwxMjkyLDQ5OCw0NDIsMjQxMiwyMzY4LDIyOTAsNjkyLDI2NjAsNDY0LDg2OCwzMTE0LDUwLDcwMCw5MzIsMjgwLDE5MjAsMjMzMiwzMTM4LDMxOCwzMjk0LDM0MzgsMjIxNiwyNzU2LDUwNiwzMzc0LDEwNzAsMjU2MCw5OTYsNTI0LDI4ODQsMjUwOCwxMTE0LDgzNCwxNjgwLDUyLDY0LDI0ODgsMTg5OCwyMjI2LDIzNzIsMjk0OCwxMzQ2LDE1NDgsOTkyLDE5MzAsOTM2LDI3MTgsMTM1OCwxNzYwLDEwMTgsMTQ4MCwxMzA2LDE1NTQsNDE4LDMwNjYsMjc4LDM2OTQsMjE5OCwyMzQ4LDI5NDQsMTE5NiwxMjYsMTgyNiwxNzQ4LDU3MCwxNDU4LDgyNiwxODc2LDE4ODAsMTU2NiwyMTc2LDE5NTIsMTYxOCwxODIyLDE1OTAsMTM5MCwxMDgsMjI2NiwxMjcwLDUzMiwzMzMwLDIxODgsMzM5Niw1NDYsNTYyLDMxMzIsNDI4LDEzNjIsMTA0NiwxMzg0LDE4MzQsMTE4MCwzNDcyLDE5MDIsMjMxMCwyNTE0LDE4NDYsMTk4MiwzMzE4LDI3NjYsMzYyOCwxNjYsMjEzMCwzMTQ4LDM1NzAsMTk4MCwxODg2LDM2MjIsNjY0LDE2OTYsNjIsMzMxNiw4LDIxMTYsMTk2NCwyNDkwLDQ4NCwyNDE2LDIyMjQsMjI1MCwzNjEwLDI3NDAsMTYyLDMzODgsMTMyNiwxMDAwLDE2NTIsMTkwLDM5NiwxNjMyLDIzMzQsMTc1MiwxMDE2LDQwMCwzNjYsMjgzOCwyNTQyLDEyMiwzMDg2LDM0NjgsMTMyOCw0OTAsMTAwOCwyODI0LDIwNiw5NjIsMTc1OCwxNDMwLDM1OTIsMzQ5NCwyNjQ4LDI3MCwzMjEyLDI0MjQsMzE4NiwzMjY2LDM2MDYsMTI3Niw5MjYsMTE5MCwxNDUyLDI1MjIsMjkxOCwzMTcyLDI5OTQsMTI4LDI0NTQsMjEyMiw2MCw1NzIsMjAsMzU5NCwxMTAwLDM1NDYsNDgyLDk2LDM0MiwzMDU4LDI0MDYsOTg4LDQzOCwyMTE4LDQ3NCwyMjMyLDc5MiwxNTc2LDI2NTAsMjkxNiwxODE2LDI0NzgsMTM4MiwyNzAyLDQ3OCwyMjU4LDIwMTgsMzE0NiwyMTc0LDYyNiwyMjY0LDIzMTQsMjgwNiwyOTcyLDE5MTAsMTczMiwxMTcyLDExNjgsMzU4MCwxOTkwLDQ4LDk0MCwxNjA0LDQ3MCwyMzc0LDI2MDYsMjM4MCwxNTQyLDI4NDAsMTY1OCwzMDAyLDMwMDQsMTkzNiw1MzYsMTk4NiwxNjc0LDEyODAsMTU4MCw1OCwzMTM0LDExOTIsMTc1NiwxODYyLDcwNCw1OTIsMzI5NiwzNTg4LDYyMCwxNzM0LDE1NDQsMTc0LDI5NDYsMzY1MiwxMjQ2LDE0NzIsMjk2MCwyMjgsMjExMiwzMjkwLDI2OTYsMjQ0LDExNjYsMjYyNiwyOTE0LDIzMDQsMjA1OCwxOTc4LDIzNjIsMzAxMiw2MTAsMTg2Niw5MjAsMTUyNiw4NTAsNzkwLDMzNzIsMjYyOCw2MzAsMjYzNiwyNDQ0LDE3OTAsNjc4LDMwMCwxNDI2LDE4MTgsMzQwOCwzMDcwLDIwODYsMjUzOCwyNzU0LDk4NCwzNjMyLDE0MTIsMjk2NiwxNTg4LDIwMDIsMjMwMiwzMzM2LDY2Miw3NjAsNDYyLDM0MDYsMTM1NCw2ODIsMzIwNCwxMTE4LDExNjIsMTI1NiwxNDE0LDkzMCwzMTk0LDE1MTAsMTUxOCwxMDQwLDk2Niw3NDAsMjkyNiwzNTAwLDE4NiwxMTA2LDU1NCw0OTIsMjIzNCwyMTYwLDE4MjQsMjQ3MCwxNDM4LDM1NjAsMzY4LDEzNjgsMzY5MCwyMjMwLDE0OTYsMTQ0NCwzMDQwLDIyMTgsMzQyNCwyNjE0LDE5NjAsMzM2MiwxNzE2LDM2NjQsMjAyMiwyNTYsMzQ4MiwyMjA4LDY3NiwzMDgyLDMxODgsMTg5MCw4OTAsMjA0NiwyMzU4LDE1NjAsMzE4NCwxNCwxMDA2LDI0NTAsMTY2MCwxMDQ4LDcxMCwyMzk2LDE1MDQsMjUwMCwzODQsMjMxOCwzMDgsMjgxMCwxMDUyLDk1OCwxOCwxMDY0LDExNDIsMjIzOCw2MTgsMTA4MiwzNDQwLDMxOTAsMTYzNiwyNTI4LDM0NzQsMTE2LDE4NDIsODEwLDI3NDQsMjYxNiwzMjkyLDgyLDE5NjgsMjM2LDM2NzIsMTA1MCwzNjQyLDMxMzAsMTc0MiwyMDMyLDE4NzQsMjQ2NCwxMiw0NDQsMzUzNCw0NTIsNTg0LDgzOCwxMzQsMzMwMCwzMDI4LDM2MjQsMzYwOCwyODc4LDMxNjQsMjYyLDI2NjIsMTAyMCwyNzY4LDMxNDIsMjEyNiw2MzYsMTYyNiwzNTk2LDEzMTQsMzY2OCwzMzc2LDM2MDIsMzIzMCwxMDYyLDM5NCwzNiwyNTUyLDMwMTgsMzU1NCw4MTgsODU4LDM1NTYsMjU2OCwxNDkwLDEzNDQsNzYyLDIxMDIsOTUwLDM3OCwzNjE4LDExNDQsMjA2NCw2NDYsNzE0LDgzMiw1MDgsMzA0NCwzNjA0LDIwMzAsMTExMiwyNDE4LDEzMTgsODcwLDIwMzgsMTQ2NCwzMDk4LDY4OCwzNTAyLDI4OCwyMTcyLDExMDgsMjc1OCwzNDgwLDg2MiwxNTIwLDI0MDIsMjAxNiwxNjM0LDM0NzAsMjEzNiwyMzI4LDMyNDYsMjgxNiwxMTU2LDExMCw3MTIsMTc3OCw1MjYsMTU1MiwzNTA2LDI0MzQsMzA2MCwyOTYyLDI4MzAsODYsMjQ2NiwyNjIyLDIzNDUsMjQzMywxMjg5LDIzMjksMjY1Myw4MjksMTA3LDE5OTMsOTA1LDMzNDcsMzI3MSw5MDcsMzM4NSwxOTAzLDI1MzksMjg3LDE1MTksMTQwMSwyNTk3LDM1NzUsMTI3MywxMDY5LDI3MzUsMTg5LDE2NDcsMzExNSw0MzcsMjgyMywxNzkxLDMxLDExMzksMzEwMSwxNzg3LDIwNDcsMTI1MSwyMTQ1LDEwMywxMjAxLDIwOTcsMjgzLDE3NjcsNDkzLDMyNzksMzA1NywzMDQ5LDM5NywxNjg3LDc3LDIxNSwxODU3LDEwOTcsOTUxLDU5NywzNDk5LDE1NzUsMTc0Nyw5ODMsMjQwMyw2MDMsMTYxNywxMDMzLDI5OTMsMzE3NywxODY3LDMyMDUsNDY3LDMwODUsMjE5LDM0MSwyNTI5LDI5NTEsMTUzNSwyNjY1LDM1NTUsNTg5LDMwOTUsNzYxLDEzMzcsMjE4MywxMDAzLDIyOSwyOTgzLDMzMTUsMjY5LDU1NywyODYxLDIyMzEsMTI5MywyNDQ1LDI1MDksMTcyMywyMDY3LDMxMjEsMzYxMywyNzg1LDE2NjcsMTI1LDIxNzcsMzQzMSw3NTEsMzU2NywxMzMsMTE4OSw3MTUsMzI5MywxNTEzLDU0MSw5MzUsMzAzOSwzMjc1LDEzOTEsNjg5LDE2MjMsMTQ0Myw2NjksMTAyMywzMzkxLDEyMzMsMTczNywxODkzLDkyNywyMDQ1LDQ2MSwxNDIzLDI1NSwyMTk1LDM1ODEsOTg3LDExODMsNTc3LDE2ODksMzU4Nyw3OTUsMzQ4MywzNDg3LDg2NSwxNjExLDMyNTEsMTcwMywzNTAxLDMxNDcsMjM3MSwxODM3LDI3LDM5MSwxNjUzLDcyOSwxMTUzLDIwNjUsMzQ3MSwyNDkzLDIwODMsNzc3LDMxODEsMzUxOSwzNTA1LDE5NTMsMjQyNSwxOTk1LDI5MzEsMTAzNSwzMzY3LDIyODEsMzc5LDE1MDMsMzY3NywzMzMsMjU2NywxMjkxLDMxNzUsMzU3MywyMTE5LDE3NDMsMjc5NSwzMTk3LDg3NSwzNDQxLDM2ODUsMzQzOSw5LDIxMjEsNjMxLDEwMSwzMjUzLDM2NTksMzAyOSwxNDMsMjcyNywxMzAxLDMwODMsMzI3LDQyNSwzMTA5LDEwOTksMjEwNywzMjE5LDEyNzcsMzM3OSwzNjM3LDIwMzEsMTk0NSwyNjI1LDMxMDUsMzQ2MSwzNTg1LDMwMDEsMTQ3MSwxMDEzLDk0Nyw0OSwzNDAxLDM1MzksMjg2OSwxNjc3LDI0ODEsNDkxLDIwOTksMzU2OSwxODE1LDMyOTksNzExLDc3OSwyMzUxLDI0NzksMTA3NSwyMzI1LDM0NTksMTc1MSw4MjcsMzYyOSw4MzEsMjQ0MywzMjAxLDM5MywzMDM3LDIzMjEsOTEsNDc1LDI5NDMsNDA1LDEyNDksMTQwNywyNzYxLDEyMDUsMTQzMSwyNjMzLDI5Nyw0NDksMTM1LDE5MTUsMjA1MywyMzUzLDM0MzUsMjExNywzMjQxLDI2MzksMTA0NywxMzE5LDMwODcsMjc1MywxNzcxLDM0ODksMjc4MSwyMzEsMTE1NywyMDc1LDI0MzEsMjEwOSwyMzYzLDEzNzcsMjg0OSwyODQ3LDI2NDUsODg3LDMwMjMsMTE0NywxNDk1LDExNzEsMjM5Nyw4NDksMjUxNSwxOTYzLDE2MzUsMTIxLDM1MDMsMzUzNyw0MSwxNzcsMzIyOSwyMzY1LDQyMSw0MywyMjM3LDI5NzEsMjIyMSw0NTEsNDgxLDE5MTMsMTczMywyNzM3LDI1ODksMjczOSw5MTEsMzU0NywyODM5LDg3MSw2NzUsMjc1NSwxMzg5LDMwOTMsMTY4NSwyNzc5LDEwNDEsNjk3LDM0MjEsMTI3NSw3MjMsNTA5LDI1NDEsMTU1OSw4MTEsMzM4OSwzMDUxLDk2NSwxOTg5LDEwODMsMTc2NSwyMzc5LDE1OTEsMTAzOSw0OTcsODUzLDMyOTcsMjYyOSw4MTMsMjY1NSwyODAzLDI4MjksMjI1MywzMTU3LDExNjMsMTM3MSwxNDg1LDI1NTMsMzM1Myw2ODMsMTE5MSwyODA3LDM0MzcsMTcxMSwyNDM1LDMxNzksMzA4MSwzMDg5LDI2ODMsMjMsMTUxNSwyMjcsMzIzNSwzNjIzLDgzNSwxNDE3LDI5MTksMjk2MywzMTM5LDkwMywzNTYzLDM1NDEsMTAxMSwyMjMzLDE2NDEsMzU3OSwxNjQ1LDM1MDksNzUzLDI4NjMsNDUzLDE1MDcsMTg0MSwyODQ1LDcxLDEzMTEsMTA1NywxOTcxLDE5ODUsNzcxLDI0OTUsMTc1NSwxNDU3LDM2MzksMTk4MywzNDUxLDIwMzksMjcxMSwyODkzLDI1NTksMTEzLDE4NjUsMTU2Myw5OTUsMjY0NywyMDU5LDIyOTcsMjcwNywyNzIzLDI4NzUsMjA3OSwzNTE1LDM1MjUsNjY3LDM2ODksMTMzOSwyMjUxLDk4OSwxMzUzLDEwOTEsMjMzMywxNjIxLDM2NjEsMTAwOSwyMzkxLDI0MDcsMzQ4NSwzMTMzLDcxNywxMDQzLDI3OTMsMzIzOSwxNzU5LDgxLDIwMjksMjE5OSwxMTEzLDI1MTcsNTgzLDIwMywyOTExLDI0NjMsMjU4NywxOTg3LDM1NjUsMzY1Myw3NDMsOTQxLDQ4OSwxOTAxLDI4MDksNDExLDIwMzUsMjk4OSwzMDIxLDY4MSwyMjY1LDU3MSwxOTk3LDI1MDEsMzksMjg1LDE0NDUsNzU5LDMzOSwxMTYxLDE1NzksMTM1Nyw0NTUsMTc1NywxNDksMTg5MSwyOTczLDM1OTMsMjI0OSw3MTMsMjMyNywyNzksMjc3NSwzMzQ1LDY4NywyMzczLDI5MjMsMzA1NSw3ODksMTUsMTUxLDEzNDcsMjI3NSw0MzUsMzA3MywyODg3LDIzODMsODk3LDI4OTEsMTg0MywzNjExLDI4NzcsMTc1MywzNTk5LDg4OSwyOTc5LDI3MywyNDk3LDg5NSwxMjc5LDEyMTcsMjQwOSwxNjEzLDI4NTUsMjQ3MSwzODUsNDMzLDMyODUsMzIzNywxMTIzLDE2ODMsMTg3LDM2NjMsMTE2OSwzMTM3LDE4NzMsMTA0NSw1MywxMjMxLDEzODUsODM3LDEzODEsMTgwNSwzNjMzLDE1OTcsMTk2NywyODEsMzAxMSw5NzMsMTU2Nyw1MTEsODg1LDE5MDcsNzYzLDY1MSw4NzcsMjQ1MSwyMTg3LDQwOSwxOTksMjcwOSwyNjg3LDc4NywyNTY5LDIyNDcsMzUzMSwyNDU1LDE3OTUsNjcsMjY1NywyOTM1LDE2OSwxNDg5LDI3NjUsMTI1OSwxOTcsMzQ5NSwyMjM1LDI5NzcsMTEyMSwxOTEsODIzLDE0NjksMjczMywxNTM5LDEzNTEsMSwyNzU3LDIyNjcsMTgxOSwzMjc3LDM0NjksMTMwMyw3OTcsODE1LDEwODEsMTI0NSwyNDExLDM2OTUsMzU3NywyODk5LDk2NywzNTg5LDM2NzEsMzU1NywyNjQzLDI4MTEsMzI2OSwxODI5LDIxODksNjA5LDE5NSwzMDYxLDE0NSw5MjEsMTM5OSwxODYzLDU1OSwzMDQ1LDYzLDc4MywyMTY5LDI4NzMsMzU5NSwyMTkzLDM0NDUsNzQ3LDIzNDksMjMwNSwxMjM1LDE2NTksMjYyNyw2NjEsMzIyNSwyOTk3LDIwMTcsMjEyNSwyNTAzLDY2NSwzMzA1LDMyNTksMTEzMSwyNTgxLDExOTUsMjgxNSwxMDE1LDE4MjcsMzUxMSwxOTM3LDU1LDI1NzEsMjE3NSwxMTQxLDc3MywzNDU3LDIyMywxNzMxLDcyNywyNDcsMjcxNywxNjU1LDYxOSw2MTcsMTUyNSwzNDIzLDEyMTEsMjY2MywxODM1LDk3MSwxMzE1LDE4NDksMTUyMywxOTIzLDczMywyNDQ3LDI1MDcsMTg4NywxMTcsMTcyNyw4NTksMzUyNywyOTkxLDE4ODUsMzYxOSwyMjI5LDEzODcsMTg1MSwyMDEzLDIxMywyODUxLDM2ODcsMTgwNywyODAxLDE0MzMsNzQ5LDE4MTcsMjM5MywyNjcsOTU1LDMyODcsNzU3LDEzOSwyNjE5LDI0MDEsODQ1LDE5NTEsMzIwOSwzNSwyNzk5LDI2MTEsMTIxOSwzNDQ3LDE0MSwzNDA3LDI1NjUsMTYyNSwxMzcsMzQwOSwxNTQzLDMxNjEsMTEwMSwzMDUzLDMxNTksMTg5NywyNjY3LDMzMDEsMzgxLDg1LDIyNjksMzUyMywxNzQ5LDMxODksMjA2MywxMjIzLDI1ODUsMTgyNSwyNDY1LDI4NTcsMjI1OSwxNzYzLDExMDMsMjMzMSwxNTQ3LDE0NywyNjQxLDE0MzUsMTQ4MywyNjcxLDUxNyw1NzMsMjAzMywyNjM1LDU0NSwzMDUsMjc1MSwxNTA5LDE0ODEsMzI5LDIzNzcsMTM3OSwxNzE1LDI3NzMsMjMzNyw3MzcsMzg3LDI5ODcsNTMzLDEzMzMsNTc1LDQ0MSwzMjY3LDE4OTUsMTQwOSwyNjAxLDMyMTEsMzEyMywxMTU5LDMzMTksMzE5NSwxOTE5LDMxODUsMjQxOSw5MzEsNzY3LDIyOTksMjMxMSwyNjUxLDIxNzMsOTMzLDY1LDEyNTcsMzUxMywyNDQxLDMzOTcsMTcyMSwxNzY5LDU2MSw5NTcsMzk5LDU0OSwyODE3LDEzNjcsMTk3NSwxOTQxLDI5MDcsMzM2OSwyMTQ5LDM0MTMsMTI5NSwxNjQzLDQyMywxNzQxLDM2MywyNTkzLDExMzMsMjEzOSwxODU1LDUxOSw1MzEsMjgxMywxODc5LDExMzUsMTYwNSwxNjYxLDMwMyw3ODEsMTkyNSwzMDY5LDQ5OSwyMDg1LDE0OTksNTEsOTYxLDM0MTksMjAwMyw0NTksMTUxNywxMTQzLDE0MDMsMjg5Nyw1MjUsMTYzMSwyNzI1LDEwMTksMTEyOSwxNzgzLDMzMSwyMTcxLDM1MSwyNzUsMTE4NSwyODM1LDExMjUsMjcwMSwyMzksMjAxLDMwMjcsODQ3LDE3OTcsMTU3Nyw2OTksMTYwMSwzMDE1LDE1NSw2NDEsNTkxLDMzLDI5MTMsMjkwOSw5NDUsMTE1NSwxMDUzLDExOTMsMjk2OSwyNDEzLDMzNzcsMzMwNyw5ODEsOTI1LDExNzMsMTE1MSwyMjg3LDIwNTcsMTk4MSw5NDMsNTM1LDM2MDEsMzY5LDI4MjUsMjQwNSwzMzI3LDMwNDcsMjM1NSwzNjA1LDI1MTEsODQzLDI2MjMsMTQ1OSw4OTksMzI5MSwyNzAzLDI2OTcsMTkyNywyNzMxLDQxMywzNTA3LDMzMjUsOTA5LDE3LDUwNSw0NjUsMzQyNSwyNzU5LDE2MjcsMzMwMywyNTcsMTU4MSwzNjcsMzQ3OSwzNTcsMjY4OSwzMzM5LDE1MzcsODY5LDgwOSwxMTUsMTkwNSw2MzksMjY5Myw5NjMsMjUxLDE3MSw1NjMsMjEzMywzMTY1LDM1NDMsMzAxLDE2NjUsMjU4MywzMzMzLDkzNywyNDUsMjg1OSwyMTEzLDMxMzEsNTY1LDEwMjEsMzE5LDIwNywzMTE5LDc0NSwxNzg1LDIwNDMsMjkyMSwxOTU1LDM5NSwyMjYzLDE0NzcsMTQwNSwzMzQ5LDYxNSwyMTcsMzE2OSwyMTUzLDIzNywxMjMsNzY5LDE0MTMsMTY3OSwzMzIzLDE4MjEsMjQ3NywxMTc3LDEyMTMsMjYwOSw0MTksMTIyOSwyNzQ5LDQwMSwzMDY1LDExMTksMzE0NSwxMzk1LDE5NzksMTg3NywyMzU3LDE5NDMsMjMxMyw3NSwxOTkxLDY0Myw1MDcsMTUxMSwxMTEsMjI3MSwzNjA5LDE1NDEsMjEzMSwxNTcxLDIwMzcsMTM3MywxNTkzLDU3LDE4MywzMDQzLDE5MzUsMTA2Nyw3NDEsMzY3MywyNzcxLDI0ODUsMjQ2MSwyNzQ3LDE1OTUsMzE1MSwyMDYxLDQ0MywxODk5LDE5NjEsMzU1OSwyNjc5LDk5MSwzMTExLDI3ODMsNzc1LDg0MSwzNjA3LDE3MjUsMTI4MSwzNjgzLDM0NjcsODUxLDI2NjEsMTk1OSwyOTMsMzY3NSwyMTAxLDMwNzcsMjcxMywyMzM1LDMzMzUsNTUzLDMwNywxMzU5LDE5MTcsNjYzLDE4NSwyNDkxLDU5LDIwNTEsOTk5LDIzOTksNjg1LDI0MjksMTE2NywxMjI1LDE1Myw1OTMsMzE1NSwxMjY5LDQ0NSwzNDQ5LDMwNDEsMzM1LDY1OSwxMzc1LDM2MjEsMywzMzMxLDg2MSwxNjE1LDg4MSwyMzAzLDIwMDcsMzc1LDIyNzMsMzIyMyw4MDEsMzE3LDIzODcsMjAyMywyMjAzLDIyMDEsMjcxOSw1ODEsMjU3OSwzMDksMTQxMSwxNjA5LDMxMzUsMjY4NSwxNDM5LDE1MzMsMTYzNywxNTk5LDQwNywzNTUsMjA3NywyMTg1LDEzNjMsMTMyNSwzNjEsMTY5OSwzNTk3LDI5NTksOTk3LDU5NSwzNjY3LDI3NjcsMzA1OSwyNjUsMTE2NSw2MDcsNzE5LDIwNDksMzA3NSwzMzU5LDE1MjcsNzA5LDMwMDUsMTcyOSwzMzA5LDE3MDksNTEzLDM0MTcsMTY3MSwxMTg3LDMzNzUsMjU5NSwxNDQxLDI5MjksMjY3MywyMjE5LDk3LDIzODUsNDMxLDI5MDUsMTUyOSwzMjczLDI2MDMsMjYzMSwzNjQzLDM1NjEsMTI2MywyMDI1LDMxOTMsMjA4MSwxMTE3LDE5OTksMjEyNywyMDczLDE1NzMsMTEwOSw3OSwxNjM5LDIzNTksMzI2NSwyMzc1LDE4NDUsNDY5LDMyMDcsMTM5Myw1MzksMTI0MSw1MDEsMTI2MSwyMjE1LDQyOSwxNDUzLDkyMywxNDk3LDI4ODEsMTY3MywzNTcxLDM2NjUsMzYwMywyODc5LDE0MjcsMzY0OSwzMzE3LDExMDUsNDU3LDM0NzMsOTEzLDM2MTcsMjUzMywxODMxLDIyOTEsMTk2OSwxMDYzLDIyNSwyOTI1LDIyNTUsMTgxMSwzMTY3LDE5NDcsMjU1MSwyOTI3LDE3ODksMzEwMywxMDc3LDEyMDksMTUwNSwyMjEzLDMxOTksMTgxMywzMTUzLDIzMDcsNzM1LDIzMywyNzQzLDEzMzUsMzExMywyNDg3LDEyNywxNzgxLDI0NjksMjIwNywyNTU1LDI1MzEsMTkzOSw2NDcsMTgyMyw2NzMsMjg4MywxMjksMjk0NSwyNzY5LDg1NSwzMjEzLDExMjcsMjI4OSwzNzcsMzI0OSw3OTMsMzM3MywyNTM1LDI4ODUsMzIxNywyOTg1LDEwODksODM5LDg3OSwyNDU3LDM2NjksMjAyMSw1MDMsMzczLDIyNzksMzY5MywzMzEzLDM2MjcsMTM0NSwzMjU1LDczLDc5MSwxMDU5LDI3Nyw4MDcsMTYyOSwxMzA1LDI5ODEsMzQ5MSwxNjUsODAzLDYyOSwxNDE5LDYyNywyMTc5LDkxOSwyOTYxLDYxLDI0MSwyMTU1LDQxNywxNjMsNzAxLDI4MzMsMTk1NywxNzE3LDMyMzMsMzQzMywyMjI3LDEzMDcsNjksMjg1MywzMTQxLDIzNDEsNzg1LDEzMjcsMTk3NywzMDE3LDgyMSwxODcxLDIzMDEsMjY3NywyOTY1LDU5OSwxMDA3LDIwMTEsNjM1LDM0NzUsOTc5LDEyODMsMjM2OSwzMjYzLDQ3OSwyODI3LDMwOTksNjU3LDI4MzEsNzA3LDY0OSwxMjcxLDI5OTksMjIxMSwzMjMxLDczOSwyMjI1LDEzOTcsMzQzLDM1NTEsMjM4OSwxNzM5LDE4NjEsMTA4NywzNDU1LDI4MjEsMjMxNSwyNjQ5LDMwMzEsMzY0MSwzNjc5LDYyNSwzNDI5LDI0NzUsMTM0MSwzMDE5LDE3OTMsMTQ0NywyMDY5LDI5NDksMjQzNywyNTIzLDEwODUsMjc2MywyOTY3LDk1MywzMDEzLDYwMSwxMDksMjM5NSw2MTMsMzA3MSwyMTUxLDI5MTUsMjEzNywyODg5LDE4MDMsNjA1LDI0MzksMzI0Nyw4MTksNTIxLDEwMDUsMjQ4OSwxMjQ3LDE1NjksODMsMTc0NSwyNSwxNTIxLDE4ODksMTUwMSwyMDg5LDEwMDEsMjM0NywzMDI1LDMxOTEsMzU5LDI0NDksNTc5LDMzOTksMTM0MywxMzQ5LDE4NDcsMzQwMywyMzE5LDIxMTUsMTYzMywyNTQ5LDExMTUsMzQ4MSwxMzMxLDIwNDEsMTE5NywzNjU1LDI3MjksMTE5OSwxOTMsMzE0MywxOTIxLDIwOSwzNDQzLDI4MTksMzUyMSw2MzcsMjUyNywzMTcxLDI4NjcsMTI5OSw0MDMsMTI4NywxNjQ5LDk4NSw0NjMsMjIwNSwyMjc3LDE0NjcsMTE3OSwxNTksMTY3NSwyMTU5LDI5NTMsMTczLDE0NTUsMzgzLDMzNTUsMTkzMywyMjQ1LDE0NjEsMjY4MSwyOTc1LDE0NjMsMjQ1MywxNzk5LDMwNjcsMjEyOSwyMTgxLDE2OTUsMTYxOSwxNzYxLDI5MDEsMTc1LDMzNjMsOTUsMjE2NSwxNzczLDE0NzUsMjc4Nyw5NTksMjA3MSwzMzQxLDE4MzksMTE4MSwyNTczLDM0NjUsNTQzLDcsMzMzNywxNTU3LDg1NywyNDMsMjMwOSwzNTMzLDMzNjUsMzQ3NywyMTQzLDQ3LDI0MjMsMTk3Myw0MzksMjA4Nyw1NjcsMTU1MywyOTAzLDI5NTcsMzIyMSwzNjM1LDI4OTUsMTQ1MSwyNjE1LDE5MTEsMjYwNSwyODA1LDY3MSwzMjg5LDI3ODksMzE4MywxMDUxLDQ3MywyNzQxLDMwMzMsMTg1OSwxNjAzLDE5LDM1NDksMTA2MSwzMTMsMTIyNywxMzgzLDM1MzUsMTA3MSwxNDIxLDE2OTEsMzQxNSwyNTQ3LDEzNjEsMzg5LDEzMjEsMjUyMSwxMjIxLDI1NDUsMzE0OSwyMTU3LDI0MTcsMzcsNTg3LDE2ODEsMjc5NywzMzQzLDI0NjcsMjI4NSw5MzksMzYxNSwyMzM5LDI4NzEsNTE1LDEzMjksNjkxLDEwNDksMTIzOSwxNjcsMjkxNywzNDI3LDM2NDUsMTI4NSw3MDMsMzI2MSwyMDI3LDY5MywyMDkzLDEyNTUsMjYxLDE3MDUsMTE5LDE3MTMsMTgzMyw4OTMsMTU4OSw0MjcsMzM3LDM0OTcsMzY1NywyODQxLDMzNTcsMzIzLDMyNDMsMjQ4MywyODQzLDIwOTUsMzM2MSwyODksMjQ1OSwxMTM3LDk3NywxODUzLDI5LDE1MzEsNDUsMjg2NSwyMjQxLDQxNSwxMDY1LDMxNzMsMTQyOSwxODc1LDI2MjEsMjEzNSwzMjAzLDMyNSw5MTcsMzM5NSwyOTQ3LDMwMDksMjI1Nyw2MzMsMTkwOSwyNjc1LDQ5NSwzMDM1LDI3MDUsMTMwOSwyNjk5LDE1NjUsMzMxMSwyMjYxLDExNDksMjAxOSwzMjQ1LDkzLDUzNywzMDc5LDE4MSwzMTI5LDE4NjksMzExNywxMzIzLDIyOTUsMjUwNSw1NTEsMzU4MywxNjk3LDI0MTUsMzY1MSwxNTg3LDg5MSwxMzE3LDEyNDMsMjI5MywxMjA3LDI3OTEsMTQzNyw5OTMsMTM1NSwyNTYzLDE4MDEsMTA5MywxMDUsMzAwNyw5MDEsMjIwOSwxNTQ1LDI4MzcsNzMxLDIzNSwxNzc1LDI0NzMsMTE0NSwyNjU5LDIzNjcsMzMyOSwyNTksODE3LDM0MTEsMjMyMywxMywxOTQ5LDIwNTUsMjk1LDEyNjcsMzQ2Myw0ODcsMTQ4Nyw5OSwyMDkxLDQ3NywzNDA1LDIyMTcsMzA5NywxMDI1LDIzNjEsMjE0NywyNTI1LDE1NDksMjc0NSwxNzM1LDY1MywzMzcxLDIxMSwxMjY1LDYyMywxNzksMzEyNSwzMTUsMTg4MywyMDAxLDI1MywyMTA1LDEwMjksNTI5LDU0NywzNjMxLDg3LDQ0NywxNTcsMjYwNyw2MTEsMTU4NSwyMjIzLDgzMywyMTAzLDE0NjUsMjcxNSwzNDUsMjIzOSwzMzgxLDM1MywxNDkzLDM2NDcsMjY2OSwyMjgzLDI5MzcsMTE3NSwzMzgzLDI2OTUsMjE5MSwxNTYxLDI0MjcsMjAwOSw4MjUsMTkzMSwzMjU3LDUyMywyNTkxLDE4ODEsMTAzNywyMTIzLDExLDY1NSwzMjI3LDI1NTcsMzIxNSwzMzg3LDMyODEsMTIwMywzNTkxLDg4MywyNTE5LDE0NzMsMTU1NSw1MjcsMTc3OSwxMTA3LDIyNDMsMjk1NSw3MjUsMjM0MywzMjk1LDI2OTEsMjU3Nyw3NjUsOTI5LDE0NDksMTM2OSwyNzEsMjE0MSwyMTYxLDMzOTMsMjQyMSwyOTk1LDIwNSwyNjM3LDI1NzUsMjUzNyw3MjEsMjAxNSwxMDc5LDE3MTksMTI5NywxNzAxLDE1ODMsMzQ1MywxNjA3LDIzMTcsNjQ1LDMxNjMsMTc3Nyw5NDksMTgwOSwzMDYzLDE2NjksMTAxNywzMDAzLDE0MjUsNTg1LDE2NjMsMzcxLDI5MzksMjQ5LDEzMSwyNTYxLDQ3MSwyMjEsMzEyNywyMSwyNzc3LDU1NSwxOTY1LDM2MjUsMzU1MywzMDkxLDM1MjksMzQ3LDEwOTUsMjYxMywxOTI5LDI5MzMsNTY5LDI5MSwzNjkxLDY3NywzMzIxLDg3MywxMDI3LDI5OSwxMjM3LDEzNjUsMzIxLDYyMSwyOTQxLDQ4NSw4NjMsMTY5MywzMzUxLDE1NTEsMjU5OSwxMjE1LDE2MSwzNjgxLDM1NDUsMTA3Myw5NjksODA1LDM1MTcsMTA1NSwyMTExLDEwMzEsMTExMSw5MTUsNjk1LDI3MjEsMTQxNSw2NzksMzY1LDMxMSwzMTg3LDMxMDcsMjM4MSwxNjUxLDEyNTMsMzQ5MywyNjMsMTcwNyw4NjcsMTY1Nyw3OTksMzI4Myw3MDUsNDgzLDk3NSwxNDkxLDIwMDUsMjQ5OSw1LDIxOTcsNzU1LDEzMTMsMzQ5LDg5LDIxNjcsMTQ3OSwyNjE3LDIxNjMsMjUxMywyNTQzXTtcbmV4cG9ydHMuaUNvbnZlcnQzNjk2ID0gWzEzMzMsMjQxNiw1NjAsMjg5Nyw4MTgsMzY4NCw2MDEsMzI4OCwxNDgzLDIwMjcsNDg5LDM1NDgsMTc1NywzNDc2LDE3MTQsMjMyOSw5MDIsMjczOCwxNzI5LDMzMjUsMTU0MSwzNjE1LDk5MCwyMjAzLDU3NiwzMjAwLDM2NSwxOTkxLDcxOSwzMzk3LDg5MSwxODc3LDc5NCwyNjk2LDExOCwyNTM3LDE3ODYsMzM0NiwxMTY4LDIzMDQsNzg3LDIxMzQsMTE4OSwyMTM5LDEwNzAsMzM5OSw2ODAsMzI5OCwxNTc5LDIwNTcsMTM4MiwyNjYxLDE0MDUsMjM2Nyw4NzIsMjQ3OSwxMjkxLDI4MzIsMTU5NywyODc4LDE1MzksMzEwMSwxNDgxLDI0NDksMTQwNiwyNjE5LDc3MiwyMzk4LDQ2LDMxMTQsNjUyLDIyMjgsNzY1LDMwODQsNDE1LDI4MTgsMzMxLDE4OTUsMjU4LDI5ODMsODgwLDIyNzcsMTc0NiwzMTk4LDQ2NywyNTU3LDE4NDUsMzUxMywxMjExLDM2ODksMTI2LDIwODQsNDksMzQzMCwyOTUsMzI3NSwxNTQ2LDI5NjMsMTEwNywzNDg0LDE4OCwyMDMwLDU0OSwxODg0LDEwOTUsMzQ1OCw4MjIsMTg1NCwxNDQ3LDMxODAsMTgzNSwyODIzLDEzNTksMjI0NCwxMzA3LDI3NTUsMTc0MCwyNTA3LDQ5MywzMzc1LDg2MCwyMTMxLDE1MDgsMjc5NSwxMzU4LDE5NDQsMTQzMiwzMDQ0LDE1MzYsMzA1NSwzNTEsMzYxMCw1MzcsMTk0OSwxNzYzLDIwOTYsNjc2LDI1NDYsOTAwLDI1MzEsMTMwLDI1NDIsMTM0NiwyMDM0LDUwMiwyNDQzLDEyODUsMjU3MywxMjk5LDIzMTQsMTgyLDIzMzAsMTE5NSwyODg2LDI0MSwyNjkzLDQ1NCwzNTE1LDEzMjIsMzI1MCwxMjg3LDM2NDgsMTQ5MywzMTA1LDEyOTMsMzA5MywxNDcyLDMzNjIsMTI0MywyNDAxLDM5MiwyNzYxLDEwOTMsMzI1NCwxNjA5LDMyNzMsMTI4OCwyMTM1LDQ4MywzNTAyLDEwMywzNDMzLDk1NCwyODMzLDY0OCwyODc2LDE2NzcsMjM2MSwyOTAsMTg3MSwxNDk4LDI0MTAsMTIwNCwzMjI5LDExMzgsMjQ0MSw4MTMsMjQwNSw4MTUsMjM4OSw0MTAsMjY4NSw3OTksMjI4Myw3MTcsMzU4MSwxNTE1LDI3NzgsNTczLDMyMzIsOTY0LDM0OTksMTM3LDI1MTgsODI4LDE4OTYsMTAxNCwyNzkxLDMzNywxOTE1LDE5NSwzNjEzLDQsMjQ4NSwzMjksMzAyMCw4NzksMjIwNSwxNjE1LDE5MjgsOTEyLDIxMTEsMTAwOSwzMDM5LDY3NywzNDY1LDE3NDgsMjc5NCwyNTUsMjY4NCw0MCwzMTAyLDU2MSwzMjkyLDE2MTksMjc3MSwxNiwyNDg4LDM4MywzNjA5LDEyMzksMjc2MCw5NDUsMzUwNyw0NzQsMTk3MiwxNzAyLDI3NDUsMTE1MiwzNDcyLDgxNiwzMzczLDE3NzAsMzY3MiwxMDUxLDI5NDAsNDg3LDI1MjcsNjcsMTkzMSwxNTIyLDM1NzUsMTEwOSwyMzQ2LDUwNiwyNjc5LDUzMSwzMDg3LDE0MjYsMjMyMSwxMzg1LDIzNzYsNDY5LDE4ODcsOTYwLDIzMDUsMzcsMTg2MywxODE5LDMzOTIsMTczLDM2MjksMjg0LDI4NjQsNzc4LDM0NzksMTIzMywyMDk0LDgzMSwzNjM1LDE2NDEsMjc2NiwxMTkxLDI2NTQsMTAzMiwyNTgzLDczMywyODcyLDE3MjUsMjkxNiw2OTQsMzY2NSw3NDEsMzMyOCw1MCwzNTA0LDQwNywyOTA4LDEzODksMjc3NywxMzU1LDM2MzgsNDk4LDMzODYsOTc5LDM0MTAsMzQ5LDIwMzgsMzk1LDI1ODcsMTE3NiwyNjc2LDEyNTksMjAxNCwxMDA4LDI4OTMsOTQwLDMzODEsMzM4LDIzMDgsMTI5NSwxOTE2LDE1NDcsMzE1MCw2NDksMzUyNCw2MDcsMzYyMywxMTU2LDM2ODgsMzA5LDI2NzgsNjEyLDM1MjcsMTk2LDI5MjYsMjY5LDI3NDksNzk4LDMyMDksMTA2NSwyOTMxLDY2NiwyNjQyLDEyNzgsMzY2NCwxNTA1LDI3NDcsMTY4NywyNzE3LDM2OCwzNjA3LDk3MywzMDc3LDc0LDI5MDQsMTM5LDMwNjIsMTc5OSwyMDExLDExMTcsMjU1NiwzMTYsMzI1NiwxNzIzLDIzNTUsMzQsMjU5NCw2MzcsMzMzOCw5NDYsMTk5Miw4NzYsMjA4MSwxNzg1LDI3ODUsMTQ5OSwxODkzLDUxNSwyNjI4LDE1MDQsMjgwOCwyMTUsMzI0MSw1NzQsMjA4NywyNjQsMjkyNSw3MTQsMjM4OCw5ODMsMjI5NSw3MCwyNzM0LDI5NywzNDAyLDMxMSwzMTA0LDE0MjQsMjgwNSw2OTAsMjEzOCwxMzM1LDI2NDAsNDE2LDIwMzksNjM2LDMzODAsMTQ1NywyOTk3LDEyMzgsMjk2NSwxMzQwLDIzNTYsODM2LDIzMzMsNzczLDE4NzQsMTU1MSwzMzAxLDQwNiwyNTk5LDEzNzMsMjg0NiwxNzU4LDI4OTAsMzU3LDM1MTQsMzczLDIwOTUsNTQ2LDIxNDMsMTc2MCwyMjI0LDExOTYsMjMxMiw3MTYsMzAxMSw3ODgsMjY2NSw5ODgsMTk3MCwxNjU5LDMyNDUsMTM3OSwyNzQwLDMyMiwxOTEzLDg5MywyOTg5LDE1ODIsMzYxMiwxMDkxLDMzMjAsMTU1MywyMDg1LDEwMTIsMzQ4NiwxNTYzLDMxMzYsNDk5LDIxNDQsMTU0NSwzNjc5LDE0ODcsMzY0MSwyMjYsMzQ4Miw3NjYsMjI5MiwxNTEyLDIwNjMsMTY4MCwxODg5LDEyMTcsMzQxOSwxMTk4LDIxNzgsMTM3MiwyNjU4LDEyMjgsMjk5NCwyNDIsMzA3NiwxMzUxLDI3MzksMTM5NCwyODIxLDE4MDYsMjE2NSwxMTc3LDIzODAsNTM0LDI5NTMsMTI2OSwzMzU3LDM5MSwyNTc4LDEwODQsMjY0Nyw4NTQsMzE5Myw4OTIsMzU0MywxMzk5LDI2NzAsMTgzOCwzNTYxLDIxLDM1MTAsNzM3LDI2NDgsMTQ1MCwyNTk2LDkzNiwyNzE1LDE1OTIsMzQzMSwxMDM3LDI5OTIsMTAxLDE5NTQsMjU0LDMyODcsOTA5LDI1ODIsMTQ1NCwzNTExLDEwNDMsMjYyOSwxODMsMzQ0MCwyMjAsMjg3MSwxNjc5LDM2MTcsMTEsMTkzMiwyNTAsMjQ0NywxNTUsMjYyNiwxNDU1LDI3NjIsMTcsMjc3NSw0MDgsMzMwMyw3MywzNjI4LDE0MzUsMjMwMSwxNTQwLDI1NzksNzcsMjU5OCwzNSwxOTc3LDEyNTEsMzIxMSw5NzIsMjkxNCwxMDI3LDIyODIsMTc2MSwzNjA1LDEzNDMsMzM0Nyw0MjIsMTkyMiwxNjQsMjY5NSwxNjAzLDI4ODcsNDI5LDI5MzYsMTM0OCwxOTAwLDg2NywzMTI3LDc2OCwzMTc5LDQzMiwxOTA2LDUxMCwzMTg5LDEyNzIsMjk0MiwxNjYsMjQ0MCwxNjI4LDM1MTcsMTAyOSwzMTgyLDIxOSwyNzkwLDI0MCwyNDkyLDE3MzMsMjQ5MSwxNjA2LDM2MzksNDM0LDM1MDEsMTE1MywzMTYzLDE1NjgsMzA5NywxMDA2LDMwOTUsMTYzNiwyMDI5LDYxMSwzNDE2LDExMzEsMzEzMCwxNzc2LDMyMzYsMjAwLDI3NTcsMTE1NCwyNjk0LDEwMjgsMjgyMCw1ODUsMzU5NSwxODAzLDMwNTEsMTA3MywzMTQyLDMxOCwyMzg0LDYwOSwzNDk3LDIzNSwzNTQ5LDkyOCwzMTM5LDEyMjIsMjg5NCwyOTgsMjQ2MiwxNjU3LDI4NzUsMTQ3OSwyNDY4LDMzOSwyMjU3LDgzNCwxOTYyLDExNzMsMzMxNSw5MjksMzA1MywxMDc1LDIxNTQsMTcwNSwzNjMxLDE2NDAsMzY2Myw2ODUsMjI5OSwxNjYyLDIxOTMsMTI0NywyODgyLDUxNiwyMzI0LDE4MTcsMTk1OSw1MDksMzM1OSwxMzc3LDMzNzAsODksMzY2MCwzNzgsMjE2MSwxMDAwLDI2OTAsMTM4MywzMTA2LDUyNSwzMzY3LDE2MDIsMzY3OCwxMDAxLDMxNDEsNTksMjk0OCwxNzE5LDIwNjgsMTgzNiwyMzE5LDE4MDQsMTk1MSwxMTY3LDIyNzIsMTI3MCwyOTQzLDgxMSwzNTg1LDMxLDIxNjQsNTA3LDM1NjYsMTA4NSwyNDg3LDEwNjksMTk5NCwxMjc2LDM0NjQsNDU2LDI1MDMsODI0LDMwMzgsODAsMjU5MywxMDA3LDMxNDcsMTY3NCwyODM3LDQ4MSwyMjkwLDY2MywyNzgwLDExNjQsMjQ1Niw5NTksMjUyNCwyMTgsMTk0NywzNzYsMjIyMiwzNzcsMzY4NiwzNDAsMjUzMCwxMjk2LDIzMDcsMTY1OCwxOTI0LDE3OTYsMjM4MywxMDYyLDM1NzEsMTA1NywyNjEzLDI2NywyNzk2LDExNDQsMjIzMyw1MTMsMjQ4Myw4ODMsMjg1NCw2ODcsMjAwMCw3MDAsMjA2OSwxMDQ3LDI2NTUsNjY5LDI0NTAsMTI4MywzMTE4LDY0NCwyMzkyLDEwNTQsMjMyOCwxNjMzLDMwODUsMTU1NSwzMDY0LDE3OSwxOTgwLDQ2MywyNDIzLDE1LDM2NzYsMTM0OSwyOTA3LDg2NCwzMDk0LDM2MiwzNjUzLDEzMjYsMzA4OCw4MywyNzU0LDE3NDIsMjE2OCwxMjU0LDIxODIsMTMyMSwyNDI0LDEzNTcsMzQ3MywxNzkwLDMxOTIsOTAzLDMxMjIsNTIyLDI0MTEsMTE1MSwzNTQwLDE0MzcsMjA3Niw5NTMsMTg1Myw0NDAsMjA3OCwxODA1LDM1MjAsMTQwMywyMjA4LDExMjksMjM3MCwxNzYyLDMwNzEsODIwLDI4NTUsMjM4LDI3MjUsOTMxLDI1MzQsODk1LDI2ODcsNzY3LDIxMjcsMTYzMiwyODYxLDc4LDIxNzksMjkyLDMwNTgsOTk2LDMyOTEsMTc5MSwyNTA5LDgwNSwyODk5LDE4MjQsMzY0MiwxMTAxLDE5ODMsMTExNiwzNjc0LDEzODAsMjc1MywxODEzLDIxNTMsNjAwLDM2MzMsMywyMDIzLDk3MCwyMzg1LDEzMDYsMzA3Miw0NDEsMjkwMSw2NzAsMzU1NywxMjM2LDIzODEsNTYsMjEyMSwxMTQxLDIzNDQsMTcwOSwzNDQ2LDI2MywzMzc4LDg3LDIzNDgsOTU3LDIzMzcsMzY2LDI3MjgsODgsMzQ2MCw5OTUsMjIxMyw1OTgsMTg1NiwxMjg5LDE4NTksMTE2MSwyNzM3LDEwOTgsMjE1MCwxMDYsMzAxMyw5OTksMzY1OSwxNTAsMzQxMSwyMDksMzA5OSwxNjMwLDI0NDQsMTM1MiwyOTk5LDEwOTIsMjcwOCwxNTI5LDE5NjgsNTIsMzU3MiwxNjY4LDI2MTIsMTM4NCwyNjE4LDIwNiwxOTU1LDE0MTYsMjc3MCwyNzksMzM1MywxNTgwLDIyOTEsNTU0LDI3MTQsMzg2LDI2OTksMzgwLDIwNTYsNjgyLDM1OTgsMTc5OCwxODk5LDgxMiwzMTc3LDE0MywyNTI4LDg5OCwyNjI3LDE3MjgsMzI4MCwzMjEsMjY2MiwxNTE2LDI3NTksMjksMjE3MSwxNjczLDI0MzEsMTExMywzNjUyLDUyNiwyNDk4LDM0MSwyMzc4LDEyNDQsMzY4MCwxMzMsMzM5NSw3NjEsMzEzMiwxMjUwLDI3MDcsMzYzLDE5MDQsMTY0OSwzMjQ0LDI4NiwxOTc1LDE1NTAsMjI2MSw2MTQsMjg1MSwxNDE0LDM0NTMsNjY1LDIyNDcsMTM5OCwyOTM1LDE3NSwyODgwLDE0OTYsMzIwNSw5NjksMTkyNywxMjY0LDMxOTQsMTcxNSwzMTI4LDE1MTMsMjI2Nyw3NDUsMjIxNiwxMTgwLDIwNTUsMTExLDI0NzUsMTUwMywzNjAyLDE0MjAsMjY3MywxNzcyLDI3NzYsMTAxOSwxOTYzLDI4OCwzNDkwLDEyMDgsMzYzNCwxMjIwLDM1MDksMzcyLDM2NTcsMTEyMCwxOTA4LDY0MCwyMDA4LDEyMjUsMzU0Niw2MzAsMjE3NywxNjcyLDIxNjAsMTI5OCwyMjczLDgxMCwyMzY2LDE0NTksMjEwNCwxNzE4LDMzNjAsMTc1MCwzMzE5LDE3MjcsMjcwMSwxMDQ5LDM2NTUsNzcwLDIyMzAsOTQ4LDMwODYsOTE4LDMzMjcsMTc4NCwzMDE5LDE3MzAsMzQwMyw0NTgsMjgzNiw2NDUsMTg2OSwxMzk2LDMzMzIsMTA2MywzNjUxLDc2NCwyMDcyLDEwODMsMzAzMCwxMDQwLDM1ODcsNzQ4LDI0MjUsMTczNCwyMTczLDY2LDMxNzQsMTQ4LDMxNTUsMTQ1LDMwNzAsMTAzMCwyMjYzLDExNjUsMzQ1NywzMTcsMzYyNCw5MjcsMTg5OCw1NzksMjA0MSwxNTQzLDI1NTAsOTE1LDI1NzAsMTM2NywzMDEwLDE2NzgsMzU2MywxODIxLDI5ODIsMTUxLDM2NTgsMTgxMCwyMjgwLDE0MDIsMzIyMSwxMDgsMjk3NywxNjY0LDI4MTAsOTg2LDI0MDksMTUzLDIzNTksMTMsMjY4MiwzNDgsMzA2MCw0NjIsMjY3NCw0OCwyNDcxLDk5MywyNjQ0LDQ0NiwyNjUxLDExNzgsMzM5NCw1NTAsMTg3OCw4MDksMjQ4MiwxNzMxLDI2NjcsMTgwMSwzNDY4LDEwMTYsMjEyMywxMDExLDM0MjcsNjE3LDI3MTAsMjk5LDE5OTUsMjUzLDI3MDAsMTgzNCwyMTEyLDk2MSwyNjA2LDYyOSwyMzA5LDE2NjUsMjE4OCwyNDMsMjk0MSwxNjIwLDI4ODQsMTU3NiwyMzYzLDEwNzgsMjEyNSwxNTc1LDI3MDksNDczLDM1MzMsMTM2OCwyODAyLDEzMiwzMjQ5LDE0NjIsMzI4NCwzODcsMTk3NiwxMDE4LDI2ODAsMTI4MiwyOTU2LDEzMjksMTk1MCwxNTMwLDIxOTQsMTU5OSwyNzAyLDg1OCwyNDczLDE0MzEsMzIyNSwxMTMwLDMyMjgsNTMyLDE4ODUsMzkwLDM1NTUsNzU4LDIwOTEsMTEyMSwzNDUwLDEzMzcsMzAzMSwzMTksMjQ5NSw5MDYsMjgwMyw2NzgsMzY0NywxMTQ5LDIzNTAsMzQzLDI1NDAsODE0LDMzNDEsOTQsMjU2Myw0NzksMjg4NSwxMzE0LDMzMjksMTMwNCwyODA2LDEwODYsMjM2OCwxMjMxLDE5NjUsNTM2LDI0NTksMjgzLDM2MzYsODg5LDMzNjEsNjkzLDI5OTMsMTM2NiwzNDQ4LDk5MSwyNDI2LDE2MTIsMzE5NiwzNjEsMjA4OCw2NzUsMTg4Miw1OTIsMzY3MCw3NjIsMzM3MiwxNjY2LDI2MjAsMTA2OCwyNDA0LDE1MiwyOTk1LDcwNCwyOTczLDg3NSwzNTAwLDUwMSwzNDgwLDI1OSwyODg5LDE0NDksMzE0MywxMjI2LDE4NjgsMzU4LDIxNjMsMTUyOCwyMDQ0LDQ2NSwyMzQ5LDE1OTUsMjg1OCwxMTE4LDMxMzMsODU1LDMzNjYsMTgsMzI0Miw1MTQsMTg1MCwxMDQ1LDIwMTYsMTM3MSwxOTM1LDExMzUsMjYzOCwxMjE4LDM1ODksMTE0MCwzMjQwLDQ1OSwyMDM2LDUxOSwyNDIyLDExOTMsMzA5MCwxNDIyLDMxMTMsMjIxLDM0MjIsMzI2LDIyMjksNzI0LDM2ODcsMTc3OSwyNDk5LDUzNSwzNDQ3LDE4MTIsMjEwNSwxMjIsMzMzOSwyNTYsMzQzNyw2NjQsMjkzMCwxNDk1LDMxMTksMTUxMSwzMzU4LDEyNzcsMzIyMywzNDYsMjU5Nyw2OTIsMzA0MSw2NTEsMTkyNSw1MDgsMjI1OSwyNjUsMzE2Niw1NzgsMzIxMywxNzk1LDMwODIsMTQxMiwyMzMxLDEwNzQsMzIxNCw5NSwyNDE1LDYxMywyMjYyLDE2NjEsMzQ1NCwzOTMsMjMxMSwxNDE4LDI4NzMsMjgwLDMzMzcsMTQ1OCwyOTI5LDc2MCwzNjM3LDMwNiwyNjMxLDE2ODgsMzU3NCw4NDEsMjE4OSwxMjM3LDI4MzAsODUwLDI4OTUsMTM0MiwyMTE3LDcwNSwyNTg5LDEyNzQsMjM3MSwxNTYxLDMzMzAsMTQ2MCwyMzY5LDEsMjUxNSwxMjkyLDIxNTYsMTQ0NiwxOTU4LDcwMSwyOTkxLDY2OCwyODEyLDEyMjMsMzE0OSw0NzEsMjQ0NSwxMDY3LDE4NjUsMjc3LDI2NjgsNjk2LDI3ODgsMjQ3LDIwODksNzU0LDI2MDIsNDUwLDI5MTcsMTY1MSwyNzk3LDE2NjcsMzY2MiwxMjQxLDIyMDksMTg1LDMwOTYsMTM0LDMzMzMsNTUzLDE5NzEsMTMwMSwzNjA0LDE2NDIsMzAwNyw4MDgsMzQwNSwxNTE4LDIwOTIsMzg0LDI1MjMsMTI3NSwyNTc1LDUxLDM0NTIsMTY4NSwyOTIxLDczNCwyOTU5LDU1OCwxOTYxLDE2OTIsMjMwNiwxMTc1LDMxNjksNTkzLDM1NzMsNDIxLDMzMTAsMTUzMSwyOTk4LDExNzEsMzI1NSwyNDUsMjIzNiwxNDM2LDI3MjcsODM3LDMyNjAsMTQ5LDMyNjMsMTgxNSwzNTIyLDE0NCwzMjQ4LDEzMTIsMjQxMiwxMjY2LDIwNTQsMTYxMywzNTU5LDUyNywzMjc4LDEyMywyNzg3LDExOTksMzY5MSwxNDIxLDI1ODYsMTEzOSwyNTc2LDYxOCwyMTkwLDgwNCwzNDgzLDQwNSwyNDAyLDE3OTQsMzY4MSwxMjAsMzUyOCwxMTE0LDIxMjQsMTY5MSwzMDAwLDkyLDI2NjAsNDI4LDMyMDMsODM4LDIwMTIsMTcyMSwzMDMyLDE1OSwyMjI1LDExOTQsMjU4NSwxNjcwLDI4MjIsMTAxMCwxOTUzLDE5LDIyMDQsMTcwLDI2NjYsMTY3MSwxODY0LDE4MjUsMzIwMSw2MTksMjUwMSwxMDUwLDI0OTMsMTYzMSwyOTQ3LDEyMDksMjk2NywxMTI2LDMzOTgsNzM1LDI5MjIsNTIwLDE5MTksMTA3OSwyNzUyLDgwMCwyNDE0LDEwMzksMjgyNiwxNTg2LDI1NDgsMTYwOCwzNDYyLDIwMywyNTcyLDE0MTMsMzQ5NCwyNjAsMzY0NSwxODM5LDMzMDQsMTQyMywzNTYwLDU3MiwzMjkwLDcwMiwyMTY3LDE3MTIsMzUzNyw4NDksMjI0NiwxMTIsMzQyNCwxNDQwLDIzNzksODY5LDMxOTcsNDY0LDI4MjgsMTEwMywyOTgxLDQ2MCwxOTAyLDE1NTYsMjY4OSw3ODIsMjMxMCwxNTk2LDI3NDYsMjQ4LDM1OTEsMjMyLDM1MTgsODczLDM0NDUsMTY1MywzMzc5LDE0NDUsMjE3NiwxMDU4LDI4MzEsMTc3LDI4NDMsNDEsMjM3NCw4NDYsMjkyNCw4NzQsMjY5MSwxMzgsMzMyNCwxNTgxLDI2NTIsMzQ0LDM1OTMsMTM2MiwyOTE4LDEyOSwxOTg0LDM1MCwyMzUyLDEwMjAsMjkwMCwzMiwxOTA3LDE0NDMsMzI3MCwxMjQsMjI2NSwxMTQ3LDE5NjAsNDM2LDI1NDUsMTc3NywyNzQzLDMwNSwzMDg5LDI5NCwyNjcxLDE1MDAsMzIxOSwxODI4LDIxMzAsMTczNywyOTIzLDI4MiwyOTg0LDEzNTMsMjIxOCwxMjAxLDI2MzksMjEwLDIyMjAsNDc3LDE4NzIsMTM2MSwzMjQzLDExNjksMzY2OSwxNDk3LDE5OTMsNDg2LDI0OTAsNDQyLDM2NzUsMTU4OCwyNDYwLDE3MTcsMjY1Myw1NTYsMzYwNiw5MjUsMjc2NywxMDUzLDE5NDMsNzEsMzYwMSw3NiwyOTU1LDg0NywzMDAyLDE1OTQsMzI1MSwxMjc5LDIwNjEsMTIzMCwyNzk4LDE0MDQsMzM0OCwxMTg0LDIzNjAsMTAyMywyMTU4LDc3OSwxODk0LDQ5MiwxOTc4LDE3MiwzMzM0LDY2MiwzNjQzLDEzMTMsMzI2OSwxNDgwLDM0NDIsMTA0NiwyOTMyLDEzMTgsMzU5MCw4ODYsMTk4Niw5MzMsMzM3NCw2OSwzNjczLDUzMywyOTUyLDExMjQsMjE5NywxMjUzLDMzNzYsOTg0LDI1OTAsMTY5OSwzMTA5LDEwNDEsMzU4OCw2MywyNjI0LDEwMzQsMTkzOCwxMjYyLDI4NTcsMTA1LDI1MDgsNjQyLDI5NTAsMTMyNCwyNDg2LDE1NzQsMjE0NiwxNjA3LDM0OTYsMTAxNSwxOTY2LDEyMDAsMzE1MywxODEsMjY0MSwxNzUzLDIwMjAsODMwLDMxOTksNjI2LDE5MDMsMTQzNCwyNTYwLDIxMywyMDc1LDE1MDIsMjM0Miw0NzUsMjIzNSwxNjAwLDIzMTMsMTUxNywyMjc2LDE0MTksMzI3MSwyODEsMjU2OSw4MjEsMjE3NCw3ODEsMTg4OCw1MTIsMjYyNSwxMDM1LDIxMDgsMzgxLDMyNzcsNjk5LDM0NjYsMTQsMzU5NywxODM3LDM1NjIsMTE4NywzMDQ1LDEyNDIsMjY3NSwxMzUsMjc4MSw3NDIsMTg4MCwxNDcsMzAyOCwxNjM5LDE4NzYsMTAzNiwzMTY4LDkxNCwyMzk3LDEyMzUsMjY4OCw0OTAsMzI2NSwxMTg1LDM0NTYsNTQzLDMxODgsMTMwNSwyMzcyLDExNSwyNTIxLDc5MSwzNTk5LDc0NywzMDIzLDI1MSwzMDM1LDMwMCwyMDY2LDE1NTksMjUyNSwxNjQzLDI0MTksMjc1LDI4MDAsMTQ0NCwzMDUyLDE2ODMsMjU2NSwxNDMzLDI0NzYsMTA4OSwyNDM4LDMwMSwzMDE2LDEwOTQsMzM3NywxNDYxLDI0OTcsNDM4LDE5OTAsMTMxNywzMjgzLDc1MCwyMjI2LDE3NDEsMjMzOSwxNzQsMjk4OCwxNDY3LDMyMTUsMTA0NCwyNTAwLDgwNywyNTE2LDkwNywzMzk2LDcyNSwyNjQ2LDk3LDE4OTcsNzk2LDMzMjMsMTEwMCwzMTU0LDE2MDEsMjQ0Niw0OTUsMjI0NSwxNjI5LDE5MTEsMzUyLDM0MzUsMjMxLDMxMjMsMTIwMywyMzY1LDE3NTUsMzQwNiwxNDM4LDI4MTQsMTE3LDI2NTAsMTQzOSwzNTQ1LDExMTEsMzUwNSwxMzU0LDI1MTIsMTQ3NywyNTA2LDQxOCwzMjAyLDE3MDgsMjMxNSwyMjMsMTk2Nyw1NTksMjYwMSwxMjE0LDI1NTMsMTQwOCwyODQ3LDE2MywyMjkzLDE0NjQsMTg2MSwxMjg0LDI3NTYsNTYyLDIzODIsOTc4LDM0MTcsMTU3MywzMzEyLDEzMjUsMjE0NSw1NSwyMDk3LDExMjgsMjg3NCwxNjUsMjYwOSwxMzg2LDMyMzEsNTk3LDI1MDIsMTA3LDI2NTYsMjExLDI3MzIsOTU1LDM2MjYsMTQxNSwzNTQxLDExODEsMzI1OCwzNDIsMjgzNSwxNTkxLDI0NzgsNjkxLDMwNTAsNDg0LDI2MzMsMTAwNCwyODE2LDEzNjAsMjA0OCwxMzMyLDMwMjUsODU3LDM0NzcsMTM0NCwyNTM1LDE0NDIsMjAwNCwzNjksMjc4NCwxMTM3LDMxMDgsNDUsMjg2MywxNjk3LDI4NDgsNTE4LDIxMjksMTQ4NSwzNjE4LDc2OSwyMzc1LDE3NDcsMzAxOCw1MjEsMjIzMSw3OTIsMzMwMCw5NTYsMjYzMiw3MjMsMzEyMCwxNjI1LDI4MTMsMTQ3NiwyNzEzLDE0NjgsMjIzOCwyMzYsMjIzMiwxNTkzLDIyODcsNjg5LDIxNzIsMTU3OCwyODE5LDQ3LDE4NTUsMTkzLDIwMDYsMTA0MiwyMzAyLDIxNiwyOTc4LDMyMCwzNTA2LDE2NTQsMjY2NCw5ODUsMzY4Miw0NDQsMjkwMywxMTgzLDM1MzksNDcwLDMxMjksODYxLDI1MTcsNjAsMzU4NiwxODI3LDI0NjUsMTU2NSwzNDI4LDEyMTUsMzA3NSwxNzAxLDI5MTAsMTMzNiwyOTc0LDUxNywzMzY5LDg3NywyMjc4LDE4MDksMjA0NywxNzU0LDI1ODAsNTg0LDIyOTYsNzIwLDI4MjksMTgxNCwyMjQwLDEzNDEsMzIyNCw4MzIsMjc4MiwxMDkwLDE5NjksMTcxMCwxODgxLDg0NSwyOTQ0LDg4NSwyODc5LDExMjcsMjA5OCw4MzUsMzQ3OCwzNTQsMjcxMiwxNjI0LDIyNDksNTgsMjg0NSw5MzcsMjU2MiwxODAyLDE5OTYsNDA5LDE5MzksMjA0LDMxNzAsMzc0LDMyODEsNDEzLDI5ODAsMTE3OSwyMTEzLDE5MSwyOTI3LDgyOSwyMjU0LDY3OSwyOTc2LDcxMCwxOTk5LDExNjYsMjY1OSwxNjQ2LDMzMDIsNTQ3LDMyMDQsNDg4LDM0ODUsMTY4LDMzNzEsNjQ2LDMzOTAsMTcxLDE4ODYsNzU1LDIwNjQsMjMzLDI4NjYsMTc5NywzNTIxLDg1LDM1MDgsNDQzLDIwNDIsMTI0NiwyMTE1LDExODIsMzY1NiwxNjE2LDI3NzMsNzM2LDMyMTgsMTQ4NCwyMTAxLDE1NTIsMjAxOSwxMDM4LDIwMjgsMTUzOCwzNTQ3LDQyNywyNDY2LDE3NzUsMjk3OSw2MDYsMzI2NywxNDczLDI4MjcsMTMyNywyNzYzLDg0OCwzNDA4LDE4MzAsMzE4NiwxMTU3LDI2NDUsMTI3LDM1NzYsNTcsMzI5Nyw1NDgsMTg4MywxNDYsMzQ5MiwxMzEsMjYzNiw5NzYsMzE4NCwxMTMyLDI3OTMsMjY2LDMxMDMsMTc4LDMzNDQsNzkzLDMyNTIsMTY4MiwzNTc3LDYyMSwzNjkzLDIyOSwzMjc2LDEyMDIsMzY5MCwxMzUwLDI0NTEsMTMyMywyNjc3LDE4MjAsMjYxNywxNTY3LDI0ODEsMTQ0MSwxOTQ1LDcwNiwzMDk4LDEyNjgsMzI2OCw5MjMsMTkyNiwxMTI1LDI5MjgsMzU1LDIzODcsMTQ1MiwyNDM5LDEyMzIsMzUzNiwxMzY0LDI0NTQsNjU3LDE5NzMsMTEwNiwzNjg1LDE0MjgsMjI3OSw2MzEsMjkxMiwzMDgsMjkxMSwzMzMsMzI0Niw5OCwzMDQ3LDE3MDQsMzQ2MSw1NzAsMzE0NSwxNDEsMzAzMyw4NCwyOTk2LDEzOTIsMzQ4OCwxNjk0LDI5NjIsMjYxLDIxNDIsNTkwLDM1MTksMTQ4OSwzMTQ4LDE0MDksMzExMiw0NTEsMjUxNCwxNjkwLDE5MzQsMTU1NCwyMjE3LDE2ODEsMjQwNywzOTYsMjE0MCwxNzMyLDM1MjUsOTY4LDM0MDEsNzU3LDM1NjQsNDAwLDMyNTksNzUzLDIzOTQsODEsMjMxOCwxNDkwLDIyNjAsNDU3LDIxODYsMTEyMiwzMDIyLDMzLDM0MTUsMTU2NCwyNTY4LDE4NCwzNDI2LDE1OCwyNzg2LDE1NjksMjMwMCwxNDQ4LDI0MTgsMjg3LDI1NTgsODg0LDI4MjQsMTA1MiwyOTA1LDkwLDIzMzIsMjQsMzI0NywzMTQsMzA3OCw5OTcsMjAxMCwyNjIsMzUzMSwxMjk0LDMzNTIsMTAyMiwyNzExLDk0MywzMDYxLDEzNzYsMzAxNyw0MTcsMzQ0OSwzODIsMzQzOCwxMjczLDIyNTAsMjMsMjYxNCw5NTAsMzEyNCwxNjU1LDI5MDIsMTYyMywyNDU4LDEwNjQsMzAzNywxMTYwLDMyOTMsMTQ2NSwyNjE1LDcyOSwyODE3LDE1NzAsMzE1OCw4OTksMzU5NCwxNzI0LDMyMTcsMTE1MCwyMDgzLDEwNjAsMzQ3NSw1MzgsMjA3Myw5MzUsMjMyMCwxODMxLDE4NTEsMTIxOSwyNTcxLDEzODcsMjI2NCwxNTAxLDI4NjksOTgwLDI1OTIsNjg2LDMzNTUsNjM0LDMxMTcsOTY3LDM1NjcsMzMwLDE4NDgsNjUzLDMyMDYsMTQyOSwyNDU3LDU0LDIwNzAsNjM5LDIwOTksMTI1NywyNzIyLDEwMjEsMjgxNSwxNzExLDI5ODUsNDQ3LDM0OTEsMTYyNiwyMTE2LDEzMDksMjEzNyw2MDMsMzQ3MCwxMzc1LDMxMzQsODk0LDE5ODksMTQxMCwyMzI1LDE1ODMsMjk4Nyw1LDI1ODgsOTcxLDIxNzUsMTU4NSwzNjY4LDkzOCwyMzM2LDgyLDI5NjQsMzgsMjkwOSwyMDEsMzE1MiwxMzM0LDIyNjgsOTc3LDI1MjYsMjcwLDMxODEsMTcyMCwyMTI2LDU5NiwyODgxLDEyMTIsMjUzMywxODI2LDE5MDUsMjQ5LDI3MTksMTU0OSwyMjY5LDY3MSwyMzUxLDEwNjYsMjQyNywxMzc0LDI3MDQsNzExLDM0NDMsMTQ4OCwzMzQ1LDE4MTEsMjYxMSw2ODEsMzU3OSw1NjksMzI5OSwxNTI0LDIwMDUsMTI5MCwzNTM4LDMwNywyODgzLDEzMjgsMjExNCw3NDQsMTg0OSwxODQxLDIxOTgsMzcxLDMxNzIsNzQwLDMxOTAsNjg4LDI2MjIsNDMzLDIwNzksMTYzOCwxOTM2LDg3OCwyNTA0LDM5OSwzMjEwLDE3MTYsMjM4Niw4NjUsMzI2NCwxNTM3LDIzOTYsMTE5MiwzMDczLDExNDgsMzM5Myw5NzUsMjg0MSwxMTA1LDIyODUsMTc1NiwyNTY2LDE4NDYsMzM1MSw4NjgsMzA0NiwxNjg0LDIzNTQsMTM2LDM0NjcsNzUxLDMxNjUsMTE0LDI4MDEsMTU2MCwyMDcxLDQwMywyMDYyLDEwMTMsMzM4OCw1ODksMjg0MCwyMjIsMzA0MywxNDA3LDMxOTUsMTQ4NiwyODc3LDg0MiwxOTk4LDkyMCwyMjM0LDExOSwyMzQ3LDQwMSwzNjgzLDE3MjIsMjMwMyw1NTUsMjQ2NywxMTAyLDM0MzksMTk5LDI1MDUsMTQwMSwxOTM3LDE4NywyNzI0LDUyMywzNjk0LDE0NjYsMjEyOCwzMzUsMjI4MSw4NjMsMzU1OCwxMjYzLDMzNDAsMTUzMiwzMTczLDg1OSwzNDkzLDEwOTYsMzIzNywxNzM4LDE5MTcsMTE4NiwzMDQ5LDUwMywzMDE1LDcxOCwzMDY2LDEwMDIsMzU4NCwxNjQ3LDE4NjIsOTkyLDIxNjYsMTUwNywzNjk1LDU3NSwzMzQyLDQ4NSwzMzM2LDIyOCwzMjIwLDEzNDcsMzAyNiwxNzg3LDIxOTEsNDcyLDMwNDgsMTI3MSwzNTUxLDExMzQsMjI0MywxMzk3LDM2MTEsMTE4OCwzNDU1LDEwNzcsMjU0NCw3NzcsMjAxNSwxNzkzLDIzOTMsMTEwOCwyNDgwLDEyMTMsMzI4NSwzNDcsMzU4MywzOTgsMzU3MCw5MjQsMjkxNSwzMjMsMjQ3Miw0MzEsMjc2OCwzMCwyNTY0LDU0MCwyMjg2LDEwNzYsMjE0OCw1MzksMzU0NCwxMTE1LDI2NDMsOSwyOTU4LDYzOCwxODY2LDE4MCwzNjQ2LDM2NywyNjAzLDQyNSwyOTY5LDY5OCwzMzEzLDE1ODQsMzUxNiwxMDU2LDI4MDQsMTExMCwyNTM5LDEwNTUsMzYyNSwxNjk2LDMzMTEsMTc0NCwzNjkyLDU4NiwyNTMyLDE2NywzNDA3LDE4NDcsMjcyNiwyNywyMDQ5LDE2MjEsMjQ2MSwxNjM1LDIxODEsMTMwMiwyOTcwLDMzMiwyMDkzLDM3NSwyNTgxLDE2MzcsMzU4Miw2NTYsMjEwMywzMTIsMjU3NCwzMTUsMjQzNSwyMDIsMjEyMCw3NDksMjI0OCwxNTIxLDMxNTksMTU1NywyNjE2LDYwMiwxODUyLDY3NCwyMTgzLDExMywyMzk5LDU1MiwzNDY5LDEzNzgsMjg2MiwxNzcxLDI0OTYsMTIzNCwxOTIwLDI0NCwyNTU0LDEzMTYsMzUzMCw0NzgsMjU3NywxMjUyLDI5NjEsOTMwLDM0MTgsNDAyLDMxMjUsMTI4MSwyODUwLDEwMjQsMzI2MSw5NDIsMjIwMiw0MzAsMjkyMCwxNjksMjM5MSwxMDA1LDI3NTAsNzk3LDM1NjksMTk0LDI3NTgsNTI5LDM1MzUsMTYxOCwyNzMxLDE2MSwzNDIzLDIsMjY4MywxNTYyLDI3MzAsMTA4MiwzNDIxLDMxMywyMjUxLDUyNCwyMzkwLDEyMjksMjI0MSw0NjEsMjg2OCwyNzIsMzUyMywzNDUsMjQ4OSwxNDE3LDI5MTMsNzA3LDM2NjEsMTE5MCwyMjUyLDY1OCwyNjcyLDEwNjEsMjAzNSw5OTgsMzIyNywyMjQsMjczMywxMzEwLDI0MTMsMTMxNSwxODcwLDkxMywyMTQ3LDQ0LDIxNDksMTQ5MiwzMzIxLDQ4MCwzMDQwLDE3NDMsMzQ5NSw3MzIsMjg0Miw3OTAsMjgwNywxMzYzLDI1ODQsNjgzLDIxMDcsMTY0OCwyMTU1LDEzOTMsMjQxNywxODIyLDI3NDIsMTA5OSwyMDkwLDYyMCwzMTc1LDQ2OCwyNDAzLDE0NzAsMjkzOCwxNzczLDMwNTcsNDQ1LDI4MzksOTQ0LDI1OTEsOTExLDIzMjIsMTI1LDM2MTYsNDc2LDIxNTksNjA0LDIxMTAsMzUzLDI4NTMsNTUxLDE5NDIsNDkxLDMyNzksOTYsMzMxNyw0MzksMzQ1MSw3NDYsMjI3NCwxMjY1LDIwMjEsNDMsMzM0OSwyNTIsMjUzOCwxMjU2LDI1MjIsMzAzLDIxODQsNTgxLDMzMTQsMTU3MSwyMTk1LDEyLDIyOTQsMTcyNiwyNDM2LDI5NiwyNjQ5LDEyMjQsMjQ3NCwxODMzLDI2MzAsNzE1LDMyMzQsMTAyNSwzMTU3LDczOSwxODc1LDE1MTQsMjcxOCw2MTUsMzEzNywzOTQsMjE4NSwxODQ0LDMxNDAsMTI0OSwzMTA3LDE4NiwyNjgxLDc4NiwzNDYzLDE1MDYsMjE1MiwxNTg3LDMzODQsMTU2LDMzODksMjM0LDIyMjcsNjA4LDIxMTksMjMwLDIxMTgsMzI3LDI1MTksMzI4LDMxMTUsMTI0OCwyMzUzLDEzNjksMjU2NywxMDgxLDI3NzIsNzU2LDE5MzMsODUyLDIyMjMsNjU0LDM0MDAsNzUyLDMyMzksNDM1LDIwNjAsMTI0NSwzMzU2LDU0NSwyNDUyLDkxMCwyMjUzLDY2MCwyMzQxLDE3NjgsMzAwNiwxMjA1LDMwMDEsNzc0LDMwNTQsMTQwMCwzMDY3LDEyODAsMjMzNSwxMzExLDMxODcsMzcwLDIzMzgsNTAwLDIyNDIsNDY2LDMzMDksMjQ2LDI2NjksMjkzLDI0MzAsNTQ0LDMyNzIsMTA4MCwzMzA1LDQ4MiwyOTY2LDkwOCwyNjM0LDY3MywyNjk4LDU2NSwyMjg0LDQ0OSwyNjk3LDE2MjIsMzE4NSwxNTU4LDMzNjMsMTUzMywyMjEwLDc2MywyNzgzLDc5LDIzMjYsMzI1LDMwMjEsMTY3NSwzMDI3LDg3MSwyOTYwLDM5LDIwMDcsNjI1LDM2MjcsNTY3LDI0MDAsOTUxLDM1MzIsOCwzNjA4LDEyMDcsMzY0MCw3LDIwODYsMTQzMCwzMDU2LDE2MTAsMzQxMywxNDExLDMxNzEsMjgsMTkxOCw4NTEsMzI1MywxMTAsMzU2NSwxMDMzLDMzMDYsNzI2LDI5MzQsMTYxNCwzMTAwLDE4NDMsMjIxMSw3MjIsMzEyNiwxNjUyLDMxNzYsMTE0MywyNzAzLDI3MywyMTQxLDE1NzIsMjMxNiw3OTUsMzI2MiwxNzYsMjQwOCw2NjEsMjM0NSwxMzE5LDMwOTEsNTA1LDE5MjksMTM2NSwzMDY5LDE5MiwyNTk1LDEyMjcsMjI5NywxMTQyLDI1MTEsODYsMTkwOSwxNTM1LDM1ODAsMTI2NywyNDY0LDExNiwzMTQ0LDgyNSwyMDUzLDE1ODksMzYwMywxNTkwLDI5NDksMjM5LDM0NTksMzAyLDM0MTQsMjYsMjM3NywxNjI3LDMxNzgsODkwLDI2OTIsOTgyLDMxMjEsMTc4OCwzMTY3LDk1OCwyMjk4LDQyLDIxMjIsMTA5NywzMjA3LDk4OSwyNjg2LDE3NjUsMjAzMywxMTA0LDMxNjAsODI2LDMzMjIsMzM2LDM0MjAsODYyLDIwODIsMTMwMCwxOTU2LDE2OTMsMjg5MiwxMjYwLDI4MzQsMTgwNywyNDQ4LDc4NCwyNzIxLDczMSwxODkyLDYsMjE3MCwxMjE2LDI1NTEsNDI0LDIzMjcsODIzLDE4OTEsMTU0OCwyOTM5LDE4NDIsMjQ0Miw5MzksMzYwMCwyMjcsMjgwOSwxNDI1LDMyNjYsNTcxLDI2NTcsMTY0NSwzMTgzLDQyMCwyMzM0LDU5OSwyOTQ1LDEzNTYsMjg2Nyw5MjIsMzQzMiw1OTQsMjIwMCwxNzA2LDIwMzcsNDExLDE5MTQsMTUwOSwyMTA2LDgxOSwyMjAxLDEzMDMsMzYyMSw0OTYsMjE1NywxMzM5LDE5MjMsNjIsMzQ4OSwxODE2LDMxMzgsNTk1LDE4NzksNjgsMzAyOSwyMiwyMDUwLDYyNCwzNjY3LDY0MywyMDQwLDQ5NywyODUyLDk5NCwzMDQyLDEzODEsMTg3Myw1NjMsMzQzNiw5MywyNzc5LDU3NywxOTQwLDg2NiwyNjA1LDE2MCwzNTAzLDkxNywzNjE0LDExNzQsMzQzNCwxNzUyLDI3NzQsMTQ1NiwyMjcxLDE1OTgsMjkxOSw3NzUsMjM2NCwxMzg4LDIyMTIsNDUyLDMxMTYsMTc3NCwzMjMwLDExMTIsMjgxMSwxNTY2LDE5ODgsMTQ3NCwzMzQzLDE0MCwyODQ0LDIyNSwzMDM2LDcwMywyODg4LDM3OSwyMTg3LDY3MiwyNTUyLDEzNzAsMjU0OSwxMzMwLDM1OTYsMTc2OSwyNzY0LDEwNzIsMzAyNCwzODksMjc5Miw2MjMsMzIzOCwxNTM0LDM0MDQsMTk3LDIwMTcsMTE0NSwxOTEwLDk2MywyMTk5LDczOCwyMDAxLDUyOCwzMzE4LDE3MTMsMjYxMCwxNTI1LDM2NjYsMTcwNywyNTYxLDE3MzYsMzIwOCw2NDcsMjk3NSwxNjY5LDI2MDgsODk2LDIwMjIsNDEyLDMwMzQsNjM1LDIwODAsNDQ4LDM0MDksMTY2MywxOTEyLDMxMCwyOTkwLDg4NywyNTM2LDk0NywyNjA0LDE1MjMsMzA1OSwzMjQsMzU1Miw0NTUsMzA2OCw3ODMsMjA0MywxMDQ4LDMzMDcsMjg5LDI5MDYsNjIyLDI0NjMsMTAzMSwzNTUwLDgzOSwyMTM2LDE3ODMsMzE0NiwxMjQwLDMxMTAsODI3LDIyMDYsNTkxLDIzNTgsMjM3LDIyNzUsNTY0LDIxMDIsMjE3LDMzODcsNzUsMzQyOSwxODMyLDMxOTEsMTE5NywzMDYzLDE4OSwxOTg1LDExMTksMjAzMSwyMDUsMzA4MywzNjQsMzU0Miw3MDgsMjQ3MCw3ODksMzM2OCw2NjcsMzEzNSw5OSwyOTg2LDE1MjYsMjYwMCwxMzA4LDI0MzcsODUzLDE4NTgsMTA0LDI5NjgsNDE5LDE5NTcsNzgwLDI0MjAsODQwLDE4OTAsNzEzLDM1NTQsNjMzLDM2NzcsNjg0LDIzNTcsMTI1OCwyNTI5LDkwNSwzMzE2LDE2MTcsMjcyOSwxNzQ1LDE5NTIsMTM5MCwzNTY4LDE2MDQsMjE4MCw4NDMsMjA2NywxNzY0LDI1NTUsMzU5LDI3NDQsOTc0LDI0NjksMTAyNiwyNzA2LDUzLDI5NTEsNTg3LDM0MjUsMTI5NywzMDgwLDQwNCwxOTMwLDE0ODIsMzAwOSwxNDY5LDI2MDcsNzc2LDM2MzIsOTI2LDI3OTksNzg1LDI3MzYsOTg3LDI3MjAsMTYyLDM0NzEsMTQ1MSwyODk4LDEyMDYsMjc2OSw4NzAsMjg3MCwxNjU2LDMyODksNDUzLDI3NTEsODgxLDMyODIsMzYwLDMzNTAsMTI4NiwyMzIzLDc3MSwxODU3LDYzMiwyNzg5LDk2NSwzNjQ0LDY1OSwyMTkyLDEzMjAsMzI1NywyMCwzMzg1LDExMzMsMjk0NiwxMjgsMzM5MSwxNjk4LDMyNzQsODMzLDMyOTUsNTgyLDIwMDksMTE2MywyNjM1LDY0MSwzNDk4LDE2MzQsMzA2NSwxMzk1LDI5NTcsMTc4MSwyNzA1LDEzNDUsMjA0NSwxOTAsMzUyNiw5MSwzNTM0LDU4MywxODYwLDIxMiwzNTUzLDE0OTQsMjE2OSwyNzYsMTk2NCw5ODEsMzU3OCw1NjgsMzQxMiwxNDUzLDI2MjMsNzI4LDMyMTIsMTE1OSwyMDU4LDkzMiwzMjE2LDI3OCwzNDg3LDE2NjAsMjU0MywxNjQ0LDI1NDcsMzk3LDM0NzQsNzMwLDI2MzcsNjUwLDMzMzUsMjkxLDI5NTQsMTAxNywyNjYzLDUzMCwyMTYyLDEwMCwyNDk0LDE2OTUsMjc0MSw1ODAsMzM2NCwxMTM2LDMxNjQsMCwxOTQ2LDEyNjEsMzExMSw5NjYsMjEwMCwyMDgsMjE5NiwxMzkxLDIwMjYsMTczNSwyMDI0LDEyMTAsMzIzMyw5NTIsMjQ1NSw2MTAsMjU0MSwyNzEsMjg5MSw3MTIsMjIzOSw5MzQsMzU5Miw0MzcsMzE1Niw3MDksMjQ4NCw2MSwyMDc0LDI3NCwyMDUxLDEyMSwzNDgxLDU2NiwzMjg2LDExMjMsMjg2MCwxNTEwLDI0MjEsMTgyOSwxOTk3LDE0NjMsMzAxMiwxNzM5LDMxMzEsMjg1LDMyOTYsOTQxLDI3NDgsMTgyMywzMjIyLDE3MDMsMTk4MSwyMDcsMjI3MCw5MTYsMTk4Miw2NCwyMTA5LDY5NSwzMDkyLDExNTgsMzY3MSwxNTIwLDI0MDYsMzU2LDMzODIsODQ0LDE5MDEsMTY3NiwxOTg3LDE4MTgsMjEzMiw1MDQsMjAwMywxODQwLDI3MzUsNDI2LDIyMjEsNzU5LDI0NzcsNjI3LDI2MjEsOTE5LDIyNTUsMTA4NywzNjU0LDYxNiwyMDAyLDIxNCwzMjM1LDkwMSwyNTU5LDgxNywyMjU2LDEwLDI1MTAsMTE1NSwzNjIyLDYwNSwyMzk1LDY1NSwzMjk0LDE3NTksMzMzMSwxNDIsMjEzMywxNTQsMjA1OSw4ODIsMjIxNSw4MDYsMjc2NSw1ODgsMzY1MCwxNTQ0LDIxNTEsNDIzLDMzMjYsMzg4LDMxNTEsMTI1NSwzNjIwLDE3ODksMTkyMSwxNzkyLDI0MzQsODAzLDI4NDksMTY4NiwyOTcyLDEwMiwyMjE0LDMwNCwyMjg4LDcyLDE5NDgsMTE0NiwyMDY1LDE0NzUsMzAwMywxMzM4LDIwMTgsMjU3LDE4NjcsOTYyLDI0MjksMTE3MCwyMjE5LDE1NzcsMTk3NCw1NTcsMzQ0MSwxMDg4LDIwNTIsNTQxLDE5NzksMTYwNSwyNDMyLDE1NywzNTU2LDE1MTksMjMxNywxNTQyLDI0NTMsMTc3OCwyOTMzLDcyMSwyMzQzLDEwNTksMjcxNiwxNzgyLDMwMDUsMTgwOCwyNzIzLDE1MjcsMjg1NiwxNzY3LDI4MjUsMTQ5MSwyMzQwLDQ5NCwxOTQxLDE5OCwzMzU0LDc0MywzMDE0LDE4MDAsMjUxMywxMjIxLDI4OTYsMTQ3OCwyMjA3LDE3NjYsMzYxOSwxMTcyLDMwODEsMTQ3MSwyMDc3LDgwMiwzNTEyLDE2NTAsMjM3Myw5NDksMzMwOCwzMzQsMjA0Niw5MjEsMjIzNyw4OTcsMzE2MSwxNzUxLDI5NzEsMTA3MSwzMzY1LDgwMSwzNTI5LDcyNywzMDA4LDY1LDM0NDQsMTYxMSwyMjg5LDI1LDMyMjYsMTMzMSwzMzgzLDUxMSwyMDMyLDg4OCwyMjY2LDg1NiwyMzYyLDE3MDAsMzAwNCw1NDIsMjkzNywxNzgwLDMwNzQsMTAwMywyNDMzLDE3NDksMjgzOCwzODUsMjg2NSwyNjgsMjAxMywxMTYyLDMxNjIsNjI4LDM2NDksNDE0LDI4NTksMzYsMjAyNSwxMDksMjUyMCw2OTcsMjI1OCwxNjg5LDM2MzAsOTA0LDMwNzksMTQyNywyNDI4XTtcbiIsIi8qanNsaW50IG5vZGU6IHRydWUgLCBicm93c2VyOiB0cnVlICovXG4vKmdsb2JhbCB3aW5kb3cgKi9cblwidXNlIHN0cmljdFwiO1xuXG52YXIgY2lyYyA9IHJlcXVpcmUoJy4vY2lyYycpO1xuXG5mdW5jdGlvbiBQcmVkaWN0b3IoYU5DaGFuZWxzLCBhTkZyYW1lcywgYVBlcm0sIGFEZXN0aW5hdGlvbikge1xuXG5cdHZhciBzZWxmPXRoaXM7XG5cblxuXHQvLyBUaGUgZXhjZWwgZXN0aW1hdG9yX21hcFxuXHQvLyBUaGlzIGNhbGN1bGF0ZSBhbiBMTFIgKFRoZSBpbmRleCkgZ2l2ZW4gYSBlcnJvcl4yXG5cblx0c2VsZi5wcl9hcnIgPSBbICAxLjA5OTA1NDY2OSwwLjQwOTExOTAwNywwLjIwNTk1MDkzNywwLjEyNzIxOTQ5NSwwLjA4OTMyNTcyMywwLjA2Nzk5Mzg4NCwwLjA1NDU4MDczMywwLjA0NTQ1Mzk3Nixcblx0XHRcdDAuMDM4ODc0Njc3LDAuMDMzOTIxMTAyLDAuMDMwMDYzOTYzLDAuMDI2OTc5MzM5LDAuMDI0NDU4NTQ0LDAuMDIyMzYxMzU1LDAuMDIwNTkwMjAxLDAuMDE5MDc1MTcxLFxuXHRcdFx0MC4wMTc3NjQ4OTYsMC4wMTY2MjA4MTEsMC4wMTU2MTM0MTYsMC4wMTQ3MTk3NjYsMC4wMTM5MjE3NTgsMC4wMTMyMDQ5MTgsMC4wMTI1NTc1MzgsMC4wMTE5NzAwNTIsXG5cdFx0XHQwLjAxMTQzNDU2NCwwLjAxMDk0NDUwMiwwLjAxMDQ5NDM1MywwLjAxMDA3OTQ1NywwLjAwOTY5NTg1MiwwLjAwOTM0MDE0MywwLjAwOTAwOTQwOSwwLjAwODcwMTEyMixcblx0XHRcdDAuMDA4NDEzMDgyLDAuMDA4MTQzMzY2LDAuMDA3ODkwMjg5LDAuMDA3NjUyMzYyLDAuMDA3NDI4MjcwLDAuMDA3MjE2ODQ3LDAuMDA3MDE3MDUxLDAuMDA2ODI3OTUyLFxuXHRcdFx0MC4wMDY2NDg3MTgsMC4wMDY0Nzg1OTgsMC4wMDYzMTY5MTgsMC4wMDYxNjMwNjYsMC4wMDYwMTY0OTAsMC4wMDU4NzY2ODcsMC4wMDU3NDMyMDAsMC4wMDU2MTU2MTIsXG5cdFx0XHQwLjAwNTQ5MzU0MSwwLjAwNTM3NjYzOCwwLjAwNTI2NDU4MywwLjAwNTE1NzA4MiwwLjAwNTA1Mzg2MiwwLjAwNDk1NDY3NSwwLjAwNDg1OTI4OSwwLjAwNDc2NzQ5MCxcblx0XHRcdDAuMDA0Njc5MDgwLDAuMDA0NTkzODc2LDAuMDA0NTExNzA2LDAuMDA0NDMyNDEyLDAuMDA0MzU1ODQ2LDAuMDA0MjgxODcwLDAuMDA0MjEwMzU0LDAuMDA0MTQxMTc5LFxuXHRcdFx0MC4wMDQwNzQyMzIsMC4wMDQwMDk0MDcsMC4wMDM5NDY2MDUsMC4wMDM4ODU3MzIsMC4wMDM4MjY3MDMsMC4wMDM3Njk0MzMsMC4wMDM3MTM4NDcsMC4wMDM2NTk4NzAsXG5cdFx0XHQwLjAwMzYwNzQzNSwwLjAwMzU1NjQ3NiwwLjAwMzUwNjkzMiwwLjAwMzQ1ODc0NSwwLjAwMzQxMTg2MCwwLjAwMzM2NjIyNSwwLjAwMzMyMTc5MCwwLjAwMzI3ODUxMCxcblx0XHRcdDAuMDAzMjM2MzQwLDAuMDAzMTk1MjM4LDAuMDAzMTU1MTYzLDAuMDAzMTE2MDc4LDAuMDAzMDc3OTQ3LDAuMDAzMDQwNzM1LDAuMDAzMDA0NDEwLDAuMDAyOTY4OTM5LFxuXHRcdFx0MC4wMDI5MzQyOTUsMC4wMDI5MDA0NDcsMC4wMDI4NjczNjksMC4wMDI4MzUwMzUsMC4wMDI4MDM0MjAsMC4wMDI3NzI1MDEsMC4wMDI3NDIyNTQsMC4wMDI3MTI2NTgsXG5cdFx0XHQwLjAwMjY4MzY5MywwLjAwMjY1NTMzOSwwLjAwMjYyNzU3NSwwLjAwMjYwMDM4NSwwLjAwMjU3Mzc1MSwwLjAwMjU0NzY1NSwwLjAwMjUyMjA4MiwwLjAwMjQ5NzAxNixcblx0XHRcdDAuMDAyNDcyNDQyLDAuMDAyNDQ4MzQ1LDAuMDAyNDI0NzEzLDAuMDAyNDAxNTMyLDAuMDAyMzc4Nzg5LDAuMDAyMzU2NDcxLDAuMDAyMzM0NTY4LDAuMDAyMzEzMDY3LFxuXHRcdFx0MC4wMDIyOTE5NTcsMC4wMDIyNzEyMjksMC4wMDIyNTA4NzEsMC4wMDIyMzA4NzQsMC4wMDIyMTEyMjksMC4wMDIxOTE5MjYsMC4wMDIxNzI5NTYsMC4wMDIxNTQzMTEsXG5cdFx0XHQwLjAwMjEzNTk4MywwLjAwMjExNzk2MywwLjAwMjEwMDI0NCwwLjAwMjA4MjgxOSwwLjAwMjA2NTY4MCwwLjAwMjA0ODgyMCwwLjAwMjAzMjIzMiwwLjAwMjAxNTkxMCxcblx0XHRcdDAuMDAxOTk5ODQ4LDAuMDAxOTg0MDQwLDAuMDAxOTY4NDc5LDAuMDAxOTUzMTU5LDAuMDAxOTM4MDc2LDAuMDAxOTIzMjIzLDAuMDAxOTA4NTk2LDAuMDAxODk0MTkwLFxuXHRcdFx0MC4wMDE4Nzk5OTksMC4wMDE4NjYwMTgsMC4wMDE4NTIyNDQsMC4wMDE4Mzg2NzEsMC4wMDE4MjUyOTUsMC4wMDE4MTIxMTIsMC4wMDE3OTkxMTgsMC4wMDE3ODYzMDgsXG5cdFx0XHQwLjAwMTc3MzY4MCwwLjAwMTc2MTIyOCwwLjAwMTc0ODk1MCwwLjAwMTczNjg0MSwwLjAwMTcyNDg5OCwwLjAwMTcxMzExOSwwLjAwMTcwMTQ5OSwwLjAwMTY5MDAzNSxcblx0XHRcdDAuMDAxNjc4NzI0LDAuMDAxNjY3NTY0LDAuMDAxNjU2NTUxLDAuMDAxNjQ1NjgyLDAuMDAxNjM0OTU0LDAuMDAxNjI0MzY2LDAuMDAxNjEzOTEzLDAuMDAxNjAzNTk0LFxuXHRcdFx0MC4wMDE1OTM0MDUsMC4wMDE1ODMzNDUsMC4wMDE1NzM0MTIsMC4wMDE1NjM2MDEsMC4wMDE1NTM5MTMsMC4wMDE1NDQzNDMsMC4wMDE1MzQ4OTAsMC4wMDE1MjU1NTMsXG5cdFx0XHQwLjAwMTUxNjMyNywwLjAwMTUwNzIxMywwLjAwMTQ5ODIwOCwwLjAwMTQ4OTMwOSwwLjAwMTQ4MDUxNSwwLjAwMTQ3MTgyNCwwLjAwMTQ2MzIzNSwwLjAwMTQ1NDc0NSxcblx0XHRcdDAuMDAxNDQ2MzUzLDAuMDAxNDM4MDU3LDAuMDAxNDI5ODU1LDAuMDAxNDIxNzQ3LDAuMDAxNDEzNzMwLDAuMDAxNDA1ODAyLDAuMDAxMzk3OTYzLDAuMDAxMzkwMjExLFxuXHRcdFx0MC4wMDEzODI1NDQsMC4wMDEzNzQ5NjEsMC4wMDEzNjc0NjAsMC4wMDEzNjAwNDEsMC4wMDEzNTI3MDIsMC4wMDEzNDU0NDIsMC4wMDEzMzgyNTksMC4wMDEzMzExNTIsXG5cdFx0XHQwLjAwMTMyNDEyMCwwLjAwMTMxNzE2MiwwLjAwMTMxMDI3NywwLjAwMTMwMzQ2MywwLjAwMTI5NjcxOSwwLjAwMTI5MDA0NSwwLjAwMTI4MzQzOSwwLjAwMTI3NjkwMSxcblx0XHRcdDAuMDAxMjcwNDI4LDAuMDAxMjY0MDIxLDAuMDAxMjU3Njc4LDAuMDAxMjUxMzk4LDAuMDAxMjQ1MTgxLDAuMDAxMjM5MDI1LDAuMDAxMjMyOTI5LDAuMDAxMjI2ODkzLFxuXHRcdFx0MC4wMDEyMjA5MTYsMC4wMDEyMTQ5OTcsMC4wMDEyMDkxMzUsMC4wMDEyMDMzMjksMC4wMDExOTc1NzgsMC4wMDExOTE4ODIsMC4wMDExODYyNDAsMC4wMDExODA2NTEsXG5cdFx0XHQwLjAwMTE3NTExNCwwLjAwMTE2OTYyOSwwLjAwMTE2NDE5NSwwLjAwMTE1ODgxMSwwLjAwMTE1MzQ3NywwLjAwMTE0ODE5MSwwLjAwMTE0Mjk1NCwwLjAwMTEzNzc2NCxcblx0XHRcdDAuMDAxMTMyNjIxLDAuMDAxMTI3NTI0LDAuMDAxMTIyNDczLDAuMDAxMTE3NDY3LDAuMDAxMTEyNTA1LDAuMDAxMTA3NTg4LDAuMDAxMTAyNzEzLDAuMDAxMDk3ODgxLFxuXHRcdFx0MC4wMDEwOTMwOTEsMC4wMDEwODgzNDMsMC4wMDEwODM2MzUsMC4wMDEwNzg5NjksMC4wMDEwNzQzNDIsMC4wMDEwNjk3NTQsMC4wMDEwNjUyMDYsMC4wMDEwNjA2OTYsXG5cdFx0XHQwLjAwMTA1NjIyNCwwLjAwMTA1MTc5MCwwLjAwMTA0NzM5MywwLjAwMTA0MzAzMiwwLjAwMTAzODcwNywwLjAwMTAzNDQxOCwwLjAwMTAzMDE2NCwwLjAwMTAyNTk0NSxcblx0XHRcdDAuMDAxMDIxNzYxLDAuMDAxMDE3NjEwLDAuMDAxMDEzNDkzLDAuMDAxMDA5NDA5LDAuMDAxMDA1MzU4LDAuMDAxMDAxMzM5LDAuMDAwOTk3MzUzLDAuMDAwOTkzMzk3XTtcblxuXG5cdHNlbGYuZXJyMmxsciA9IGZ1bmN0aW9uKGVycikge1xuXHRcdHZhciBsbHI9MDtcblx0XHRmb3IgKHZhciBiPTB4ODA7IGI+MDsgYiA9IGIgPj4gMSkge1xuXHRcdFx0aWYgKGVyciA8IHNlbGYucHJfYXJyW2xsciB8IGIgXSkge1xuXHRcdFx0XHRsbHIgPSBsbHIgfCBiO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbGxyO1xuXHR9O1xuXG5cblxuXG5cblx0c2VsZi5wZXJtPWFQZXJtO1xuXHRzZWxmLm5DaGFuZWxzID0gYU5DaGFuZWxzO1xuXHRzZWxmLm5GcmFtZXMgPSBhTkZyYW1lcztcblx0c2VsZi5kZXN0aW5hdGlvbiA9IGFEZXN0aW5hdGlvbjtcblx0c2VsZi5uU3luY0JpdHMgPSBNYXRoLmZsb29yKGFORnJhbWVzICogYU5DaGFuZWxzIC8gMiArIDAuNSk7XG5cblx0c2VsZi5lc3RpbWF0ZSA9IGZ1bmN0aW9uKGluQiwgcCkge1xuXHRcdHZhciBwcCxiYiwgbCwgYXJnLCByZXM7XG5cblx0XHR2YXIgZXJyPTA7XG5cdFx0dmFyIG5lcnI9MDtcblx0XHR2YXIgZXJyMj0wO1xuXHRcdHZhciBuZXJyMj0wO1xuXHRcdHZhciBlO1xuXHRcdHZhciBmciA9IE1hdGguZmxvb3IocCAvIHNlbGYubkNoYW5lbHMpO1xuXHRcdHZhciBjaCA9IHAgJSBzZWxmLm5DaGFuZWxzO1xuXG5cdFx0aWYgKGZyPjApIHtcblx0XHRcdHBwID0gcCAtIHNlbGYubkNoYW5lbHM7XG5cdFx0XHRiYiA9IHNlbGYucGVybS5pQ29udmVydFtwcF07XG5cdFx0XHRsID0gKGJiICYgMSkgPyAwLjUgOiAwO1xuXHRcdFx0ZSA9IGNpcmMuZXJyKGluQltwcF0sIGwpO1xuXHRcdFx0ZXJyICs9IGU7XG5cdFx0XHRuZXJyICsrO1xuXHRcdFx0ZXJyMiArPSBlKmU7XG5cdFx0XHRuZXJyMiArKztcblx0XHR9XG5cdFx0aWYgKGZyPHNlbGYubkZyYW1lcy0xKSB7XG5cdFx0XHRwcCA9IHAgKyBzZWxmLm5DaGFuZWxzO1xuXHRcdFx0YmIgPSBzZWxmLnBlcm0uaUNvbnZlcnRbcHBdO1xuXHRcdFx0bCA9IChiYiAmIDEpID8gMC41IDogMDtcblx0XHRcdGUgPSBjaXJjLmVycihpbkJbcHBdLCBsKTtcblx0XHRcdGVyciArPSBlO1xuXHRcdFx0bmVyciArKztcblx0XHRcdGVycjIgKz0gZSplO1xuXHRcdFx0bmVycjIgKys7XG5cdFx0fVxuXHRcdGlmIChjaCA+MCkge1xuXHRcdFx0cHAgPSBwIC0xO1xuXHRcdFx0YmIgPSBzZWxmLnBlcm0uaUNvbnZlcnRbcHBdO1xuXHRcdFx0bCA9IChiYiAmIDEpID8gMC41IDogMDtcblx0XHRcdGUgPSBjaXJjLmVycihpbkJbcHBdLCBsKTtcblx0XHRcdGVycjIgKz0gZSplO1xuXHRcdFx0bmVycjIgKys7XG5cdFx0fVxuXHRcdGlmIChjaCA8IHNlbGYubkNoYW5lbHMtMSkge1xuXHRcdFx0cHAgPSBwICsxO1xuXHRcdFx0YmIgPSBzZWxmLnBlcm0uaUNvbnZlcnRbcHBdO1xuXHRcdFx0bCA9IChiYiAmIDEpID8gMC41IDogMDtcblx0XHRcdGUgPSBjaXJjLmVycihpbkJbcHBdLCBsKTtcblx0XHRcdGVycjIgKz0gZSplO1xuXHRcdFx0bmVycjIgKys7XG5cdFx0fVxuXG5cdFx0ZXJyID0gZXJyIC9uZXJyO1xuXHRcdGFyZyA9IGNpcmMubm9ybShpbkJbcF0gLSBlcnIpO1xuXHRcdHJlcyA9IDQqTWF0aC5hYnMoYXJnLTAuNSkgLTE7XG5cblx0XHRlID0gMSAtIE1hdGguYWJzKHJlcyk7XG5cdFx0ZXJyMiArPSBlKmU7XG5cdFx0bmVycjIgKys7XG5cblx0XHRyZXMgPSByZXM+MCA/IDEgOiAtMTtcblxuXHRcdGJiID0gc2VsZi5wZXJtLmlDb252ZXJ0W3BdO1xuXHRcdGlmIChiYiAmIDEpIHJlcyA9IC1yZXM7XG5cbi8vXHRcdGVycjIgPSBlcnIyIC8gbmVycjI7XG5cblx0XHRyZXMgPSByZXMgKiBzZWxmLmVycjJsbHIoIGVycjIpICogNjQ7XG5cblx0XHRyZXR1cm4gcmVzO1xuXG5cdH07XG5cblx0c2VsZi5wcm9jZXNzRGF0YT0gZnVuY3Rpb24oaW5CKSB7XG5cdFx0dmFyIGk7XG5cdFx0dmFyIG91dEIgPSBbXTtcblx0XHRmb3IgKGkgPSBzZWxmLm5TeW5jQml0czsgaSA8IHNlbGYubkNoYW5lbHMgKiBzZWxmLm5GcmFtZXM7ICBpKyspIHtcblxuXHRcdFx0b3V0Qi5wdXNoKCBzZWxmLmVzdGltYXRlKGluQiwgc2VsZi5wZXJtLmNvbnZlcnRbaV0pKTtcblx0XHR9XG5cblx0XHRzZWxmLmRlc3RpbmF0aW9uLnByb2Nlc3NEYXRhKG91dEIpO1xuXHR9O1xuXG5cdHJldHVybiBzZWxmO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFByZWRpY3RvcjtcbiIsIi8qanNsaW50IG5vZGU6IHRydWUgLCBicm93c2VyOiB0cnVlICovXG4vKmdsb2JhbCB3aW5kb3cgKi9cblwidXNlIHN0cmljdFwiO1xuXG5yZXF1aXJlKFwiLi4vc2VlZHJhbmRvbS9zZWVkcmFuZG9tLmpzXCIpO1xudmFyIHBlcm1kYXRhPXJlcXVpcmUoJy4vcGVybWRhdGEuanMnKTtcblxuZnVuY3Rpb24gUmFuZG9tUGVybShMKSB7XG5cblx0aWYgKEw9PT0zNjk2KSB7XG5cdFx0dGhpcy5jb252ZXJ0PXBlcm1kYXRhLmNvbnZlcnQzNjk2O1xuXHRcdHRoaXMuaUNvbnZlcnQ9cGVybWRhdGEuaUNvbnZlcnQzNjk2O1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHZhciBOTSA9MDtcblx0dmFyIE1BU0sgPTA7XG5cdGZ1bmN0aW9uIHJhbmRvbWl6ZXIoaSwgTSwgaW52KSB7XG5cdFx0dmFyIHIsIHg7XG5cdFx0aWYgKCFOTSkge1xuXHRcdFx0eD1NLTE7XG5cdFx0XHR3aGlsZSAoeCkge1xuXHRcdFx0XHR4ID4+PSAxO1xuXHRcdFx0XHROTSArPTE7XG5cdFx0XHRcdE1BU0sgPSAoTUFTSyA8PCAxKSB8IDE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gcm90TChhLCBuKSB7XG5cdFx0XHR2YXIgYXV4ID0gYSB8IChhPDxOTSk7XG5cdFx0XHRhdXggPj49IE5NLW47XG5cdFx0XHRhdXggJj0gTUFTSztcblx0XHRcdHJldHVybiBhdXg7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gcm90UihhLCBuKSB7XG5cdFx0XHR2YXIgYXV4ID0gYSB8IChhPDxOTSk7XG5cdFx0XHRhdXggPj49IG47XG5cdFx0XHRhdXggJj0gTUFTSztcblx0XHRcdHJldHVybiBhdXg7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZW5jKGF1eCkge1xuXHRcdFx0dmFyIGksIE09MHgyQTMyO1xuXHRcdFx0Zm9yIChpPTA7IGk8Tk0vMzsgaSsrKSB7XG5cdFx0XHRcdGF1eCA9IChhdXggXk0pICYgTUFTSztcblx0XHRcdFx0YXV4PXJvdFIoYXV4LDEpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGF1eDtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBkZWMoYXV4KSB7XG5cdFx0XHR2YXIgaSwgTT0weDJBMzI7XG5cdFx0XHRmb3IgKGk9MDsgaTxOTS8zOyBpKyspIHtcblx0XHRcdFx0YXV4PXJvdEwoYXV4LDEpO1xuXHRcdFx0XHRhdXggPSAoYXV4IF5NKSAmIE1BU0s7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYXV4O1xuXHRcdH1cblxuXHRcdGlmIChpbnYpIHtcblx0XHRcdHggPSBkZWMoaSk7XG5cdFx0XHR3aGlsZSAoeD49TSkgeD1kZWMoeC0xKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0eCA9IGVuYyhpKTtcblx0XHRcdHdoaWxlICh4Pj1NKSB4PWVuYyh4KTtcblx0XHR9XG5cblx0XHRyZXR1cm4geDtcblxuXHR9XG5cblxuXHR0aGlzLmNvbnZlcnQgPSBbXTtcblx0dGhpcy5pQ29udmVydCA9IFtdO1xuXG5cblx0TWF0aC5zZWVkcmFuZG9tKCdoZWxsby4nKTtcblx0dmFyIHI7XG5cblx0dmFyIExIYWxmID0gTWF0aC5mbG9vcihMLzIgKyAwLjUpO1xuXG5cdHZhciByZW1haW5pbmc9W107XG5cdHZhciBpO1xuXHRmb3IgKGk9MDtpPExIYWxmO2krKykge1xuXHRcdHJlbWFpbmluZ1tpXT1pKjI7XG5cdH1cblx0Zm9yIChpPTA7aTxMSGFsZjtpKyspIHtcblx0XHRyPU1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChMSGFsZi1pKSApO1xuXHRcdHRoaXMuY29udmVydFtpXSA9IHJlbWFpbmluZ1tyXTtcblx0XHRyZW1haW5pbmdbcl09IHJlbWFpbmluZ1tMSGFsZi1pLTFdO1xuXHRcdHRoaXMuaUNvbnZlcnRbdGhpcy5jb252ZXJ0W2ldXSA9IGk7XG5cdH1cblx0Zm9yIChpPTA7aTxMLUxIYWxmO2krKykge1xuXHRcdHJlbWFpbmluZ1tpXT1pKjIrMTtcblx0fVxuXHRmb3IgKGk9MDtpPCBMIC1MSGFsZjtpKyspIHtcblx0XHRyPU1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChMIC1MSGFsZi1pKSApO1xuXHRcdHRoaXMuY29udmVydFsgTEhhbGYgKyBpIF0gPSByZW1haW5pbmdbcl07XG5cdFx0cmVtYWluaW5nW3JdPSByZW1haW5pbmdbIEwtTEhhbGYgLWkgLTEgXTtcblx0XHR0aGlzLmlDb252ZXJ0W3RoaXMuY29udmVydFsgTEhhbGYgKyBpIF1dID0gTEhhbGYgKyBpO1xuXHR9XG5cblxuLypcblx0Zm9yIChpPTA7aTxMO2krKykge1xuXHRcdHRoaXMuY29udmVydFtpXT1yYW5kb21pemVyKGksIEwpO1xuXHRcdHRoaXMuaUNvbnZlcnRbdGhpcy5jb252ZXJ0W2ldXSA9IGk7XG5cdH1cbiovXG5cblx0Y29uc29sZS5sb2codGhpcy5jb252ZXJ0KTtcblx0Y29uc29sZS5sb2codGhpcy5pQ29udmVydCk7XG5cblx0cmV0dXJuIHRoaXM7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gUmFuZG9tUGVybTtcbiIsIi8qanNsaW50IG5vZGU6IHRydWUgLCBicm93c2VyOiB0cnVlICovXG4vKmdsb2JhbCB3aW5kb3cgKi9cblwidXNlIHN0cmljdFwiO1xuXG5cblxuZnVuY3Rpb24gY3JlYXRlU291bmRQbGF5ZXIoY2IpIHtcblxuICAgIGlmICh3aW5kb3cudm9jb1NvdW5kRHJpdmVyKSB7XG4gICAgICAgIHJldHVybiBjYihudWxsLCB3aW5kb3cudm9jb1NvdW5kRHJpdmVyKTtcbiAgICB9XG5cbiAgICB2YXIgc3AgPSB7fTtcblxuICAgIHZhciBjb250ZXh0O1xuICAgIHRyeSB7XG4gICAgICAgIC8vIEZpeCB1cCBmb3IgcHJlZml4aW5nXG4gICAgICAgIHdpbmRvdy5BdWRpb0NvbnRleHQgPSB3aW5kb3cuQXVkaW9Db250ZXh0fHx3aW5kb3cud2Via2l0QXVkaW9Db250ZXh0O1xuICAgICAgICBjb250ZXh0ID0gbmV3IHdpbmRvdy5BdWRpb0NvbnRleHQoKTtcbiAgICB9XG4gICAgY2F0Y2goZSkge1xuICAgICAgICBjb25zb2xlLmxvZygnV2ViIEF1ZGlvIEFQSSBpcyBub3Qgc3VwcG9ydGVkIGluIHRoaXMgYnJvd3NlcicgKyBlKTtcbiAgICAgICAgY2IobmV3IEVycm9yKCdXZWIgQXVkaW8gQVBJIGlzIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBicm93c2VyJykpO1xuICAgIH1cblxuXG4gICAgc3AucHJvY2Vzc0RhdGEgPSBmdW5jdGlvbihpbkJ1ZmYpIHtcbiAgICAgICAgdmFyIGJ1ZmYgPSBjb250ZXh0LmNyZWF0ZUJ1ZmZlcigyLCBpbkJ1ZmYubGVuZ3RoLCA0NDEwMCk7XG4gICAgICAgIHZhciBvdXRMID0gYnVmZi5nZXRDaGFubmVsRGF0YSgwKTtcbiAgICAgICAgdmFyIGk7XG4gICAgICAgIGZvciAoaT0wOyBpPGluQnVmZi5sZW5ndGg7IGkrPTEpIHtcbiAgICAgICAgICAgIG91dExbaV0gPSBpbkJ1ZmZbaV07XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc291cmNlID0gY29udGV4dC5jcmVhdGVCdWZmZXJTb3VyY2UoKTtcbiAgICAgICAgc291cmNlLmJ1ZmZlciA9IGJ1ZmY7XG4gICAgICAgIHNvdXJjZS5jb25uZWN0KGNvbnRleHQuZGVzdGluYXRpb24pO1xuICAgICAgICBzb3VyY2Uuc3RhcnQoMCk7XG4gICAgfTtcblxuICAgIHZhciBoaWRkZW4sIHZpc2liaWxpdHlDaGFuZ2U7XG4gICAgaWYgKHR5cGVvZiBkb2N1bWVudC5oaWRkZW4gIT09IFwidW5kZWZpbmVkXCIpIHsgLy8gT3BlcmEgMTIuMTAgYW5kIEZpcmVmb3ggMTggYW5kIGxhdGVyIHN1cHBvcnRcbiAgICAgIGhpZGRlbiA9IFwiaGlkZGVuXCI7XG4gICAgICB2aXNpYmlsaXR5Q2hhbmdlID0gXCJ2aXNpYmlsaXR5Y2hhbmdlXCI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZG9jdW1lbnQubW96SGlkZGVuICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICBoaWRkZW4gPSBcIm1vekhpZGRlblwiO1xuICAgICAgdmlzaWJpbGl0eUNoYW5nZSA9IFwibW96dmlzaWJpbGl0eWNoYW5nZVwiO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRvY3VtZW50Lm1zSGlkZGVuICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICBoaWRkZW4gPSBcIm1zSGlkZGVuXCI7XG4gICAgICB2aXNpYmlsaXR5Q2hhbmdlID0gXCJtc3Zpc2liaWxpdHljaGFuZ2VcIjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkb2N1bWVudC53ZWJraXRIaWRkZW4gIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIGhpZGRlbiA9IFwid2Via2l0SGlkZGVuXCI7XG4gICAgICB2aXNpYmlsaXR5Q2hhbmdlID0gXCJ3ZWJraXR2aXNpYmlsaXR5Y2hhbmdlXCI7XG4gICAgfVxuXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcih2aXNpYmlsaXR5Q2hhbmdlLCBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKGRvY3VtZW50W2hpZGRlbl0pIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwib25CbHVyVHhcIik7XG4gICAgICAgICAgICBjb250ZXh0LnN1c3BlbmQoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwib25Gb2N1c1R4XCIpO1xuICAgICAgICAgICAgY29udGV4dC5yZXN1bWUoKTtcbiAgICAgICAgfVxuICAgIH0sIGZhbHNlKTtcblxuLypcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsIGZ1bmN0aW9uKCkge1xuICAgICAgICBjb25zb2xlLmxvZyhcIm9uQmx1clR4XCIpO1xuICAgICAgICBjb250ZXh0LnN1c3BlbmQoKTtcbiAgICB9KTtcblxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdmb2N1cycsIGZ1bmN0aW9uKCkge1xuICAgICAgICBjb25zb2xlLmxvZyhcIm9uRm9jdXNUeFwiKTtcbiAgICAgICAgY29udGV4dC5yZXN1bWUoKTtcbiAgICB9KTtcbiovXG4gICAgY2IobnVsbCwgc3ApO1xufVxuXG5cbmZ1bmN0aW9uIGNyZWF0ZVNvdW5kR3JhYmJlcihOX0JVRkZfSU4sIEZESVYsIHByb2Nlc3NvciwgY2IpIHtcbiAgICB2YXIgY29udGV4dDtcbiAgICB2YXIgYnl0ZXNSZWNlaXZlZCA9MDtcbiAgICB2YXIgc3RhcnRUaW1lID0gKG5ldyBEYXRlKCkpLmdldFRpbWUoKTtcblxuICAgIGZ1bmN0aW9uIHByaW50UHJvY2Vzc29yKCkge1xuICAgICAgICB2YXIgbm93ID0gKG5ldyBEYXRlKCkpLmdldFRpbWUoKTtcbiAgICAgICAgY29uc29sZS5sb2coYnl0ZXNSZWNlaXZlZCoxMDAwIC8gKG5vdy1zdGFydFRpbWUpKTtcbiAgICB9XG5cbiAgICBzZXRJbnRlcnZhbChwcmludFByb2Nlc3NvciwzMDAwKTtcblxuICAgIHRyeSB7XG4gICAgICAgIC8vIEZpeCB1cCBmb3IgcHJlZml4aW5nXG4gICAgICAgIHdpbmRvdy5BdWRpb0NvbnRleHQgPSB3aW5kb3cuQXVkaW9Db250ZXh0fHx3aW5kb3cud2Via2l0QXVkaW9Db250ZXh0O1xuICAgICAgICBjb250ZXh0ID0gbmV3IHdpbmRvdy5BdWRpb0NvbnRleHQoKTtcbiAgICB9XG4gICAgY2F0Y2goZSkge1xuICAgICAgICBjb25zb2xlLmxvZygnV2ViIEF1ZGlvIEFQSSBpcyBub3Qgc3VwcG9ydGVkIGluIHRoaXMgYnJvd3NlcicgKyBlKTtcbiAgICAgICAgd2luZG93LmFsZXJ0KCdXZWIgQXVkaW8gQVBJIGlzIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBicm93c2VyJyk7XG4gICAgfVxuXG4gICAgaWYgKCFuYXZpZ2F0b3IuZ2V0VXNlck1lZGlhKVxuICAgICAgICBuYXZpZ2F0b3IuZ2V0VXNlck1lZGlhID0gbmF2aWdhdG9yLndlYmtpdEdldFVzZXJNZWRpYSB8fCBuYXZpZ2F0b3IubW96R2V0VXNlck1lZGlhO1xuICAgIGlmICghbmF2aWdhdG9yLmNhbmNlbEFuaW1hdGlvbkZyYW1lKVxuICAgICAgICBuYXZpZ2F0b3IuY2FuY2VsQW5pbWF0aW9uRnJhbWUgPSBuYXZpZ2F0b3Iud2Via2l0Q2FuY2VsQW5pbWF0aW9uRnJhbWUgfHwgbmF2aWdhdG9yLm1vekNhbmNlbEFuaW1hdGlvbkZyYW1lO1xuICAgIGlmICghbmF2aWdhdG9yLnJlcXVlc3RBbmltYXRpb25GcmFtZSlcbiAgICAgICAgbmF2aWdhdG9yLnJlcXVlc3RBbmltYXRpb25GcmFtZSA9IG5hdmlnYXRvci53ZWJraXRSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHwgbmF2aWdhdG9yLm1velJlcXVlc3RBbmltYXRpb25GcmFtZTtcblxuXG4gICAgdmFyIHJlY2VwdG9yID0gY29udGV4dC5jcmVhdGVTY3JpcHRQcm9jZXNzb3IoTl9CVUZGX0lOLCAyLCAyKTtcbiAgICByZWNlcHRvci5vbmF1ZGlvcHJvY2VzcyA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgdmFyIG9mLCBiZiwgaSwgajtcbiAgICAgICAgdmFyIGluTCA9IGUuaW5wdXRCdWZmZXIuZ2V0Q2hhbm5lbERhdGEoMCk7XG4gICAgICAgIGZvciAob2Y9IDAgOyBvZjxOX0JVRkZfSU47IG9mKz1GRElWKSB7XG4gICAgICAgICAgICBwcm9jZXNzb3IucHJvY2Vzc0RhdGEoaW5MLG9mKTtcbiAgICAgICAgfVxuICAgICAgICBieXRlc1JlY2VpdmVkICs9IE5fQlVGRl9JTjtcbi8vICAgICAgICBjb25zb2xlLmxvZyhcInJ4XCIpO1xuICAgIH07XG5cbiAgICB2YXIgaGlkZGVuLCB2aXNpYmlsaXR5Q2hhbmdlO1xuICAgIGlmICh0eXBlb2YgZG9jdW1lbnQuaGlkZGVuICE9PSBcInVuZGVmaW5lZFwiKSB7IC8vIE9wZXJhIDEyLjEwIGFuZCBGaXJlZm94IDE4IGFuZCBsYXRlciBzdXBwb3J0XG4gICAgICBoaWRkZW4gPSBcImhpZGRlblwiO1xuICAgICAgdmlzaWJpbGl0eUNoYW5nZSA9IFwidmlzaWJpbGl0eWNoYW5nZVwiO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRvY3VtZW50Lm1vekhpZGRlbiAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgaGlkZGVuID0gXCJtb3pIaWRkZW5cIjtcbiAgICAgIHZpc2liaWxpdHlDaGFuZ2UgPSBcIm1venZpc2liaWxpdHljaGFuZ2VcIjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkb2N1bWVudC5tc0hpZGRlbiAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgaGlkZGVuID0gXCJtc0hpZGRlblwiO1xuICAgICAgdmlzaWJpbGl0eUNoYW5nZSA9IFwibXN2aXNpYmlsaXR5Y2hhbmdlXCI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZG9jdW1lbnQud2Via2l0SGlkZGVuICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICBoaWRkZW4gPSBcIndlYmtpdEhpZGRlblwiO1xuICAgICAgdmlzaWJpbGl0eUNoYW5nZSA9IFwid2Via2l0dmlzaWJpbGl0eWNoYW5nZVwiO1xuICAgIH1cblxuXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcih2aXNpYmlsaXR5Q2hhbmdlLCBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKGRvY3VtZW50W2hpZGRlbl0pIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwib25CbHVyUnhcIik7XG4gICAgICAgICAgICBjb250ZXh0LnN1c3BlbmQoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwib25Gb2N1c1J4XCIpO1xuICAgICAgICAgICAgY29udGV4dC5yZXN1bWUoKTtcbiAgICAgICAgfVxuICAgIH0sIGZhbHNlKTtcbi8qXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCBmdW5jdGlvbigpIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJvbkJsdXJSeFwiKTtcbiAgICAgICAgY29udGV4dC5zdXNwZW5kKCk7XG4gICAgfSk7XG5cbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignZm9jdXMnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJvbkZvY3VzUnhcIik7XG4gICAgICAgIGNvbnRleHQucmVzdW1lKCk7XG4gICAgfSk7XG4qL1xuXG4vLyBDb25maWd1cmUgYW5kIHNldCBXMyBjdHhcblxuICAgIG5hdmlnYXRvci5nZXRVc2VyTWVkaWEoe2F1ZGlvOnRydWV9LCBmdW5jdGlvbihzdHJlYW0pIHtcblxuXG4gICAgICAgIHZhciBhdWRpb0lucHV0ID0gY29udGV4dC5jcmVhdGVNZWRpYVN0cmVhbVNvdXJjZShzdHJlYW0pO1xuICAgICAgICBhdWRpb0lucHV0LmNvbm5lY3QocmVjZXB0b3IpO1xuXG5cbiAgICAgICAgdmFyIHplcm9HYWluID0gY29udGV4dC5jcmVhdGVHYWluKCk7XG4gICAgICAgIHplcm9HYWluLmdhaW4udmFsdWUgPSAwLjA7XG4gICAgICAgIHJlY2VwdG9yLmNvbm5lY3QoIHplcm9HYWluICk7XG4gICAgICAgIHplcm9HYWluLmNvbm5lY3QoIGNvbnRleHQuZGVzdGluYXRpb24gKTtcblxuICAgICAgICB3aW5kb3cuaW5TdHJlYW0gPSBzdHJlYW07XG4gICAgICAgIHdpbmRvdy5hdWRpb0lucHV0ID0gYXVkaW9JbnB1dDtcbiAgICAgICAgd2luZG93Lnplcm9HYWluID0gemVyb0dhaW47XG4gICAgICAgIHdpbmRvdy5jb250ZXh0ID0gY29udGV4dDtcblxuICAgICAgICBjYihudWxsLCByZWNlcHRvcik7XG4gICAgfSwgZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGVycik7XG4gICAgICAgIHJldHVybiBjYihlcnIpO1xuICAgIH0pO1xufVxuXG5leHBvcnRzLmNyZWF0ZVNvdW5kUGxheWVyID0gY3JlYXRlU291bmRQbGF5ZXI7XG5leHBvcnRzLmNyZWF0ZVNvdW5kR3JhYmJlciA9IGNyZWF0ZVNvdW5kR3JhYmJlcjtcblxuIiwiLypqc2xpbnQgbm9kZTogdHJ1ZSAsIGJyb3dzZXI6IHRydWUgKi9cbi8qZ2xvYmFsIHdpbmRvdyAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBCQ0pSID0gcmVxdWlyZSgnLi9iY2pyLmpzJyk7XG52YXIgQnl0ZUJpdCA9IHJlcXVpcmUoJy4vYnl0ZWJpdC5qcycpO1xuXG5mdW5jdGlvbiBUQ0VuY29kZXIobnVtczEsIGRlbjEsIG51bXMyLCBkZW4yLCBwZXJtLCBkZXN0aW5hdGlvbikge1xuXHR2YXIgc2VsZj10aGlzO1xuXG5cdHNlbGYuYmNqcjEgPSBuZXcgQkNKUihudW1zMSxkZW4xKTtcblx0c2VsZi5iY2pyMiA9IG5ldyBCQ0pSKG51bXMyLGRlbjIpO1xuXHRzZWxmLmRlc3RpbmF0aW9uID0gZGVzdGluYXRpb247XG5cdHNlbGYucGVybSA9IHBlcm07XG5cblxuXHRzZWxmLnByb2Nlc3NEYXRhID0gZnVuY3Rpb24oaW5CKSB7XG5cdFx0dmFyIGksajtcblx0XHR2YXIgb3V0Qj1bXTtcblxuXG5cdFx0dmFyIHUgPSBCeXRlQml0LmJ5dGVzMmJpdHMoaW5CKTtcblx0XHR3aGlsZSAodS5sZW5ndGggPCBzZWxmLnBlcm0uY29udmVydC5sZW5ndGgpIHUucHVzaCgxKTtcblxuXHRcdHZhciB1cCA9IFtdO1xuXHRcdGZvciAoaT0wOyBpPCB1Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR1cFtzZWxmLnBlcm0uY29udmVydFtpXV0gPSB1W2ldO1xuXHRcdH1cblx0XHR2YXIgeDEgPSBzZWxmLmJjanIxLmVuY29kZSh1KTtcblx0XHR2YXIgeDIgPSBzZWxmLmJjanIyLmVuY29kZSh1cCk7XG5cblx0XHRmb3IgKGk9MDsgaTwgeDEubGVuZ3RoIC8gc2VsZi5iY2pyMS5uT3V0czsgaSsrKSB7XG5cdFx0XHRmb3IgKGo9MDsgajwgc2VsZi5iY2pyMS5uT3V0czsgaisrKSB7XG5cdFx0XHRcdG91dEIucHVzaCh4MVtpKnNlbGYuYmNqcjEubk91dHMgKyBqXSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGo9MDsgajwgc2VsZi5iY2pyMi5uT3V0czsgaisrKSB7XG5cdFx0XHRcdG91dEIucHVzaCh4MltpKnNlbGYuYmNqcjIubk91dHMgKyBqXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZGVzdGluYXRpb24ucHJvY2Vzc0RhdGEob3V0Qik7XG5cdH07XG5cblx0cmV0dXJuIHNlbGY7XG59XG5cbmZ1bmN0aW9uIFRDRGVjb2RlcihudW1zMSwgZGVuMSwgbnVtczIsIGRlbjIsIHBlcm0sIG5JdGVyYXRpb25zLCBkZXN0aW5hdGlvbikge1xuXHR2YXIgc2VsZj10aGlzO1xuXG5cdHNlbGYubkl0ZXJhdGlvbnMgPSBuSXRlcmF0aW9ucztcblxuXHRzZWxmLmJjanIxID0gbmV3IEJDSlIobnVtczEsZGVuMSk7XG5cdHNlbGYuYmNqcjIgPSBuZXcgQkNKUihudW1zMixkZW4yKTtcblx0c2VsZi5kZXN0aW5hdGlvbiA9IGRlc3RpbmF0aW9uO1xuXHRzZWxmLnBlcm0gPSBwZXJtO1xuXG5cblx0c2VsZi5wcm9jZXNzRGF0YSA9IGZ1bmN0aW9uKGluQikge1xuXHRcdHZhciBpLGosaztcblx0XHR2YXIgc2VncyA9IHNlbGYuYmNqcjEubk91dHMgKyBzZWxmLmJjanIyLm5PdXRzO1xuXHRcdHZhciBuPU1hdGguZmxvb3IoaW5CLmxlbmd0aCAvIHNlZ3MpO1xuXG5cdFx0dmFyIHkxID0gW107XG5cdFx0dmFyIHkyID0gW107XG5cdFx0dmFyIGx1ID0gW107XG5cdFx0dmFyIGx1MiA9IFtdO1xuXHRcdHZhciBsdWUgPSBbXTtcblxuXHRcdHZhciBjPTA7XG5cdFx0Zm9yIChpPTA7IGk8IG47IGkrKykge1xuXHRcdFx0bHUucHVzaCgwKTtcblxuXHRcdFx0Zm9yIChqPTA7IGo8c2VsZi5iY2pyMS5uT3V0czsgaisrKSB7XG5cdFx0XHRcdHkxLnB1c2goaW5CW2NdKTtcblx0XHRcdFx0YysrO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGo9MDsgajxzZWxmLmJjanIyLm5PdXRzOyBqKyspIHtcblx0XHRcdFx0eTIucHVzaChpbkJbY10pO1xuXHRcdFx0XHRjKys7XG5cdFx0XHR9XG5cblx0XHR9XG5cblx0XHRmb3IgKGk9MDsgaTxzZWxmLm5JdGVyYXRpb25zOyBpKyspIHtcblx0XHRcdGx1ZSA9IHNlbGYuYmNqcjEuZGVjb2RlKHkxLCBsdSk7XG5cdFx0XHRmb3IgKGs9MDsgazxuOyBrKyspIHtcblx0XHRcdFx0aWYgKGs8c2VsZi5wZXJtLmNvbnZlcnQubGVuZ3RoKSB7XG5cdFx0XHRcdFx0bHUyW3NlbGYucGVybS5jb252ZXJ0W2tdXSA9IGx1ZVtrXSAtIGx1W2tdO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGx1MltrXT0wO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGx1ZSA9IHNlbGYuYmNqcjIuZGVjb2RlKHkyLCBsdTIpO1xuXHRcdFx0Zm9yIChrPTA7IGs8bjsgaysrKSB7XG5cdFx0XHRcdGlmIChrPHNlbGYucGVybS5jb252ZXJ0Lmxlbmd0aCkge1xuXHRcdFx0XHRcdGx1W2tdID0gbHVlW3NlbGYucGVybS5jb252ZXJ0W2tdXSAtIGx1MltzZWxmLnBlcm0uY29udmVydFtrXV0gLSB5MVtrKnNlbGYuYmNqcjEubk91dHNdO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGx1W2tdID0gMDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHdoaWxlIChsdS5sZW5ndGg+IHNlbGYucGVybS5jb252ZXJ0Lmxlbmd0aCkgbHUucG9wKCk7XG5cblx0XHR2YXIgb3V0QiA9IEJ5dGVCaXQuYml0czJieXRlcyhsdSk7XG5cblx0XHRkZXN0aW5hdGlvbi5wcm9jZXNzRGF0YShvdXRCKTtcblx0fTtcblxuXG5cdHJldHVybiBzZWxmO1xufVxuXG5leHBvcnRzLkVuY29kZXIgPSBUQ0VuY29kZXI7XG5leHBvcnRzLkRlY29kZXIgPSBUQ0RlY29kZXI7XG4iLCIvKmpzbGludCBub2RlOiB0cnVlICwgYnJvd3NlcjogdHJ1ZSAqL1xuLypnbG9iYWwgd2luZG93ICovXG5cInVzZSBzdHJpY3RcIjtcblxuLy8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbi8vIFVURi04IEVuY29kaW5nIGhlbHBlcnMuXG4vLyBiYXNlZCBvbiB0aGUgY29kZSBhdCBodHRwOi8vd3d3LndlYnRvb2xraXQuaW5mb1xuLy8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbnZhciBVdGY4VXRpbHM9IGZ1bmN0aW9uKCkge1xuICAgIGZ1bmN0aW9uIF9lbmNvZGUoc3RyaW5nVG9FbmNvZGUsIGluc2VydEJPTSkge1xuICAgICAgICBzdHJpbmdUb0VuY29kZSA9IHN0cmluZ1RvRW5jb2RlLnJlcGxhY2UoL1xcclxcbi9nLFwiXFxuXCIpO1xuICAgICAgICB2YXIgdXRmdGV4dCA9IFtdO1xuICAgICAgICBpZiggaW5zZXJ0Qk9NID09PSB0cnVlICkgIHtcbiAgICAgICAgICAgIHV0ZnRleHRbMF09ICAweGVmO1xuICAgICAgICAgICAgdXRmdGV4dFsxXT0gIDB4YmI7XG4gICAgICAgICAgICB1dGZ0ZXh0WzJdPSAgMHhiZjtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAodmFyIG4gPSAwOyBuIDwgc3RyaW5nVG9FbmNvZGUubGVuZ3RoOyBuKyspIHtcblxuICAgICAgICAgICAgdmFyIGMgPSBzdHJpbmdUb0VuY29kZS5jaGFyQ29kZUF0KG4pO1xuXG4gICAgICAgICAgICBpZiAoYyA8IDEyOCkge1xuICAgICAgICAgICAgICAgIHV0ZnRleHRbdXRmdGV4dC5sZW5ndGhdPSBjO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZigoYyA+IDEyNykgJiYgKGMgPCAyMDQ4KSkge1xuICAgICAgICAgICAgICAgIHV0ZnRleHRbdXRmdGV4dC5sZW5ndGhdPSAoYyA+PiA2KSB8IDE5MjtcbiAgICAgICAgICAgICAgICB1dGZ0ZXh0W3V0ZnRleHQubGVuZ3RoXT0gKGMgJiA2MykgfCAxMjg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB1dGZ0ZXh0W3V0ZnRleHQubGVuZ3RoXT0gKGMgPj4gMTIpIHwgMjI0O1xuICAgICAgICAgICAgICAgIHV0ZnRleHRbdXRmdGV4dC5sZW5ndGhdPSAoKGMgPj4gNikgJiA2MykgfCAxMjg7XG4gICAgICAgICAgICAgICAgdXRmdGV4dFt1dGZ0ZXh0Lmxlbmd0aF09IChjICYgNjMpIHwgMTI4O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHV0ZnRleHQ7XG4gICAgfVxuXG4gICAgdmFyIG9iaj0ge1xuICAgICAgICAvKipcbiAgICAgICAgICogRW5jb2RlIGphdmFzY3JpcHQgc3RyaW5nIGFzIHV0ZjggYnl0ZSBhcnJheVxuICAgICAgICAgKi9cbiAgICAgICAgZW5jb2RlIDogZnVuY3Rpb24oc3RyaW5nVG9FbmNvZGUpIHtcbiAgICAgICAgICAgIHJldHVybiBfZW5jb2RlKCBzdHJpbmdUb0VuY29kZSwgZmFsc2UpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBFbmNvZGUgamF2YXNjcmlwdCBzdHJpbmcgYXMgdXRmOCBieXRlIGFycmF5LCB3aXRoIGEgQk9NIGF0IHRoZSBzdGFydFxuICAgICAgICAgKi9cbiAgICAgICAgZW5jb2RlV2l0aEJPTTogZnVuY3Rpb24oc3RyaW5nVG9FbmNvZGUpIHtcbiAgICAgICAgICAgIHJldHVybiBfZW5jb2RlKHN0cmluZ1RvRW5jb2RlLCB0cnVlKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogRGVjb2RlIHV0ZjggYnl0ZSBhcnJheSB0byBqYXZhc2NyaXB0IHN0cmluZy4uLi5cbiAgICAgICAgICovXG4gICAgICAgIGRlY29kZSA6IGZ1bmN0aW9uKGRvdE5ldEJ5dGVzKSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0PSBcIlwiO1xuICAgICAgICAgICAgdmFyIGk9IDA7XG4gICAgICAgICAgICB2YXIgYz0wLCBjMT0wLCBjMj0wO1xuXG4gICAgICAgICAgICAvLyBQZXJmb3JtIGJ5dGUtb3JkZXIgY2hlY2suXG4gICAgICAgICAgICBpZiggZG90TmV0Qnl0ZXMubGVuZ3RoID49IDMgKSB7XG4gICAgICAgICAgICAgICAgaWYoIChkb3ROZXRCeXRlc1swXSAmIDB4ZWYpID09PSAweGVmICYmIChkb3ROZXRCeXRlc1sxXSAmIDB4YmIpID09PSAweGJiICYmIChkb3ROZXRCeXRlc1syXSAmIDB4YmYpID09PSAweGJmICkge1xuICAgICAgICAgICAgICAgICAgICAvLyBIbW0gYnl0ZSBzdHJlYW0gaGFzIGEgQk9NIGF0IHRoZSBzdGFydCwgd2UnbGwgc2tpcCB0aGlzLlxuICAgICAgICAgICAgICAgICAgICBpPSAzO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgd2hpbGUoIGkgPCBkb3ROZXRCeXRlcy5sZW5ndGggKSB7XG4gICAgICAgICAgICAgICAgYz0gZG90TmV0Qnl0ZXNbaV0mMHhmZjtcblxuICAgICAgICAgICAgICAgIGlmKCBjIDwgMTI4ICkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQrPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGMpO1xuICAgICAgICAgICAgICAgICAgICBpKys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYoIChjID4gMTkxKSAmJiAoYyA8IDIyNCkgKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmKCBpKzEgPj0gZG90TmV0Qnl0ZXMubGVuZ3RoICkge1xuLy8gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBcIlVuLWV4cGVjdGVkIGVuY29kaW5nIGVycm9yLCBVVEYtOCBzdHJlYW0gdHJ1bmNhdGVkLCBvciBpbmNvcnJlY3RcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGkrPTI7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjMj0gZG90TmV0Qnl0ZXNbaSsxXSYweGZmO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0Kz0gU3RyaW5nLmZyb21DaGFyQ29kZSggKChjJjMxKTw8NikgfCAoYzImNjMpICk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpKz0yO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZiggaSsyID49IGRvdE5ldEJ5dGVzLmxlbmd0aCAgfHwgaSsxID49IGRvdE5ldEJ5dGVzLmxlbmd0aCApIHtcbi8vICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgXCJVbi1leHBlY3RlZCBlbmNvZGluZyBlcnJvciwgVVRGLTggc3RyZWFtIHRydW5jYXRlZCwgb3IgaW5jb3JyZWN0XCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBpKz0zO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgYzI9IGRvdE5ldEJ5dGVzW2krMV0mMHhmZjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBjMz0gZG90TmV0Qnl0ZXNbaSsyXSYweGZmO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0Kz0gU3RyaW5nLmZyb21DaGFyQ29kZSggKChjJjE1KTw8MTIpIHwgKChjMiY2Myk8PDYpIHwgKGMzJjYzKSApO1xuICAgICAgICAgICAgICAgICAgICAgICAgaSs9MztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHJldHVybiBvYmo7XG59KCk7XG5cbm1vZHVsZS5leHBvcnRzID0gVXRmOFV0aWxzO1xuIiwiLypqc2xpbnQgbm9kZTogdHJ1ZSAsIGJyb3dzZXI6IHRydWUgKi9cbi8qZ2xvYmFsIHdpbmRvdyAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBjb25maWcgPSByZXF1aXJlKCcuL2NvbmZpZy5qcycpO1xudmFyIFNvdW5kRHJpdmVyID0gcmVxdWlyZSgnLi9zb3VuZF9kcml2ZXIuanMnKTtcbnZhciBSYW5kb21QZXJtID0gcmVxdWlyZSgnLi9yYW5kb21fcGVybS5qcycpO1xudmFyIE9GRE0gPSByZXF1aXJlKCcuL29mZG0uanMnKTtcbnZhciBQYWNrZXRpemVyID0gcmVxdWlyZSgnLi9wYWNrZXRpemVyLmpzJyk7XG52YXIgVHVyYm9Db2RlID0gcmVxdWlyZSgnLi90dXJib2NvZGUuanMnKTtcbnZhciBGTFNJbnRlcmxlYXZlciA9IHJlcXVpcmUoJy4vZmxzaW50ZXJsZWF2ZXIuanMnKTtcbnZhciBJZENSQyA9IHJlcXVpcmUoJy4vaWRjcmMuanMnKTtcbnZhciBVdGY4VXRpbHMgPSByZXF1aXJlKCcuL3V0ZjguanMnKTtcbnZhciBQcmVkaWN0b3IgPSByZXF1aXJlKCcuL3ByZWRpY3Rvci5qcycpO1xudmFyIGNpcmMgPSByZXF1aXJlKCcuL2NpcmMuanMnKTtcblxudmFyIFZvY29KUyA9IGZ1bmN0aW9uKCkge1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciB0eEluaXRpYWxpemVkID0gZmFsc2U7XG4gICAgdmFyIHJ4SW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgICB0aGlzLnJhbmRvbVBlcm0gPSBuZXcgUmFuZG9tUGVybShjb25maWcuTl9GUkFNRVNfUEFDS0VUICogY29uZmlnLnVzZWRDaGFubmVscy5sZW5ndGgpO1xuICAgIHRoaXMudGNQZXJtID0gbmV3IEZMU0ludGVybGVhdmVyKDMwNCk7XG5cbiAgICB2YXIgcnhDYWxsQmFja3NCaW4gPSBbXTtcbiAgICB2YXIgcnhDYWxsQmFja3NTdHJpbmcgPSBbXTtcblxuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICAgIHRoaXMuY2lyYyA9IGNpcmM7XG5cbiAgICB0aGlzLmluaXRUeCA9IGZ1bmN0aW9uKGNiKSB7XG4gICAgICAgIGlmICghY2IpIGNiID0gZnVuY3Rpb24oKXt9O1xuICAgICAgICBpZiAodHhJbml0aWFsaXplZCkgcmV0dXJuIGNiKCk7XG5cbiAgICAgICAgU291bmREcml2ZXIuY3JlYXRlU291bmRQbGF5ZXIoZnVuY3Rpb24oZXJyLCBzcCkge1xuICAgICAgICAgICAgc2VsZi5zb3VuZFBsYXllciA9IHNwO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBzZWxmLm9mZG1Db2RlciA9IG5ldyBPRkRNLkVuY29kZXIoY29uZmlnLk5fUFJFQU1CTEVfRlJBTUVTLCBjb25maWcuTl9QT1NUQU1CTEVfRlJBTUVTLCBjb25maWcuRkRJViwgY29uZmlnLnVzZWRDaGFubmVscywgc2VsZi5zb3VuZFBsYXllcik7XG4gICAgICAgICAgICAgICAgc2VsZi5wYWNrZXRHZW5lcmF0b3IgPSBuZXcgUGFja2V0aXplci5QYWNrZXRHZW5lcmF0b3IoY29uZmlnLnVzZWRDaGFubmVscy5sZW5ndGgsIGNvbmZpZy5OX0ZSQU1FU19QQUNLRVQsIHNlbGYucmFuZG9tUGVybSwgc2VsZi5vZmRtQ29kZXIpO1xuICAgICAgICAgICAgLy8gIGxkcGM9bmV3IExEUENFbmNvZGVyKFwiYWxpc3QvbDE4NDhfMTI4LmFsaXN0XCIsIHBhY2tldEdlbmVyYXRvcik7XG5cbiAgICAgICAgICAgICAgICBzZWxmLmVjY0VuY29kZXIgPSBuZXcgVHVyYm9Db2RlLkVuY29kZXIoY29uZmlnLk5VTVMxLCBjb25maWcuREVOMSwgY29uZmlnLk5VTVMyLCBjb25maWcuREVOMiwgc2VsZi50Y1Blcm0sIHNlbGYucGFja2V0R2VuZXJhdG9yKTtcblxuICAgICAgICAgICAgICAgIHNlbGYuaWRDcmNFbmNvZGVyID0gbmV3IElkQ1JDLkVuY29kZXIoc2VsZi5lY2NFbmNvZGVyKTtcblxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgY2IoZXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHR4SW5pdGlhbGl6ZWQ9IHRydWU7XG4gICAgICAgICAgICBjYigpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIHRoaXMuaW5pdFJ4ID0gZnVuY3Rpb24oY2IpIHtcbiAgICAgICAgaWYgKCFjYikgY2IgPSBmdW5jdGlvbigpe307XG4gICAgICAgIGlmIChyeEluaXRpYWxpemVkKSByZXR1cm4gY2IoKTtcblxuXG4gICAgICAgIHRoaXMucGFja2V0UmVjZWl2ZXIgPSB7XG4gICAgICAgICAgICBwcm9jZXNzRGF0YTogZnVuY3Rpb24ocGFja2V0KSB7XG4gICAgICAgICAgICAgICAgdmFyIHN0cmluZ1JlY2VpdmVkID0gVXRmOFV0aWxzLmRlY29kZShwYWNrZXQpO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiUGFja2V0IHJlY2VpdmVkOiBcIisgc3RyaW5nUmVjZWl2ZWQpO1xuICAgICAgICAgICAgICAgIHJ4Q2FsbEJhY2tzQmluLmZvckVhY2goZnVuY3Rpb24oY2IpIHtcbiAgICAgICAgICAgICAgICAgICAgY2IocGFja2V0KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByeENhbGxCYWNrc1N0cmluZy5mb3JFYWNoKGZ1bmN0aW9uKGNiKSB7XG4gICAgICAgICAgICAgICAgICAgIGNiKHN0cmluZ1JlY2VpdmVkKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuXG5cbiAgICAgICAgdGhpcy5pZENyY0RlY29kZXIgPSBuZXcgSWRDUkMuRGVjb2Rlcih0aGlzLnBhY2tldFJlY2VpdmVyKTtcblxuXG4gICAgICAgIHRoaXMuZWNjRGVjb2RlciA9IG5ldyBUdXJib0NvZGUuRGVjb2Rlcihjb25maWcuTlVNUzEsIGNvbmZpZy5ERU4xLCBjb25maWcuTlVNUzIsIGNvbmZpZy5ERU4yLCB0aGlzLnRjUGVybSwgMTAsIHRoaXMuaWRDcmNEZWNvZGVyKTtcblxuICAgICAgICB0aGlzLnByZWRpY3RvciA9IG5ldyBQcmVkaWN0b3IoY29uZmlnLnVzZWRDaGFubmVscy5sZW5ndGgsIGNvbmZpZy5OX0ZSQU1FU19QQUNLRVQsIHRoaXMucmFuZG9tUGVybSwgdGhpcy5lY2NEZWNvZGVyKTtcblxuICAgICAgICB0aGlzLnBhY2tldERldGVjdG9yID0gbmV3IFBhY2tldGl6ZXIuUGFja2V0RGV0ZWN0b3IoY29uZmlnLnVzZWRDaGFubmVscy5sZW5ndGgsIGNvbmZpZy5OX0ZSQU1FU19QQUNLRVQsIHRoaXMucmFuZG9tUGVybSwgdGhpcy5wcmVkaWN0b3IpO1xuICAgICAgICB0aGlzLm9mZG1EZWNvZGVyID0gbmV3IE9GRE0uRGVjb2Rlcihjb25maWcuRkRJViwgY29uZmlnLnVzZWRDaGFubmVscywgdGhpcy5wYWNrZXREZXRlY3Rvcik7XG4gICAgICAgIHJ4SW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLnJlY2VwdG9yID0gU291bmREcml2ZXIuY3JlYXRlU291bmRHcmFiYmVyKGNvbmZpZy5OX0JVRkZfSU4sIGNvbmZpZy5GRElWLCB0aGlzLm9mZG1EZWNvZGVyLCBjYik7XG4gICAgfTtcbiAgICB0aGlzLm9uUnhCaW4gPSBmdW5jdGlvbihyeENhbGxCYWNrLCBjYikge1xuICAgICAgICBpZiAoIWNiKSBjYiA9IGZ1bmN0aW9uKCl7fTtcblxuICAgICAgICB2YXIgcG9zID0gcnhDYWxsQmFja3NCaW4ubGVuZ3RoO1xuICAgICAgICByeENhbGxCYWNrc0Jpbltwb3NdID0gcnhDYWxsQmFjaztcbiAgICAgICAgdGhpcy5pbml0UngoY2IpO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGRlbGV0ZSByeENhbGxCYWNrc0Jpbltwb3NdO1xuICAgICAgICB9O1xuICAgIH07XG5cbiAgICB0aGlzLm9uUnhTdHJpbmcgPSBmdW5jdGlvbihyeENhbGxCYWNrLCBjYikge1xuICAgICAgICBpZiAoIWNiKSBjYiA9IGZ1bmN0aW9uKCl7fTtcblxuICAgICAgICB2YXIgcG9zID0gcnhDYWxsQmFja3NTdHJpbmcubGVuZ3RoO1xuICAgICAgICByeENhbGxCYWNrc1N0cmluZ1twb3NdID0gcnhDYWxsQmFjaztcbiAgICAgICAgdGhpcy5pbml0UngoY2IpO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGRlbGV0ZSByeENhbGxCYWNrc1N0cmluZ1twb3NdO1xuICAgICAgICB9O1xuICAgIH07XG5cbiAgICB0aGlzLnR4U3RyaW5nID0gZnVuY3Rpb24oZGF0YSwgY2IpIHtcbiAgICAgICAgICAgIHZhciByYXdEYXRhID0gVXRmOFV0aWxzLmVuY29kZShkYXRhKTtcbiAgICAgICAgICAgIHNlbGYudHhCaW4ocmF3RGF0YSwgY2IpO1xuICAgIH07XG4gICAgdGhpcy50eEJpbiA9IGZ1bmN0aW9uKGRhdGEsIGNiKSB7XG4gICAgICAgIHRoaXMuaW5pdFR4KGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgaWYgKGVycikgcmV0dXJuIGNiKGVycik7XG4gICAgICAgICAgICBzZWxmLmlkQ3JjRW5jb2Rlci5wcm9jZXNzRGF0YShkYXRhKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICB0aGlzLnR4U2lsZW5jZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB0aGlzLmluaXRUeChmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhRnJhbWU7XG4gICAgICAgICAgICB2YXIgTCA9IChjb25maWcuTl9QUkVBTUJMRV9GUkFNRVMgKyBjb25maWcuTl9GUkFNRVNfUEFDS0VUICsgIGNvbmZpZy5OX1BPU1RBTUJMRV9GUkFNRVMpKiBjb25maWcuRkRJViAqIDQ7XG5cbiAgICAgICAgICAgIHZhciBvdXRMID0gbmV3IEFycmF5KCBMICk7XG5cbiAgICAgICAgICAgIHZhciBpO1xuICAgICAgICAgICAgZm9yIChpPTA7IGk8TDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgb3V0TFtpXT0wO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzZWxmLnNvdW5kUGxheWVyLnByb2Nlc3NEYXRhKG91dEwpO1xuICAgICAgICB9KTtcbiAgICB9O1xufTtcblxud2luZG93LnZvY29qcyA9IG5ldyBWb2NvSlMoKTtcblxuXG5cbiIsIid1c2Ugc3RyaWN0JztcblxuIWZ1bmN0aW9uKGV4cG9ydHMsIHVuZGVmaW5lZCkge1xuXG4gIHZhclxuICAgIC8vIElmIHRoZSB0eXBlZCBhcnJheSBpcyB1bnNwZWNpZmllZCwgdXNlIHRoaXMuXG4gICAgRGVmYXVsdEFycmF5VHlwZSA9IEZsb2F0MzJBcnJheSxcbiAgICAvLyBTaW1wbGUgbWF0aCBmdW5jdGlvbnMgd2UgbmVlZC5cbiAgICBzcXJ0ID0gTWF0aC5zcXJ0LFxuICAgIHNxciA9IGZ1bmN0aW9uKG51bWJlcikge3JldHVybiBNYXRoLnBvdyhudW1iZXIsIDIpfSxcbiAgICAvLyBJbnRlcm5hbCBjb252ZW5pZW5jZSBjb3BpZXMgb2YgdGhlIGV4cG9ydGVkIGZ1bmN0aW9uc1xuICAgIGlzQ29tcGxleEFycmF5LFxuICAgIENvbXBsZXhBcnJheVxuXG4gIGV4cG9ydHMuaXNDb21wbGV4QXJyYXkgPSBpc0NvbXBsZXhBcnJheSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogIT09IHVuZGVmaW5lZCAmJlxuICAgICAgb2JqLmhhc093blByb3BlcnR5ICE9PSB1bmRlZmluZWQgJiZcbiAgICAgIG9iai5oYXNPd25Qcm9wZXJ0eSgncmVhbCcpICYmXG4gICAgICBvYmouaGFzT3duUHJvcGVydHkoJ2ltYWcnKVxuICB9XG5cbiAgZXhwb3J0cy5Db21wbGV4QXJyYXkgPSBDb21wbGV4QXJyYXkgPSBmdW5jdGlvbihvdGhlciwgb3B0X2FycmF5X3R5cGUpe1xuICAgIGlmIChpc0NvbXBsZXhBcnJheShvdGhlcikpIHtcbiAgICAgIC8vIENvcHkgY29uc3R1Y3Rvci5cbiAgICAgIHRoaXMuQXJyYXlUeXBlID0gb3RoZXIuQXJyYXlUeXBlXG4gICAgICB0aGlzLnJlYWwgPSBuZXcgdGhpcy5BcnJheVR5cGUob3RoZXIucmVhbClcbiAgICAgIHRoaXMuaW1hZyA9IG5ldyB0aGlzLkFycmF5VHlwZShvdGhlci5pbWFnKVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLkFycmF5VHlwZSA9IG9wdF9hcnJheV90eXBlIHx8IERlZmF1bHRBcnJheVR5cGVcbiAgICAgIC8vIG90aGVyIGNhbiBiZSBlaXRoZXIgYW4gYXJyYXkgb3IgYSBudW1iZXIuXG4gICAgICB0aGlzLnJlYWwgPSBuZXcgdGhpcy5BcnJheVR5cGUob3RoZXIpXG4gICAgICB0aGlzLmltYWcgPSBuZXcgdGhpcy5BcnJheVR5cGUodGhpcy5yZWFsLmxlbmd0aClcbiAgICB9XG5cbiAgICB0aGlzLmxlbmd0aCA9IHRoaXMucmVhbC5sZW5ndGhcbiAgfVxuXG4gIENvbXBsZXhBcnJheS5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgY29tcG9uZW50cyA9IFtdXG5cbiAgICB0aGlzLmZvckVhY2goZnVuY3Rpb24oY192YWx1ZSwgaSkge1xuICAgICAgY29tcG9uZW50cy5wdXNoKFxuICAgICAgICAnKCcgK1xuICAgICAgICBjX3ZhbHVlLnJlYWwudG9GaXhlZCgyKSArICcsJyArXG4gICAgICAgIGNfdmFsdWUuaW1hZy50b0ZpeGVkKDIpICtcbiAgICAgICAgJyknXG4gICAgICApXG4gICAgfSlcblxuICAgIHJldHVybiAnWycgKyBjb21wb25lbnRzLmpvaW4oJywnKSArICddJ1xuICB9XG5cbiAgLy8gSW4tcGxhY2UgbWFwcGVyLlxuICBDb21wbGV4QXJyYXkucHJvdG90eXBlLm1hcCA9IGZ1bmN0aW9uKG1hcHBlcikge1xuICAgIHZhclxuICAgICAgaSxcbiAgICAgIG4gPSB0aGlzLmxlbmd0aCxcbiAgICAgIC8vIEZvciBHQyBlZmZpY2llbmN5LCBwYXNzIGEgc2luZ2xlIGNfdmFsdWUgb2JqZWN0IHRvIHRoZSBtYXBwZXIuXG4gICAgICBjX3ZhbHVlID0ge31cblxuICAgIGZvciAoaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgIGNfdmFsdWUucmVhbCA9IHRoaXMucmVhbFtpXVxuICAgICAgY192YWx1ZS5pbWFnID0gdGhpcy5pbWFnW2ldXG4gICAgICBtYXBwZXIoY192YWx1ZSwgaSwgbilcbiAgICAgIHRoaXMucmVhbFtpXSA9IGNfdmFsdWUucmVhbFxuICAgICAgdGhpcy5pbWFnW2ldID0gY192YWx1ZS5pbWFnXG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXNcbiAgfVxuXG4gIENvbXBsZXhBcnJheS5wcm90b3R5cGUuZm9yRWFjaCA9IGZ1bmN0aW9uKGl0ZXJhdG9yKSB7XG4gICAgdmFyXG4gICAgICBpLFxuICAgICAgbiA9IHRoaXMubGVuZ3RoLFxuICAgICAgLy8gRm9yIGNvbnNpc3RlbmN5IHdpdGggLm1hcC5cbiAgICAgIGNfdmFsdWUgPSB7fVxuXG4gICAgZm9yIChpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgY192YWx1ZS5yZWFsID0gdGhpcy5yZWFsW2ldXG4gICAgICBjX3ZhbHVlLmltYWcgPSB0aGlzLmltYWdbaV1cbiAgICAgIGl0ZXJhdG9yKGNfdmFsdWUsIGksIG4pXG4gICAgfVxuICB9XG5cbiAgQ29tcGxleEFycmF5LnByb3RvdHlwZS5jb25qdWdhdGUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gKG5ldyBDb21wbGV4QXJyYXkodGhpcykpLm1hcChmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgdmFsdWUuaW1hZyAqPSAtMVxuICAgIH0pXG4gIH1cblxuICAvLyBIZWxwZXIgc28gd2UgY2FuIG1ha2UgQXJyYXlUeXBlIG9iamVjdHMgcmV0dXJuZWQgaGF2ZSBzaW1pbGFyIGludGVyZmFjZXNcbiAgLy8gICB0byBDb21wbGV4QXJyYXlzLlxuICBmdW5jdGlvbiBpdGVyYWJsZShvYmopIHtcbiAgICBpZiAoIW9iai5mb3JFYWNoKVxuICAgICAgb2JqLmZvckVhY2ggPSBmdW5jdGlvbihpdGVyYXRvcikge1xuICAgICAgICB2YXIgaSwgbiA9IHRoaXMubGVuZ3RoXG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IG47IGkrKylcbiAgICAgICAgICBpdGVyYXRvcih0aGlzW2ldLCBpLCBuKVxuICAgICAgfVxuXG4gICAgcmV0dXJuIG9ialxuICB9XG5cbiAgQ29tcGxleEFycmF5LnByb3RvdHlwZS5tYWduaXR1ZGUgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgbWFncyA9IG5ldyB0aGlzLkFycmF5VHlwZSh0aGlzLmxlbmd0aClcblxuICAgIHRoaXMuZm9yRWFjaChmdW5jdGlvbih2YWx1ZSwgaSkge1xuICAgICAgbWFnc1tpXSA9IHNxcnQoc3FyKHZhbHVlLnJlYWwpICsgc3FyKHZhbHVlLmltYWcpKVxuICAgIH0pXG5cbiAgICAvLyBBcnJheVR5cGUgd2lsbCBub3QgbmVjZXNzYXJpbHkgYmUgaXRlcmFibGU6IG1ha2UgaXQgc28uXG4gICAgcmV0dXJuIGl0ZXJhYmxlKG1hZ3MpXG4gIH1cbn0odHlwZW9mIGV4cG9ydHMgPT09ICd1bmRlZmluZWQnICYmICh0aGlzLmNvbXBsZXhfYXJyYXkgPSB7fSkgfHwgZXhwb3J0cylcbiIsIid1c2Ugc3RyaWN0JztcblxuIWZ1bmN0aW9uKGV4cG9ydHMsIGNvbXBsZXhfYXJyYXkpIHtcblxuICB2YXJcbiAgICBDb21wbGV4QXJyYXkgPSBjb21wbGV4X2FycmF5LkNvbXBsZXhBcnJheSxcbiAgICAvLyBNYXRoIGNvbnN0YW50cyBhbmQgZnVuY3Rpb25zIHdlIG5lZWQuXG4gICAgUEkgPSBNYXRoLlBJLFxuICAgIFNRUlQxXzIgPSBNYXRoLlNRUlQxXzIsXG4gICAgc3FydCA9IE1hdGguc3FydCxcbiAgICBjb3MgPSBNYXRoLmNvcyxcbiAgICBzaW4gPSBNYXRoLnNpblxuXG4gIENvbXBsZXhBcnJheS5wcm90b3R5cGUuRkZUID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIEZGVCh0aGlzLCBmYWxzZSlcbiAgfVxuXG4gIGV4cG9ydHMuRkZUID0gZnVuY3Rpb24oaW5wdXQpIHtcbiAgICByZXR1cm4gZW5zdXJlQ29tcGxleEFycmF5KGlucHV0KS5GRlQoKVxuICB9XG5cbiAgQ29tcGxleEFycmF5LnByb3RvdHlwZS5JbnZGRlQgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gRkZUKHRoaXMsIHRydWUpXG4gIH1cblxuICBleHBvcnRzLkludkZGVCA9IGZ1bmN0aW9uKGlucHV0KSB7XG4gICAgcmV0dXJuIGVuc3VyZUNvbXBsZXhBcnJheShpbnB1dCkuSW52RkZUKClcbiAgfVxuXG4gIC8vIEFwcGxpZXMgYSBmcmVxdWVuY3ktc3BhY2UgZmlsdGVyIHRvIGlucHV0LCBhbmQgcmV0dXJucyB0aGUgcmVhbC1zcGFjZVxuICAvLyBmaWx0ZXJlZCBpbnB1dC5cbiAgLy8gZmlsdGVyZXIgYWNjZXB0cyBmcmVxLCBpLCBuIGFuZCBtb2RpZmllcyBmcmVxLnJlYWwgYW5kIGZyZXEuaW1hZy5cbiAgQ29tcGxleEFycmF5LnByb3RvdHlwZS5mcmVxdWVuY3lNYXAgPSBmdW5jdGlvbihmaWx0ZXJlcikge1xuICAgIHJldHVybiB0aGlzLkZGVCgpLm1hcChmaWx0ZXJlcikuSW52RkZUKClcbiAgfVxuXG4gIGV4cG9ydHMuZnJlcXVlbmN5TWFwID0gZnVuY3Rpb24oaW5wdXQsIGZpbHRlcmVyKSB7XG4gICAgcmV0dXJuIGVuc3VyZUNvbXBsZXhBcnJheShpbnB1dCkuZnJlcXVlbmN5TWFwKGZpbHRlcmVyKVxuICB9XG5cbiAgZnVuY3Rpb24gZW5zdXJlQ29tcGxleEFycmF5KGlucHV0KSB7XG4gICAgcmV0dXJuIGNvbXBsZXhfYXJyYXkuaXNDb21wbGV4QXJyYXkoaW5wdXQpICYmIGlucHV0IHx8XG4gICAgICAgIG5ldyBDb21wbGV4QXJyYXkoaW5wdXQpXG4gIH1cblxuICBmdW5jdGlvbiBGRlQoaW5wdXQsIGludmVyc2UpIHtcbiAgICB2YXIgbiA9IGlucHV0Lmxlbmd0aFxuXG4gICAgaWYgKG4gJiAobiAtIDEpKSB7XG4gICAgICByZXR1cm4gRkZUX1JlY3Vyc2l2ZShpbnB1dCwgaW52ZXJzZSlcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIEZGVF8yX0l0ZXJhdGl2ZShpbnB1dCwgaW52ZXJzZSlcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBGRlRfUmVjdXJzaXZlKGlucHV0LCBpbnZlcnNlKSB7XG4gICAgdmFyXG4gICAgICBuID0gaW5wdXQubGVuZ3RoLFxuICAgICAgLy8gQ291bnRlcnMuXG4gICAgICBpLCBqLFxuICAgICAgb3V0cHV0LFxuICAgICAgLy8gQ29tcGxleCBtdWx0aXBsaWVyIGFuZCBpdHMgZGVsdGEuXG4gICAgICBmX3IsIGZfaSwgZGVsX2ZfciwgZGVsX2ZfaSxcbiAgICAgIC8vIExvd2VzdCBkaXZpc29yIGFuZCByZW1haW5kZXIuXG4gICAgICBwLCBtLFxuICAgICAgbm9ybWFsaXNhdGlvbixcbiAgICAgIHJlY3Vyc2l2ZV9yZXN1bHQsXG4gICAgICBfc3dhcCwgX3JlYWwsIF9pbWFnXG5cbiAgICBpZiAobiA9PT0gMSkge1xuICAgICAgcmV0dXJuIGlucHV0XG4gICAgfVxuXG4gICAgb3V0cHV0ID0gbmV3IENvbXBsZXhBcnJheShuLCBpbnB1dC5BcnJheVR5cGUpXG5cbiAgICAvLyBVc2UgdGhlIGxvd2VzdCBvZGQgZmFjdG9yLCBzbyB3ZSBhcmUgYWJsZSB0byB1c2UgRkZUXzJfSXRlcmF0aXZlIGluIHRoZVxuICAgIC8vIHJlY3Vyc2l2ZSB0cmFuc2Zvcm1zIG9wdGltYWxseS5cbiAgICBwID0gTG93ZXN0T2RkRmFjdG9yKG4pXG4gICAgbSA9IG4gLyBwXG4gICAgbm9ybWFsaXNhdGlvbiA9IDEgLyBzcXJ0KHApXG4gICAgcmVjdXJzaXZlX3Jlc3VsdCA9IG5ldyBDb21wbGV4QXJyYXkobSwgaW5wdXQuQXJyYXlUeXBlKVxuXG4gICAgLy8gTG9vcHMgZ28gbGlrZSBPKG4gzqMgcF9pKSwgd2hlcmUgcF9pIGFyZSB0aGUgcHJpbWUgZmFjdG9ycyBvZiBuLlxuICAgIC8vIGZvciBhIHBvd2VyIG9mIGEgcHJpbWUsIHAsIHRoaXMgcmVkdWNlcyB0byBPKG4gcCBsb2dfcCBuKVxuICAgIGZvcihqID0gMDsgaiA8IHA7IGorKykge1xuICAgICAgZm9yKGkgPSAwOyBpIDwgbTsgaSsrKSB7XG4gICAgICAgIHJlY3Vyc2l2ZV9yZXN1bHQucmVhbFtpXSA9IGlucHV0LnJlYWxbaSAqIHAgKyBqXVxuICAgICAgICByZWN1cnNpdmVfcmVzdWx0LmltYWdbaV0gPSBpbnB1dC5pbWFnW2kgKiBwICsgal1cbiAgICAgIH1cbiAgICAgIC8vIERvbid0IGdvIGRlZXBlciB1bmxlc3MgbmVjZXNzYXJ5IHRvIHNhdmUgYWxsb2NzLlxuICAgICAgaWYgKG0gPiAxKSB7XG4gICAgICAgIHJlY3Vyc2l2ZV9yZXN1bHQgPSBGRlQocmVjdXJzaXZlX3Jlc3VsdCwgaW52ZXJzZSlcbiAgICAgIH1cblxuICAgICAgZGVsX2ZfciA9IGNvcygyKlBJKmovbilcbiAgICAgIGRlbF9mX2kgPSAoaW52ZXJzZSA/IC0xIDogMSkgKiBzaW4oMipQSSpqL24pXG4gICAgICBmX3IgPSAxXG4gICAgICBmX2kgPSAwXG5cbiAgICAgIGZvcihpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgICBfcmVhbCA9IHJlY3Vyc2l2ZV9yZXN1bHQucmVhbFtpICUgbV1cbiAgICAgICAgX2ltYWcgPSByZWN1cnNpdmVfcmVzdWx0LmltYWdbaSAlIG1dXG5cbiAgICAgICAgb3V0cHV0LnJlYWxbaV0gKz0gZl9yICogX3JlYWwgLSBmX2kgKiBfaW1hZ1xuICAgICAgICBvdXRwdXQuaW1hZ1tpXSArPSBmX3IgKiBfaW1hZyArIGZfaSAqIF9yZWFsXG5cbiAgICAgICAgX3N3YXAgPSBmX3IgKiBkZWxfZl9yIC0gZl9pICogZGVsX2ZfaVxuICAgICAgICBmX2kgPSBmX3IgKiBkZWxfZl9pICsgZl9pICogZGVsX2ZfclxuICAgICAgICBmX3IgPSBfc3dhcFxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENvcHkgYmFjayB0byBpbnB1dCB0byBtYXRjaCBGRlRfMl9JdGVyYXRpdmUgaW4tcGxhY2VuZXNzXG4gICAgLy8gVE9ETzogZmFzdGVyIHdheSBvZiBtYWtpbmcgdGhpcyBpbi1wbGFjZT9cbiAgICBmb3IoaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgIGlucHV0LnJlYWxbaV0gPSBub3JtYWxpc2F0aW9uICogb3V0cHV0LnJlYWxbaV1cbiAgICAgIGlucHV0LmltYWdbaV0gPSBub3JtYWxpc2F0aW9uICogb3V0cHV0LmltYWdbaV1cbiAgICB9XG5cbiAgICByZXR1cm4gaW5wdXRcbiAgfVxuXG4gIGZ1bmN0aW9uIEZGVF8yX0l0ZXJhdGl2ZShpbnB1dCwgaW52ZXJzZSkge1xuICAgIHZhclxuICAgICAgbiA9IGlucHV0Lmxlbmd0aCxcbiAgICAgIC8vIENvdW50ZXJzLlxuICAgICAgaSwgaixcbiAgICAgIG91dHB1dCwgb3V0cHV0X3IsIG91dHB1dF9pLFxuICAgICAgLy8gQ29tcGxleCBtdWx0aXBsaWVyIGFuZCBpdHMgZGVsdGEuXG4gICAgICBmX3IsIGZfaSwgZGVsX2ZfciwgZGVsX2ZfaSwgdGVtcCxcbiAgICAgIC8vIFRlbXBvcmFyeSBsb29wIHZhcmlhYmxlcy5cbiAgICAgIGxfaW5kZXgsIHJfaW5kZXgsXG4gICAgICBsZWZ0X3IsIGxlZnRfaSwgcmlnaHRfciwgcmlnaHRfaSxcbiAgICAgIC8vIHdpZHRoIG9mIGVhY2ggc3ViLWFycmF5IGZvciB3aGljaCB3ZSdyZSBpdGVyYXRpdmVseSBjYWxjdWxhdGluZyBGRlQuXG4gICAgICB3aWR0aFxuXG4gICAgb3V0cHV0ID0gQml0UmV2ZXJzZUNvbXBsZXhBcnJheShpbnB1dClcbiAgICBvdXRwdXRfciA9IG91dHB1dC5yZWFsXG4gICAgb3V0cHV0X2kgPSBvdXRwdXQuaW1hZ1xuICAgIC8vIExvb3BzIGdvIGxpa2UgTyhuIGxvZyBuKTpcbiAgICAvLyAgIHdpZHRoIH4gbG9nIG47IGksaiB+IG5cbiAgICB3aWR0aCA9IDFcbiAgICB3aGlsZSAod2lkdGggPCBuKSB7XG4gICAgICBkZWxfZl9yID0gY29zKFBJL3dpZHRoKVxuICAgICAgZGVsX2ZfaSA9IChpbnZlcnNlID8gLTEgOiAxKSAqIHNpbihQSS93aWR0aClcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBuLygyKndpZHRoKTsgaSsrKSB7XG4gICAgICAgIGZfciA9IDFcbiAgICAgICAgZl9pID0gMFxuICAgICAgICBmb3IgKGogPSAwOyBqIDwgd2lkdGg7IGorKykge1xuICAgICAgICAgIGxfaW5kZXggPSAyKmkqd2lkdGggKyBqXG4gICAgICAgICAgcl9pbmRleCA9IGxfaW5kZXggKyB3aWR0aFxuXG4gICAgICAgICAgbGVmdF9yID0gb3V0cHV0X3JbbF9pbmRleF1cbiAgICAgICAgICBsZWZ0X2kgPSBvdXRwdXRfaVtsX2luZGV4XVxuICAgICAgICAgIHJpZ2h0X3IgPSBmX3IgKiBvdXRwdXRfcltyX2luZGV4XSAtIGZfaSAqIG91dHB1dF9pW3JfaW5kZXhdXG4gICAgICAgICAgcmlnaHRfaSA9IGZfaSAqIG91dHB1dF9yW3JfaW5kZXhdICsgZl9yICogb3V0cHV0X2lbcl9pbmRleF1cblxuICAgICAgICAgIG91dHB1dF9yW2xfaW5kZXhdID0gU1FSVDFfMiAqIChsZWZ0X3IgKyByaWdodF9yKVxuICAgICAgICAgIG91dHB1dF9pW2xfaW5kZXhdID0gU1FSVDFfMiAqIChsZWZ0X2kgKyByaWdodF9pKVxuICAgICAgICAgIG91dHB1dF9yW3JfaW5kZXhdID0gU1FSVDFfMiAqIChsZWZ0X3IgLSByaWdodF9yKVxuICAgICAgICAgIG91dHB1dF9pW3JfaW5kZXhdID0gU1FSVDFfMiAqIChsZWZ0X2kgLSByaWdodF9pKVxuICAgICAgICAgIHRlbXAgPSBmX3IgKiBkZWxfZl9yIC0gZl9pICogZGVsX2ZfaVxuICAgICAgICAgIGZfaSA9IGZfciAqIGRlbF9mX2kgKyBmX2kgKiBkZWxfZl9yXG4gICAgICAgICAgZl9yID0gdGVtcFxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB3aWR0aCA8PD0gMVxuICAgIH1cblxuICAgIHJldHVybiBvdXRwdXRcbiAgfVxuXG4gIGZ1bmN0aW9uIEJpdFJldmVyc2VJbmRleChpbmRleCwgbikge1xuICAgIHZhciBiaXRyZXZlcnNlZF9pbmRleCA9IDBcblxuICAgIHdoaWxlIChuID4gMSkge1xuICAgICAgYml0cmV2ZXJzZWRfaW5kZXggPDw9IDFcbiAgICAgIGJpdHJldmVyc2VkX2luZGV4ICs9IGluZGV4ICYgMVxuICAgICAgaW5kZXggPj49IDFcbiAgICAgIG4gPj49IDFcbiAgICB9XG4gICAgcmV0dXJuIGJpdHJldmVyc2VkX2luZGV4XG4gIH1cblxuICBmdW5jdGlvbiBCaXRSZXZlcnNlQ29tcGxleEFycmF5KGFycmF5KSB7XG4gICAgdmFyIG4gPSBhcnJheS5sZW5ndGgsXG4gICAgICAgIGZsaXBzID0ge30sXG4gICAgICAgIHN3YXAsXG4gICAgICAgIGlcblxuICAgIGZvcihpID0gMDsgaSA8IG47IGkrKykge1xuICAgICAgdmFyIHJfaSA9IEJpdFJldmVyc2VJbmRleChpLCBuKVxuXG4gICAgICBpZiAoZmxpcHMuaGFzT3duUHJvcGVydHkoaSkgfHwgZmxpcHMuaGFzT3duUHJvcGVydHkocl9pKSkgY29udGludWVcblxuICAgICAgc3dhcCA9IGFycmF5LnJlYWxbcl9pXVxuICAgICAgYXJyYXkucmVhbFtyX2ldID0gYXJyYXkucmVhbFtpXVxuICAgICAgYXJyYXkucmVhbFtpXSA9IHN3YXBcblxuICAgICAgc3dhcCA9IGFycmF5LmltYWdbcl9pXVxuICAgICAgYXJyYXkuaW1hZ1tyX2ldID0gYXJyYXkuaW1hZ1tpXVxuICAgICAgYXJyYXkuaW1hZ1tpXSA9IHN3YXBcblxuICAgICAgZmxpcHNbaV0gPSBmbGlwc1tyX2ldID0gdHJ1ZVxuICAgIH1cblxuICAgIHJldHVybiBhcnJheVxuICB9XG5cbiAgZnVuY3Rpb24gTG93ZXN0T2RkRmFjdG9yKG4pIHtcbiAgICB2YXIgZmFjdG9yID0gMyxcbiAgICAgICAgc3FydF9uID0gc3FydChuKVxuXG4gICAgd2hpbGUoZmFjdG9yIDw9IHNxcnRfbikge1xuICAgICAgaWYgKG4gJSBmYWN0b3IgPT09IDApIHJldHVybiBmYWN0b3JcbiAgICAgIGZhY3RvciA9IGZhY3RvciArIDJcbiAgICB9XG4gICAgcmV0dXJuIG5cbiAgfVxuXG59KFxuICB0eXBlb2YgZXhwb3J0cyA9PT0gJ3VuZGVmaW5lZCcgJiYgKHRoaXMuZmZ0ID0ge30pIHx8IGV4cG9ydHMsXG4gIHR5cGVvZiByZXF1aXJlID09PSAndW5kZWZpbmVkJyAmJiAodGhpcy5jb21wbGV4X2FycmF5KSB8fFxuICAgIHJlcXVpcmUoJy4vY29tcGxleF9hcnJheScpXG4pXG4iLCIvKipcblxuc2VlZHJhbmRvbS5qc1xuPT09PT09PT09PT09PVxuXG5TZWVkZWQgcmFuZG9tIG51bWJlciBnZW5lcmF0b3IgZm9yIEphdmFzY3JpcHQuXG5cbnZlcnNpb24gMi4zLjY8YnI+XG5BdXRob3I6IERhdmlkIEJhdTxicj5cbkRhdGU6IDIwMTQgTWF5IDE0XG5cbkNhbiBiZSB1c2VkIGFzIGEgcGxhaW4gc2NyaXB0LCBhIG5vZGUuanMgbW9kdWxlIG9yIGFuIEFNRCBtb2R1bGUuXG5cblNjcmlwdCB0YWcgdXNhZ2Vcbi0tLS0tLS0tLS0tLS0tLS1cblxuPHNjcmlwdCBzcmM9Ly9jZG5qcy5jbG91ZGZsYXJlLmNvbS9hamF4L2xpYnMvc2VlZHJhbmRvbS8yLjMuNi9zZWVkcmFuZG9tLm1pbi5qcz5cbjwvc2NyaXB0PlxuXG4vLyBTZXRzIE1hdGgucmFuZG9tIHRvIGEgUFJORyBpbml0aWFsaXplZCB1c2luZyB0aGUgZ2l2ZW4gZXhwbGljaXQgc2VlZC5cbk1hdGguc2VlZHJhbmRvbSgnaGVsbG8uJyk7XG5jb25zb2xlLmxvZyhNYXRoLnJhbmRvbSgpKTsgICAgICAgICAgLy8gQWx3YXlzIDAuOTI4MjU3ODc5NTc5MjQ1NFxuY29uc29sZS5sb2coTWF0aC5yYW5kb20oKSk7ICAgICAgICAgIC8vIEFsd2F5cyAwLjM3NTI1Njk3Njg2NDY3ODRcblxuLy8gU2V0cyBNYXRoLnJhbmRvbSB0byBhbiBBUkM0LWJhc2VkIFBSTkcgdGhhdCBpcyBhdXRvc2VlZGVkIHVzaW5nIHRoZVxuLy8gY3VycmVudCB0aW1lLCBkb20gc3RhdGUsIGFuZCBvdGhlciBhY2N1bXVsYXRlZCBsb2NhbCBlbnRyb3B5LlxuLy8gVGhlIGdlbmVyYXRlZCBzZWVkIHN0cmluZyBpcyByZXR1cm5lZC5cbk1hdGguc2VlZHJhbmRvbSgpO1xuY29uc29sZS5sb2coTWF0aC5yYW5kb20oKSk7ICAgICAgICAgIC8vIFJlYXNvbmFibHkgdW5wcmVkaWN0YWJsZS5cblxuLy8gU2VlZHMgdXNpbmcgdGhlIGdpdmVuIGV4cGxpY2l0IHNlZWQgbWl4ZWQgd2l0aCBhY2N1bXVsYXRlZCBlbnRyb3B5LlxuTWF0aC5zZWVkcmFuZG9tKCdhZGRlZCBlbnRyb3B5LicsIHsgZW50cm9weTogdHJ1ZSB9KTtcbmNvbnNvbGUubG9nKE1hdGgucmFuZG9tKCkpOyAgICAgICAgICAvLyBBcyB1bnByZWRpY3RhYmxlIGFzIGFkZGVkIGVudHJvcHkuXG5cbi8vIFVzZSBcIm5ld1wiIHRvIGNyZWF0ZSBhIGxvY2FsIHBybmcgd2l0aG91dCBhbHRlcmluZyBNYXRoLnJhbmRvbS5cbnZhciBteXJuZyA9IG5ldyBNYXRoLnNlZWRyYW5kb20oJ2hlbGxvLicpO1xuY29uc29sZS5sb2cobXlybmcoKSk7ICAgICAgICAgICAgICAgIC8vIEFsd2F5cyAwLjkyODI1Nzg3OTU3OTI0NTRcblxuXG5Ob2RlLmpzIHVzYWdlXG4tLS0tLS0tLS0tLS0tXG5cbm5wbSBpbnN0YWxsIHNlZWRyYW5kb21cblxuLy8gTG9jYWwgUFJORzogZG9lcyBub3QgYWZmZWN0IE1hdGgucmFuZG9tLlxudmFyIHNlZWRyYW5kb20gPSByZXF1aXJlKCdzZWVkcmFuZG9tJyk7XG52YXIgcm5nID0gc2VlZHJhbmRvbSgnaGVsbG8uJyk7XG5jb25zb2xlLmxvZyhybmcoKSk7ICAgICAgICAgICAgICAgICAgLy8gQWx3YXlzIDAuOTI4MjU3ODc5NTc5MjQ1NFxuXG4vLyBBdXRvc2VlZGVkIEFSQzQtYmFzZWQgUFJORy5cbnJuZyA9IHNlZWRyYW5kb20oKTtcbmNvbnNvbGUubG9nKHJuZygpKTsgICAgICAgICAgICAgICAgICAvLyBSZWFzb25hYmx5IHVucHJlZGljdGFibGUuXG5cbi8vIEdsb2JhbCBQUk5HOiBzZXQgTWF0aC5yYW5kb20uXG5zZWVkcmFuZG9tKCdoZWxsby4nLCB7IGdsb2JhbDogdHJ1ZSB9KTtcbmNvbnNvbGUubG9nKE1hdGgucmFuZG9tKCkpOyAgICAgICAgICAvLyBBbHdheXMgMC45MjgyNTc4Nzk1NzkyNDU0XG5cbi8vIE1peGluZyBhY2N1bXVsYXRlZCBlbnRyb3B5Llxucm5nID0gc2VlZHJhbmRvbSgnYWRkZWQgZW50cm9weS4nLCB7IGVudHJvcHk6IHRydWUgfSk7XG5jb25zb2xlLmxvZyhybmcoKSk7ICAgICAgICAgICAgICAgICAgLy8gQXMgdW5wcmVkaWN0YWJsZSBhcyBhZGRlZCBlbnRyb3B5LlxuXG5cblJlcXVpcmUuanMgdXNhZ2Vcbi0tLS0tLS0tLS0tLS0tLS1cblxuU2ltaWxhciB0byBub2RlLmpzIHVzYWdlOlxuXG5ib3dlciBpbnN0YWxsIHNlZWRyYW5kb21cblxucmVxdWlyZShbJ3NlZWRyYW5kb20nXSwgZnVuY3Rpb24oc2VlZHJhbmRvbSkge1xuICB2YXIgcm5nID0gc2VlZHJhbmRvbSgnaGVsbG8uJyk7XG4gIGNvbnNvbGUubG9nKHJuZygpKTsgICAgICAgICAgICAgICAgICAvLyBBbHdheXMgMC45MjgyNTc4Nzk1NzkyNDU0XG59KTtcblxuXG5OZXR3b3JrIHNlZWRpbmcgdmlhIGEgc2NyaXB0IHRhZ1xuLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuPHNjcmlwdCBzcmM9Ly9jZG5qcy5jbG91ZGZsYXJlLmNvbS9hamF4L2xpYnMvc2VlZHJhbmRvbS8yLjMuNi9zZWVkcmFuZG9tLm1pbi5qcz5cbjwvc2NyaXB0PlxuPCEtLSBTZWVkcyB1c2luZyB1cmFuZG9tIGJpdHMgZnJvbSBhIHNlcnZlci4gLS0+XG48c2NyaXB0IHNyYz0vL2pzb25saWIuYXBwc3BvdC5jb20vdXJhbmRvbT9jYWxsYmFjaz1NYXRoLnNlZWRyYW5kb21cIj5cbjwvc2NyaXB0PlxuXG5FeGFtcGxlcyBvZiBtYW5pcHVsYXRpbmcgdGhlIHNlZWQgZm9yIHZhcmlvdXMgcHVycG9zZXM6XG5cbnZhciBzZWVkID0gTWF0aC5zZWVkcmFuZG9tKCk7ICAgICAgICAvLyBVc2UgcHJuZyB3aXRoIGFuIGF1dG9tYXRpYyBzZWVkLlxuZG9jdW1lbnQud3JpdGUoTWF0aC5yYW5kb20oKSk7ICAgICAgIC8vIFByZXR0eSBtdWNoIHVucHJlZGljdGFibGUgeC5cblxudmFyIHJuZyA9IG5ldyBNYXRoLnNlZWRyYW5kb20oc2VlZCk7IC8vIEEgbmV3IHBybmcgd2l0aCB0aGUgc2FtZSBzZWVkLlxuZG9jdW1lbnQud3JpdGUocm5nKCkpOyAgICAgICAgICAgICAgIC8vIFJlcGVhdCB0aGUgJ3VucHJlZGljdGFibGUnIHguXG5cbmZ1bmN0aW9uIHJlc2VlZChldmVudCwgY291bnQpIHsgICAgICAvLyBEZWZpbmUgYSBjdXN0b20gZW50cm9weSBjb2xsZWN0b3IuXG4gIHZhciB0ID0gW107XG4gIGZ1bmN0aW9uIHcoZSkge1xuICAgIHQucHVzaChbZS5wYWdlWCwgZS5wYWdlWSwgK25ldyBEYXRlXSk7XG4gICAgaWYgKHQubGVuZ3RoIDwgY291bnQpIHsgcmV0dXJuOyB9XG4gICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudCwgdyk7XG4gICAgTWF0aC5zZWVkcmFuZG9tKHQsIHsgZW50cm9weTogdHJ1ZSB9KTtcbiAgfVxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKGV2ZW50LCB3KTtcbn1cbnJlc2VlZCgnbW91c2Vtb3ZlJywgMTAwKTsgICAgICAgICAgICAvLyBSZXNlZWQgYWZ0ZXIgMTAwIG1vdXNlIG1vdmVzLlxuXG5UaGUgXCJwYXNzXCIgb3B0aW9uIGNhbiBiZSB1c2VkIHRvIGdldCBib3RoIHRoZSBwcm5nIGFuZCB0aGUgc2VlZC5cblRoZSBmb2xsb3dpbmcgcmV0dXJucyBib3RoIGFuIGF1dG9zZWVkZWQgcHJuZyBhbmQgdGhlIHNlZWQgYXMgYW4gb2JqZWN0LFxud2l0aG91dCBtdXRhdGluZyBNYXRoLnJhbmRvbTpcblxudmFyIG9iaiA9IE1hdGguc2VlZHJhbmRvbShudWxsLCB7IHBhc3M6IGZ1bmN0aW9uKHBybmcsIHNlZWQpIHtcbiAgcmV0dXJuIHsgcmFuZG9tOiBwcm5nLCBzZWVkOiBzZWVkIH07XG59fSk7XG5cblxuVmVyc2lvbiBub3Rlc1xuLS0tLS0tLS0tLS0tLVxuXG5UaGUgcmFuZG9tIG51bWJlciBzZXF1ZW5jZSBpcyB0aGUgc2FtZSBhcyB2ZXJzaW9uIDEuMCBmb3Igc3RyaW5nIHNlZWRzLlxuKiBWZXJzaW9uIDIuMCBjaGFuZ2VkIHRoZSBzZXF1ZW5jZSBmb3Igbm9uLXN0cmluZyBzZWVkcy5cbiogVmVyc2lvbiAyLjEgc3BlZWRzIHNlZWRpbmcgYW5kIHVzZXMgd2luZG93LmNyeXB0byB0byBhdXRvc2VlZCBpZiBwcmVzZW50LlxuKiBWZXJzaW9uIDIuMiBhbHRlcnMgbm9uLWNyeXB0byBhdXRvc2VlZGluZyB0byBzd2VlcCB1cCBlbnRyb3B5IGZyb20gcGx1Z2lucy5cbiogVmVyc2lvbiAyLjMgYWRkcyBzdXBwb3J0IGZvciBcIm5ld1wiLCBtb2R1bGUgbG9hZGluZywgYW5kIGEgbnVsbCBzZWVkIGFyZy5cbiogVmVyc2lvbiAyLjMuMSBhZGRzIGEgYnVpbGQgZW52aXJvbm1lbnQsIG1vZHVsZSBwYWNrYWdpbmcsIGFuZCB0ZXN0cy5cbiogVmVyc2lvbiAyLjMuNCBmaXhlcyBidWdzIG9uIElFOCwgYW5kIHN3aXRjaGVzIHRvIE1JVCBsaWNlbnNlLlxuKiBWZXJzaW9uIDIuMy42IGFkZHMgYSByZWFkYWJsZSBvcHRpb25zIG9iamVjdCBhcmd1bWVudC5cblxuVGhlIHN0YW5kYXJkIEFSQzQga2V5IHNjaGVkdWxlciBjeWNsZXMgc2hvcnQga2V5cywgd2hpY2ggbWVhbnMgdGhhdFxuc2VlZHJhbmRvbSgnYWInKSBpcyBlcXVpdmFsZW50IHRvIHNlZWRyYW5kb20oJ2FiYWInKSBhbmQgJ2FiYWJhYicuXG5UaGVyZWZvcmUgaXQgaXMgYSBnb29kIGlkZWEgdG8gYWRkIGEgdGVybWluYXRvciB0byBhdm9pZCB0cml2aWFsXG5lcXVpdmFsZW5jZXMgb24gc2hvcnQgc3RyaW5nIHNlZWRzLCBlLmcuLCBNYXRoLnNlZWRyYW5kb20oc3RyICsgJ1xcMCcpLlxuU3RhcnRpbmcgd2l0aCB2ZXJzaW9uIDIuMCwgYSB0ZXJtaW5hdG9yIGlzIGFkZGVkIGF1dG9tYXRpY2FsbHkgZm9yXG5ub24tc3RyaW5nIHNlZWRzLCBzbyBzZWVkaW5nIHdpdGggdGhlIG51bWJlciAxMTEgaXMgdGhlIHNhbWUgYXMgc2VlZGluZ1xud2l0aCAnMTExXFwwJy5cblxuV2hlbiBzZWVkcmFuZG9tKCkgaXMgY2FsbGVkIHdpdGggemVybyBhcmdzIG9yIGEgbnVsbCBzZWVkLCBpdCB1c2VzIGFcbnNlZWQgZHJhd24gZnJvbSB0aGUgYnJvd3NlciBjcnlwdG8gb2JqZWN0IGlmIHByZXNlbnQuICBJZiB0aGVyZSBpcyBub1xuY3J5cHRvIHN1cHBvcnQsIHNlZWRyYW5kb20oKSB1c2VzIHRoZSBjdXJyZW50IHRpbWUsIHRoZSBuYXRpdmUgcm5nLFxuYW5kIGEgd2FsayBvZiBzZXZlcmFsIERPTSBvYmplY3RzIHRvIGNvbGxlY3QgYSBmZXcgYml0cyBvZiBlbnRyb3B5LlxuXG5FYWNoIHRpbWUgdGhlIG9uZS0gb3IgdHdvLWFyZ3VtZW50IGZvcm1zIG9mIHNlZWRyYW5kb20gYXJlIGNhbGxlZCxcbmVudHJvcHkgZnJvbSB0aGUgcGFzc2VkIHNlZWQgaXMgYWNjdW11bGF0ZWQgaW4gYSBwb29sIHRvIGhlbHAgZ2VuZXJhdGVcbmZ1dHVyZSBzZWVkcyBmb3IgdGhlIHplcm8tIGFuZCB0d28tYXJndW1lbnQgZm9ybXMgb2Ygc2VlZHJhbmRvbS5cblxuT24gc3BlZWQgLSBUaGlzIGphdmFzY3JpcHQgaW1wbGVtZW50YXRpb24gb2YgTWF0aC5yYW5kb20oKSBpcyBzZXZlcmFsXG50aW1lcyBzbG93ZXIgdGhhbiB0aGUgYnVpbHQtaW4gTWF0aC5yYW5kb20oKSBiZWNhdXNlIGl0IGlzIG5vdCBuYXRpdmVcbmNvZGUsIGJ1dCB0aGF0IGlzIHR5cGljYWxseSBmYXN0IGVub3VnaC4gIFNvbWUgZGV0YWlscyAodGltaW5ncyBvblxuQ2hyb21lIDI1IG9uIGEgMjAxMCB2aW50YWdlIG1hY2Jvb2spOlxuXG4qIHNlZWRlZCBNYXRoLnJhbmRvbSgpICAgICAgICAgIC0gYXZnIGxlc3MgdGhhbiAwLjAwMDIgbWlsbGlzZWNvbmRzIHBlciBjYWxsXG4qIHNlZWRyYW5kb20oJ2V4cGxpY2l0LicpICAgICAgIC0gYXZnIGxlc3MgdGhhbiAwLjIgbWlsbGlzZWNvbmRzIHBlciBjYWxsXG4qIHNlZWRyYW5kb20oJ2V4cGxpY2l0LicsIHRydWUpIC0gYXZnIGxlc3MgdGhhbiAwLjIgbWlsbGlzZWNvbmRzIHBlciBjYWxsXG4qIHNlZWRyYW5kb20oKSB3aXRoIGNyeXB0byAgICAgIC0gYXZnIGxlc3MgdGhhbiAwLjIgbWlsbGlzZWNvbmRzIHBlciBjYWxsXG5cbkF1dG9zZWVkaW5nIHdpdGhvdXQgY3J5cHRvIGlzIHNvbWV3aGF0IHNsb3dlciwgYWJvdXQgMjAtMzAgbWlsbGlzZWNvbmRzIG9uXG5hIDIwMTIgd2luZG93cyA3IDEuNWdoeiBpNSBsYXB0b3AsIGFzIHNlZW4gb24gRmlyZWZveCAxOSwgSUUgMTAsIGFuZCBPcGVyYS5cblNlZWRlZCBybmcgY2FsbHMgdGhlbXNlbHZlcyBhcmUgZmFzdCBhY3Jvc3MgdGhlc2UgYnJvd3NlcnMsIHdpdGggc2xvd2VzdFxubnVtYmVycyBvbiBPcGVyYSBhdCBhYm91dCAwLjAwMDUgbXMgcGVyIHNlZWRlZCBNYXRoLnJhbmRvbSgpLlxuXG5cbkxJQ0VOU0UgKE1JVClcbi0tLS0tLS0tLS0tLS1cblxuQ29weXJpZ2h0IChjKTIwMTQgRGF2aWQgQmF1LlxuXG5QZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmdcbmEgY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG53aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG5kaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG9cbnBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0b1xudGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuXG5UaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZVxuaW5jbHVkZWQgaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG5cblRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsXG5FWFBSRVNTIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbk1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC5cbklOIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZXG5DTEFJTSwgREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULFxuVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEVcblNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4qL1xuXG4vKipcbiAqIEFsbCBjb2RlIGlzIGluIGFuIGFub255bW91cyBjbG9zdXJlIHRvIGtlZXAgdGhlIGdsb2JhbCBuYW1lc3BhY2UgY2xlYW4uXG4gKi9cbihmdW5jdGlvbiAoXG4gICAgZ2xvYmFsLCBwb29sLCBtYXRoLCB3aWR0aCwgY2h1bmtzLCBkaWdpdHMsIG1vZHVsZSwgZGVmaW5lLCBybmduYW1lKSB7XG5cbi8vXG4vLyBUaGUgZm9sbG93aW5nIGNvbnN0YW50cyBhcmUgcmVsYXRlZCB0byBJRUVFIDc1NCBsaW1pdHMuXG4vL1xudmFyIHN0YXJ0ZGVub20gPSBtYXRoLnBvdyh3aWR0aCwgY2h1bmtzKSxcbiAgICBzaWduaWZpY2FuY2UgPSBtYXRoLnBvdygyLCBkaWdpdHMpLFxuICAgIG92ZXJmbG93ID0gc2lnbmlmaWNhbmNlICogMixcbiAgICBtYXNrID0gd2lkdGggLSAxLFxuXG4vL1xuLy8gc2VlZHJhbmRvbSgpXG4vLyBUaGlzIGlzIHRoZSBzZWVkcmFuZG9tIGZ1bmN0aW9uIGRlc2NyaWJlZCBhYm92ZS5cbi8vXG5pbXBsID0gbWF0aFsnc2VlZCcgKyBybmduYW1lXSA9IGZ1bmN0aW9uKHNlZWQsIG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gIHZhciBrZXkgPSBbXTtcbiAgb3B0aW9ucyA9IChvcHRpb25zID09IHRydWUpID8geyBlbnRyb3B5OiB0cnVlIH0gOiAob3B0aW9ucyB8fCB7fSk7XG5cbiAgLy8gRmxhdHRlbiB0aGUgc2VlZCBzdHJpbmcgb3IgYnVpbGQgb25lIGZyb20gbG9jYWwgZW50cm9weSBpZiBuZWVkZWQuXG4gIHZhciBzaG9ydHNlZWQgPSBtaXhrZXkoZmxhdHRlbihcbiAgICBvcHRpb25zLmVudHJvcHkgPyBbc2VlZCwgdG9zdHJpbmcocG9vbCldIDpcbiAgICAoc2VlZCA9PSBudWxsKSA/IGF1dG9zZWVkKCkgOiBzZWVkLCAzKSwga2V5KTtcblxuICAvLyBVc2UgdGhlIHNlZWQgdG8gaW5pdGlhbGl6ZSBhbiBBUkM0IGdlbmVyYXRvci5cbiAgdmFyIGFyYzQgPSBuZXcgQVJDNChrZXkpO1xuXG4gIC8vIE1peCB0aGUgcmFuZG9tbmVzcyBpbnRvIGFjY3VtdWxhdGVkIGVudHJvcHkuXG4gIG1peGtleSh0b3N0cmluZyhhcmM0LlMpLCBwb29sKTtcblxuICAvLyBDYWxsaW5nIGNvbnZlbnRpb246IHdoYXQgdG8gcmV0dXJuIGFzIGEgZnVuY3Rpb24gb2YgcHJuZywgc2VlZCwgaXNfbWF0aC5cbiAgcmV0dXJuIChvcHRpb25zLnBhc3MgfHwgY2FsbGJhY2sgfHxcbiAgICAgIC8vIElmIGNhbGxlZCBhcyBhIG1ldGhvZCBvZiBNYXRoIChNYXRoLnNlZWRyYW5kb20oKSksIG11dGF0ZSBNYXRoLnJhbmRvbVxuICAgICAgLy8gYmVjYXVzZSB0aGF0IGlzIGhvdyBzZWVkcmFuZG9tLmpzIGhhcyB3b3JrZWQgc2luY2UgdjEuMC4gIE90aGVyd2lzZSxcbiAgICAgIC8vIGl0IGlzIGEgbmV3ZXIgY2FsbGluZyBjb252ZW50aW9uLCBzbyByZXR1cm4gdGhlIHBybmcgZGlyZWN0bHkuXG4gICAgICBmdW5jdGlvbihwcm5nLCBzZWVkLCBpc19tYXRoX2NhbGwpIHtcbiAgICAgICAgaWYgKGlzX21hdGhfY2FsbCkgeyBtYXRoW3JuZ25hbWVdID0gcHJuZzsgcmV0dXJuIHNlZWQ7IH1cbiAgICAgICAgZWxzZSByZXR1cm4gcHJuZztcbiAgICAgIH0pKFxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gcmV0dXJucyBhIHJhbmRvbSBkb3VibGUgaW4gWzAsIDEpIHRoYXQgY29udGFpbnNcbiAgLy8gcmFuZG9tbmVzcyBpbiBldmVyeSBiaXQgb2YgdGhlIG1hbnRpc3NhIG9mIHRoZSBJRUVFIDc1NCB2YWx1ZS5cbiAgZnVuY3Rpb24oKSB7XG4gICAgdmFyIG4gPSBhcmM0LmcoY2h1bmtzKSwgICAgICAgICAgICAgLy8gU3RhcnQgd2l0aCBhIG51bWVyYXRvciBuIDwgMiBeIDQ4XG4gICAgICAgIGQgPSBzdGFydGRlbm9tLCAgICAgICAgICAgICAgICAgLy8gICBhbmQgZGVub21pbmF0b3IgZCA9IDIgXiA0OC5cbiAgICAgICAgeCA9IDA7ICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgIGFuZCBubyAnZXh0cmEgbGFzdCBieXRlJy5cbiAgICB3aGlsZSAobiA8IHNpZ25pZmljYW5jZSkgeyAgICAgICAgICAvLyBGaWxsIHVwIGFsbCBzaWduaWZpY2FudCBkaWdpdHMgYnlcbiAgICAgIG4gPSAobiArIHgpICogd2lkdGg7ICAgICAgICAgICAgICAvLyAgIHNoaWZ0aW5nIG51bWVyYXRvciBhbmRcbiAgICAgIGQgKj0gd2lkdGg7ICAgICAgICAgICAgICAgICAgICAgICAvLyAgIGRlbm9taW5hdG9yIGFuZCBnZW5lcmF0aW5nIGFcbiAgICAgIHggPSBhcmM0LmcoMSk7ICAgICAgICAgICAgICAgICAgICAvLyAgIG5ldyBsZWFzdC1zaWduaWZpY2FudC1ieXRlLlxuICAgIH1cbiAgICB3aGlsZSAobiA+PSBvdmVyZmxvdykgeyAgICAgICAgICAgICAvLyBUbyBhdm9pZCByb3VuZGluZyB1cCwgYmVmb3JlIGFkZGluZ1xuICAgICAgbiAvPSAyOyAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgbGFzdCBieXRlLCBzaGlmdCBldmVyeXRoaW5nXG4gICAgICBkIC89IDI7ICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICByaWdodCB1c2luZyBpbnRlZ2VyIG1hdGggdW50aWxcbiAgICAgIHggPj4+PSAxOyAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgIHdlIGhhdmUgZXhhY3RseSB0aGUgZGVzaXJlZCBiaXRzLlxuICAgIH1cbiAgICByZXR1cm4gKG4gKyB4KSAvIGQ7ICAgICAgICAgICAgICAgICAvLyBGb3JtIHRoZSBudW1iZXIgd2l0aGluIFswLCAxKS5cbiAgfSwgc2hvcnRzZWVkLCAnZ2xvYmFsJyBpbiBvcHRpb25zID8gb3B0aW9ucy5nbG9iYWwgOiAodGhpcyA9PSBtYXRoKSk7XG59O1xuXG4vL1xuLy8gQVJDNFxuLy9cbi8vIEFuIEFSQzQgaW1wbGVtZW50YXRpb24uICBUaGUgY29uc3RydWN0b3IgdGFrZXMgYSBrZXkgaW4gdGhlIGZvcm0gb2Zcbi8vIGFuIGFycmF5IG9mIGF0IG1vc3QgKHdpZHRoKSBpbnRlZ2VycyB0aGF0IHNob3VsZCBiZSAwIDw9IHggPCAod2lkdGgpLlxuLy9cbi8vIFRoZSBnKGNvdW50KSBtZXRob2QgcmV0dXJucyBhIHBzZXVkb3JhbmRvbSBpbnRlZ2VyIHRoYXQgY29uY2F0ZW5hdGVzXG4vLyB0aGUgbmV4dCAoY291bnQpIG91dHB1dHMgZnJvbSBBUkM0LiAgSXRzIHJldHVybiB2YWx1ZSBpcyBhIG51bWJlciB4XG4vLyB0aGF0IGlzIGluIHRoZSByYW5nZSAwIDw9IHggPCAod2lkdGggXiBjb3VudCkuXG4vL1xuLyoqIEBjb25zdHJ1Y3RvciAqL1xuZnVuY3Rpb24gQVJDNChrZXkpIHtcbiAgdmFyIHQsIGtleWxlbiA9IGtleS5sZW5ndGgsXG4gICAgICBtZSA9IHRoaXMsIGkgPSAwLCBqID0gbWUuaSA9IG1lLmogPSAwLCBzID0gbWUuUyA9IFtdO1xuXG4gIC8vIFRoZSBlbXB0eSBrZXkgW10gaXMgdHJlYXRlZCBhcyBbMF0uXG4gIGlmICgha2V5bGVuKSB7IGtleSA9IFtrZXlsZW4rK107IH1cblxuICAvLyBTZXQgdXAgUyB1c2luZyB0aGUgc3RhbmRhcmQga2V5IHNjaGVkdWxpbmcgYWxnb3JpdGhtLlxuICB3aGlsZSAoaSA8IHdpZHRoKSB7XG4gICAgc1tpXSA9IGkrKztcbiAgfVxuICBmb3IgKGkgPSAwOyBpIDwgd2lkdGg7IGkrKykge1xuICAgIHNbaV0gPSBzW2ogPSBtYXNrICYgKGogKyBrZXlbaSAlIGtleWxlbl0gKyAodCA9IHNbaV0pKV07XG4gICAgc1tqXSA9IHQ7XG4gIH1cblxuICAvLyBUaGUgXCJnXCIgbWV0aG9kIHJldHVybnMgdGhlIG5leHQgKGNvdW50KSBvdXRwdXRzIGFzIG9uZSBudW1iZXIuXG4gIChtZS5nID0gZnVuY3Rpb24oY291bnQpIHtcbiAgICAvLyBVc2luZyBpbnN0YW5jZSBtZW1iZXJzIGluc3RlYWQgb2YgY2xvc3VyZSBzdGF0ZSBuZWFybHkgZG91YmxlcyBzcGVlZC5cbiAgICB2YXIgdCwgciA9IDAsXG4gICAgICAgIGkgPSBtZS5pLCBqID0gbWUuaiwgcyA9IG1lLlM7XG4gICAgd2hpbGUgKGNvdW50LS0pIHtcbiAgICAgIHQgPSBzW2kgPSBtYXNrICYgKGkgKyAxKV07XG4gICAgICByID0gciAqIHdpZHRoICsgc1ttYXNrICYgKChzW2ldID0gc1tqID0gbWFzayAmIChqICsgdCldKSArIChzW2pdID0gdCkpXTtcbiAgICB9XG4gICAgbWUuaSA9IGk7IG1lLmogPSBqO1xuICAgIHJldHVybiByO1xuICAgIC8vIEZvciByb2J1c3QgdW5wcmVkaWN0YWJpbGl0eSBkaXNjYXJkIGFuIGluaXRpYWwgYmF0Y2ggb2YgdmFsdWVzLlxuICAgIC8vIFNlZSBodHRwOi8vd3d3LnJzYS5jb20vcnNhbGFicy9ub2RlLmFzcD9pZD0yMDA5XG4gIH0pKHdpZHRoKTtcbn1cblxuLy9cbi8vIGZsYXR0ZW4oKVxuLy8gQ29udmVydHMgYW4gb2JqZWN0IHRyZWUgdG8gbmVzdGVkIGFycmF5cyBvZiBzdHJpbmdzLlxuLy9cbmZ1bmN0aW9uIGZsYXR0ZW4ob2JqLCBkZXB0aCkge1xuICB2YXIgcmVzdWx0ID0gW10sIHR5cCA9ICh0eXBlb2Ygb2JqKSwgcHJvcDtcbiAgaWYgKGRlcHRoICYmIHR5cCA9PSAnb2JqZWN0Jykge1xuICAgIGZvciAocHJvcCBpbiBvYmopIHtcbiAgICAgIHRyeSB7IHJlc3VsdC5wdXNoKGZsYXR0ZW4ob2JqW3Byb3BdLCBkZXB0aCAtIDEpKTsgfSBjYXRjaCAoZSkge31cbiAgICB9XG4gIH1cbiAgcmV0dXJuIChyZXN1bHQubGVuZ3RoID8gcmVzdWx0IDogdHlwID09ICdzdHJpbmcnID8gb2JqIDogb2JqICsgJ1xcMCcpO1xufVxuXG4vL1xuLy8gbWl4a2V5KClcbi8vIE1peGVzIGEgc3RyaW5nIHNlZWQgaW50byBhIGtleSB0aGF0IGlzIGFuIGFycmF5IG9mIGludGVnZXJzLCBhbmRcbi8vIHJldHVybnMgYSBzaG9ydGVuZWQgc3RyaW5nIHNlZWQgdGhhdCBpcyBlcXVpdmFsZW50IHRvIHRoZSByZXN1bHQga2V5LlxuLy9cbmZ1bmN0aW9uIG1peGtleShzZWVkLCBrZXkpIHtcbiAgdmFyIHN0cmluZ3NlZWQgPSBzZWVkICsgJycsIHNtZWFyLCBqID0gMDtcbiAgd2hpbGUgKGogPCBzdHJpbmdzZWVkLmxlbmd0aCkge1xuICAgIGtleVttYXNrICYgal0gPVxuICAgICAgbWFzayAmICgoc21lYXIgXj0ga2V5W21hc2sgJiBqXSAqIDE5KSArIHN0cmluZ3NlZWQuY2hhckNvZGVBdChqKyspKTtcbiAgfVxuICByZXR1cm4gdG9zdHJpbmcoa2V5KTtcbn1cblxuLy9cbi8vIGF1dG9zZWVkKClcbi8vIFJldHVybnMgYW4gb2JqZWN0IGZvciBhdXRvc2VlZGluZywgdXNpbmcgd2luZG93LmNyeXB0byBpZiBhdmFpbGFibGUuXG4vL1xuLyoqIEBwYXJhbSB7VWludDhBcnJheXxOYXZpZ2F0b3I9fSBzZWVkICovXG5mdW5jdGlvbiBhdXRvc2VlZChzZWVkKSB7XG4gIHRyeSB7XG4gICAgZ2xvYmFsLmNyeXB0by5nZXRSYW5kb21WYWx1ZXMoc2VlZCA9IG5ldyBVaW50OEFycmF5KHdpZHRoKSk7XG4gICAgcmV0dXJuIHRvc3RyaW5nKHNlZWQpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIFsrbmV3IERhdGUsIGdsb2JhbCwgKHNlZWQgPSBnbG9iYWwubmF2aWdhdG9yKSAmJiBzZWVkLnBsdWdpbnMsXG4gICAgICAgICAgICBnbG9iYWwuc2NyZWVuLCB0b3N0cmluZyhwb29sKV07XG4gIH1cbn1cblxuLy9cbi8vIHRvc3RyaW5nKClcbi8vIENvbnZlcnRzIGFuIGFycmF5IG9mIGNoYXJjb2RlcyB0byBhIHN0cmluZ1xuLy9cbmZ1bmN0aW9uIHRvc3RyaW5nKGEpIHtcbiAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkoMCwgYSk7XG59XG5cbi8vXG4vLyBXaGVuIHNlZWRyYW5kb20uanMgaXMgbG9hZGVkLCB3ZSBpbW1lZGlhdGVseSBtaXggYSBmZXcgYml0c1xuLy8gZnJvbSB0aGUgYnVpbHQtaW4gUk5HIGludG8gdGhlIGVudHJvcHkgcG9vbC4gIEJlY2F1c2Ugd2UgZG9cbi8vIG5vdCB3YW50IHRvIGludGVmZXJlIHdpdGggZGV0ZXJtaW5zdGljIFBSTkcgc3RhdGUgbGF0ZXIsXG4vLyBzZWVkcmFuZG9tIHdpbGwgbm90IGNhbGwgbWF0aC5yYW5kb20gb24gaXRzIG93biBhZ2FpbiBhZnRlclxuLy8gaW5pdGlhbGl6YXRpb24uXG4vL1xubWl4a2V5KG1hdGhbcm5nbmFtZV0oKSwgcG9vbCk7XG5cbi8vXG4vLyBOb2RlanMgYW5kIEFNRCBzdXBwb3J0OiBleHBvcnQgdGhlIGltcGxlbWVuYXRpb24gYXMgYSBtb2R1bGUgdXNpbmdcbi8vIGVpdGhlciBjb252ZW50aW9uLlxuLy9cbmlmIChtb2R1bGUgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgbW9kdWxlLmV4cG9ydHMgPSBpbXBsO1xufSBlbHNlIGlmIChkZWZpbmUgJiYgZGVmaW5lLmFtZCkge1xuICBkZWZpbmUoZnVuY3Rpb24oKSB7IHJldHVybiBpbXBsOyB9KTtcbn1cblxuLy8gRW5kIGFub255bW91cyBzY29wZSwgYW5kIHBhc3MgaW5pdGlhbCB2YWx1ZXMuXG59KShcbiAgdGhpcywgICAvLyBnbG9iYWwgd2luZG93IG9iamVjdFxuICBbXSwgICAgIC8vIHBvb2w6IGVudHJvcHkgcG9vbCBzdGFydHMgZW1wdHlcbiAgTWF0aCwgICAvLyBtYXRoOiBwYWNrYWdlIGNvbnRhaW5pbmcgcmFuZG9tLCBwb3csIGFuZCBzZWVkcmFuZG9tXG4gIDI1NiwgICAgLy8gd2lkdGg6IGVhY2ggUkM0IG91dHB1dCBpcyAwIDw9IHggPCAyNTZcbiAgNiwgICAgICAvLyBjaHVua3M6IGF0IGxlYXN0IHNpeCBSQzQgb3V0cHV0cyBmb3IgZWFjaCBkb3VibGVcbiAgNTIsICAgICAvLyBkaWdpdHM6IHRoZXJlIGFyZSA1MiBzaWduaWZpY2FudCBkaWdpdHMgaW4gYSBkb3VibGVcbiAgKHR5cGVvZiBtb2R1bGUpID09ICdvYmplY3QnICYmIG1vZHVsZSwgICAgLy8gcHJlc2VudCBpbiBub2RlLmpzXG4gICh0eXBlb2YgZGVmaW5lKSA9PSAnZnVuY3Rpb24nICYmIGRlZmluZSwgIC8vIHByZXNlbnQgd2l0aCBhbiBBTUQgbG9hZGVyXG4gICdyYW5kb20nLy8gcm5nbmFtZTogbmFtZSBmb3IgTWF0aC5yYW5kb20gYW5kIE1hdGguc2VlZHJhbmRvbVxuKTsiXX0=
