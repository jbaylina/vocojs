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
