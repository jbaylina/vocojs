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

