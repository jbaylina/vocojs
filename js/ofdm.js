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



