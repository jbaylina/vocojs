/////// CONFIGURATION CONSTANTS
var N_BUFF_IN = 4096;
var FDIV=128;
var N_FRAMES_PACKET=48;


//var usedChannels=[2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101,103,107,109,113,127]; // 31
var usedChannels=[]; // 27
for (i=6; i<=82; i++) {
	usedChannels.push(i);
}

var N_PREAMBLE_FRAMES= 1;
var N_POSTAMBLE_FRAMES= 1;
var LDPC_MAX_ITERS=500;

/*
var NUMS1 = [ 0x19, 0xB, 0x15, 0x1F];
var DEN1 = 0x19;
var NUMS2 = [ 0xB,  0x1F];
var DEN2 = 0x19;
*/
var NUMS1 = [ 0x19, 0xB, 0x15, 0x1F];
var DEN1 = 0x19;
var NUMS2 = [ 0xB, 0x1F];
var DEN2 = 0x19;

//// END CONSTANTS

var randomPerm;
var looper;
var ofdmCoder;
var packetGenerator;

var packetDetector;
var ofdmDecoder;

var eccEncoder;
var eccDecoder;

var idCrcEncoder;
var idCrcDecoder;

function rnd_snd() {
	return (Math.random()*2-1)+(Math.random()*2-1)+(Math.random()*2-1);
}

function rnd(mean, stdev) {
	return rnd_snd()*stdev+mean;
}

function Looper() {
	var accS=0.0, accN= 0.0;
	var self=this;
	self.processData = function(inBuff) {
		for (i=0; i<inBuff.length; i++) {
			accS += inBuff[i]*inBuff[i];
//			n = rnd(0,0.15703);       // Turbocode limit
//			n = rnd(0,0.095);          // LDPC limit
			n = rnd(0,0);          // LDPC limit
			accN += n*n;
			inBuff[i] = inBuff[i] + n;
		}
		for (i=0; i<inBuff.length; i+=FDIV) {
			ofdmDecoder.processData(inBuff, i);
		}
		console.log(Math.sqrt(accS) / inBuff.length);
		console.log(Math.sqrt(accN) / inBuff.length);
		console.log("S/N (db) = " + 10*Math.log(accS/accN)/Math.log(10));
	};
}

function PacketPainter() {
	var self=this;
	self.processData = function(packet, acc) {
		var S=Utf8Utils.decode(packet);
		console.log("Packet received: "+ S);
	};
	return self;
}


function init() {

	randomPerm = new RandomPerm(N_FRAMES_PACKET * usedChannels.length);

	tcPerm = new FLSInterleaver(304);
	
	looper = new Looper();
	ofdmCoder = new OfdmEncoder(N_PREAMBLE_FRAMES, N_POSTAMBLE_FRAMES, FDIV, usedChannels, looper);

	packetGenerator = new PacketGenerator(usedChannels.length, N_FRAMES_PACKET, randomPerm, ofdmCoder);

//	eccEncoder = new LDPCEncoder("alist/l1848_462.alist", packetGenerator);
//	eccEncoder = new BCJREncoder(NUMS, DEN, packetGenerator);
	eccEncoder = new TCEncoder(NUMS1, DEN1, NUMS2, DEN2, tcPerm, packetGenerator);

	idCrcEncoder = new IdCRCEncoder(eccEncoder);

	packetPainter = new PacketPainter();

	idCrcDecoder = new IdCRCDecoder(packetPainter);
//	eccDecoder = new LDPCDecoder("alist/l1848_462.alist", LDPC_MAX_ITERS, packetPainter);
//	eccDecoder = new BCJRDecoder(NUMS, DEN, packetPainter);
	eccDecoder = new TCDecoder(NUMS1, DEN1, NUMS2, DEN2, tcPerm, 10, idCrcDecoder);

	predictor = new Predictor(usedChannels.length, N_FRAMES_PACKET, randomPerm, eccDecoder);

	packetDetector = new PacketDetector(usedChannels.length, N_FRAMES_PACKET, randomPerm, predictor);
	ofdmDecoder = new OfdmDecoder(FDIV, usedChannels, packetDetector);


	idCrcEncoder.processData(Utf8Utils.encode("123456789-123456789-123456789-12"));

	var buff = [];

/*  Wait to decode unti finished
	function f() {
		if ((!eccEncoder.ldpc.processing) && (!eccDecoder.ldpc.processing)) {
			eccEncoder.processData(Utf8Utils.encode("123456789-123456789-123456789-12345678"));
		} else {
			setTimeout(f,1000);
		}

	}
	setTimeout(f,1000);
*/

}

window.addEventListener('load', init, false);