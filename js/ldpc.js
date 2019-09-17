/*jslint node: true , browser: true */
/*global window */
"use strict";

// Variable Nodes (vNodes)           Check Nodes (cNodes)
//       vNodes[0]            \
//       vNodes[1]            -          cNodes[0]
//       ..                   -          cNodes[1]
//       ..                   -          ..
//       ..                   -          cNodes[K-1]
//       nNodes[N-1]          /

// To navegate from cNodes to vNodes and from vNodes to cNodes
//       vNodes[i].cNodes[j]   === vNodes[j]
//       cNodes[j].vNodes[i]   === vNodes[i]

// To pass a message from vNode i to cNode j
// cNode[j].rxMsg[i] = msg
//
// To pass a message from cNode j to vNode i
// vNode[i].rxMsg[j] = msg
//

var lAlg = require('lalg.js');


function LDPC(file, maxIters) {
	var self=this;
	self.maxIters = maxIters;

	self.swapVNode = function(H,s1,s2) {

		var aux, i;
		aux = self.vNodes[s1];
		self.vNodes[s1] = self.vNodes[s2];
		self.vNodes[s2] = aux;
		for (i in  self.vNodes[s1].cNodes) {
			delete self.vNodes[s1].cNodes[i].vNodes[s2];
		}
		for (i in  self.vNodes[s2].cNodes) {
			delete self.vNodes[s2].cNodes[i].vNodes[s1];
		}
		for (i in  self.vNodes[s1].cNodes) {
			self.vNodes[s1].cNodes[i].vNodes[s1]=self.vNodes[s1];
		}
		for (i in  self.vNodes[s2].cNodes) {
			self.vNodes[s2].cNodes[i].vNodes[s2]=self.vNodes[s2];
		}
		for (i=0; i<H.length; i++) {
			aux=H[i][s1];
			H[i][s1] = H[i][s2];
			H[i][s2] = aux;
		}
	};

	self.gausianReduce=function(H) {
		var r,r2,i, c, c2, aux;
		for (c=0; c<H.length; c++) {

			// Find first non zero
			var i_max = -1;
			for (c2=c; c2<H[0].length; c2++) {
				if (H[c][c2]) {
					i_max=c2;
					break;
				}
			}
			if (i_max === -1) {
				throw new Error("Matrix is not diagonalizable");
			}

			self.swapVNode(H, c,i_max);

			for (r2= c+1; r2<H.length; r2++) {
				if (H[r2][c]) {
					for (c2= c+1; c2<H[0].length; c2 ++ ) {
						H[r2][c2] = H[r2][c2] ^ H[c][c2];
					}
				}
				H[r2][c]=0;
			}
		}

		for (c=H.length-1; c>0;  c--) {
			for (r=c-1; r>=0; r--) {
				if (H[r][c]) {
					for (c2=H.length; c2<H[0].length; c2 ++ ) {
						H[r][c2] = H[r][c2] ^ H[c][c2];
					}
				}
				H[r][c] =0;
			}
		}
	};

	self.createGen = function() {
		var H = [];
		var r,c,b;
		for (r=0; r<self.K; r++) {
			H[r]=[];
			for (c=0; c<self.N; c++) {
				H[r][c]=0;
			}
		}

		var i,j;
		for (i=0; i<self.cNodes.length; i++) {
			for (j in self.cNodes[i].vNodes) {
				H[i][j] = 1;
			}
		}

		self.gausianReduce(H);

		while (H.length % 8 !== 0) {
			var L=[];
			for (c=0; c<self.N; c++) {
				L[c]=0;
			}
			H.push(L);
		}

		self.H =H;

		self.G=[];
		for (r=0 ; r<H.length >> 3; r++) {
			self.G[r] = [];
			for (c=0; c<self.N - self.K; c++) {
				self.G[r][c] = 0;
				for (b=0; b<8; b++) {
					self.G[r][c] = H[r*8+b][self.K+c] ? self.G[r][c] | (1<<b) : self.G[r][c];
				}
			}
		}

	};

	self.parseAList = function(S) {
		var i,j, n;
		var words= S.split(/\s+/);
		var lpos=0;

		function getNum() {
			var num = parseInt(words[lpos],10);
			lpos += 1;
			return num;
		}

		self.K = getNum();
		self.N = getNum();

		var maxC2V = getNum();
		var maxV2C = getNum();

		self.vNodes = [];			// Variable Nodes
		self.cNodes = [];			// Check Nodes;

		for (i=0; i<self.K; i++) {
			self.cNodes[i] = {
				id: i
			};
			n = getNum();
			self.cNodes[i].vNodes = {};
			self.cNodes[i].rxMsg = {};
		}

		for (i=0; i<self.N; i++) {
			self.vNodes[i] = {
				id: i
			};
			n = getNum();
			self.vNodes[i].cNodes = {};
			self.vNodes[i].rxMsg = {};
		}

		for (i=0; i<self.K; i+=1) {
			for (j=0; j<maxC2V; j+=1) {
				n=getNum() -1;
				if (n>=0) {
					self.cNodes[i].vNodes[n] = self.vNodes[n];
					self.vNodes[n].cNodes[i] = self.cNodes[i];
				}
			}
		}

		for (i=0; i<self.N; i+=1) {
			for (j=0; j<maxV2C; j+=1) {
				n=getNum() -1;
				if (n>=0) {
					if (self.vNodes[i].cNodes[n] !== self.cNodes[n]) {
						throw new Error("Incoherent matrix");
					}
					if (self.cNodes[n].vNodes[i] !== self.vNodes[i]) {
						throw new Error("Incoherent matrix");
					}
				}
			}
		}

		while ((lpos<words.length)&&(!words[lpos])) lpos+=1;

		if (lpos !== words.length) {
			throw new Error("Invalid File");
		}

		self.createGen();

	};

	self.encode = function(ba, cb) {
		var i,j, acc;
		var checks=[];
		while (ba.length * 8 < self.G[0].length) ba.push(0);
		for (i=0; i<self.G.length; i++) {
			acc =0;
			for (j=0; j<self.G[0].length; j++) {
				if (ba[j >> 3] & (1 << (j & 0x7)) ) {
					acc ^= self.G[i][j];
				}
			}
			checks.push(acc);
		}

		var outB = [];

		for (i=0; i< self.K; i++) {
			outB.push( checks[i >> 3] & (1 << (i & 0x7)) ? -1 : 1);
		}

		for (i=0; i< self.N-self.K; i++) {
			outB.push( ba[i >> 3] & (1 << (i & 0x7)) ? -1 : 1);
		}

		cb(outB);
		if (self.onReady) self.onReady();

	};

	self.verify = function() {
		var i, j, acc;
		for (i=0; i<self.cNodes.length; i++) {
			acc = -1;
			for (j in self.cNodes[i].vNodes) {
				if (self.orig[j]<0) acc = -acc;
			}
			if (acc>0) {
				return false;
			}
		}
		return true;
	};


	self.processing=true;
	self.orig=[];
	self.orig0=[];

	self.cancelDecode = function() {
		self.nIters = 0;
	};

	self.decode = function(inb, cb) {
		if (self.processing) {
			throw new Error("Decoder in use, please first cancel decoding and wait for readyness");
		}
		self.processing =true;
		self.nIters=self.maxIters;

		function it() {
			var i;
			var isOk = self.verify();
			if (isOk) {
				var out8 = [];
				for (i=0; i<self.N - self.K; i++) {
					var b = out8 [i >> 3] || 0;
					if (self.orig[self.K + i] < 0) {
						b = b | (1 << (i & 0x7));
					}
					out8 [i >> 3] = b;
				}
				console.log("iters: "+ (self.maxIters - self.nIters));
				cb(out8);
				self.processing =false;
				if (self.onReady) self.onReady();
				return;
			}
			if (self.nIters <= 0) {
				self.processing =false;
				if (self.onReady) self.onReady();
				console.log("Errors not resolved");
				return;
			}
			self.iterate();
			self.nIters --;
			setTimeout(it,0);
		}

		var i,j;
		for (i=0; i< self.vNodes.length; i++) {
//			self.orig[i] = -Math.round(inb[i]*0x8000);
			self.orig[i] = inb[i];
			self.orig0[i] = self.orig[i];
			for (j in self.vNodes[i].cNodes) {
				self.vNodes[i].rxMsg[j] = 0;
			}
		}

		setTimeout(it,0);
	};

	self.iterate = function() {
		var i,j, acc;
		for (i=0; i<self.vNodes.length; i++) {
			acc = self.orig0[i];
			for (j in self.vNodes[i].cNodes) {
				acc += self.vNodes[i].rxMsg[j];
			}
			self.orig[i]=acc;
			for (j in self.vNodes[i].cNodes) {
				self.cNodes[j].rxMsg[i]= acc - self.vNodes[i].rxMsg[j];
			}
		}

		for (i=0; i<self.cNodes.length; i++) {
			var sigma=[];
			var ro=[];
			var keys = Object.keys(self.cNodes[i].vNodes);
			sigma[0] = self.cNodes[i].rxMsg[keys[0]];
			ro[keys.length-1] = self.cNodes[i].rxMsg[keys[keys.length - 1]];
			for (j = 1; j < keys.length; j++) {
					sigma[j] = lAlg.lSum(sigma[j-1], self.cNodes[i].rxMsg[keys[j]]);
					ro[keys.length - j -1] = lAlg.lSum(ro[keys.length - j], self.cNodes[i].rxMsg[keys[keys.length -j -1]]);
			}

			self.vNodes[keys[0]].rxMsg[i] = ro[1];
			for (j = 1; j < keys.length -1; j++) {
				self.vNodes[keys[j]].rxMsg[i] = lAlg.lSum(sigma[j-1], ro[j+1]);
			}
			self.vNodes[keys[keys.length -1]].rxMsg[i] = sigma[keys.length-2];

		}
	};

	var client = new XMLHttpRequest();
	client.open('GET', file);
	client.onreadystatechange = function() {
		if  ( client.readyState == 4 ) {
			self.parseAList(client.responseText);
			self.processing=false;
			if (self.onReady) self.onReady();
		}
	};
	client.send();
}

