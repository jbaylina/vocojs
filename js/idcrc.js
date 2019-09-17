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