function LDPCDecoder(alist, maxIters,  destination) {
	var self=this;
	self.destination=destination;
	self.ldpc = new LDPC(alist, maxIters);
	self.queue = [];

	self.queue = [];
	self.ldpc.onReady = function() {
		setTimeout(function() {
			self.procesQueue();
		},0);
	};

	self.procesQueue = function() {
		if (self.ldpc.processing) return;
		if (self.queue.length === 0) return;
		var inb = self.queue.shift();
		self.ldpc.decode(inb, function(outB) {
			destination.processData(outB);
		});
	};

	self.processData = function(inB) {
			self.queue.push(inB);
			self.procesQueue();
	};
	return self;
}

function LDPCEncoder(alist, destination) {
	var self=this;
	self.destination=destination;
	self.ldpc = new LDPC(alist);
	self.queue = [];
	self.ldpc.onReady = function() {
		setTimeout(function() {
			self.procesQueue();
		},0);
	};

	self.procesQueue = function() {
		if (self.ldpc.processing) return;
		if (self.queue.length === 0) return;
		var inb = self.queue.shift();
		self.ldpc.encode(inb, function(outB) {
			destination.processData(outB);
		});
	};


	self.processData = function(inB) {
			self.queue.push(inB);
			self.procesQueue();
	};
	return self;
}

exports.Encoder = LDPCEncoder;
exports.Decoder = LDPCDecoder;
